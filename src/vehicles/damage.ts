// Independent vehicle damage model: accumulated/critical damage, fire, blasts and radial effects.
// Pure and deterministic: it never imports game/world/renderer and only mutates the state handed to it,
// so the simulation can integrate it at whatever cadence it likes. Front/rear/side component damage is
// derived from the local contact point (vehicle space, +x is forward, matching CarDynamics tyres).
import { clamp, dist, normalize, scale, sub, vec, type Vec } from '../physics';

export type VehicleDamage = {
  health: number;
  critical: { engine: number; fuel: number; tyres: number };
  status: 'intact' | 'smoking' | 'burning' | 'wreck';
  fireTime: number;
  fuse: number;
  hitAt: number;
  blamed: boolean;
  bloodTime: number;
};

// Tuning: match the existing taxi collision feel while keeping god mode and repairs authoritative.
const IMPACT_COOLDOWN = 0.22; // seconds between damaging impacts (blasts are never rate-limited)
const SMALL_IMPACT = 3; // sub-3 contacts are cosmetic and never damage or consume the cooldown
const SMOKING_ENGINE = 45; // engine critical above this starts smoking
const SMOKING_HEALTH = 45; // health below this starts smoking
const IGNITE_FUEL = 55; // fuel critical above this catches fire
const IGNITE_ENGINE = 65; // engine critical above this catches fire
const IGNITE_HEALTH = 18; // HP at or below this catches fire
const CATASTROPHIC_IMPACT = 32; // hard frontal hit that can bypass the critical thresholds
const CATASTROPHIC_ENGINE = 35; // ...but only with meaningful engine damage
const BURN_RATE = 6; // HP lost per second while burning
const CHAIN_MIN = 1.2; // shortest fuse a chained explosion can leave
const CHAIN_MAX = 2; // longest fuse a chained explosion can leave
const LETHAL_FUSE = 1.5; // brief but readable countdown when a hit already leaves HP at 0
const CRITICAL_MAX = 100; // component damage is a bounded percentage
const KICK_SCALE = 13; // blast kick tuning: ~13 * falloff * sqrt(power/100) m/s
const KICK_CAP = 20; // never launch a car across the city

const safe = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);
const mitigation = (armor: number) => clamp(1 - 0.25 * Math.max(0, safe(armor)), 0, 1);
const critical = (n: number) => clamp(safe(n), 0, CRITICAL_MAX);

// Impact zone in vehicle-local space. The dominant axis wins; ties lean onto the front.
function zoneOf(localPoint: Vec): 'front' | 'rear' | 'side' {
  const x = safe(localPoint?.x), y = safe(localPoint?.y);
  if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? 'front' : 'rear';
  return 'side';
}

function addComponent(state: VehicleDamage, zone: 'front' | 'rear' | 'side', damage: number) {
  if (damage <= 0) return;
  if (zone === 'front') state.critical.engine = critical(state.critical.engine + damage);
  else if (zone === 'rear') state.critical.fuel = critical(state.critical.fuel + damage);
  else state.critical.tyres = critical(state.critical.tyres + damage);
}

// The fuse a fresh ignition should get. A hit that already zeroed HP lights a short, readable fire
// so the player sees the car burning for a beat before the blast rather than exploding on contact.
const ignitionFuse = (state: VehicleDamage, fuse: number) =>
  state.health <= 0 ? Math.min(safe(fuse, 7), LETHAL_FUSE) : safe(fuse, 7);

function shouldIgnite(state: VehicleDamage) {
  return state.critical.fuel > IGNITE_FUEL || state.critical.engine > IGNITE_ENGINE || state.health <= IGNITE_HEALTH;
}

// Recompute idle status only. Fire only ends through burning out (tick) or external repair, so an
// already-burning or wrecked state is never downgraded here — raising HP alone cannot cancel a fire.
function updateStatus(state: VehicleDamage) {
  if (state.status === 'wreck' || state.status === 'burning') return;
  if (state.health <= 0) { state.status = 'wreck'; return; }
  state.status = state.critical.engine > SMOKING_ENGINE || state.health < SMOKING_HEALTH ? 'smoking' : 'intact';
}

export function createVehicleDamage(): VehicleDamage {
  return {
    health: 100,
    critical: { engine: 0, fuel: 0, tyres: 0 },
    status: 'intact',
    fireTime: 0,
    fuse: 0,
    hitAt: -Infinity,
    blamed: false,
    bloodTime: 0,
  };
}

export function impactDamage(state: VehicleDamage, input: {
  impact: number; localPoint: Vec; armor: number; time: number; scale: number; blamed: boolean; fuse: number; invincible?: boolean;
}): { damage: number; ignited: boolean } {
  const none = { damage: 0, ignited: false };
  if (input.invincible || state.status === 'wreck') return none;
  const impact = safe(input.impact);
  if (impact < SMALL_IMPACT) return none; // small scuffs stay free and keep the cooldown available
  const time = safe(input.time);
  // Epsilon keeps an exact 0.22s gap working despite float subtraction (1.22 - 1 < 0.22).
  if (time - state.hitAt < IMPACT_COOLDOWN - 1e-9) return none;

  state.hitAt = time;
  const damage = Math.max(0, impact - 2) * 1.45 * safe(input.scale, 1) * mitigation(input.armor);
  state.health = Math.max(0, state.health - damage);
  const zone = zoneOf(input.localPoint);
  addComponent(state, zone, damage);

  // A catastrophic front hit can torch a car even before the usual critical thresholds trip.
  const catastrophic = zone === 'front' && impact > CATASTROPHIC_IMPACT && state.critical.engine >= CATASTROPHIC_ENGINE;
  if (shouldIgnite(state) || catastrophic) igniteVehicle(state, ignitionFuse(state, input.fuse), input.blamed);
  // Blame is sticky (OR) until an external repair resets the whole state.
  state.blamed = state.blamed || input.blamed;
  updateStatus(state);
  return { damage, ignited: state.status === 'burning' };
}

export function blastDamage(state: VehicleDamage, amount: number, input: {
  armor: number; time: number; scale: number; blamed: boolean; fuse: number; invincible?: boolean;
}): { damage: number; ignited: boolean } {
  const none = { damage: 0, ignited: false };
  if (input.invincible || state.status === 'wreck') return none;
  const raw = safe(amount);
  if (raw <= 0) return none;

  const damage = raw * safe(input.scale, 1) * mitigation(input.armor);
  state.health = Math.max(0, state.health - damage);
  // Blasts are omnidirectional: spread damage across components deterministically, clamped to 100.
  state.critical.engine = critical(state.critical.engine + damage * 0.4);
  state.critical.fuel = critical(state.critical.fuel + damage * 0.4);
  state.critical.tyres = critical(state.critical.tyres + damage * 0.2);
  state.blamed = state.blamed || input.blamed;

  if (state.status === 'burning') {
    // A nearby explosion shortens an existing fuse rather than restarting it.
    const chain = clamp(CHAIN_MAX - raw * 0.02, CHAIN_MIN, CHAIN_MAX);
    state.fuse = Math.min(state.fuse, chain);
    return { damage, ignited: true };
  }
  if (shouldIgnite(state)) {
    igniteVehicle(state, ignitionFuse(state, input.fuse), input.blamed);
    return { damage, ignited: true };
  }
  updateStatus(state);
  return { damage, ignited: false };
}

// Lighting an already-burning vehicle is idempotent: it can only shorten the remaining fuse and never
// resets fireTime or extends the countdown, so bumps cannot postpone an explosion.
export function igniteVehicle(state: VehicleDamage, fuse = 7, blamed = false): void {
  if (state.status === 'wreck') return; // a wreck cannot be lit again
  const next = Number.isFinite(fuse) ? Math.max(0, fuse) : 7;
  if (state.status === 'burning') {
    state.fuse = Math.min(state.fuse, next);
    state.blamed = state.blamed || blamed;
    return;
  }
  state.status = 'burning';
  state.fuse = next;
  state.fireTime = 0;
  state.blamed = state.blamed || blamed;
}

export function tickVehicleDamage(state: VehicleDamage, dt: number): 'none' | 'explode' {
  if (state.status === 'wreck') return 'none'; // already blasted: never explode twice
  if (state.status !== 'burning') { updateStatus(state); return 'none'; }

  const step = Math.max(0, safe(dt));
  state.fireTime += step;
  state.fuse -= step;
  state.health = Math.max(0, state.health - BURN_RATE * step);
  if (state.bloodTime > 0) state.bloodTime = Math.max(0, state.bloodTime - step);

  // The fuse alone detonates the car. Health can burn to zero first and the wreck still smoulders
  // until the fuse runs out, keeping the blast readable instead of instantaneous.
  if (state.fuse <= 0) {
    state.fuse = 0;
    state.health = 0;
    state.status = 'wreck'; // poison the state so later ticks are inert
    return 'explode';
  }
  return 'none';
}

// Bounded multipliers so a smoking (or even burning) cab stays steerable; only a wreck is immobile.
export function vehiclePerformance(state: VehicleDamage): { engine: number; grip: number } {
  if (state.status === 'wreck') return { engine: 0, grip: 0 };
  const engine = clamp(1 - state.critical.engine / 220 - (100 - state.health) / 400, 0.3, 1);
  const grip = clamp(1 - state.critical.tyres / 200 - (100 - state.health) / 500, 0.35, 1);
  return { engine, grip };
}

export function radialEffect(origin: Vec, target: Vec, radius: number, power: number): { damage: number; kick: Vec; falloff: number } {
  const r = safe(radius);
  const p = safe(power);
  if (r <= 0 || p <= 0) return { damage: 0, kick: vec(), falloff: 0 }; // nonpositive power is inert
  const d = dist(origin, target);
  if (!Number.isFinite(d) || d >= r) return { damage: 0, kick: vec(), falloff: 0 };
  const falloff = clamp(1 - d / r, 0, 1);
  // At the exact origin the gradient is undefined; pick a stable axis so the kick stays finite and non-zero.
  const direction = d < 1e-6 ? vec(1, 0) : normalize(sub(target, origin));
  // Damage stays linear in power; the velocity kick is a tuned, capped root so big blasts shove, not launch.
  const kickSpeed = Math.min(KICK_CAP, KICK_SCALE * falloff * Math.sqrt(p / 100));
  return { damage: p * falloff, kick: scale(direction, kickSpeed), falloff };
}

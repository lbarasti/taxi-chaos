// DOM-free audio messages. Gameplay never depends on an AudioContext or audio RNG.
import { clamp, dist, type Vec } from '../physics/physics';
import type { VehicleUpgrades } from '../vehicles/vehicle-upgrades';

export const soundLabels = {
  engine: 'Player engine', skid: 'Tyre skid', 'boost-start': 'Boost onset', 'boost-loop': 'Boost rush', 'boost-end': 'Boost release',
  bump: 'Light bump', crunch: 'Metal crunch', crash: 'Heavy crash', wood: 'Wood smash', metal: 'Metal clutter', glass: 'Glass break',
  collapse: 'Structure collapse', explosion: 'Explosion', fire: 'Burning fire', siren: 'Police siren', horn: 'Soft traffic horn', body: 'Body impact', pulp: 'Pulp layer',
  pickup: 'Passenger pickup', payment: 'Fare payment', purchase: 'Upgrade purchase', repair: 'Garage repair', escape: 'Police escaped', arrest: 'Arrest',
} as const;
export type SoundCue = keyof typeof soundLabels;
export type SoundEvent = { cue: SoundCue; time: number; position?: Vec; strength: number; priority: number };
export const isSoundCue = (value: string): value is SoundCue => Object.hasOwn(soundLabels, value);
export function soundPriority(cue: SoundCue) { return cue === 'horn' ? 1 : cue === 'explosion' || cue === 'collapse' ? 5 : ['pickup', 'payment', 'purchase', 'repair', 'escape', 'arrest'].includes(cue) ? 4 : cue === 'crash' ? 3 : 2; }

/** Surrounding world FX share ambience; the player's driving and feedback stay independent.
 * New world cues (such as crowd reactions) join the ambient mix by default. */
export function isAmbientCue(cue: SoundCue) {
  return !(['engine', 'skid', 'boost-start', 'boost-loop', 'boost-end', 'siren', 'pickup', 'payment', 'purchase', 'repair', 'escape', 'arrest'] as SoundCue[]).includes(cue);
}

export class SoundEvents {
  private queue: SoundEvent[] = [];
  private cooldowns = new Map<string, number>();
  private nextHorn = -Infinity;
  epoch = 0;
  emit(cue: SoundCue, time: number, options: { position?: Vec; strength?: number; key?: string; cooldown?: number } = {}) {
    // One shared gap prevents a crowd or pile-up from becoming a wall of horns.
    if (cue === 'horn' && time < this.nextHorn) return;
    if (options.key) {
      if ((this.cooldowns.get(options.key) ?? -Infinity) > time) return;
      this.cooldowns.delete(options.key);
      this.cooldowns.set(options.key, time + (options.cooldown ?? 0.18));
      if (this.cooldowns.size > 256) this.cooldowns.delete(this.cooldowns.keys().next().value!);
    }
    const event: SoundEvent = { cue, time, position: options.position && { ...options.position }, strength: clamp(options.strength ?? 1, 0, 2), priority: soundPriority(cue) };
    if (this.queue.length >= 64) {
      const lowest = this.queue.reduce((index, e, i, all) => e.priority < all[index].priority ? i : index, 0);
      if (this.queue[lowest].priority > event.priority) return;
      this.queue.splice(lowest, 1);
    }
    this.queue.push(event);
    if (cue === 'horn') this.nextHorn = time + 2.5;
  }
  drain(time: number) { const events = this.queue.filter(e => time - e.time <= 0.35); this.queue = []; return events; }
  clear() { this.queue = []; }
  reset() { this.clear(); this.cooldowns.clear(); this.nextHorn = -Infinity; this.epoch++; }
}

/** Pan follows screen/world X, not cab heading (the top-down camera never rotates). */
export function spatialSound(listener: Vec, source?: Vec, range = 75) {
  if (!source) return { gain: 1, pan: 0 };
  const distance = dist(listener, source);
  return { gain: (1 - clamp(distance / range, 0, 1)) ** 2, pan: clamp((source.x - listener.x) / 35, -0.8, 0.8) };
}
export function drivingSound(speed: number, throttle: number, slip: number, boosting: boolean, upgrades: Pick<VehicleUpgrades, 'engine' | 'boost'> = { engine: 0, boost: 0 }) {
  // Engine levels deepen and fill out the exhaust; boost levels sharpen the rush.
  const engine = clamp(upgrades.engine, 0, 3), boost = clamp(upgrades.boost, 0, 3);
  const load = clamp(throttle, 0, 1), pace = clamp(speed / 40, 0, 1);
  // Blend a low idle with a rougher engine under load; lifting off softens it.
  const power = clamp(load * 0.8 + pace * 0.2 + (boosting ? 0.15 : 0), 0, 1);
  // Layer balance only. The transmission owns RPM, the shift envelope and the
  // overall gain, so two engine recordings cannot each claim a full engine level.
  return {
    enginePitch: 1 - engine * 0.03,
    engineGain: (1 - power * 0.65) * (1 + engine * 0.035),
    engineLoadGain: power * 0.85 * (1 + engine * 0.14),
    engineCutoff: 650 + load * 700 + pace * 250 + engine * 70,
    boostGain: boosting ? 0.28 + boost * 0.04 : 0,
    boostRate: 1 + boost * 0.08,
    boostCutoff: 3000 + boost * 650,
    skidGain: clamp((slip - 1.1) / 9, 0, 0.5) * clamp((speed - 3) / 7, 0, 1),
  };
}

/** Above three nearby cars, raise the traffic mix gently, capped at eight. */
export function trafficEngineGain(nearbyCars: number) {
  return nearbyCars <= 0 ? 0 : 0.075 * (1 + clamp((nearbyCars - 3) / 5, 0, 1) * 0.5);
}

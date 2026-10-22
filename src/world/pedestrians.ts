// Pedestrian street simulation: anticipation, collision-free escape, fatal pulp-gore
// impacts and corpse drag. Pure physics/ped-model code — it never touches vehicle bodies,
// Game state, money, rendering or audio. main.ts owns blood/shred spawning, crime
// assignment and vehicle momentum loss from the returned events.
import { Body, add, clamp, dist, dot, length, rotate, scale, sub, vec, type Vec } from '../physics/physics';
import { blocksWalking, type Person, type World } from './world';

export type PedestrianVehicle = { id: number; body: Body; kind: 'taxi' | 'police' | 'traffic' };
export type PedestrianEvent = {
  type: 'killed' | 'hit';
  personId: number;
  vehicleId: number;
  position: Vec;
  impact: number;
  force: Vec;
  blamed: boolean;
};

/** Person collision radius, in metres. */
export const PERSON_RADIUS = 0.3;
/** Closing speed above which a gore-mode impact is fatal. */
export const FATAL_IMPACT = 6;
/** Seconds of immunity from repeated non-fatal hit events/crime per person. */
export const HIT_COOLDOWN = 0.6;

const MOVING_SPEED = 2; // cars slower than this are parked, not a threat
const PANIC_RANGE = 9; // any moving car this close spooks people
const ANTICIPATE_RANGE = 15; // an approaching car is anticipated this far out
const ESCAPE_SPEED = 5.2;
const CORPSE_MAX_SPEED = 13;
const CORPSE_KICK = 0.35; // fraction of the incoming body velocity retained on death
const CORPSE_DRAG = 2.4;
const MAX_STEP = 0.25; // corpse sub-step length, so thin statics can never be tunnelled

// Cadence margin. updatePedestrians is stateless between calls, so the only cadence
// risk is a car skipping a pedestrian between samples. At the coarsest expected
// cadence (30 Hz, fixedDt 1/30) a 35 m/s car advances ~1.17 m per call. The smallest
// car extent (Body.h = 2.1 m) plus the person diameter (2 × 0.3 m) gives a 2.7 m
// overlap band, so ≥2 samples land inside; the front-facing half-band is 1.35 m,
// which still exceeds the 1.17 m step, so a head-on contact is always sampled before
// the car centre passes the pedestrian. Tunnelling would need >2.7 m/call (>81 m/s at
// 30 Hz, or >40 m/s in the worst short-axis alignment); game vehicles peak ~32 m/s.
// Cost per call is O(people × vehicles) narrow-phase checks, plus O(people ×
// candidates) only for panicking people — comfortably real-time at city density.
export const CONTACT_BAND_MIN = 2.1 + PERSON_RADIUS * 2;

type CircleHit = { normal: Vec; depth: number; point: Vec };

/** Scratch probes: pedestrian queries are synchronous and never nested, so one body
 *  per helper avoids an allocation per candidate without aliasing a live result. */
const penetrationProbe = new Body(0, 0, 1, 0, 0);
const separateProbe = new Body(0, 0, 1, 0, 0);

/**
 * Circle-vs-OBB in the body's local frame (+x forward, matching CarDynamics).
 * `normal` always points from the body toward the circle centre. Person radius
 * is ~0.3 m, so a contact is resolved against the true rotated car footprint.
 */
function circleBody(body: Body, center: Vec, radius: number): CircleHit | null {
  // One trig pair for the whole test: every call reuses it for the local transform
  // and for mapping the normal and contact point back to world space.
  const cos = Math.cos(body.angle), sin = Math.sin(body.angle);
  const rx = center.x - body.position.x, ry = center.y - body.position.y;
  const local = vec(cos * rx + sin * ry, -sin * rx + cos * ry);
  const hw = body.w / 2, hh = body.h / 2;
  const cx = clamp(local.x, -hw, hw), cy = clamp(local.y, -hh, hh);
  const dx = local.x - cx, dy = local.y - cy;
  let normalX: number, normalY: number, depth: number;
  if (dx === 0 && dy === 0) {
    // Centre is inside (or exactly on) the footprint: push out of the nearest face.
    const px = hw - Math.abs(local.x), py = hh - Math.abs(local.y);
    if (px <= py) { normalX = local.x < 0 ? -1 : 1; normalY = 0; depth = px + radius; }
    else { normalX = 0; normalY = local.y < 0 ? -1 : 1; depth = py + radius; }
  } else {
    const d = Math.hypot(dx, dy);
    if (d > radius) return null;
    normalX = d > 1e-6 ? dx / d : 1; normalY = d > 1e-6 ? dy / d : 0;
    depth = radius - d;
  }
  return {
    normal: vec(cos * normalX - sin * normalY, sin * normalX + cos * normalY),
    depth,
    point: vec(body.position.x + (cos * cx - sin * cy), body.position.y + (sin * cx + cos * cy)),
  };
}

/** Deepest penetration of a circle against any alive world prop, or 0. */
function penetration(world: World, center: Vec, radius: number): number {
  const probe = penetrationProbe;
  probe.position.x = center.x; probe.position.y = center.y;
  probe.w = radius * 2; probe.h = radius * 2;
  let worst = 0;
  for (const prop of world.hash.query(probe)) {
    if (!blocksWalking(prop.kind)) continue;
    const hit = circleBody(prop.body, center, radius);
    if (hit && hit.depth > worst) worst = hit.depth;
  }
  return worst;
}

/** Push a circle out of every alive static prop, iterating until it is clear. */
function separate(world: World, center: Vec, radius: number): Vec {
  let p = { ...center };
  for (let iter = 0; iter < 6; iter++) {
    const probe = separateProbe;
    probe.position.x = p.x; probe.position.y = p.y;
    probe.w = radius * 2; probe.h = radius * 2;
    let worst = 0, normal = vec();
    for (const prop of world.hash.query(probe)) {
      if (!blocksWalking(prop.kind)) continue;
      const hit = circleBody(prop.body, p, radius);
      if (hit && hit.depth > worst) { worst = hit.depth; normal = hit.normal; }
    }
    if (worst <= 1e-4) break;
    p = add(p, scale(normal, worst + 0.001));
  }
  return p;
}

/**
 * Move a person to `candidate`, but refuse any move that makes them penetrate
 * static geometry more than they already did. This is what keeps a cornered
 * pedestrian out of a building even when every escape direction is walled.
 *
 * The common case is open ground: when separation leaves the candidate untouched it
 * cannot penetrate anything, so the two validation scans are unnecessary. That keeps
 * ordinary walking at one spatial query instead of three.
 */
function moveTo(world: World, person: Person, candidate: Vec, radius: number): void {
  const next = separate(world, candidate, radius);
  if (next.x === candidate.x && next.y === candidate.y) { person.position = next; return; }
  const before = penetration(world, person.position, radius);
  const after = penetration(world, next, radius);
  person.position = after > Math.max(before, 0.03) + 1e-3 ? separate(world, person.position, radius) : next;
}

/** Pick a clear escape step that maximises distance from threats. */
function flee(world: World, person: Person, threats: PedestrianVehicle[], dt: number): Vec {
  const { roadDistance, roadProjection } = world.navigation;
  const step = ESCAPE_SPEED * dt;
  const dirs: Vec[] = [];
  let nearest: PedestrianVehicle | undefined, nearestD = Infinity;
  for (const v of threats) {
    const dx = v.body.position.x - person.position.x, dy = v.body.position.y - person.position.y, d2 = dx * dx + dy * dy;
    if (d2 < nearestD) { nearestD = d2; nearest = v; }
  }
  if (nearest) {
    const away = sub(person.position, nearest.body.position);
    const base = length(away) > 1e-4 ? away : vec(0, -1);
    for (const angle of [0, 0.55, -0.55, 1.15, -1.15, 1.9, -1.9]) dirs.push(rotate(base, angle));
  }
  // Bias toward the sidewalk/street rather than deeper into a block.
  const proj = roadProjection(person.position);
  if (dist(person.position, proj) > 0.4) dirs.push(sub(proj, person.position));
  dirs.push(vec(1, 0), vec(-1, 0), vec(0, 1), vec(0, -1));
  let best = person.position, bestScore = -Infinity;
  for (const dir of dirs) {
    const len = length(dir);
    if (len < 1e-4) continue;
    const candidate = add(person.position, scale(dir, step / len));
    let score = -penetration(world, candidate, PERSON_RADIUS) * 120;
    for (const v of threats) {
      const dx = candidate.x - v.body.position.x, dy = candidate.y - v.body.position.y;
      score += Math.min(Math.hypot(dx, dy), 16) * 0.35;
    }
    score -= roadDistance(candidate) * 0.04;
    if (score > bestScore) { bestScore = score; best = candidate; }
  }
  return best;
}

/** Customers hold near home; ordinary civilians keep the prior local sinusoidal wander. */
function wanderTarget(world: World, person: Person, time: number): Vec {
  if (person.role === 'customer') return person.home;
  return add(person.home, scale(person.wander ?? vec(0,4), Math.sin(time * 0.3 + person.phase)));
}

/** Integrate a corpse with drag, static separation and bounded speed. */
function updateCorpse(world: World, person: Person, movers: PedestrianMover[], dt: number): void {
  person.velocity = scale(person.velocity, Math.exp(-CORPSE_DRAG * dt));
  let speed = length(person.velocity);
  if (speed > CORPSE_MAX_SPEED) { person.velocity = scale(person.velocity, CORPSE_MAX_SPEED / speed); speed = CORPSE_MAX_SPEED; }
  if (speed < 0.04) person.velocity = vec();
  else {
    const steps = Math.max(1, Math.ceil(speed * dt / MAX_STEP));
    const subDt = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (length(person.velocity) < 0.04) break;
      const intended = add(person.position, scale(person.velocity, subDt));
      const before = penetration(world, person.position, PERSON_RADIUS);
      let next = separate(world, intended, PERSON_RADIUS);
      if (penetration(world, next, PERSON_RADIUS) > before + 0.06) next = { ...person.position };
      if (dist(next, intended) > 0.01) person.velocity = scale(person.velocity, 0.6); // lost energy to a wall
      person.position = next;
    }
  }
  // Always keep the corpse clear of statics, and never resting inside a vehicle.
  person.position = separate(world, person.position, PERSON_RADIUS);
  for (const mover of movers) {
    const dx = mover.x - person.position.x, dy = mover.y - person.position.y;
    if (dx * dx + dy * dy > mover.reach2) continue;
    const hit = circleBody(mover.vehicle.body, person.position, PERSON_RADIUS);
    if (hit) person.position = separate(world, add(person.position, scale(hit.normal, hit.depth + 0.02)), PERSON_RADIUS);
  }
  // Shoreline props and bridge rails bound corpses just like living pedestrians.
  // Clamping to the original city rectangle teleports rural impacts across the river.
}

/** Vehicle facts that stay constant for one pedestrian tick: position, speed and the
 *  circumradius used as a conservative contact broad phase. */
type PedestrianMover = { vehicle: PedestrianVehicle; x: number; y: number; cos: number; sin: number; speed: number; moving: boolean; reach2: number };

function moversFor(vehicles: PedestrianVehicle[]): PedestrianMover[] {
  const movers: PedestrianMover[] = [];
  for (const vehicle of vehicles) {
    const body = vehicle.body;
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    const reach = Math.hypot(body.w, body.h) / 2 + PERSON_RADIUS;
    movers.push({
      vehicle, x: body.position.x, y: body.position.y,
      cos: Math.cos(body.angle), sin: Math.sin(body.angle),
      speed, moving: speed > MOVING_SPEED, reach2: reach * reach,
    });
  }
  return movers;
}

/**
 * Kill a pedestrian once. Handles fatal blast hits as well as road impacts:
 * force is the incoming body velocity (or blast impulse), and the corpse keeps
 * ~35% of it as a kick. Returns false when the person is already dead, so a
 * caller firing several blasts only reports the first.
 */
export function killPedestrian(person: Person, force: Vec, time: number): boolean {
  if (!person.alive) return false;
  person.alive = false;
  person.aboard = false;
  person.health = 0;
  person.deathTime = time;
  person.panic = 0;
  if (length(force) > 1e-3) {
    person.angle = Math.atan2(force.y, force.x);
    person.velocity = add(person.velocity, scale(force, CORPSE_KICK));
    const speed = length(person.velocity);
    if (speed > CORPSE_MAX_SPEED) person.velocity = scale(person.velocity, CORPSE_MAX_SPEED / speed);
  }
  return true;
}

/**
 * Advance every street pedestrian against the supplied vehicles and return the
 * impacts that main.ts should visualise/score. Aboard passengers and corpses are
 * excluded from threat/contact handling; the gore flag gates only fatalities.
 */
export function updatePedestrians(
  world: World,
  vehicles: PedestrianVehicle[],
  settings: { gore: boolean },
  dt: number,
  time: number,
): PedestrianEvent[] {
  const events: PedestrianEvent[] = [];
  const gore = settings?.gore ?? false;
  const movers = moversFor(vehicles);

  for (const person of world.people) {
    if (person.aboard) continue;
    if (!person.alive) { updateCorpse(world, person, movers, dt); continue; }

    // Anticipate every kind of moving car, including ones heading for the person.
    const threats: PedestrianVehicle[] = [];
    for (const mover of movers) {
      if (!mover.moving) continue;
      const tx = person.position.x - mover.x, ty = person.position.y - mover.y;
      const distance = Math.hypot(tx, ty);
      if (distance > ANTICIPATE_RANGE) continue;
      threats.push(mover.vehicle);
      if (distance < PANIC_RANGE) person.panic = 1;
      else if (distance > 1e-4) {
        const inv = 1 / distance;
        if (mover.cos * (tx * inv) + mover.sin * (ty * inv) > 0.15) person.panic = 1;
      }
    }

    // Contact against the real rotated car footprint, in car-local coordinates.
    // The circumradius test rejects the far majority of person/vehicle pairs without
    // any trig or allocation; anything inside it still takes the exact circle test.
    for (const mover of movers) {
      const dx = mover.x - person.position.x, dy = mover.y - person.position.y;
      if (dx * dx + dy * dy > mover.reach2) continue;
      const vehicle = mover.vehicle;
      const hit = circleBody(vehicle.body, person.position, PERSON_RADIUS);
      if (!hit) continue;
      const incoming = vehicle.body.velocityAt(hit.point);
      const closing = Math.max(0, dot(sub(incoming, person.velocity), hit.normal));
      const blamed = vehicle.kind === 'taxi';

      if (gore && closing > FATAL_IMPACT) {
        if (killPedestrian(person, incoming, time)) {
          events.push({
            type: 'killed', personId: person.id, vehicleId: vehicle.id,
            position: { ...person.position }, impact: closing, force: { ...incoming }, blamed,
          });
        }
        break;
      }

      // Non-fatal: always clear the person out of the vehicle body. The push is
      // capped and resolved against statics each frame, so a deep overlap can
      // never eject someone straight through a thin wall to the far side.
      const push = Math.min(hit.depth + 0.05, 0.3);
      const clear = separate(world, add(person.position, scale(hit.normal, push)), PERSON_RADIUS);
      moveTo(world, person, clear, PERSON_RADIUS);
      // A parked/blocking vehicle is just an obstacle: no injury, panic or event.
      if (closing <= 0.5) continue;
      person.panic = 1;
      if (time - person.hitAt >= HIT_COOLDOWN) {
        person.hitAt = time;
        const damage = Math.max(3, closing * 3);
        person.health = gore ? Math.max(0, person.health - damage) : Math.max(1, person.health - damage);
        person.velocity = add(person.velocity, scale(hit.normal, Math.max(1.6, closing * 0.7)));
        // Accumulated blunt trauma is still fatal below the single-hit threshold:
        // when injury reaches zero, convert this blow into a real kill and report
        // it once as 'killed' so no zero-HP survivor lingers. With gore off the
        // health floor above keeps them alive forever.
        if (gore && person.health <= 0) {
          if (killPedestrian(person, incoming, time)) {
            events.push({
              type: 'killed', personId: person.id, vehicleId: vehicle.id,
              position: { ...person.position }, impact: closing, force: { ...incoming }, blamed,
            });
          }
          break;
        }
        events.push({
          type: 'hit', personId: person.id, vehicleId: vehicle.id,
          position: { ...person.position }, impact: closing, force: { ...incoming }, blamed,
        });
      }
    }

    if (!person.alive) continue; // killed this frame; corpse integration starts next frame

    if (person.fall) {
      // Ejected motorcyclists are independent sliding bodies until their tumble
      // ends. Substep against static geometry so they cannot tunnel through walls.
      const fall = person.fall;
      fall.elapsed += dt;
      const speed = length(person.velocity);
      const steps = Math.max(1, Math.ceil(speed * dt / MAX_STEP));
      for (let i = 0; i < steps; i++) {
        const intended = add(person.position, scale(person.velocity, dt / steps));
        moveTo(world, person, intended, PERSON_RADIUS);
        if (dist(person.position, intended) > 0.1) person.velocity = scale(person.velocity, 0.65);
        for (const mover of movers) {
          const dx = mover.x - person.position.x, dy = mover.y - person.position.y;
          if (dx * dx + dy * dy > mover.reach2) continue;
          const hit = circleBody(mover.vehicle.body, person.position, PERSON_RADIUS);
          if (hit) person.position = separate(world, add(person.position, scale(hit.normal, hit.depth + 0.04)), PERSON_RADIUS);
        }
      }
      person.velocity = scale(person.velocity, Math.exp(-dt * (fall.elapsed < 0.17 ? 0.7 : 4.3)));
      person.angle += fall.angularVelocity * dt;
      fall.angularVelocity *= Math.exp(-dt * 2);
      if (fall.elapsed >= fall.duration) {
        person.fall = undefined;
        person.velocity = vec();
        person.home = { ...person.position };
        person.panic = 1.5;
      }
      continue;
    }

    // Any knock impulse is applied every frame and decays, panic or not.
    const impulse = scale(person.velocity, dt);
    person.velocity = length(person.velocity) < 0.05 ? vec() : scale(person.velocity, Math.exp(-6 * dt));

    if (person.panic > 0) {
      moveTo(world, person, add(flee(world, person, threats, dt), impulse), PERSON_RADIUS);
      person.panic = Math.max(0, person.panic - dt * 0.35);
    } else {
      const target = wanderTarget(world, person, time);
      const delta = sub(target, person.position), d = length(delta);
      let candidate = person.position;
      if (d > 0.05) {
        const speed = person.role === 'customer' ? 1.1 : 1.7;
        const step = Math.min(d, speed * dt);
        candidate = add(person.position, scale(delta, step / d));
      }
      moveTo(world, person, add(candidate, impulse), PERSON_RADIUS);
    }
  }

  return events;
}

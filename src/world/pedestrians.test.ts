import { describe, expect, it } from 'vitest';
import { Body, CarDynamics, add, dist, length, scale, vec } from '../physics';
import { World, type Person } from './world';
import {
  CONTACT_BAND_MIN, FATAL_IMPACT, HIT_COOLDOWN, PERSON_RADIUS,
  killPedestrian, updatePedestrians,
  type PedestrianEvent, type PedestrianVehicle,
} from './pedestrians';

// Isolated city: no generated clutter or residents, so each test controls its own layout.
function clearWorld(): World {
  const w = new World();
  w.people.length = 0;
  w.props.length = 0;
  w.hash.cells.clear();
  return w;
}

function car(x: number, y: number, angle: number, velocity: ReturnType<typeof vec>, kind: PedestrianVehicle['kind'] = 'taxi', id = 0): PedestrianVehicle {
  const body = new Body(x, y);
  body.angle = angle;
  body.velocity = { ...velocity };
  return { id, body, kind };
}

// Real approach: the vehicle actually travels each frame (no overlapping-only mirror).
function drive(w: World, vehicles: PedestrianVehicle[], seconds: number, gore: boolean, dt = 1 / 120): PedestrianEvent[] {
  const events: PedestrianEvent[] = [];
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    for (const v of vehicles) v.body.position = add(v.body.position, scale(v.body.velocity, dt));
    events.push(...updatePedestrians(w, vehicles, { gore }, dt, i * dt));
  }
  return events;
}

const nearestSolidGap = (w: World, p: Person) => {
  let gap = Infinity;
  for (const prop of w.props) {
    const dx = Math.max(Math.abs(p.position.x - prop.body.position.x) - prop.body.w / 2 - PERSON_RADIUS, 0);
    const dy = Math.max(Math.abs(p.position.y - prop.body.position.y) - prop.body.h / 2 - PERSON_RADIUS, 0);
    gap = Math.min(gap, Math.hypot(dx, dy));
  }
  return gap;
};

describe('pedestrian impacts and gore gating', () => {
  it.each([false, true])('tumbling riders still take vehicle hits with gore=%s', gore => {
    const w = clearWorld(), person = w.addPerson(vec(12.2, 10));
    person.fall = { elapsed: 0.3, duration: 1.5, angularVelocity: 4 };
    const vehicle = car(10, 10, 0, vec(18, 0));
    const events = updatePedestrians(w, [vehicle], { gore }, 1 / 120, 1);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(gore ? 'killed' : 'hit');
    expect(events[0].blamed).toBe(true);
    expect(person.alive).toBe(!gore);
    expect(person.health).toBeLessThan(100);
  });

  it('kills on a real high-speed approach in gore mode and reports blamed once', () => {
    const w = clearWorld();
    const person = w.addPerson(vec(10, 10));
    const vehicle = car(10, 2, Math.PI / 2, vec(0, 18));
    const events: PedestrianEvent[] = [];
    let kick = 0;
    const dt = 1 / 120;
    for (let i = 0; i < Math.round(0.8 / dt); i++) {
      vehicle.body.position = add(vehicle.body.position, scale(vehicle.body.velocity, dt));
      const frame = updatePedestrians(w, [vehicle], { gore: true }, dt, i * dt);
      if (frame.some(e => e.type === 'killed')) kick = length(person.velocity);
      events.push(...frame);
    }
    const killed = events.filter(e => e.type === 'killed');
    expect(killed.length).toBe(1);
    expect(killed[0].personId).toBe(person.id);
    expect(killed[0].vehicleId).toBe(vehicle.id);
    expect(killed[0].blamed).toBe(true);
    expect(killed[0].impact).toBeGreaterThan(FATAL_IMPACT);
    expect(killed[0].force.y).toBeGreaterThan(0);
    expect(person.alive).toBe(false);
    expect(person.health).toBe(0);
    expect(person.aboard).toBe(false);
    expect(person.deathTime).toBeGreaterThanOrEqual(0);
    expect(kick).toBeGreaterThan(0); // corpse took a kick from the incoming body velocity
    expect(person.angle).toBeGreaterThan(0);
  });

  it('kills under a physically integrated accelerating car in gore mode', () => {
    const w = clearWorld();
    const person = w.addPerson(vec(40, 40));
    const body = new Body(40, 30);
    body.angle = Math.PI / 2;
    body.velocity = vec(0, 6);
    const vehicle: PedestrianVehicle = { id: 0, body, kind: 'taxi' };
    const dynamics = new CarDynamics();
    let killed = false;
    const dt = 1 / 120;
    for (let i = 0; i < Math.round(2 / dt); i++) {
      dynamics.apply(body, { throttle: 1, turn: 0, handbrake: false }, dt);
      body.integrate(dt);
      if (updatePedestrians(w, [vehicle], { gore: true }, dt, i * dt).some(e => e.type === 'killed')) killed = true;
    }
    expect(killed).toBe(true);
    expect(person.alive).toBe(false);
  });

  it('preserves every life when gore is disabled, even at lethal speed', () => {
    const w = clearWorld();
    const person = w.addPerson(vec(10, 10));
    const vehicle = car(10, 2, Math.PI / 2, vec(0, 18));
    const events = drive(w, [vehicle], 0.8, false);
    expect(events.some(e => e.type === 'killed')).toBe(false);
    expect(person.alive).toBe(true);
    expect(person.health).toBeGreaterThan(0);
    expect(person.deathTime).toBe(-1);
  });

  it('knocks a pedestrian aside with modest injury on a low-speed hit', () => {
    const w = clearWorld();
    const person = w.addPerson(vec(10, 10));
    const vehicle = car(10, 8.4, Math.PI / 2, vec(0, 3));
    const events = drive(w, [vehicle], HIT_COOLDOWN * 0.9, true);
    expect(events.some(e => e.type === 'hit')).toBe(true);
    expect(events.some(e => e.type === 'killed')).toBe(false);
    expect(person.alive).toBe(true);
    expect(person.health).toBeLessThan(100);
    expect(person.health).toBeGreaterThan(0);
    expect(person.hitAt).toBeGreaterThanOrEqual(0);
  });

  it('never re-reports a corpse or touches an aboard passenger', () => {
    const w = clearWorld();
    const corpse = w.addPerson(vec(10, 10));
    const aboard = w.addPerson(vec(50, 50));
    aboard.aboard = true;
    killPedestrian(corpse, vec(0, 12), 1);
    const vehicles = [car(10, 2, Math.PI / 2, vec(0, 18), 'taxi', 0), car(50, 42, Math.PI / 2, vec(0, 18), 'traffic', 1)];
    const events = drive(w, vehicles, 0.8, true);
    expect(events.filter(e => e.type === 'killed').length).toBe(0);
    expect(events.every(e => e.personId !== aboard.id)).toBe(true);
    expect(corpse.alive).toBe(false);
    expect(aboard.alive).toBe(true);
    expect(aboard.aboard).toBe(true);
  });

  it('blames only taxi-driven impacts', () => {
    const w = clearWorld();
    const a = w.addPerson(vec(10, 10));
    const b = w.addPerson(vec(60, 10));
    const vehicles = [car(10, 2, Math.PI / 2, vec(0, 18), 'police', 7), car(60, 2, Math.PI / 2, vec(0, 18), 'traffic', 8)];
    const events = drive(w, vehicles, 0.8, true);
    const killed = events.filter(e => e.type === 'killed');
    expect(killed.map(e => e.personId).sort()).toEqual([a.id, b.id].sort());
    expect(killed.every(e => !e.blamed)).toBe(true);
  });
});

describe('pedestrian anticipation and escape', () => {
  it('panics near a moving NPC car of any kind, but not a parked one', () => {
    const w = clearWorld();
    const spooked = w.addPerson(vec(20, 20));
    const npc = car(20, 26, Math.PI / 2, vec(0, 6), 'traffic');
    updatePedestrians(w, [npc], { gore: false }, 1 / 120, 0);
    expect(spooked.panic).toBeGreaterThan(0);

    const calm = w.addPerson(vec(80, 80));
    const parked = car(80, 86, Math.PI / 2, vec(0, 0), 'police');
    updatePedestrians(w, [parked], { gore: false }, 1 / 120, 0);
    expect(calm.panic).toBe(0);
  });

  it('treats a parked vehicle as an obstacle, not a hit', () => {
    const w = clearWorld();
    const person = w.addPerson(vec(10, 10));
    const parked = car(10, 8.6, Math.PI / 2, vec(0, 0));
    const events = drive(w, [parked], 0.4, true);
    expect(events.length).toBe(0);
    expect(person.alive).toBe(true);
    expect(person.health).toBe(100);
    expect(person.panic).toBe(0);
    expect(person.position.y).toBeGreaterThan(10.7); // stepped clear of the car footprint
  });

  it('escapes along clear ground instead of into a building when cornered', () => {
    const w = clearWorld();
    w.add('building', 10, 6, 12, 4, '#333', 'WALL'); // solid slab behind the person (y 4..8)
    const person = w.addPerson(vec(10, 10));
    const vehicle = car(10, 15, -Math.PI / 2, vec(0, -7)); // drives down toward the person
    drive(w, [vehicle], 0.7, false);
    expect(person.alive).toBe(true);
    // Never ends up inside the slab: centre stays outside its top face plus the person radius.
    expect(person.position.y).toBeGreaterThan(8 + PERSON_RADIUS - 0.06);
    expect(nearestSolidGap(w, person)).toBeGreaterThan(-0.02);
  });

  it('keeps customers near home and lets civilians wander the sidewalk', () => {
    const w = clearWorld();
    const customer = w.addPerson(vec(100, 100), 'customer');
    const civilian = w.addPerson(vec(140, 140), 'civilian');
    let furthest = 0;
    for (let i = 0; i < 120 * 3; i++) {
      updatePedestrians(w, [], { gore: false }, 1 / 120, i / 120);
      furthest = Math.max(furthest, dist(civilian.position, civilian.home));
    }
    expect(dist(customer.position, customer.home)).toBeLessThan(1.5);
    expect(furthest).toBeGreaterThan(0.2);
    expect(furthest).toBeLessThanOrEqual(4.5);
  });
});

describe('corpse handling and killPedestrian', () => {
  it('reports a fatal hit once and kicks the corpse along the force', () => {
    const w = clearWorld();
    const person = w.addPerson(vec(5, 5));
    expect(killPedestrian(person, vec(20, 3), 7)).toBe(true);
    expect(killPedestrian(person, vec(20, 3), 7)).toBe(false);
    expect(person.alive).toBe(false);
    expect(person.health).toBe(0);
    expect(person.deathTime).toBe(7);
    expect(person.velocity.x).toBeGreaterThan(0);
    expect(person.velocity.x).toBeCloseTo(20 * 0.35, 5);
    expect(person.angle).toBeCloseTo(Math.atan2(3, 20), 6);
  });

  it('handles fatal blast hits on an aboard passenger once and clears aboard', () => {
    const w = clearWorld();
    const person = w.addPerson(vec(6, 6));
    person.aboard = true;
    expect(killPedestrian(person, vec(8, 0), 2)).toBe(true);
    expect(person.alive).toBe(false);
    expect(person.aboard).toBe(false);
    expect(killPedestrian(person, vec(8, 0), 3)).toBe(false);
  });

  it('drags a corpse against static geometry without tunnelling into a building', () => {
    const w = clearWorld();
    w.add('building', 20, 20, 10, 10, '#333', 'WALL'); // spans 15..25 on both axes
    const person = w.addPerson(vec(20, 14.4));
    killPedestrian(person, vec(0, 10), 0);
    for (let i = 0; i < 120 * 2; i++) updatePedestrians(w, [], { gore: true }, 1 / 120, i / 120);
    const inside = Math.abs(person.position.x - 20) < 5 - PERSON_RADIUS && Math.abs(person.position.y - 20) < 5 - PERSON_RADIUS;
    expect(inside).toBe(false);
    expect(length(person.velocity)).toBeLessThanOrEqual(13.0001);
  });

  it('bounds a corpse kicked directly through a wall', () => {
    const w = clearWorld();
    w.add('building', 120, 120, 8, 40, '#333', 'WALL'); // long thin wall to tunnel through
    const person = w.addPerson(vec(110, 120));
    killPedestrian(person, vec(200, 0), 0); // would be clamped at 13 m/s by design
    for (let i = 0; i < 240; i++) {
      updatePedestrians(w, [], { gore: true }, 1 / 120, i / 120);
      expect(person.position.x).toBeLessThan(116 + PERSON_RADIUS);
    }
  });
});

describe('accumulated blunt injury still kills (gore only)', () => {
  it('converts a low-speed blow that zeroes health into a kill, not a zero-HP zombie', () => {
    const w = clearWorld();
    const person = w.addPerson(vec(10, 10));
    person.health = 10; // a single sub-threshold hit now overflows the remaining injury
    const vehicle = car(10, 8.4, Math.PI / 2, vec(0, 4)); // closing ~4 < FATAL_IMPACT
    const events = drive(w, [vehicle], 0.3, true);
    const killed = events.filter(e => e.type === 'killed');
    expect(killed.length).toBe(1);
    expect(killed[0].personId).toBe(person.id);
    expect(events.some(e => e.type === 'hit')).toBe(false); // the killing blow reports as killed
    expect(person.alive).toBe(false);
    expect(person.health).toBe(0);
    expect(person.deathTime).toBeGreaterThanOrEqual(0);
  });

  it('accumulates repeated low-speed hits into exactly one kill and never leaves an alive zero-HP person', () => {
    const w = clearWorld();
    // A pocket (ceiling + side walls) keeps the pedestrian in the path so a slow car
    // lands repeated head-on blows, each on its own 0.6 s cooldown. The side walls are
    // only as wide as the car, so the pedestrian cannot sidestep out of the footprint.
    w.add('building', 10, 13, 40, 4, '#333', 'CEILING'); // y 11..15
    w.add('building', 8, 8, 2, 16, '#333', 'LEFT'); // x 7..9
    w.add('building', 12, 8, 2, 16, '#333', 'RIGHT'); // x 11..13
    const person = w.addPerson(vec(10, 10));
    person.health = 30;
    const events: PedestrianEvent[] = [];
    const dt = 1 / 30;
    let time = 0, zombie = false;
    for (let pass = 0; pass < 3 && person.alive; pass++) {
      const vehicle = car(10, 4.5, Math.PI / 2, vec(0, 5.8), 'taxi', pass);
      for (let i = 0; i < Math.round(1.3 / dt); i++) {
        vehicle.body.position = add(vehicle.body.position, scale(vehicle.body.velocity, dt));
        events.push(...updatePedestrians(w, [vehicle], { gore: true }, dt, time));
        if (person.alive && person.health <= 0) zombie = true;
        time += dt;
      }
    }
    expect(events.some(e => e.type === 'hit')).toBe(true);
    expect(events.filter(e => e.type === 'killed').length).toBe(1);
    expect(person.alive).toBe(false);
    expect(person.health).toBe(0);
    expect(zombie).toBe(false);
  });

  it('keeps the health floor and never kills with gore disabled', () => {
    const w = clearWorld();
    const person = w.addPerson(vec(10, 10));
    person.health = 1;
    const vehicle = car(10, 8.4, Math.PI / 2, vec(0, 4));
    const events = drive(w, [vehicle], 1.5, false);
    expect(events.some(e => e.type === 'killed')).toBe(false);
    expect(person.alive).toBe(true);
    expect(person.health).toBe(1);
    expect(person.deathTime).toBe(-1);
  });
});

describe('30 Hz cadence', () => {
  it('documents a contact band wider than the worst-case 35 m/s step', () => {
    // Shortest car extent (Body.h = 2.1) + person diameter (0.6) = 2.7 m band.
    expect(CONTACT_BAND_MIN).toBeCloseTo(2.7, 6);
    expect(CONTACT_BAND_MIN).toBeGreaterThan(35 / 30); // ~1.17 m step at 30 Hz
  });

  it('detects a 35 m/s pass at 30 Hz even when the car leads with its short axis', () => {
    const w = clearWorld();
    const person = w.addPerson(vec(10, 10));
    // angle 0 + velocity along +y means the 2.1 m short axis leads: the worst case.
    const vehicle = car(10, -6, 0, vec(0, 35));
    const events = drive(w, [vehicle], 0.9, true, 1 / 30);
    expect(events.some(e => e.type === 'killed' && e.personId === person.id)).toBe(true);
    expect(person.alive).toBe(false);
    expect(person.health).toBe(0);
  });

  it('detects the same 30 Hz pass but never kills with gore off', () => {
    const w = clearWorld();
    const person = w.addPerson(vec(10, 10));
    const vehicle = car(10, -6, 0, vec(0, 35));
    const events = drive(w, [vehicle], 0.9, false, 1 / 30);
    expect(events.some(e => e.type === 'killed')).toBe(false);
    expect(person.alive).toBe(true);
    expect(person.deathTime).toBe(-1);
  });

  it('runs full city density at 30 Hz within a sane CPU budget and without NaN', () => {
    const w = new World(); // generated city: props + ~150 residents
    const vehicles: PedestrianVehicle[] = [];
    for (let i = 0; i < 24; i++) {
      const horizontal = i % 2 === 0;
      const body = new Body((i % 6) * 40 + 3, Math.floor(i / 6) * 40 + 3);
      body.angle = horizontal ? 0 : Math.PI / 2;
      body.velocity = horizontal ? vec(0, 12) : vec(12, 0);
      vehicles.push({ id: i, body, kind: i % 5 === 0 ? 'taxi' : i % 7 === 0 ? 'police' : 'traffic' });
    }
    const started = Date.now();
    for (let i = 0; i < 60; i++) updatePedestrians(w, vehicles, { gore: false }, 1 / 30, i / 30);
    const elapsed = Date.now() - started;
    for (const person of w.people) {
      expect(Number.isFinite(person.position.x)).toBe(true);
      expect(Number.isFinite(person.position.y)).toBe(true);
      expect(Number.isFinite(person.velocity.x)).toBe(true);
      expect(Number.isFinite(person.velocity.y)).toBe(true);
    }
    expect(elapsed).toBeLessThan(4000); // ~150 × 24 narrow-phase checks × 60 frames
  });
});

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { contact, dist, length, vec } from './physics';
import { createVehicleBody, createVehicleDynamics, vehicleDefinition, vehicleDefinitions, type VehicleDefinition, type VehicleModel } from './vehicles';
import { igniteVehicle } from './damage';
import { loadScenario } from './lab';

const commercial: VehicleModel[] = ['van', 'truck-empty', 'truck-loaded', 'truck-flammable'];
const run = (g: Game, seconds: number) => { for (let i = 0; i < seconds * 120; i++) g.update(1 / 120); };
const emptyGame = () => { const g = new Game(); g.vehicles = [g.player]; g.trafficTarget = 0; g.world.people = []; g.settings.noPolice = true; g.setMode('playing'); g.player.body.position = vec(4, 32); return g; };
function drive(model: VehicleModel, seconds: number, speed = 0, throttle = 1) {
  const definition = vehicleDefinition(model), body = createVehicleBody(definition, vec()), dynamics = createVehicleDynamics(definition);
  body.velocity = vec(speed, 0);
  for (let i = 0; i < seconds * 120; i++) { dynamics.apply(body, { throttle, turn: 0, handbrake: false }, 1 / 120); body.integrate(1 / 120); }
  return body;
}
function stoppingDistance(model: VehicleModel) {
  const definition = vehicleDefinition(model), body = createVehicleBody(definition, vec()), dynamics = createVehicleDynamics(definition);
  body.velocity = vec(12, 0);
  for (let i = 0; i < 1200 && body.velocity.x > 0.5; i++) { dynamics.apply(body, { throttle: -1, turn: 0, handbrake: false }, 1 / 120); body.integrate(1 / 120); }
  return body.position.x;
}

describe('vehicle catalogue and physics', () => {
  it('preserves existing vehicle geometry/tuning and gives independent tyre state to each spawn', () => {
    const g = emptyGame();
    for (const [model, mass, size, engine, grip, tyres] of [
      ['car', 1000, [4.2, 2.1], 10500, 1250, 4], ['motorcycle', 260, [2.6, 0.8], 2800, 950, 2], ['golf-cart', 360, [2.7, 1.6], 2300, 430, 4],
    ] as const) {
      const a = g.spawnVehicle({ model, position: vec(80, 80) }), b = g.spawnVehicle({ model, position: vec(100, 80) });
      expect(a.body.mass).toBe(mass); expect([a.body.w, a.body.h]).toEqual(size);
      expect(a.dynamics.engineForce).toBe(engine); expect(a.dynamics.grip).toBe(grip); expect(a.dynamics.tyres).toHaveLength(tyres);
      a.dynamics.tyres[0].position.x = 123; expect(b.dynamics.tyres[0].position.x).not.toBe(123);
    }
  });
  it('supports definition-only geometry, graphics and handling changes through the factories', () => {
    const custom: VehicleDefinition = { ...vehicleDefinition('van'), chassis: { mass: 2400, length: 6, width: 2.3 }, graphics: { ...vehicleDefinition('van').graphics, color: '#123456' }, physics: { ...vehicleDefinition('van').physics, engineForce: 11000, brakeDeceleration: 6 } };
    const body = createVehicleBody(custom, vec(12, 13), Math.PI / 2), dynamics = createVehicleDynamics(custom);
    expect([body.mass, body.w, body.h, body.angle]).toEqual([2400, 6, 2.3, Math.PI / 2]);
    expect(dynamics.engineForce).toBe(11000); expect(dynamics.tuning.brakeDeceleration).toBe(6);
  });
  it('adds payload to mass and yaw inertia, slowing acceleration and resisting impulses', () => {
    const empty = drive('truck-empty', 3), loaded = drive('truck-loaded', 3), fuel = drive('truck-flammable', 3), van = drive('van', 3);
    expect(loaded.mass).toBe(8200); expect(fuel.mass).toBe(7400); expect(loaded.inertia).toBeGreaterThan(empty.inertia * 1.9);
    expect(length(loaded.velocity)).toBeLessThan(length(empty.velocity) * 0.65);
    expect(length(fuel.velocity)).toBeGreaterThan(length(loaded.velocity)); expect(length(van.velocity)).toBeGreaterThan(length(empty.velocity));
    for (const b of [empty, loaded]) { b.velocity = vec(); b.impulse(vec(10000, 0), b.toWorld(vec(0, 1))); }
    expect(loaded.velocity.x).toBeLessThan(empty.velocity.x); expect(Math.abs(loaded.angularVelocity)).toBeLessThan(Math.abs(empty.angularVelocity));
  });
  it('gives loaded trucks a longer braking distance than empty trucks, vans and cars', () => {
    const distances = ['car', 'van', 'truck-empty', 'truck-loaded'].map(m => stoppingDistance(m as VehicleModel));
    expect(distances[0]).toBeLessThan(distances[1]); expect(distances[1]).toBeLessThan(distances[2]); expect(distances[2]).toBeLessThan(distances[3]);
  });
  it('does not steer a stationary truck and bounds cornering force at high speed', () => {
    const def = vehicleDefinition('truck-loaded'), body = createVehicleBody(def, vec()), dynamics = createVehicleDynamics(def);
    dynamics.apply(body, { throttle: 0, turn: 1, handbrake: false }, 1 / 120); body.integrate(1 / 120);
    expect(body.angle).toBe(0); expect(body.angularVelocity).toBe(0);
    body.velocity = vec(18, 50);
    dynamics.apply(body, { throttle: 0, turn: 0, handbrake: false }, 1 / 120);
    // Aerodynamic drag is independent; tyre lateral forces have a mass-scaled traction cap.
    const lateralTyreForce = body.force.y + dynamics.tuning.drag * length(body.velocity) * body.velocity.y;
    expect(Math.abs(lateralTyreForce)).toBeLessThanOrEqual(body.mass * dynamics.tuning.maxLateralAcceleration + 500);
    expect(dynamics.skidding).toBe(true);
  });
});

describe('commercial NPC integration', () => {
  it('populates all commercial types without intersecting vehicles or solid scenery', () => {
    const g = new Game(), moving = g.vehicles.filter(v => v.kind === 'traffic' && !v.parked && !v.cart && !v.freight);
    expect(moving).toHaveLength(23); for (const model of commercial) expect(moving.some(v => v.model === model)).toBe(true);
    for (const v of moving) {
      expect([...g.world.hash.query(v.body)].some(p => contact(v.body, p.body))).toBe(false);
      expect(g.vehicles.some(other => other !== v && contact(v.body, other.body))).toBe(false);
    }
    g.setTrafficCount(0); g.setTrafficCount(40);
    for (const model of commercial) expect(g.vehicles.some(v => v.model === model && !v.parked)).toBe(true);
    for (const v of g.vehicles.filter(v => !v.parked && !v.cart && !v.freight)) {
      expect([...g.world.hash.query(v.body)].some(p => contact(v.body, p.body))).toBe(false);
      expect(g.vehicles.some(other => other !== v && contact(v.body, other.body))).toBe(false);
    }
  });
  it('keeps new NPCs inaccessible even when parked next to the walking player', () => {
    const g = emptyGame(); g.onFoot = true; g.driver.position = vec(80, 80); g.player.body.position = vec(4, 32);
    for (const model of commercial) {
      const v = g.spawnVehicle({ model, position: vec(80, 82), parked: true, driverExited: true });
      expect(g.nearestCar).toBe(g.player); expect(g.enterableCar).toBeUndefined(); expect(g.interact()).toBe(false); v.alive = false;
    }
    const car = g.spawnVehicle({ position: vec(80, 82), parked: true }); expect(g.nearestCar).toBe(car); expect(g.interact()).toBe(true);
  });
  it('resolves overlapping long trucks whose centres are more than six metres apart', () => {
    const g = emptyGame(), a = g.spawnVehicle({ model: 'truck-loaded', position: vec(80, 80), parked: true }), b = g.spawnVehicle({ model: 'truck-empty', position: vec(87.6, 80), parked: true });
    expect(dist(a.body.position, b.body.position)).toBeGreaterThan(6); expect(contact(a.body, b.body)).not.toBeNull();
    a.body.velocity = vec(8, 0); g.update(1 / 120);
    expect(b.body.velocity.x).toBeGreaterThan(3); expect(a.body.velocity.x).toBeLessThan(8);
  });
  it('shoves a car more than a loaded truck and applies less collision damage to the truck', () => {
    const g = emptyGame(), car = g.spawnVehicle({ position: vec(80, 80), parked: true }), truck = g.spawnVehicle({ model: 'truck-loaded', position: vec(85.95, 80), parked: true });
    car.body.velocity = vec(15, 0); g.collision(car, truck, 1 / 120);
    expect(100 - car.damage.health).toBeGreaterThan((100 - truck.damage.health) * 5);
    expect(truck.body.velocity.x).toBeLessThan(3); expect(car.body.velocity.x).toBeLessThan(3);
  });
  it('makes heavier vehicles receive less blast velocity for the same blast impulse', () => {
    const speeds = ['car', 'truck-loaded'].map(model => {
      const g = emptyGame(), v = g.spawnVehicle({ model: model as VehicleModel, position: vec(80, 80) });
      g.explosion({ position: vec(80, 70), radius: 20, power: 60, blamed: false, due: 0 }); return length(v.body.velocity);
    });
    expect(speeds[1]).toBeCloseTo(speeds[0] * 1000 / 8200);
  });
  it.each(commercial)('drives %s through a city corner without wrecking or drowning', model => {
    const g = emptyGame(), v = g.spawnVehicle({ model, position: vec(80, 83) });
    v.path = [vec(120, 83), vec(123, 120), vec(160, 123)];
    run(g, 20);
    expect(v.alive).toBe(true); expect(v.sinking).toBeUndefined(); expect(v.damage.status).not.toBe('wreck'); expect(v.damage.status).not.toBe('burning');
    expect(v.body.position.y).toBeGreaterThan(100); expect(v.ai.attempts).toBeLessThan(3);
  });
  it('uses a truck-sized corridor and begins braking before a car driver at the same speed', () => {
    const controls = ['car', 'truck-loaded'].map(model => {
      const g = emptyGame(), v = g.spawnVehicle({ model: model as VehicleModel, position: vec(80, 80) });
      v.body.velocity = vec(9, 0); v.path = [vec(160, 80)];
      g.world.add('building', 99, 80, 1, 4, '#333');
      return g.ai(v, 1 / 120);
    });
    expect(controls[1].throttle).toBeLessThan(controls[0].throttle);
  });
});

describe('flammable cargo and fixtures', () => {
  it('ignites fuel cargo on a hard cargo-area hit while crates and minor scrapes stay safe', () => {
    for (const model of ['truck-empty', 'truck-loaded', 'truck-flammable'] as const) {
      const g = emptyGame(), v = g.spawnVehicle({ model, position: vec(80, 80) });
      g.damageImpact(v, 1, v.body.toWorld(vec(-2, 0)), true); expect(v.damage.status).toBe('intact');
      g.damageImpact(v, 14, v.body.toWorld(vec(-2, 0)), true);
      expect(v.damage.status).toBe(model === 'truck-flammable' ? 'burning' : 'intact');
      if (model === 'truck-flammable') { expect(v.damage.fuse).toBe(3.5); expect(v.damage.blamed).toBe(true); }
    }
    const g = emptyGame(), frontHit = g.spawnVehicle({ model: 'truck-flammable', position: vec(80, 80) });
    g.damageImpact(frontHit, 14, frontHit.body.toWorld(vec(3.9, 0)), false); expect(frontHit.damage.status).toBe('intact');
  });
  it('nearby explosions ignite fuel without requiring the ordinary chassis ignition threshold', () => {
    const g = emptyGame(), v = g.spawnVehicle({ model: 'truck-flammable', position: vec(80, 80) });
    g.explosion({ position: vec(80, 68), radius: 20, power: 110, blamed: true, due: 0 });
    expect(v.damage.health).toBeGreaterThan(18); expect(v.damage.critical.fuel).toBeLessThan(55);
    expect(v.damage.status).toBe('burning'); expect(v.damage.fuse).toBe(1.7); expect(v.damage.blamed).toBe(true);
  });
  it('detonates once with the cargo blast profile', () => {
    const g = emptyGame(), v = g.spawnVehicle({ model: 'truck-flammable', position: vec(80, 80), driverExited: true });
    igniteVehicle(v.damage, 0.01); g.hazards(0.02); g.hazards(0.02);
    expect(g.explosions).toBe(1); expect(g.fx.blasts[0].maxRadius).toBe(24); expect(v.damage.status).toBe('wreck');
  });
  it('sinking fuel cargo cannot explode underwater', () => {
    const g = emptyGame(), v = g.spawnVehicle({ model: 'truck-flammable', position: vec(276, 120), parked: true });
    igniteVehicle(v.damage, 0.1); run(g, 2.5); expect(v.sinking).toBeDefined(); expect(g.explosions).toBe(0);
  });
  it('stages all commercial NPCs and triggers the cargo fire through an actual collision', () => {
    const g = emptyGame(); loadScenario(g, 'commercial-traffic');
    expect(g.vehicles.filter(v => v !== g.player).map(v => v.model)).toEqual(commercial);
    loadScenario(g, 'flammable-cargo'); run(g, 1.2);
    const fuel = g.vehicles.find(v => v.model === 'truck-flammable')!;
    expect(fuel.damage.status).toBe('burning'); expect(g.explosions).toBe(0);
    run(g, 5); expect(fuel.damage.status).toBe('wreck'); expect(g.explosions).toBeGreaterThanOrEqual(2); expect(g.mode).toBe('playing');
  });
});

import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { loadScenario } from '../debug/lab';
import { Body, contact, dist, length, vec, type Controls } from '../physics';
import { BIKE_ENGINE, MAX_LEAN, MotorcycleDynamics, cornerLean, leanProjection } from './motorcycle';
import { igniteVehicle } from './damage';

const controls = (turn = 0, throttle = 0): Controls => ({ turn, throttle, handbrake: false });
function motion(speed = 10) {
  const body = new Body(0, 0, 260, 2.6, 0.8), dynamics = new MotorcycleDynamics(); body.velocity = vec(speed, 0);
  const run = (seconds: number, input: Controls, dt = 1 / 120) => { for (let i = 0; i < Math.round(seconds / dt); i++) { dynamics.apply(body, input, dt); body.integrate(dt); } };
  return { body, dynamics, run };
}
const runGame = (g: Game, seconds: number, keys: string[] = []) => { g.keys = new Set(keys); for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120); g.keys.clear(); };
function takeBike() {
  const g = new Game(); loadScenario(g, 'motorcycle');
  expect(g.interact()).toBe(true); // cab's side exit is within walking reach of the bike
  runGame(g, 0.2, ['KeyS']);
  expect(g.enterableCar?.model).toBe('motorcycle'); expect(g.interact()).toBe(true);
  return g;
}

describe('single-track handling and top-down roll', () => {
  it('leans into symmetric physical turns and tracks steady lateral acceleration', () => {
    const right = motion(), left = motion();
    right.run(2, controls(0.65, 0.3)); left.run(2, controls(-0.65, 0.3));
    expect(right.body.angle).toBeGreaterThan(0.3); expect(right.body.position.y).toBeGreaterThan(2);
    expect(right.dynamics.lean).toBeGreaterThan(0.2);
    expect(left.dynamics.lean).toBeCloseTo(-right.dynamics.lean, 6);
    expect(right.dynamics.lean).toBeCloseTo(cornerLean(right.dynamics.lateralAcceleration), 1);
  });
  it('cannot yaw or lean by steering at rest; straight riding stays upright', () => {
    const stopped = motion(0); stopped.run(2, controls(1));
    expect(stopped.body.angle).toBe(0); expect(stopped.dynamics.lean).toBe(0);
    const straight = motion(); straight.run(3, controls(0, 1)); expect(straight.dynamics.lean).toBe(0);
  });
  it('smoothly reverses roll and stands up again after braking', () => {
    const bike = motion(); bike.run(1, controls(1, 0.3)); const previous = bike.dynamics.lean;
    bike.run(1 / 120, controls(-1, 0.3)); expect(Math.abs(bike.dynamics.lean - previous)).toBeLessThan(0.03);
    bike.run(1, controls(-1, 0.3)); expect(bike.dynamics.lean).toBeLessThan(-0.2);
    bike.run(3, { ...controls(), handbrake: true }); expect(length(bike.body.velocity)).toBeLessThan(0.1); expect(Math.abs(bike.dynamics.lean)).toBeLessThan(0.02);
  });
  it('uses small high-speed steering angles and bounded tyre forces rather than pivoting', () => {
    const slow = motion(3), fast = motion(30); slow.run(0.7, controls(1)); fast.run(0.7, controls(1));
    expect(Math.abs(fast.dynamics.tyres[1].angle)).toBeLessThan(Math.abs(slow.dynamics.tyres[1].angle));
    expect(Math.abs(fast.dynamics.lateralAcceleration)).toBeLessThanOrEqual(9.81 * Math.tan(MAX_LEAN) + 0.01);
    expect(Math.abs(fast.dynamics.lean)).toBeLessThanOrEqual(MAX_LEAN);
    expect(Math.abs(fast.body.angularVelocity)).toBeLessThan(1);
  });
  it('handles reverse, boost and rear braking without unstable motion', () => {
    const bike = motion(0); bike.run(8, controls(1, -1)); expect(length(bike.body.velocity)).toBeLessThan(4);
    expect(Number.isFinite(bike.dynamics.lean)).toBe(true);
    bike.run(10, { ...controls(-1, 1), boost: true });
    expect(length(bike.body.velocity)).toBeLessThan(45); expect(Math.abs(bike.body.angularVelocity)).toBeLessThan(3);
    bike.run(4, { ...controls(), handbrake: true }); expect(length(bike.body.velocity)).toBeLessThan(0.1);
  });
  it('rolls higher parts inward and lowers them toward the pavement', () => {
    const angle = Math.PI / 4, frame = leanProjection(angle, 0.65), helmet = leanProjection(angle, 1.4);
    expect(helmet.offset).toBeGreaterThan(frame.offset); expect(helmet.height).toBeLessThan(1.4);
    expect(frame.width).toBeCloseTo(Math.SQRT1_2); expect(leanProjection(-angle, 1.4).offset).toBeCloseTo(-helmet.offset);
    expect(leanProjection(angle, 0).offset).toBe(0); // road contact stays anchored
  });
});

describe('courier motorcycle integration', () => {
  it('spawns accessible parked bikes in the city, including beside Pit Stop', () => {
    const g = new Game(), bikes = g.vehicles.filter(v => v.model === 'motorcycle' && v.parked);
    expect(bikes.length).toBeGreaterThan(3); expect(bikes.some(v => dist(v.body.position, vec(6.5, 34.6)) < 0.1)).toBe(true);
    for (const bike of bikes) { expect(bike.parked).toBe(true); expect(bike.body.h).toBeLessThan(1); expect([...g.world.hash.query(bike.body)].some(p => contact(bike.body, p.body))).toBe(false); }
  });
  it('physically mounts a bike, retains money/upgrades and changes dispatch to parcels', () => {
    const g = takeBike(), cash = g.save.cash;
    expect(g.player.model).toBe('motorcycle'); expect(g.player.kind).toBe('taxi'); expect(g.onFoot).toBe(false);
    expect(g.job.type).toBe('parcel'); expect(g.job.customerId).toBe(-1); expect(g.world.people.some(p => p.role === 'customer')).toBe(false);
    g.player.upgrades.engine = 2; g.applyUpgrades(); expect(g.player.baseEngine).toBeCloseTo(BIKE_ENGINE * 1.44); expect(g.save.cash).toBe(cash);
    runGame(g, 0.5, ['KeyW']); expect(g.speed).toBeGreaterThan(3); expect(g.snapshot().vehicleModel).toBe('motorcycle');
  });
  it('loads and delivers a real parcel, pays once, and dispatches another without a phantom passenger', () => {
    const g = takeBike(), cash = g.save.cash;
    g.player.body.position = { ...g.job.pickup }; runGame(g, 1); expect(g.job.stage).toBe('dropoff');
    expect(g.world.people.some(p => p.aboard)).toBe(false);
    g.player.body.position = { ...g.job.dropoff }; runGame(g, 1);
    expect(g.jobsDone).toBe(1); expect(g.save.cash).toBeGreaterThan(cash); expect(g.job.type).toBe('parcel'); expect(g.job.stage).toBe('pickup');
    const paid = g.save.cash; runGame(g, 1); expect(g.save.cash).toBe(paid);
  });
  it('can drive from the starting bay to the first pickup without striking roadside clutter', () => {
    const g = takeBike(); runGame(g, 1.6, ['KeyW']); runGame(g, 0.9, ['KeyS']); runGame(g, 1);
    expect(g.job.stage).toBe('dropoff'); expect(g.health).toBe(100); expect(g.smashed).toBe(0);
  });
  it('cancels abandoned cargo without payout and resumes passenger fares when switching back', () => {
    const g = takeBike(), bike = g.player, cash = g.save.cash;
    g.player.body.position = { ...g.job.pickup }; runGame(g, 1); g.interact();
    expect(g.job.stage).toBe('pickup'); expect(g.world.people.some(p => p.aboard)).toBe(false); expect(g.save.cash).toBe(cash);
    const cab = g.vehicles.find(v => v.model === 'car')!; g.driver.position = cab.body.toWorld(vec(0, 2));
    expect(g.interact()).toBe(true); expect(g.player).toBe(cab); expect(bike.model).toBe('motorcycle'); expect(bike.parked).toBe(true);
    expect(g.job.type).toBe('fare'); expect(g.world.people.find(p => p.id === g.job.customerId)?.role).toBe('customer');
  });
  it('keeps motorcycle damage, emergency exit and repair in the existing recovery loop', () => {
    const g = takeBike(), bike = g.player;
    g.damageImpact(bike, 15, bike.body.toWorld(vec(1, 0)), true); expect(g.health).toBeLessThan(100);
    igniteVehicle(bike.damage, 1); expect(g.interact()).toBe(true); runGame(g, 1.2);
    expect(bike.damage.status).toBe('wreck'); expect(g.explosions).toBe(1); expect(g.enterableCar).not.toBe(bike);
    runGame(g, 1.2); g.recover(); expect(g.player.model).toBe('motorcycle'); expect(g.health).toBe(100); expect(g.lean).toBe(0); expect(g.job.type).toBe('parcel');
  });
});

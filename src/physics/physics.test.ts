import { describe, expect, it } from 'vitest';
import { Body, CarDynamics, SpatialHash, contact, length, resolveCollision, vec } from './physics';

describe('rigid body and tyre-force foundation', () => {
  it('accelerates, brakes and reverses without unstable energy growth', () => {
    const body = new Body(0, 0), car = new CarDynamics();
    const run = (seconds: number, throttle: number) => { for (let i = 0; i < seconds * 120; i++) { car.apply(body, { throttle, turn: 0, handbrake: false }, 1 / 120); body.integrate(1 / 120); } };
    run(8, 1); expect(body.velocity.x).toBeGreaterThan(20); expect(body.velocity.x).toBeLessThan(32);
    run(1, -1); expect(length(body.velocity)).toBeLessThan(12);
    run(3, -1); expect(body.velocity.x).toBeLessThan(-5); expect(Math.abs(body.angularVelocity)).toBeLessThan(0.01);
  });
  it('handbrake removes rear grip, produces real sideways slip, then recovers', () => {
    const body = new Body(0, 0), car = new CarDynamics(); body.velocity = vec(17, 0);
    for (let i = 0; i < 80; i++) { car.apply(body, { throttle: 1, turn: 1, handbrake: true }, 1 / 120); body.integrate(1 / 120); }
    expect(car.rearGripLoss).toBe(1); expect(car.skidding).toBe(true); expect(Math.abs(body.angle)).toBeGreaterThan(0.3);
    for (let i = 0; i < 60; i++) { car.apply(body, { throttle: 0, turn: 0, handbrake: false }, 1 / 120); body.integrate(1 / 120); }
    expect(car.rearGripLoss).toBe(0); expect(Number.isFinite(body.angularVelocity)).toBe(true);
  });
});
describe('rotated collision solver', () => {
  it('rejects separated OBBs and finds a rotated corner contact', () => {
    const car = new Body(0, 0); car.angle = Math.PI / 4;
    const wall = new Body(5, 0, Infinity, 2, 8); expect(contact(car, wall)).toBeNull();
    wall.position.x = 2.5; expect(contact(car, wall)?.depth).toBeGreaterThan(0);
  });
  it('stops a direct wall impact without creating artificial spin', () => {
    const car = new Body(0, 0), wall = new Body(2.8, 0, Infinity, 2, 10); car.velocity = vec(20, 0);
    const hit = contact(car, wall)!; expect(resolveCollision(car, wall, hit)).toBeCloseTo(20);
    expect(car.velocity.x).toBeLessThan(0); expect(Math.abs(car.angularVelocity)).toBeLessThan(0.01); expect(car.position.x).toBeLessThan(0);
  });
  it('conserves pair momentum while losing collision energy', () => {
    const a = new Body(0, 0), b = new Body(4, 0); a.velocity = vec(15, 0); b.velocity = vec(-5, 0);
    resolveCollision(a, b, contact(a, b)!);
    expect(a.velocity.x + b.velocity.x).toBeCloseTo(10);
    expect(a.velocity.x ** 2 + b.velocity.x ** 2).toBeLessThan(250);
  });
  it('off-center impacts create bounded angular motion instead of passing through', () => {
    const car = new Body(0, 2.6), obstacle = new Body(2.5, 0, Infinity, 2, 4); car.angle = 0.2; car.velocity = vec(18, 0);
    const hit = contact(car, obstacle); expect(hit).not.toBeNull(); const impact = resolveCollision(car, obstacle, hit!);
    expect(impact).toBeGreaterThan(0); expect(Math.abs(car.angularVelocity)).toBeGreaterThan(0.1); expect(length(car.velocity)).toBeLessThan(18);
  });
  it('glancing contacts do not create kinetic energy across varied angles and spin', () => {
    for (let i = 0; i < 60; i++) {
      const car = new Body(0, -2 + i / 15), wall = new Body(2.2, 0, Infinity, 2, 5);
      car.angle = Math.sin(i * 2.3) * 0.8; car.angularVelocity = Math.cos(i) * 2; car.velocity = vec(12 + i * 0.2, Math.sin(i) * 6);
      const energy = () => (car.mass * length(car.velocity) ** 2 + car.inertia * car.angularVelocity ** 2) / 2;
      const before = energy(), hit = contact(car, wall); if (!hit) continue;
      resolveCollision(car, wall, hit); expect(energy()).toBeLessThanOrEqual(before + 0.001);
    }
  });
  it('broad phase includes edge-spanning objects and excludes destroyed ones', () => {
    const grid = new SpatialHash<{ body: Body; alive: boolean }>(4), prop = { body: new Body(4, 4, Infinity, 8, 8), alive: true };
    grid.insert(prop); expect(grid.query(new Body(0, 0)).has(prop)).toBe(true);
    prop.alive = false; expect(grid.query(new Body(0, 0)).size).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { length, vec } from './physics';
import { DOOR_OPEN_TIME, LANDING_TIME, MOVING_EXIT_SPEED, doorOpenness, landingDamage, motorcycleJumpReaction, tumbleDuration } from './vehicle-exit';

function run(g: Game, seconds: number, keys: string[] = []) {
  g.keys = new Set(keys);
  for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120);
  g.keys.clear();
}

function setup(speed: number, model: 'car' | 'motorcycle' = 'car') {
  const g = new Game();
  g.start();
  g.settings.noPolice = true;
  g.setTrafficCount(0);
  // A long straight road free of NPCs. Keep the normal world collisions enabled.
  if (model === 'motorcycle') {
    const bike = g.vehicle('taxi', 90, 80, 0, '#ed9b63', 'motorcycle');
    g.player = bike; g.setJobType();
  }
  g.vehicles = [g.player];
  g.player.body.position = vec(90, 80);
  g.player.body.angle = 0;
  g.player.body.velocity = vec(speed, 0);
  return g;
}

describe('moving vehicle exit / ground contact', () => {
  it('animates a door before launching, carries momentum, and leaves the car coasting', () => {
    const g = setup(20), car = g.player;
    expect(g.interact()).toBe(true);
    expect(g.pendingExit).not.toBeNull();
    expect(g.onFoot).toBe(false);
    expect(car.door?.side).toBe(1);
    expect(doorOpenness(0)).toBe(0);
    run(g, 0.17);
    expect(doorOpenness(g.time - car.door!.at)).toBeGreaterThan(0.8);
    expect(g.onFoot).toBe(false);
    run(g, 0.1);
    expect(g.pendingExit).toBeNull();
    expect(g.onFoot).toBe(true);
    expect(g.tumble).not.toBeNull();
    expect(g.driver.velocity.x).toBeGreaterThan(12);
    expect(g.driver.velocity.y).toBeGreaterThan(1);
    expect(car.parked).toBe(true);
    expect(car.driverExited).toBe(true);
    expect(car.coastUntil).toBeGreaterThan(g.time);
    const lastCarX = car.body.position.x;
    run(g, 0.28);
    expect(car.body.position.x).toBeGreaterThan(lastCarX + 1);
    expect(g.tumble?.grounded).toBe(true);
    expect(g.driverHealth).toBeLessThan(100);
    expect(g.mode).toBe('playing');
    run(g, 1.4);
    expect(g.tumble).toBeNull();
    expect(g.driver.angularVelocity).toBe(0);
    expect(g.mode).toBe('playing');
    expect(g.snapshot().exitPending).toBe(false);
  });

  it('uses A/left or the touch stick to choose the opposite exit and door', () => {
    const g = setup(14);
    g.keys.add('KeyA');
    expect(g.interact()).toBe(true);
    expect(g.pendingExit?.side).toBe(-1);
    expect(g.player.door?.side).toBe(-1);
    run(g, DOOR_OPEN_TIME + 0.03);
    expect(g.onFoot).toBe(true);
    expect(g.driver.position.y).toBeLessThan(80);
    const touch = setup(14);
    touch.touchMove = vec(-1, 0);
    expect(touch.interact()).toBe(true);
    expect(touch.pendingExit?.side).toBe(-1);
  });

  it('steps out of a stationary car without a flying animation or injury', () => {
    const g = setup(0);
    expect(g.interact()).toBe(true);
    expect(g.onFoot).toBe(true);
    expect(g.pendingExit).toBeNull();
    expect(g.tumble).toBeNull();
    expect(g.driverHealth).toBe(100);
    expect(g.driver.velocity).toEqual(vec());
    expect(g.player.coastUntil).toBeUndefined();
  });

  it('blocks re-entry during the tumble and ignores walking controls until the roll finishes', () => {
    const g = setup(11);
    g.interact(); run(g, 0.3);
    const prior = g.driverHealth;
    expect(g.tumble).not.toBeNull();
    expect(g.enterableCar).toBeUndefined();
    expect(g.interact()).toBe(false);
    const before = g.driver.velocity.x;
    run(g, 0.12, ['KeyA']);
    expect(g.driver.velocity.x).toBeGreaterThan(0);
    expect(g.driver.velocity.x).toBeLessThan(before);
    expect(g.driverHealth).toBeLessThan(prior);
    expect(g.tumble?.elapsed).toBeGreaterThan(LANDING_TIME);
  });

  it('scales the landing hit with speed but respects invincibility and bounded injury', () => {
    expect(landingDamage(0)).toBe(0);
    expect(landingDamage(MOVING_EXIT_SPEED)).toBe(0);
    expect(landingDamage(24)).toBeGreaterThan(landingDamage(12));
    expect(landingDamage(100)).toBe(95);
    expect(tumbleDuration(30)).toBeGreaterThan(tumbleDuration(6));
    const g = setup(22);
    g.settings.invincible = true;
    g.interact(); run(g, 0.55);
    expect(g.tumble?.grounded).toBe(true);
    expect(g.driverHealth).toBe(100);
  });
});

describe('motorcycle dismount physics', () => {
  it('conserves sideways push-off direction by reacting oppositely and lowering bike mass', () => {
    const g = setup(4, 'motorcycle'), bike = g.player;
    expect(bike.body.mass).toBe(260);
    expect(g.interact()).toBe(true);
    run(g, 0.27);
    expect(g.onFoot).toBe(true);
    expect(bike.body.mass).toBe(185);
    expect(g.tumble?.bike).toBe(true);
    expect(g.driver.velocity.y).toBeGreaterThan(0);
    expect(bike.body.velocity.y).toBeLessThan(0);
    expect(bike.body.angularVelocity).toBeLessThan(0);
    expect((bike.dynamics as { leanVelocity: number }).leanVelocity).toBeLessThan(0);
  });

  it('reverses bike swerve for a left exit and fades recoil as speed increases', () => {
    const low = motorcycleJumpReaction(3, 1);
    const high = motorcycleJumpReaction(28, 1);
    expect(low.lateralVelocity).toBeLessThan(0);
    expect(low.yawVelocity).toBeLessThan(0);
    expect(low.leanVelocity).toBeLessThan(0);
    expect(Math.abs(low.yawVelocity)).toBeGreaterThan(Math.abs(high.yawVelocity) * 3);
    expect(Math.abs(low.lateralVelocity)).toBeGreaterThan(Math.abs(high.lateralVelocity) * 3);
    const mirrored = motorcycleJumpReaction(3, -1);
    expect(mirrored.yawVelocity).toBeCloseTo(-low.yawVelocity);
    expect(mirrored.lateralVelocity).toBeCloseTo(-low.lateralVelocity);

    const g = setup(4, 'motorcycle');
    g.keys.add('KeyA');
    g.interact(); run(g, 0.27);
    expect(g.onFoot).toBe(true);
    expect(g.driver.velocity.y).toBeLessThan(0);
    expect(g.player.body.velocity.y).toBeGreaterThan(0);
    expect(g.player.body.angularVelocity).toBeGreaterThan(0);
  });

  it('simply dismounts a stationary bike with no swerve, roll, or HP loss', () => {
    const g = setup(0, 'motorcycle'), bike = g.player;
    expect(g.interact()).toBe(true);
    expect(g.onFoot).toBe(true);
    expect(g.pendingExit).toBeNull();
    expect(g.tumble).toBeNull();
    expect(bike.body.velocity).toEqual(vec());
    expect(bike.body.angularVelocity).toBe(0);
    expect(length(g.driver.velocity)).toBe(0);
    expect(g.driverHealth).toBe(100);
    expect(motorcycleJumpReaction(0, 1)).toEqual({ lateralVelocity: 0, yawVelocity: 0, leanVelocity: 0 });
  });

  it('returns rider mass to the motorcycle when mounting again', () => {
    const g = setup(0, 'motorcycle'), bike = g.player;
    g.interact();
    expect(bike.body.mass).toBe(185);
    expect(g.enterableCar).toBe(bike);
    expect(g.interact()).toBe(true);
    expect(g.onFoot).toBe(false);
    expect(bike.body.mass).toBe(260);
  });
});

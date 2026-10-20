import { describe, expect, it } from 'vitest';
import { createVehicleDamage } from './damage';
import { Game } from '../game';
import { BIKE_FALL_ANGLE, BIKE_MAX_ENGINE_DAMAGE, BIKE_MIN_START_HP, MOTORCYCLE_KNOCKOFF_SPEED, MotorcycleDynamics, motorcycleEngineWorks } from './motorcycle';
import { Body, length, vec, type Controls } from '../physics';

const IDLE: Controls = { throttle: 0, turn: 0, handbrake: false };
const run = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120); };

function collisionScene(playerRiding: boolean, speed = 14) {
  const g = new Game();
  g.start(); g.settings.noPolice = true;
  const bike = g.vehicle(playerRiding ? 'taxi' : 'traffic', 90, 80, 0, '#ed9b63', 'motorcycle');
  const car = g.vehicle(playerRiding ? 'traffic' : 'taxi', 92.9, 80, Math.PI, '#91b5b0');
  g.player = playerRiding ? bike : car;
  g.setJobType(); g.vehicles = [bike, car]; g.time = 1;
  car.body.velocity = vec(-speed, 0);
  return { g, bike, car, dynamics: bike.dynamics as MotorcycleDynamics };
}

describe('motorcycle impact / laid-down bike dynamics', () => {
  it('tips toward the impact, has one road contact bounce, and scrubs speed to rest', () => {
    for (const side of [-1, 1] as const) {
      const body = new Body(0, 0, 185, 2.6, 0.8);
      body.velocity = vec(18, 3); body.angularVelocity = side * 1.3;
      const d = new MotorcycleDynamics();
      d.crash(side, 13);
      expect(d.fallen).toBe(true);
      expect(Math.sign(d.leanVelocity)).toBe(side);
      let maxLean = 0;
      for (let i = 0; i < 480; i++) {
        d.apply(body, { ...IDLE, throttle: 1, turn: -side }, 1 / 120);
        body.integrate(1 / 120);
        maxLean = Math.max(maxLean, Math.abs(d.lean));
      }
      expect(maxLean).toBeGreaterThan(BIKE_FALL_ANGLE - 0.02);
      expect(Math.sign(d.lean)).toBe(side);
      expect(Math.abs(d.lean)).toBeLessThanOrEqual(BIKE_FALL_ANGLE + 1e-6);
      expect(length(body.velocity)).toBeLessThan(0.1);
      expect(Math.abs(body.angularVelocity)).toBeLessThan(0.01);
      expect(body.position.x).toBeGreaterThan(0.5); // traveled while sliding
      d.resetLean();
      expect(d.fallen).toBe(false); expect(d.lean).toBe(0);
    }
  });

  it('knocks off NPC riders in real car collisions while preserving an independently sliding bike', () => {
    const { g, bike, car, dynamics } = collisionScene(false);
    const population = g.world.people.length, mass = bike.body.mass;
    g.collision(car, bike, 1 / 120);
    expect(bike.damage.health).toBeLessThan(100);
    expect(dynamics.fallen).toBe(true);
    expect(bike.driverExited).toBe(true);
    expect(bike.parked).toBe(true);
    expect(bike.body.mass).toBe(mass - 75);
    expect(g.world.people).toHaveLength(population + 1);
    const rider = g.world.people.at(-1)!;
    expect(rider.fall?.angularVelocity).not.toBe(0);
    expect(length(rider.velocity)).toBeGreaterThan(2);
    expect(rider.position).not.toEqual(bike.body.position);
    g.vehicles = [bike]; run(g, 2);
    expect(rider.fall).toBeUndefined();
    expect(rider.alive).toBe(true);
    expect(dynamics.fallen).toBe(true);
    expect(g.world.people.length).toBe(population + 1); // never spawn twice
  });

  it('throws the player off the motorbike and applies one landing injury with the existing tumble', () => {
    const { g, bike, car, dynamics } = collisionScene(true);
    g.collision(car, bike, 1 / 120);
    expect(dynamics.fallen).toBe(true);
    expect(g.onFoot).toBe(true);
    expect(g.tumble?.bike).toBe(true);
    expect(g.enterableCar).toBeUndefined();
    const start = g.driverHealth;
    g.vehicles = [bike]; run(g, 0.25);
    expect(g.driverHealth).toBeLessThan(start);
    const landed = g.driverHealth;
    run(g, 0.15);
    expect(g.driverHealth).toBeCloseTo(landed);
  });

  it('does not eject a rider in a harmless low-speed nudge', () => {
    const { g, bike, car, dynamics } = collisionScene(false, MOTORCYCLE_KNOCKOFF_SPEED - 2);
    const people = g.world.people.length;
    g.collision(car, bike, 1 / 120);
    expect(dynamics.fallen).toBe(false);
    expect(bike.driverExited).toBe(false);
    expect(g.world.people.length).toBe(people);
  });

  it('also throws the rider when a motorcycle strikes a solid building', () => {
    const { g, bike, dynamics } = collisionScene(true);
    g.vehicles = [bike]; bike.body.velocity = vec(13, 0);
    const wall = g.world.add('building', 91.6, 80, 1, 5, '#445566');
    g.collision(bike, wall, 1 / 120);
    expect(dynamics.fallen).toBe(true);
    expect(g.onFoot).toBe(true);
  });

  it('a still-healthy fallen bike must be lifted before its rider can mount', () => {
    const { g, bike, car, dynamics } = collisionScene(true);
    g.collision(car, bike, 1 / 120);
    g.vehicles = [bike]; g.tumble = null;
    bike.body.velocity = vec(); bike.body.angularVelocity = 0;
    g.driver.position = bike.body.toWorld(vec(0, 2));
    expect(g.enterableCar).toBe(bike);
    expect(g.interact()).toBe(true);
    expect(g.onFoot).toBe(true); expect(dynamics.fallen).toBe(false);
    expect(g.interact()).toBe(true);
    expect(g.onFoot).toBe(false); expect(bike.body.mass).toBe(bike.definition.chassis.mass);
  });

  it('lifting another fallen bike preserves the active ride and job until mounting', () => {
    const { g, bike, car } = collisionScene(false);
    g.collision(car, bike, 1 / 120);
    bike.body.velocity = vec(); car.body.velocity = vec();
    g.onFoot = true; car.driverExited = true; car.parked = true;
    g.driver.position = bike.body.toWorld(vec(0, 2));
    const job = g.job, boost = g.boost = 42;
    expect(g.enterableCar).toBe(bike);
    expect(g.interact()).toBe(true);
    expect(g.player).toBe(car); expect(g.job).toBe(job);
    expect(g.boost).toBe(boost); expect(bike.kind).toBe('traffic');
    expect(g.interact()).toBe(true);
    expect(g.player).toBe(bike); expect(g.job.type).toBe('parcel');
    expect(g.onFoot).toBe(false);
  });

  it('hospital respawn leaves the abandoned motorcycle fallen and damaged', () => {
    const { g, bike, car, dynamics } = collisionScene(true);
    g.collision(car, bike, 1 / 120);
    const health = bike.damage.health, mass = bike.body.mass;
    g.driverHealth = 1; g.hurtDriver(10, 'impact');
    expect(g.mode).toBe('wasted');
    g.recover();
    expect(g.mode).toBe('playing'); expect(g.onFoot).toBe(true);
    expect(dynamics.fallen).toBe(true);
    expect(bike.damage.health).toBe(health); expect(bike.body.mass).toBe(mass);
  });
});

describe('motorcycle HP, engine failure and recovery', () => {
  it('will not start below the HP cutoff or after a critical engine hit', () => {
    const damage = createVehicleDamage();
    expect(motorcycleEngineWorks(damage)).toBe(true);
    damage.health = BIKE_MIN_START_HP;
    expect(motorcycleEngineWorks(damage)).toBe(false);
    damage.health = BIKE_MIN_START_HP + 1;
    expect(motorcycleEngineWorks(damage)).toBe(true);
    damage.critical.engine = BIKE_MAX_ENGINE_DAMAGE;
    expect(motorcycleEngineWorks(damage)).toBe(false);
    damage.critical.engine = 0;
    damage.status = 'burning';
    expect(motorcycleEngineWorks(damage)).toBe(false);
    damage.status = 'wreck';
    expect(motorcycleEngineWorks(damage)).toBe(false);
  });

  it('disables throttle and entry, but lets the stranded rider tow and repair', () => {
    const { g, bike } = collisionScene(true);
    g.vehicles = [bike]; bike.body.velocity = vec();
    bike.damage.health = BIKE_MIN_START_HP;
    g.keys = new Set(['KeyW']); run(g, 0.5); g.keys.clear();
    expect(bike.dynamics.engineForce).toBe(0);
    expect(length(bike.body.velocity)).toBe(0);
    expect(g.bikeDisabled).toBe(true);
    expect(g.interact()).toBe(true); // stationary dismount
    expect(g.enterableCar).toBeUndefined();
    expect(g.bikeTowable).toBe(true);
    expect(g.interact()).toBe(false);
    g.recover();
    expect(g.onFoot).toBe(false);
    expect(bike.damage.health).toBe(100);
    expect(motorcycleEngineWorks(bike.damage)).toBe(true);
  });

  it('does not turn a destroyed or burning bike back on with the lifting action', () => {
    const { g, bike, car, dynamics } = collisionScene(true);
    g.collision(car, bike, 1 / 120);
    g.vehicles = [bike]; g.tumble = null; bike.body.velocity = vec();
    bike.damage.health = BIKE_MIN_START_HP - 1;
    g.driver.position = bike.body.toWorld(vec(0, 2));
    expect(dynamics.fallen).toBe(true);
    expect(g.enterableCar).toBeUndefined();
    expect(g.interact()).toBe(false);
    expect(dynamics.fallen).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { EngineSound } from './engine';
import { createVehicleBody, createVehicleDynamics, vehicleDefinition, type VehicleModel } from '../vehicles/vehicles';
import { vec } from '../physics/physics';

function input(speed: number, time: number, extra = {}) {
  return { speed, time, vehicle: 1, throttle: 1, boosting: false, gearSpeeds: vehicleDefinition('car').audio.gearSpeeds, ...extra };
}

describe('engine transmission sound', () => {
  it.each<[VehicleModel, number, number]>([['car', 0, 5], ['car', 2, 6], ['motorcycle', 0, 6]])('reaches every gear under real %s acceleration (engine level %i)', (model, upgrade, count) => {
    const definition = vehicleDefinition(model), body = createVehicleBody(definition, vec()), dynamics = createVehicleDynamics(definition);
    dynamics.engineForce *= 1 + upgrade * 0.22;
    const profile = definition.audio;
    const gearSpeeds = upgrade >= 2 && profile.upgradedSixthSpeed ? [...profile.gearSpeeds, profile.upgradedSixthSpeed] : profile.gearSpeeds;
    const engine = new EngineSound(), gears = [1];
    let previous = engine.update(input(0, 0, { gearSpeeds }));
    for (let frame = 1; frame <= 120 * 20; frame++) {
      dynamics.apply(body, { throttle: 1, turn: 0, handbrake: false, boost: false }, 1 / 120); body.integrate(1 / 120);
      const signal = engine.update(input(body.velocity.x, frame / 120, { gearSpeeds }));
      if (signal.gear !== previous.gear) {
        gears.push(signal.gear);
        expect(signal.rate).toBeLessThan(previous.rate * 0.85);
        expect(signal.gain).toBeLessThan(previous.gain * 0.4);
        expect(signal.shifting).toBe(true);
      }
      expect(signal.gain).toBeLessThanOrEqual(0.125);
      previous = signal;
    }
    expect(gears).toEqual(Array.from({ length: count }, (_, i) => i + 1));
  });

  it('keeps idle and full rev pitch in a lower road-car range', () => {
    expect(new EngineSound().update(input(0, 0, { throttle: 0 })).rate).toBe(0.56);
    expect(new EngineSound().update(input(100, 0)).rate).toBe(1.56);
  });

  it('does not hunt near an upshift boundary and downshifts with a rev rise on deceleration', () => {
    const engine = new EngineSound(); engine.update(input(6.4, 0));
    expect(engine.update(input(6.6, 0.01)).gear).toBe(2);
    expect(engine.update(input(6.4, 0.32)).shifting).toBe(false);
    expect(engine.update(input(6.6, 0.4)).gear).toBe(2);
    const before = engine.update(input(4.6, 0.5, { throttle: 0 }));
    const after = engine.update(input(4.5, 0.6, { throttle: 0 }));
    expect(after.gear).toBe(1); expect(after.rate).toBeGreaterThan(before.rate);
    expect(engine.update(input(0, 0.7)).gear).toBe(1);
  });

  it('keeps reverse in a single ratio, distinguishes braking from throttle and bounds boost revs', () => {
    const engine = new EngineSound();
    for (let frame = 0; frame < 600; frame++) {
      const signal = engine.update(input(-frame / 30, frame / 60, { throttle: -1 }));
      expect(signal.gear).toBe(-1); expect(signal.shifting).toBe(false); expect(signal.rate).toBeLessThanOrEqual(1.56);
    }
    const coast = new EngineSound().update(input(12, 0, { throttle: 0 }));
    const brake = new EngineSound().update(input(12, 0, { throttle: -1 }));
    expect(brake).toEqual(coast);
    expect(new EngineSound().update(input(12, 0, { boosting: true })).rate).toBeGreaterThan(coast.rate);
  });

  it('rejoins the actual speed without phantom shifts after swapping vehicles, reset or a fixed-clock gap', () => {
    const engine = new EngineSound();
    engine.update(input(22, 0));
    const swapped = engine.update(input(0, 0.1, { vehicle: 2 }));
    expect(swapped.gear).toBe(1); expect(swapped.shifting).toBe(false);
    const rejoined = engine.update(input(23, 2, { vehicle: 2 }));
    expect(rejoined.gear).toBe(5); expect(rejoined.shifting).toBe(false);
    engine.reset();
    expect(engine.update(input(0, 0)).gear).toBe(1);
  });
});

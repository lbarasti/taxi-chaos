import { describe, expect, it } from 'vitest';
import { blastDamage, createVehicleDamage, igniteVehicle, impactDamage, radialEffect, tickVehicleDamage, vehiclePerformance } from './damage';
import { vec } from '../physics';

const hit = (state = createVehicleDamage(), over: Partial<Parameters<typeof impactDamage>[1]> = {}) =>
  impactDamage(state, { impact: 20, localPoint: vec(2, 0), armor: 0, time: 1, scale: 1, blamed: false, fuse: 7, ...over });

describe('createVehicleDamage', () => {
  it('starts as a healthy, intact taxi', () => {
    expect(createVehicleDamage()).toEqual({
      health: 100,
      critical: { engine: 0, fuel: 0, tyres: 0 },
      status: 'intact',
      fireTime: 0,
      fuse: 0,
      hitAt: -Infinity,
      blamed: false,
      bloodTime: 0,
    });
  });
});

describe('impactDamage ordinary collisions', () => {
  it('keeps the taxi formula max(0, impact-2)*1.45*scale*(1-.25armor)', () => {
    const state = createVehicleDamage();
    const result = hit(state, { impact: 12, localPoint: vec(0, 0), scale: 1.5, time: 1 });
    expect(result.damage).toBeCloseTo(10 * 1.45 * 1.5);
    expect(state.health).toBeCloseTo(100 - result.damage);
    expect(result.ignited).toBe(false);
  });

  it('ignores sub-3 scuffs and does not consume the impact cooldown', () => {
    const state = createVehicleDamage();
    expect(hit(state, { impact: 2.9, time: 1 })).toEqual({ damage: 0, ignited: false });
    expect(state.health).toBe(100);
    expect(state.hitAt).toBe(-Infinity);
    expect(hit(state, { impact: 10, time: 1 }).damage).toBeGreaterThan(0);
  });

  it('rate-limits impacts to 0.22s but never blasts', () => {
    const state = createVehicleDamage();
    expect(hit(state, { impact: 20, time: 1 }).damage).toBeGreaterThan(0);
    expect(hit(state, { impact: 20, time: 1.1 }).damage).toBe(0);
    expect(hit(state, { impact: 20, time: 1.22 }).damage).toBeGreaterThan(0);
    const blastState = createVehicleDamage();
    expect(blastDamage(blastState, 5, { armor: 0, time: 1, scale: 1, blamed: false, fuse: 7 }).damage).toBeGreaterThan(0);
    expect(blastDamage(blastState, 5, { armor: 0, time: 1, scale: 1, blamed: false, fuse: 7 }).damage).toBeGreaterThan(0);
  });

  it('goes smoking past 45 engine critical or below 45 HP', () => {
    const state = createVehicleDamage();
    hit(state, { impact: 22, localPoint: vec(2, 0), time: 1 });
    hit(state, { impact: 22, localPoint: vec(2, 0), time: 2 });
    expect(state.critical.engine).toBeGreaterThan(45);
    expect(state.critical.engine).toBeLessThan(65);
    expect(state.status).toBe('smoking');

    const fragile = createVehicleDamage();
    hit(fragile, { impact: 40, localPoint: vec(0, 1.4), time: 1 });
    expect(fragile.health).toBeLessThan(45);
    expect(fragile.critical.tyres).toBeGreaterThan(0);
    expect(fragile.status).toBe('smoking');
  });
});

describe('deterministic front/rear/side component damage', () => {
  it('front hits chew the engine only', () => {
    const state = createVehicleDamage();
    hit(state, { impact: 20, localPoint: vec(2, 0) });
    expect(state.critical.engine).toBeGreaterThan(0);
    expect(state.critical.fuel).toBe(0);
    expect(state.critical.tyres).toBe(0);
  });

  it('rear hits chew the fuel only', () => {
    const state = createVehicleDamage();
    hit(state, { impact: 20, localPoint: vec(-2, 0) });
    expect(state.critical.fuel).toBeGreaterThan(0);
    expect(state.critical.engine).toBe(0);
    expect(state.critical.tyres).toBe(0);
  });

  it('side hits chew the tyres only', () => {
    const state = createVehicleDamage();
    hit(state, { impact: 20, localPoint: vec(0, 1.4) });
    expect(state.critical.tyres).toBeGreaterThan(0);
    expect(state.critical.engine).toBe(0);
    expect(state.critical.fuel).toBe(0);
  });

  it('fuel above 55 catches fire from the rear', () => {
    const state = createVehicleDamage();
    const result = hit(state, { impact: 45, localPoint: vec(-2, 0), time: 1 });
    expect(state.critical.fuel).toBeGreaterThan(55);
    expect(result.ignited).toBe(true);
    expect(state.status).toBe('burning');
  });

  it('a catastrophic front crash over 32 ignites while 32 itself does not', () => {
    const fatal = createVehicleDamage();
    expect(hit(fatal, { impact: 33, localPoint: vec(2, 0), time: 1 }).ignited).toBe(true);
    expect(fatal.status).toBe('burning');

    const edge = createVehicleDamage();
    expect(hit(edge, { impact: 32, localPoint: vec(2, 0), time: 1 }).ignited).toBe(false);
    expect(edge.status).toBe('intact');
  });

  it('a lethal hit catches fire and burns down rather than vanishing', () => {
    const state = createVehicleDamage();
    const result = hit(state, { impact: 90, localPoint: vec(2, 0), time: 1 });
    expect(state.health).toBe(0);
    expect(result.ignited).toBe(true);
    expect(state.status).toBe('burning');
  });
});

describe('armor and god mode', () => {
  it('armor mitigates impact damage by 25% per level', () => {
    const plain = createVehicleDamage();
    const armored = createVehicleDamage();
    const base = hit(plain, { impact: 20, time: 1 }).damage;
    const reduced = hit(armored, { impact: 20, armor: 3, time: 1 }).damage;
    expect(reduced).toBeCloseTo(base * 0.25);
  });

  it('invincibility blocks health, critical and fire from both impacts and blasts', () => {
    const state = createVehicleDamage();
    expect(hit(state, { impact: 60, invincible: true })).toEqual({ damage: 0, ignited: false });
    expect(blastDamage(state, 80, { armor: 0, time: 1, scale: 1, blamed: false, fuse: 7, invincible: true })).toEqual({ damage: 0, ignited: false });
    expect(state).toMatchObject({ health: 100, status: 'intact', critical: { engine: 0, fuel: 0, tyres: 0 } });
  });

  it('still allows the explicit igniteVehicle cheat under god mode', () => {
    const state = createVehicleDamage();
    igniteVehicle(state, 3, true);
    expect(state.status).toBe('burning');
    expect(state.fuse).toBe(3);
    expect(state.blamed).toBe(true);
  });
});

describe('fire countdown', () => {
  it('burns for the default 7s fuse and explodes exactly once', () => {
    const state = createVehicleDamage();
    igniteVehicle(state);
    expect(state.status).toBe('burning');
    expect(state.fuse).toBe(7);

    let explosions = 0;
    for (let i = 0; i < 200; i++) if (tickVehicleDamage(state, 0.1) === 'explode') explosions++;
    expect(explosions).toBe(1);
    expect(state.status).toBe('wreck');
    expect(state.health).toBe(0);
    expect(state.fuse).toBe(0);
    // Further ticks stay inert after the wreck is marked.
    expect(tickVehicleDamage(state, 5)).toBe('none');
  });

  it('burns health down but cannot be cancelled by raising HP', () => {
    const state = createVehicleDamage();
    igniteVehicle(state, 4);
    tickVehicleDamage(state, 1);
    expect(state.health).toBeLessThan(100);
    state.health = 100;
    tickVehicleDamage(state, 0.5);
    expect(state.status).toBe('burning');
    expect(state.fireTime).toBeCloseTo(1.5);
  });

  it('igniteVehicle accepts a custom fuse and marks a wreck unre-lightable', () => {
    const state = createVehicleDamage();
    igniteVehicle(state, 2);
    expect(state.fuse).toBe(2);
    state.status = 'wreck';
    igniteVehicle(state, 9);
    expect(state.status).toBe('wreck');
  });

  it('igniteVehicle is idempotent: only shortens, preserving fireTime and blame', () => {
    const state = createVehicleDamage();
    igniteVehicle(state, 5, false);
    tickVehicleDamage(state, 1); // fireTime 1, fuse 4
    igniteVehicle(state, 9, true); // a longer fuse must not extend the countdown
    expect(state.fuse).toBeCloseTo(4);
    expect(state.fireTime).toBeCloseTo(1);
    expect(state.blamed).toBe(true);
    igniteVehicle(state, 1, false); // a shorter fuse shortens it, blame stays ORed
    expect(state.fuse).toBeCloseTo(1);
    expect(state.blamed).toBe(true);
  });
});

describe('blast chains', () => {
  it('shortens an existing fire fuse into the 1.2-2s window', () => {
    const state = createVehicleDamage();
    igniteVehicle(state, 7);
    const result = blastDamage(state, 25, { armor: 0, time: 1, scale: 1, blamed: true, fuse: 7 });
    expect(result.damage).toBeGreaterThan(0);
    expect(result.ignited).toBe(true);
    expect(state.fuse).toBeGreaterThanOrEqual(1.2);
    expect(state.fuse).toBeLessThanOrEqual(2);
    expect(state.fuse).toBeLessThan(7);
  });

  it('scales the shortened fuse with blast power', () => {
    const weak = createVehicleDamage();
    igniteVehicle(weak, 7);
    blastDamage(weak, 10, { armor: 0, time: 1, scale: 1, blamed: false, fuse: 7 });
    const strong = createVehicleDamage();
    igniteVehicle(strong, 7);
    blastDamage(strong, 60, { armor: 0, time: 1, scale: 1, blamed: false, fuse: 7 });
    expect(weak.fuse).toBeGreaterThan(strong.fuse);
    expect(strong.fuse).toBeCloseTo(1.2);
  });

  it('a fresh blast that trips a threshold ignites a brief fire when it already zeroes HP', () => {
    const state = createVehicleDamage();
    const result = blastDamage(state, 100, { armor: 0, time: 1, scale: 1, blamed: true, fuse: 5 });
    expect(result.ignited).toBe(true);
    expect(state.status).toBe('burning');
    expect(state.health).toBe(0);
    expect(state.fuse).toBe(1.5); // min(defaultFuse, 1.5) so the fire is readable before the blast
  });
});

describe('integration regressions', () => {
  it('repeated impacts do not postpone an existing fire', () => {
    const state = createVehicleDamage();
    igniteVehicle(state, 5, true);
    tickVehicleDamage(state, 1); // fuse 4, fireTime 1
    const fuse = state.fuse, fireTime = state.fireTime;
    // Bumps carry the default 7s fuse; they must never reset or extend the countdown.
    impactDamage(state, { impact: 10, localPoint: vec(2, 0), armor: 0, time: 10, scale: 1, blamed: false, fuse: 7 });
    impactDamage(state, { impact: 10, localPoint: vec(2, 0), armor: 0, time: 11, scale: 1, blamed: false, fuse: 7 });
    expect(state.status).toBe('burning');
    expect(state.fuse).toBeLessThanOrEqual(fuse);
    expect(state.fireTime).toBeGreaterThanOrEqual(fireTime);
    expect(state.blamed).toBe(true); // sticky until repair
  });

  it('a lethal impact lights a brief fuse rather than exploding instantly', () => {
    const state = createVehicleDamage();
    const result = hit(state, { impact: 90, localPoint: vec(2, 0), time: 1 });
    expect(state.health).toBe(0);
    expect(result.ignited).toBe(true);
    expect(state.status).toBe('burning');
    expect(state.fuse).toBeLessThanOrEqual(1.5);
    // HP is already zero, but the fuse still governs the blast.
    expect(tickVehicleDamage(state, 0.5)).toBe('none');
    expect(tickVehicleDamage(state, 0.5)).toBe('none');
    expect(state.status).toBe('burning');
    let explosions = 0;
    for (let i = 0; i < 20; i++) if (tickVehicleDamage(state, 0.1) === 'explode') explosions++;
    expect(explosions).toBe(1);
    expect(state.status).toBe('wreck');
  });

  it('clamps critical components at 100 across repeated hits', () => {
    const state = createVehicleDamage();
    for (let i = 1; i <= 8; i++) impactDamage(state, { impact: 30, localPoint: vec(2, 0), armor: 0, time: i * 2, scale: 1, blamed: false, fuse: 7 });
    expect(state.critical.engine).toBe(100);
    expect(state.critical.fuel).toBe(0);
    expect(state.critical.tyres).toBe(0);
  });

  it('keeps blame on later non-blamed hits until repaired', () => {
    const state = createVehicleDamage();
    hit(state, { impact: 15, localPoint: vec(0, 1.4), blamed: true, time: 1 });
    expect(state.blamed).toBe(true);
    hit(state, { impact: 15, localPoint: vec(0, 1.4), blamed: false, time: 2 });
    expect(state.blamed).toBe(true);
    // Repair replaces the state externally, clearing blame.
    expect(createVehicleDamage().blamed).toBe(false);
  });
});

describe('radialEffect', () => {
  it('falls off linearly with distance', () => {
    const near = radialEffect(vec(0, 0), vec(1, 0), 10, 50);
    const mid = radialEffect(vec(0, 0), vec(3, 0), 10, 50);
    const far = radialEffect(vec(0, 0), vec(9, 0), 10, 50);
    expect(near.falloff).toBeCloseTo(0.9);
    expect(mid.falloff).toBeCloseTo(0.7);
    expect(mid.damage).toBeCloseTo(35);
    expect(near.damage).toBeGreaterThan(mid.damage);
    expect(mid.damage).toBeGreaterThan(far.damage);
    expect(mid.kick.x).toBeGreaterThan(0);
    expect(mid.kick.y).toBeCloseTo(0);
  });

  it('is exactly zero outside the radius', () => {
    expect(radialEffect(vec(0, 0), vec(10.001, 0), 10, 50)).toEqual({ damage: 0, kick: { x: 0, y: 0 }, falloff: 0 });
    expect(radialEffect(vec(0, 0), vec(-3, 0), 0, 50)).toEqual({ damage: 0, kick: { x: 0, y: 0 }, falloff: 0 });
  });

  it('produces a finite, non-zero kick direction at the exact origin', () => {
    const result = radialEffect(vec(5, 5), vec(5, 5), 10, 50);
    expect(result.falloff).toBe(1);
    expect(Number.isFinite(result.kick.x)).toBe(true);
    expect(Number.isFinite(result.kick.y)).toBe(true);
    expect(Math.hypot(result.kick.x, result.kick.y)).toBeGreaterThan(0);
  });

  it('caps blast kick velocity and rejects nonpositive power', () => {
    const tuned = radialEffect(vec(0, 0), vec(1, 0), 10, 100);
    expect(Math.hypot(tuned.kick.x, tuned.kick.y)).toBeCloseTo(11.7); // ~13 * 0.9 at falloff 0.9
    const huge = radialEffect(vec(0, 0), vec(1, 0), 100, 100000);
    expect(Math.hypot(huge.kick.x, huge.kick.y)).toBeLessThanOrEqual(20);
    expect(huge.damage).toBeCloseTo(100000 * 0.99); // damage is still power * falloff
    expect(radialEffect(vec(0, 0), vec(1, 0), 10, 0)).toEqual({ damage: 0, kick: { x: 0, y: 0 }, falloff: 0 });
    expect(radialEffect(vec(0, 0), vec(1, 0), 10, -5)).toEqual({ damage: 0, kick: { x: 0, y: 0 }, falloff: 0 });
  });
});

describe('vehiclePerformance', () => {
  it('sets a healthy cab to full engine and grip', () => {
    expect(vehiclePerformance(createVehicleDamage())).toEqual({ engine: 1, grip: 1 });
  });

  it('penalises damaged components but keeps a smoking cab mobile', () => {
    const state = createVehicleDamage();
    state.critical.engine = 120;
    state.critical.tyres = 120;
    state.health = 20;
    const perf = vehiclePerformance(state);
    expect(perf.engine).toBeLessThan(1);
    expect(perf.grip).toBeLessThan(1);
    expect(perf.engine).toBeGreaterThan(0);
    expect(perf.grip).toBeGreaterThan(0);
  });

  it('leaves a wreck immobile', () => {
    const state = createVehicleDamage();
    state.status = 'wreck';
    expect(vehiclePerformance(state)).toEqual({ engine: 0, grip: 0 });
  });
});

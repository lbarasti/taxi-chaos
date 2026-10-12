import { describe, expect, it } from 'vitest';
import { DayNight, formatClock, periodForHour, type LightingState } from './day-night';
import { Game } from './game';

const clock = new DayNight();
const setHour = (hour: number) => { clock.configure({ hour }); return clock; };
// Lighting is a pure function of the hour, so use a fresh instance: these assertions never
// depend on (or mutate) the shared clock's rate/freeze state.
const lightAt = (hour: number): LightingState => { const c = new DayNight(); c.configure({ hour }); return c.lighting; };

const expectSameLighting = (a: LightingState, b: LightingState, epsilon = 1e-3) => {
  for (let i = 0; i < 3; i++) expect(Math.abs(a.tint[i] - b.tint[i])).toBeLessThan(epsilon);
  expect(Math.abs(a.tintStrength - b.tintStrength)).toBeLessThan(epsilon);
  expect(Math.abs(a.darkness - b.darkness)).toBeLessThan(epsilon);
  expect(Math.abs(a.artificialLight - b.artificialLight)).toBeLessThan(epsilon);
  expect(Math.abs(a.sunDirection.x - b.sunDirection.x)).toBeLessThan(epsilon);
  expect(Math.abs(a.sunDirection.y - b.sunDirection.y)).toBeLessThan(epsilon);
  expect(Math.abs(a.shadowLength - b.shadowLength)).toBeLessThan(epsilon);
  expect(Math.abs(a.shadowOpacity - b.shadowOpacity)).toBeLessThan(epsilon);
};

describe('day/night clock', () => {
  it('starts a fresh cycle at 07:00 on day 1 at normal rate', () => {
    expect(new DayNight().snapshot()).toEqual({ hour: 7, minutes: 420, day: 1, time: '07:00', period: 'morning', rate: 1, frozen: false });
  });

  it('advances one in-game minute per simulated second and is deterministic under fixed stepping', () => {
    clock.reset(); clock.configure({ rate: 1, frozen: false });
    clock.update(60);
    expect(clock.snapshot()).toMatchObject({ hour: 8, minutes: 480, time: '08:00' });
    clock.update(1);
    expect(clock.snapshot().time).toBe('08:01');

    const a = new DayNight(), b = new DayNight();
    for (let i = 0; i < 2400; i++) { a.update(1 / 120); b.update(1 / 120); }
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.snapshot().minutes).toBeCloseTo(440, 4);
  });

  it('rolls over midnight into the next day', () => {
    clock.reset(); clock.configure({ hour: 23.5, rate: 1 });
    clock.update(60);
    expect(clock.snapshot()).toMatchObject({ hour: 0.5, minutes: 30, day: 2, time: '00:30', period: 'night' });
    clock.update(60 * 24);
    expect(clock.snapshot().day).toBe(3);
  });

  it('labels every period at its boundaries and wraps out-of-range hours', () => {
    expect(periodForHour(4.999)).toBe('night');
    expect(periodForHour(5)).toBe('morning');
    expect(periodForHour(11.999)).toBe('morning');
    expect(periodForHour(12)).toBe('afternoon');
    expect(periodForHour(16.999)).toBe('afternoon');
    expect(periodForHour(17)).toBe('evening');
    expect(periodForHour(20.999)).toBe('evening');
    expect(periodForHour(21)).toBe('night');
    expect(periodForHour(24)).toBe('night');
    expect(periodForHour(25)).toBe('night');
    expect(periodForHour(-1)).toBe('night');

    setHour(25);
    expect(clock.snapshot().hour).toBeCloseTo(1, 6);
    setHour(-1);
    expect(clock.snapshot().hour).toBeCloseTo(23, 6);
    setHour(24);
    expect(clock.snapshot().hour).toBe(0);
  });

  it('honours rate, clamps invalid rates and pauses at zero or while frozen', () => {
    clock.reset(); clock.configure({ rate: 2, frozen: false });
    clock.update(10);
    expect(clock.snapshot().minutes).toBeCloseTo(440, 6);

    clock.configure({ rate: 0 });
    clock.update(120);
    expect(clock.snapshot().minutes).toBeCloseTo(440, 6);

    clock.configure({ rate: -5 });
    expect(clock.snapshot().rate).toBe(0);
    clock.configure({ rate: Number.POSITIVE_INFINITY });
    expect(Number.isFinite(clock.snapshot().rate)).toBe(true);
    expect(clock.snapshot().rate).toBeGreaterThan(0);

    clock.reset(); clock.configure({ rate: 1, frozen: true });
    clock.update(600);
    expect(clock.snapshot().minutes).toBe(420);
    clock.configure({ frozen: false });
    clock.update(1);
    expect(clock.snapshot().minutes).toBe(421);
  });

  it('ignores non-finite configuration and non-positive steps', () => {
    clock.reset(); clock.configure({ hour: 9, rate: 2, frozen: true });
    clock.update(60);
    expect(clock.snapshot().minutes).toBe(540);

    clock.configure({ hour: Number.NaN, rate: Number.NaN, frozen: 'yes' as unknown as boolean });
    clock.configure({ hour: Number.POSITIVE_INFINITY });
    expect(clock.snapshot()).toMatchObject({ minutes: 540, rate: 2, frozen: true });

    clock.configure({ frozen: false });
    clock.update(Number.NaN); clock.update(Number.POSITIVE_INFINITY); clock.update(0); clock.update(-5);
    expect(clock.snapshot().minutes).toBe(540);
  });

  it('resets the clock to 07:00 without discarding rate/freeze configuration', () => {
    clock.reset(); clock.configure({ rate: 3, frozen: true, hour: 3 });
    clock.reset();
    expect(clock.snapshot()).toMatchObject({ hour: 7, minutes: 420, day: 1, time: '07:00', rate: 3, frozen: true });
    clock.configure({ frozen: false });
    clock.update(20);
    expect(clock.snapshot().minutes).toBeCloseTo(480, 6);
  });

  it('formats zero-padded HH:MM and wraps whole days', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(419.9)).toBe('06:59');
    expect(formatClock(1440)).toBe('00:00');
    expect(formatClock(1500)).toBe('01:00');
  });
});

describe('day/night lighting', () => {
  it('keeps every channel in range across the whole cycle', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const light = lightAt(hour);
      expect(light.tint.every(c => c >= 0 && c <= 255)).toBe(true);
      expect(light.tintStrength).toBeGreaterThanOrEqual(0);
      expect(light.tintStrength).toBeLessThanOrEqual(1);
      expect(light.darkness).toBeGreaterThanOrEqual(0);
      expect(light.darkness).toBeLessThanOrEqual(1);
      expect(light.artificialLight).toBeGreaterThanOrEqual(0);
      expect(light.artificialLight).toBeLessThanOrEqual(1);
      expect(light.shadowOpacity).toBeGreaterThanOrEqual(0);
      expect(light.shadowOpacity).toBeLessThanOrEqual(1);
      expect(light.shadowLength).toBeGreaterThanOrEqual(0);
      expect(Math.hypot(light.sunDirection.x, light.sunDirection.y)).toBeCloseTo(1, 6);
    }
  });

  it('gives noon and midnight clearly different atmospheres', () => {
    const noon = lightAt(12), midnight = lightAt(0);
    expect(noon.darkness).toBe(0);
    expect(noon.artificialLight).toBe(0);
    expect(noon.tintStrength).toBe(0);
    expect(midnight.darkness).toBeGreaterThan(0.5);
    expect(midnight.artificialLight).toBe(1);
    expect(midnight.tintStrength).toBeGreaterThan(0.5);
    expect(noon.shadowLength).toBeLessThan(midnight.shadowLength);
  });

  it('keeps the whole night readable instead of pitch black', () => {
    // References show blue-hour/neon cities with legible streets, not crushed blacks. Hold every
    // night hour below a readability ceiling and keep a cool, blue-dominant ambient film.
    for (let hour = 21; hour < 24; hour += 0.25) {
      const light = lightAt(hour);
      expect(light.darkness).toBeLessThanOrEqual(0.6);
      expect(light.artificialLight).toBeGreaterThan(0.5);
      expect(light.tint[2]).toBeGreaterThan(light.tint[0]);
      expect(light.tint[2]).toBeGreaterThan(light.tint[1]);
    }
    for (let hour = 0; hour < 5; hour += 0.25) {
      const light = lightAt(hour);
      expect(light.darkness).toBeLessThanOrEqual(0.6);
      expect(light.darkness).toBeGreaterThan(0.3);
      expect(light.tint[2]).toBeGreaterThan(light.tint[0]);
    }
  });

  it('interpolates continuously through midnight and every period boundary', () => {
    for (const boundary of [0, 5, 12, 17, 21]) {
      const before = lightAt(boundary - 0.0001), after = lightAt(boundary + 0.0001);
      expectSameLighting(before, after, 0.5);
    }
    // Exactly midnight equals the limit from both sides.
    expectSameLighting(lightAt(0), lightAt(23.9999), 0.5);
    // A smooth sweep never produces a discrete jump.
    for (let hour = 0; hour < 24; hour += 0.05) {
      const a = lightAt(hour), b = lightAt(hour + 0.05);
      expect(Math.abs(a.darkness - b.darkness)).toBeLessThan(0.05);
      expect(Math.abs(a.tintStrength - b.tintStrength)).toBeLessThan(0.05);
      expect(Math.abs(a.artificialLight - b.artificialLight)).toBeLessThan(0.05);
    }
  });
});

describe('game day/night integration', () => {
  const make = () => { const g = new Game(); g.vehicles = [g.player]; g.setMode('playing'); return g; };
  const run = (g: Game, seconds: number) => { for (let i = 0; i < seconds * 120; i++) g.update(1 / 120); };
  const runKeys = (g: Game, seconds: number, keys: string[]) => { g.keys = new Set(keys); run(g, seconds); g.keys.clear(); };

  it('exposes the clock in Game.snapshot and advances it during play', () => {
    const g = make();
    expect(g.snapshot().dayNight).toMatchObject({ hour: 7, time: '07:00', period: 'morning', day: 1 });
    run(g, 30);
    expect(g.snapshot().dayNight.minutes).toBeCloseTo(450, 4);
    expect(g.snapshot().dayNight.time).toBe('07:30');
  });

  it('freezes the clock in intro, pause, garage, arrest and wasted states', () => {
    const g = new Game();
    const introStart = g.snapshot().dayNight.minutes;
    run(g, 30);
    expect(g.snapshot().dayNight.minutes).toBe(introStart);

    // resetRun restores a fresh 07:00 clock. Trim to the player afterwards: this assertion is
    // about the world clock, and stepping the full 61-car city for 3,600 frames costs ~5 s on
    // its own, which pushed the test over the default 5 s timeout under parallel suite load.
    g.resetRun();
    g.vehicles = [g.player];
    run(g, 30);
    const playing = g.snapshot().dayNight.minutes;
    expect(playing).toBeCloseTo(450, 4);

    g.setMode('paused'); run(g, 30);
    expect(g.snapshot().dayNight.minutes).toBe(playing);
    g.setMode('garage'); run(g, 30);
    expect(g.snapshot().dayNight.minutes).toBe(playing);
    g.setMode('arrested'); run(g, 30);
    expect(g.snapshot().dayNight.minutes).toBe(playing);

    g.mode = 'wasted'; run(g, 10);
    expect(g.snapshot().dayNight.minutes).toBe(playing);
  });

  it('changing the hour never touches gameplay timers or consumes gameplay RNG', () => {
    const g = make();
    g.job.stage = 'dropoff';
    run(g, 30);
    expect(g.snapshot().dayNight.minutes).toBeCloseTo(450, 4);
    expect(g.time).toBeCloseTo(30, 3);
    const elapsed = g.job.elapsed;
    expect(elapsed).toBeGreaterThan(0);

    // Two cities stepped in lockstep must stay in sync when one hour is reconfigured.
    const a = new Game(), b = new Game();
    expect(a.world.random()).toBe(b.world.random());
    a.dayNight.configure({ hour: 2 });
    expect(a.world.random()).toBe(b.world.random());
    expect(a.dayNight.snapshot().hour).toBe(2);

    g.dayNight.configure({ hour: 2 });
    expect(g.time).toBeCloseTo(30, 3);
    expect(g.job.elapsed).toBe(elapsed);
    expect(g.dayNight.snapshot().hour).toBe(2);
  });

  it('preserves campaign lighting time on resetRun', () => {
    const g = make();
    run(g, 30);
    expect(g.snapshot().dayNight.minutes).toBeCloseTo(450, 4);
    g.resetRun();
    expect(g.snapshot().dayNight).toMatchObject({ hour: 7.5, minutes: 450, day: 1 });
    expect(g.time).toBe(0);
    expect(g.mode).toBe('playing');
  });

  it('leaves gameplay behaviour unchanged while accelerating the cycle', () => {
    const g = make();
    g.dayNight.configure({ hour: 20, rate: 60 });
    runKeys(g, 2, ['KeyW']);
    expect(g.time).toBeCloseTo(2, 3);
    expect(g.speed).toBeGreaterThan(0);
    expect(g.snapshot().dayNight.frozen).toBe(false);
  });
});

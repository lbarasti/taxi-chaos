import { describe, expect, it } from 'vitest';
import { joystickVector, touchSteering } from './touch-controls';
import { Game } from '../game';
import { loadScenario } from '../lab';

describe('proportional touch movement', () => {
  it('ignores centre jitter and clamps diagonal travel to a circle', () => {
    expect(joystickVector(3, -2, 35)).toEqual({ x: 0, y: 0 });
    expect(joystickVector(0, -100, 35)).toEqual({ x: 0, y: -1 });
    const diagonal = joystickVector(100, 100, 35);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    expect(joystickVector(17.5, 0, 35).x).toBeGreaterThan(0);
    expect(joystickVector(17.5, 0, 35).x).toBeLessThan(0.5);
  });

  it('applies fractional throttle and steering, supports boost, and releases to keyboard', () => {
    const game = new Game(); loadScenario(game, 'first-fare');
    game.touchMove = { x: 0.3, y: -0.5 }; game.keys.add('boost');
    game.update(1 / 120);
    expect(game.controls.throttle).toBe(0.5);
    expect(game.controls.turn).toBeCloseTo(0.015625);
    expect(game.controls.boost).toBe(true);
    game.touchMove = { x: 0, y: 0.6 }; game.update(1 / 120);
    expect(game.controls).toMatchObject({ throttle: -0.6, turn: 0, boost: false });
    game.touchMove = null; game.keys.clear(); game.keys.add('KeyW'); game.keys.add('KeyA'); game.update(1 / 120);
    expect(game.controls).toMatchObject({ throttle: 1, turn: -1 });
  });

  it('holds a straight course through sideways jitter while accelerating or reversing', () => {
    const game = new Game(); loadScenario(game, 'first-fare');
    for (const y of [-1, 1]) for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) {
      game.touchMove = { x, y }; game.update(1 / 120);
      expect(game.controls).toMatchObject({ throttle: -y, turn: 0 });
    }
    for (const x of [-1, 1]) {
      game.touchMove = { x, y: -0.5 }; game.update(1 / 120);
      expect(game.controls).toMatchObject({ throttle: 0.5, turn: x });
    }
  });

  it('preserves shallow diagonal walking without applying the driving dead zone', () => {
    const game = new Game(); loadScenario(game, 'first-fare');
    game.onFoot = true; game.driver.position = { x: 4, y: 20 };
    game.touchMove = { x: 0.15, y: -0.5 };
    for (let i = 0; i < 120; i++) game.update(1 / 120);
    expect(game.driver.velocity.x).toBeCloseTo(0.825);
    expect(game.driver.velocity.y).toBeCloseTo(-2.75);
  });

  it('walks proportionally in screen directions without boosting', () => {
    const game = new Game(); loadScenario(game, 'first-fare');
    game.onFoot = true; game.driver.position = { x: 4, y: 20 };
    game.touchMove = { x: 0, y: -0.5 }; game.keys.add('boost');
    for (let i = 0; i < 120; i++) game.update(1 / 120);
    expect(game.driver.velocity.y).toBeCloseTo(-2.75, 2);
    expect(game.driver.position.y).toBeLessThan(20);
    expect(game.controls.boost).toBe(false);
  });

  it('clears held movement on pause, death, vehicle transitions and reset', () => {
    const game = new Game(); loadScenario(game, 'first-fare');
    for (const mode of ['paused', 'wasted', 'playing'] as const) {
      game.touchMove = { x: 1, y: -1 }; game.keys.add('boost'); game.setMode(mode);
      expect(game.touchMove).toBeNull(); expect(game.keys.size).toBe(0);
    }
    game.touchMove = { x: 1, y: -1 }; game.resetRun();
    expect(game.touchMove).toBeNull();
  });
});

describe('touch steering response', () => {
  it('ignores horizontal centre jitter and smoothly ramps to full lock in both directions', () => {
    for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) expect(touchSteering(x)).toBe(0);
    expect(touchSteering(0.2001)).toBeGreaterThan(0);
    expect(touchSteering(0.2001)).toBeLessThan(0.000001);
    expect(touchSteering(0.6)).toBeCloseTo(0.25);
    expect(touchSteering(-0.6)).toBeCloseTo(-0.25);
    expect(touchSteering(1)).toBe(1);
    expect(touchSteering(-1)).toBe(-1);
    expect(touchSteering(2)).toBe(1);
    expect(touchSteering(-2)).toBe(-1);
    let previous = 0;
    for (let i = 0; i <= 100; i++) {
      const value = touchSteering(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(touchSteering(-i / 100)).toBeCloseTo(-value);
      previous = value;
    }
  });
});

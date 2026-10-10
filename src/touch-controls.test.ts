import { describe, expect, it } from 'vitest';
import { joystickVector } from './touch-controls';
import { Game } from './game';
import { loadScenario } from './lab';

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
    expect(game.controls).toMatchObject({ throttle: 0.5, turn: 0.3, boost: true });
    game.touchMove = { x: 0, y: 0.6 }; game.update(1 / 120);
    expect(game.controls).toMatchObject({ throttle: -0.6, turn: 0, boost: false });
    game.touchMove = null; game.keys.clear(); game.keys.add('KeyW'); game.update(1 / 120);
    expect(game.controls.throttle).toBe(1);
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

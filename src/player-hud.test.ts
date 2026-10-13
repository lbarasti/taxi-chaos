import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { playerHudMarkup, playerHudState } from './player-hud';

describe('minimal player HUD', () => {
  it('shows the time, wallet balance, personal health and police attention', () => {
    const game = new Game(undefined, false);
    game.save.cash = 1122;
    game.shiftEarnings = 83;
    expect(playerHudState(game)).toEqual({ time: '07:00', cash: '$1,122', health: 100, heat: 0, stars: 0, starFills: [0, 0, 0] });
    expect(playerHudMarkup).not.toMatch(/speed|boost|chassis|earnings/i);
  });

  it('does not substitute vehicle condition for personal health', () => {
    const game = new Game(undefined, false);
    game.driverHealth = 63.5;
    game.player.damage.health = 12;
    expect(game.onFoot).toBe(false);
    expect(playerHudState(game).health).toBe(63.5);
    game.onFoot = true;
    expect(playerHudState(game).health).toBe(63.5);
    game.onFoot = false;
    game.player.damage.health = 100;
    expect(playerHudState(game).health).toBe(63.5);
  });

  it('follows the simulation clock across midnight and Lab lighting previews', () => {
    const game = new Game(undefined, false);
    game.dayNight.followCampaign(1439);
    expect(playerHudState(game).time).toBe('23:59');
    game.dayNight.synchronize(1440);
    expect(playerHudState(game).time).toBe('00:00');
    game.dayNight.configure({ hour: 12.5 });
    expect(playerHudState(game).time).toBe('12:30');
  });

  it('bounds the health bar, including empty and full health', () => {
    const game = new Game(undefined, false);
    for (const [health, expected] of [[-10, 0], [0, 0], [100, 100], [120, 100]]) {
      game.driverHealth = health;
      expect(playerHudState(game).health).toBe(expected);
    }
  });

  it.each([
    [0, [0, 0, 0], 0], [10, [0.5, 0, 0], 0], [20, [1, 0, 0], 1],
    [34, [1, 0.5, 0], 1], [48, [1, 1, 0], 2], [62, [1, 1, 0.5], 2],
    [76, [1, 1, 1], 3], [100, [1, 1, 1], 3],
  ])('fills stars progressively at heat %s without changing wanted level', (heat, fills, stars) => {
    const game = new Game(undefined, false);
    game.heat = heat as number;
    const state = playerHudState(game);
    expect(state.starFills).toEqual(fills);
    expect(state.stars).toBe(stars);
  });

  it('keeps the next star partial immediately before each wanted threshold', () => {
    const game = new Game(undefined, false);
    for (const [index, threshold] of [20, 48, 76].entries()) {
      game.heat = threshold - 0.001;
      const state = playerHudState(game);
      expect(state.stars).toBe(index);
      expect(state.starFills[index]).toBeLessThan(1);
      expect(state.starFills[index]).toBeGreaterThan(0.99);
    }
  });

  it('drains partial attention and clears every star when attention resets', () => {
    const game = new Game(undefined, false);
    game.heat = 100;
    expect(playerHudState(game).starFills).toEqual([1, 1, 1]);
    game.heat = 34;
    expect(playerHudState(game).starFills).toEqual([1, 0.5, 0]);
    game.heat = 0;
    expect(playerHudState(game).starFills).toEqual([0, 0, 0]);
  });
});

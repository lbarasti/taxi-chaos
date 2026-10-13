import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { playerHudMarkup, playerHudState } from './player-hud';

describe('minimal player HUD', () => {
  it('shows only the time, wallet balance and personal health', () => {
    const game = new Game(undefined, false);
    game.save.cash = 1122;
    game.shiftEarnings = 83;
    expect(playerHudState(game)).toEqual({ time: '07:00', cash: '$1,122', health: 100 });
    expect(playerHudMarkup).not.toMatch(/speed|boost|chassis|earnings|wanted|stars/i);
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
});

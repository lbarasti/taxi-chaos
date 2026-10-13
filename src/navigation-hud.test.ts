import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { navigationHudMarkup, navigationHudState } from './navigation-hud';

describe('consolidated navigation HUD', () => {
  it('uses one map, leaving the personal-status HUD separate, with embedded original icons', () => {
    expect(navigationHudMarkup.match(/id="map"/g)).toHaveLength(1);
    expect(navigationHudMarkup).not.toContain('class="player-hud"');
    expect(navigationHudMarkup).not.toMatch(/https?:|<image|target|lightning/i);
    for (const id of ['dispatch', 'texts', 'newsroom', 'job-status', 'mission-title', 'distance']) expect(navigationHudMarkup).toContain(`id="${id}"`);
  });

  it('ends at the minimap without instructions, readouts or service buttons below it', () => {
    expect(navigationHudMarkup).toMatch(/<\/canvas><\/div>\s*<\/aside>$/);
    for (const id of ['mission-description', 'job-progress', 'fare', 'fast-tip', 'comfort', 'notebook', 'photo', 'garage', 'harbour', 'boost-meter', 'speed']) expect(navigationHudMarkup).not.toContain(`id="${id}"`);
  });

  it('keeps an accessible map without a status label or collapse button', () => {
    expect(navigationHudMarkup).not.toMatch(/map-status|LIVE|PURSUIT|map-toggle|map-chevron|aria-expanded/);
    expect(navigationHudMarkup).toContain('aria-label="Local minimap:');
  });

  it('distinguishes engaged, on-board and vacant without mutating the fare', () => {
    const game = new Game(undefined, false);
    const before = structuredClone(game.job);
    expect(navigationHudState(game)).toMatchObject({ status: 'ENGAGED', vacant: false, routeVisible: true });
    expect(navigationHudState(game, false)).toMatchObject({ status: 'VACANT', vacant: true, routeVisible: false });
    expect(game.job).toEqual(before);
    game.job.stage = 'dropoff';
    expect(navigationHudState(game, false)).toMatchObject({ status: 'ON BOARD', title: `${game.job.destination}.`, vacant: false, routeVisible: true });
  });

  it('keeps parcel terminology and distance accurate without arrival copy', () => {
    const game = new Game(undefined, false);
    game.job.type = 'parcel';
    expect(navigationHudState(game).title).toContain('parcel');
    game.job.stage = 'dropoff';
    game.job.dropoff = { ...game.actor.position };
    expect(navigationHudState(game)).toMatchObject({ status: 'LOADED', distance: 0 });
    expect(navigationHudState(game)).not.toHaveProperty('arriving');
  });

  it('overrides vacant guidance for detours', () => {
    const game = new Game(undefined, false);
    game.navToGarage = true;
    expect(navigationHudState(game, false)).toMatchObject({ title: 'Pit Stop.', vacant: false, routeVisible: true });
    game.navToGarage = false; game.navToNewsroom = true;
    expect(navigationHudState(game, false).title).toContain('Newsroom');
    game.navToNewsroom = false; game.navToHarbour = true;
    expect(navigationHudState(game, false)).toMatchObject({ title: 'Northstar Harbour.', routeVisible: true });
    game.harbour.vehicleId = game.player.id;
    expect(navigationHudState(game, false).title).toBe('Container C-76.');
    game.harbour.exchanged = true;
    expect(navigationHudState(game).title).toBe('Take the exit.');
  });

  it('follows the actor on foot and during bailout rather than showing fare details', () => {
    const game = new Game(undefined, false);
    game.onFoot = true;
    expect(navigationHudState(game, false)).toMatchObject({ status: 'ON FOOT', title: 'Find a ride.', routeVisible: true, vacant: false });
    game.tumble = { elapsed: 0, duration: 1, speed: 10, side: -1, bike: false, grounded: false };
    expect(navigationHudState(game).title).toBe('Brace for impact.');
  });
});

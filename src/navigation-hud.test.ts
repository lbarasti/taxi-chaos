import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { navigationHudMarkup, navigationHudState } from './navigation-hud';

describe('consolidated navigation HUD', () => {
  it('uses one map, leaving the personal-status HUD separate, with embedded original icons', () => {
    expect(navigationHudMarkup.match(/id="map"/g)).toHaveLength(1);
    expect(navigationHudMarkup).not.toContain('class="player-hud"');
    expect(navigationHudMarkup).not.toMatch(/https?:|<image|target|lightning/i);
    for (const id of ['dispatch', 'texts', 'newsroom', 'notebook', 'photo', 'garage', 'harbour', 'boost-meter', 'speed']) expect(navigationHudMarkup).toContain(`id="${id}"`);
  });

  it('distinguishes engaged, on-board and vacant without mutating the fare', () => {
    const game = new Game(undefined, false);
    const before = structuredClone(game.job);
    expect(navigationHudState(game)).toMatchObject({ status: 'ENGAGED', vacant: false, bonuses: false, routeVisible: true });
    expect(navigationHudState(game, false)).toMatchObject({ status: 'VACANT', vacant: true, bonuses: false, routeVisible: false });
    expect(game.job).toEqual(before);
    game.job.stage = 'dropoff';
    expect(navigationHudState(game, false)).toMatchObject({ status: 'ON BOARD', vacant: false, bonuses: true, routeVisible: true });
  });

  it('shows the actual base fare and non-failing tip countdown only on board', () => {
    const game = new Game(undefined, false);
    Object.assign(game.job, { stage: 'dropoff', fare: 129, time: 60, elapsed: 2, comfort: 76.4 });
    expect(navigationHudState(game)).toMatchObject({ fare: '$129', tip: 'FAST TIP · 58s', comfort: '76% comfort', bonuses: true });
    game.job.elapsed = 61;
    expect(navigationHudState(game)).toMatchObject({ fare: '$129', tip: 'NO RUSH · BASE FARE', bonuses: true });
  });

  it('keeps parcel terminology and arrival guidance accurate', () => {
    const game = new Game(undefined, false);
    game.job.type = 'parcel';
    expect(navigationHudState(game).title).toContain('parcel');
    game.job.stage = 'dropoff';
    game.job.dropoff = { ...game.actor.position };
    expect(navigationHudState(game)).toMatchObject({ status: 'LOADED', comfort: '100% intact', distance: 0, arriving: true });
  });

  it('overrides vacant guidance for detours and never leaks passenger bonuses', () => {
    const game = new Game(undefined, false);
    game.navToGarage = true;
    expect(navigationHudState(game, false)).toMatchObject({ title: 'Pit Stop.', vacant: false, routeVisible: true, bonuses: false });
    game.navToGarage = false; game.navToNewsroom = true;
    expect(navigationHudState(game, false).title).toContain('Newsroom');
    game.navToNewsroom = false; game.navToHarbour = true;
    expect(navigationHudState(game, false)).toMatchObject({ title: 'Northstar Harbour.', fareLabel: 'ENTRY + SWAP', fare: '$75', routeVisible: true });
    game.harbour.vehicleId = game.player.id; game.harbour.progress = 1.25;
    expect(navigationHudState(game, false)).toMatchObject({ title: 'Container C-76.', fare: 'PAID', progress: 0.5 });
    game.harbour.exchanged = true;
    expect(navigationHudState(game).title).toBe('Take the exit.');
  });

  it('follows the actor on foot and during bailout rather than showing fare details', () => {
    const game = new Game(undefined, false);
    game.onFoot = true;
    expect(navigationHudState(game, false)).toMatchObject({ status: 'ON FOOT', title: 'Find a ride.', routeVisible: true, vacant: false, bonuses: false, progress: 0 });
    game.tumble = { elapsed: 0, duration: 1, speed: 10, side: -1, bike: false, grounded: false };
    expect(navigationHudState(game).title).toBe('Brace for impact.');
  });

  it('converts physical speed to mph and bounds the boost reserve', () => {
    const game = new Game(undefined, false);
    game.player.body.velocity = { x: 8.9408, y: 0 }; game.boost = 25.5;
    expect(navigationHudState(game)).toMatchObject({ speed: 20, boost: 25.5 });
    game.boost = -4; expect(navigationHudState(game).boost).toBe(0);
    game.boost = 150; expect(navigationHudState(game).boost).toBe(100);
  });
});

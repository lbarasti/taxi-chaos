import { describe, expect, it } from 'vitest';
import { Game } from '../game/game';
import { GARAGE } from '../world/world';
import { PORT_ENTRY } from '../world/harbour';
import { navigationTargetKind } from '../rendering/radar';
import { navigationHudMarkup, navigationHudState } from './navigation-hud';

const routeOf = (game: Game) => navigationTargetKind({
  onFoot: game.onFoot, stage: game.job.stage, navToGarage: game.navToGarage, navToHarbour: game.navToHarbour, navToNewsroom: game.navToNewsroom,
  navToStopover: game.navToStopover && !!game.stopoverStatus && !game.stopoverStatus.completed,
  admitted: game.harbour.vehicleId === game.player.id, exchanged: game.harbour.exchanged,
});

describe('radar-first navigation HUD', () => {
  it('keeps one map and no header above it, with embedded original icons', () => {
    expect(navigationHudMarkup.match(/id="map"/g)).toHaveLength(1);
    expect(navigationHudMarkup).not.toContain('class="player-hud"');
    expect(navigationHudMarkup).not.toMatch(/https?:|<image|target|lightning/i);
    expect(navigationHudMarkup).not.toMatch(/navigation-header|mission-title|job-status|navigation-contacts/);
    expect(navigationHudMarkup).toMatch(/<div class="navigation-chart">[\s\S]*<\/div>\s*<\/aside>/);
    for (const id of ['dispatch', 'texts', 'shift', 'newsroom', 'observe']) expect(navigationHudMarkup).toContain(`id="${id}"`);
  });

  it('ends at the minimap without instructions, readouts, captions or service buttons below it', () => {
    const aside = navigationHudMarkup.match(/<aside[\s\S]*?<\/aside>/)![0];
    expect(aside).toMatch(/<div class="navigation-chart">[\s\S]*<\/div>\s*<\/aside>$/);
    expect(aside).not.toMatch(/<p[ >]|caption|readout/i);
    expect(navigationHudMarkup).toMatch(/<\/aside>\s*<div class="navigation-actions"/);
    for (const id of ['mission-description', 'job-progress', 'fare', 'fast-tip', 'comfort', 'notebook', 'photo', 'garage', 'harbour', 'boost-meter', 'speed']) expect(navigationHudMarkup).not.toContain(`id="${id}"`);
  });

  it('separates named quick actions from the map, without canvas hotspots', () => {
    const actions = navigationHudMarkup.match(/<div class="navigation-actions"[\s\S]*<\/div>/)![0];
    expect(actions).toContain('role="group"');
    expect(actions).toContain('aria-label="Dispatch and campaign shortcuts"');
    for (const id of ['dispatch', 'texts', 'shift', 'newsroom', 'observe']) expect(actions).toContain(`id="${id}"`);
    expect(actions.match(/<button/g)).toHaveLength(5);
    expect(actions).toMatch(/<button id="observe"[^>]*hidden disabled/);
    expect(actions).toMatch(/<button id="newsroom"[^>]*aria-label="Newsroom: view records and story readiness"[^>]*aria-haspopup="dialog"/);
    // Every action is a real, named button; the chart keeps no interactive markup.
    for (const button of actions.match(/<button[^>]*>/g)!) expect(button).toMatch(/aria-label="[^"]+"/);
    expect(navigationHudMarkup).toMatch(/<canvas id="map" role="img" aria-label="Local minimap:/);
    expect(navigationHudMarkup).not.toMatch(/onclick|tabindex|<a /i);
  });

  it('uses a dispatcher icon and message icon rather than a portrait', () => {
    const bookings = navigationHudMarkup.match(/<button id="texts"[^>]*>(.*?)<\/button>/)![1];
    expect(bookings).toContain('<svg');
    expect(bookings).toContain('aria-hidden="true"');
    expect(bookings).not.toContain('<img');
    expect(navigationHudMarkup).toContain('aria-label="Bookings: read text messages"');
    expect(navigationHudMarkup).not.toMatch(/dispatch-portrait|bookings-portrait|<img/);
    expect(navigationHudMarkup).toMatch(/<button id="dispatch"[^>]*aria-label="Dispatch: [^"]+"/);
    expect(navigationHudMarkup).toMatch(/<button id="dispatch"[^>]*aria-pressed="true"/);
  });

  it('keeps an accessible map without a status label, caption, badge or collapse button', () => {
    expect(navigationHudMarkup).not.toMatch(/map-status|LIVE|PURSUIT|map-toggle|map-chevron|aria-expanded/);
    expect(navigationHudMarkup).toContain('aria-label="Local minimap:');
    // The on-board cue is world-rendered; the wheel keeps no silhouette or package badge.
    expect(navigationHudMarkup).not.toMatch(/map-badge|navigation-badge|badge-passenger|badge-parcel|<img/);
    expect(navigationHudMarkup).not.toContain('map-caption');
  });

  it('distinguishes engaged, on-board and vacant without mutating the fare', () => {
    const game = new Game(undefined, false);
    const before = structuredClone(game.job);
    expect(navigationHudState(game)).toMatchObject({ status: 'ENGAGED', vacant: false, routeVisible: true, label: 'PICK UP', kind: 'pickup', load: null });
    expect(navigationHudState(game, false)).toMatchObject({ status: 'VACANT', vacant: true, routeVisible: false, label: 'DISPATCH', caption: 'DISPATCH · Route the next fare' });
    expect(game.job).toEqual(before);
    game.job.stage = 'dropoff';
    expect(navigationHudState(game, false)).toMatchObject({ status: 'ON BOARD', vacant: false, routeVisible: true, label: 'DELIVER', caption: `DELIVER · ${game.job.destination}`, kind: 'delivery', load: 'passenger' });
  });

  it('keeps parcel terminology and accurate load state without a badge', () => {
    const game = new Game(undefined, false);
    game.job.type = 'parcel';
    const collecting = navigationHudState(game);
    expect(collecting.label).toBe('PICK UP');
    expect(collecting.caption).toContain('parcel');
    expect(collecting.load).toBeNull();
    game.job.stage = 'dropoff';
    game.job.dropoff = { ...game.actor.position };
    expect(navigationHudState(game)).toMatchObject({ status: 'LOADED', load: 'parcel', kind: 'delivery' });
    expect(navigationHudState(game)).not.toHaveProperty('arriving');
    expect(navigationHudState(game)).not.toHaveProperty('distance');
  });

  it('keeps an unanswered call vacant regardless of cached fare guidance', () => {
    const game = new Game(undefined, false); game.start();
    game.newJob(false, 'replaced', true);
    expect(game.dispatchWaiting).toBe(true);
    expect(navigationHudState(game)).toMatchObject({ status: 'VACANT', routeVisible: false, load: null });
    expect(game.answerDispatch()).toBe(true);
    expect(navigationHudState(game)).toMatchObject({ status: 'ENGAGED', routeVisible: true, load: null });
    const request = game.dialogue.active;
    expect(navigationHudState(game, false)).toMatchObject({ status: 'VACANT', routeVisible: false });
    expect(game.answerDispatch()).toBe(false);
    expect(game.dialogue.active).toBe(request);
  });

  it('draws no metres counter and no bottom caption on the map', () => {
    const game = new Game(undefined, false);
    expect(navigationHudMarkup).not.toContain('map-caption');
    expect(navigationHudMarkup).not.toMatch(/\d+\s*m\b/);
    for (const state of [navigationHudState(game), navigationHudState(game, false)]) {
      expect(state).not.toHaveProperty('distance');
      expect(state.caption).not.toMatch(/\d+\s*m\b|metre|distance/i);
    }
  });

  it('overrides vacant guidance for detours and names each destination', () => {
    const game = new Game(undefined, false);
    game.navToGarage = true;
    expect(navigationHudState(game, false)).toMatchObject({ label: 'GARAGE', caption: 'GARAGE · Pit Stop', vacant: false, routeVisible: true, kind: 'garage' });
    expect(game.target).toEqual(GARAGE);
    game.navToGarage = false; game.navToNewsroom = true;
    expect(navigationHudState(game, false)).toMatchObject({ label: 'NEWSROOM', kind: 'newsroom' });
    expect(navigationHudState(game, false).caption).toContain('Newsroom');
    expect(game.target).toEqual(game.newsroom);
    game.navToNewsroom = false; game.navToHarbour = true;
    expect(navigationHudState(game, false)).toMatchObject({ label: 'HARBOUR', caption: 'HARBOUR · Northstar Harbour', routeVisible: true, kind: 'harbour' });
    expect(game.target).toEqual(PORT_ENTRY);
    game.harbour.vehicleId = game.player.id;
    expect(navigationHudState(game, false)).toMatchObject({ caption: 'HARBOUR · Container C-76', kind: 'swap', load: null });
    game.harbour.exchanged = true;
    expect(navigationHudState(game)).toMatchObject({ caption: 'HARBOUR · Take the exit', kind: 'exit' });
  });

  it('follows the actor on foot with a walk glyph and no permanent status bar', () => {
    const game = new Game(undefined, false);
    game.onFoot = true;
    const walking = navigationHudState(game, false);
    expect(walking).toMatchObject({ status: 'ON FOOT', caption: '', routeVisible: true, vacant: false, kind: 'walk', load: null });
    expect(walking.caption).not.toMatch(/Find a ride/);
    game.tumble = { elapsed: 0, duration: 1, speed: 10, side: -1, bike: false, grounded: false };
    const bracing = navigationHudState(game);
    expect(bracing).toMatchObject({ label: 'BRACE', caption: 'BRACE · Brace for impact' });
  });

  it('labels the optional wash independently and returns to the unchanged destination', () => {
    const game = new Game(undefined, false); game.job.stage = 'dropoff';
    const destination = game.job.destination, dropoff = { ...game.job.dropoff };
    const wash = { title: 'East Village wash', request: 'A wash on the way back.', position: { x: 204, y: 164 }, nearby: false, available: false, started: false, completed: false, remaining: 12, seconds: 12 };
    Object.defineProperty(game, 'stopoverStatus', { get: () => wash });
    expect(navigationHudState(game)).toMatchObject({ kind: 'delivery', caption: `DELIVER · ${destination}` });
    game.navToStopover = true;
    expect(navigationHudState(game)).toMatchObject({ kind: 'stopover', caption: 'OPTIONAL STOP · East Village wash', load: 'passenger', routeVisible: true });
    game.navToGarage = true;
    expect(navigationHudState(game)).toMatchObject({ kind: 'garage', label: 'GARAGE' });
    game.navToGarage = false;
    wash.completed = true;
    expect(navigationHudState(game)).toMatchObject({ kind: 'delivery', caption: `DELIVER · ${destination}` });
    expect(game.job.dropoff).toEqual(dropoff);
    expect(game.job.destination).toBe(destination);
  });

  it('returns to vacant after clearing newsroom guidance without cancelling the booking', () => {
    const game = new Game(undefined, false);
    game.start();
    const booking = structuredClone(game.job);
    game.navigateNewsroom();
    expect(navigationHudState(game, false)).toMatchObject({ vacant: false, routeVisible: true, kind: 'newsroom' });
    game.navigateNewsroom();
    expect(navigationHudState(game, false)).toMatchObject({ status: 'VACANT', vacant: true, routeVisible: false });
    expect(game.navToNewsroom).toBe(false);
    expect(game.job).toEqual(booking);
    expect(routeOf(game)).toBe('pickup');
  });

  it('keeps the destination symbols in step with the routed target', () => {
    const game = new Game(undefined, false);
    expect(routeOf(game)).toBe('pickup');
    game.job.stage = 'dropoff';
    expect(routeOf(game)).toBe('delivery');
    game.navToGarage = true;
    expect(routeOf(game)).toBe('garage');
    game.navToGarage = false; game.navToNewsroom = true;
    expect(routeOf(game)).toBe('newsroom');
    game.navToNewsroom = false; game.navToHarbour = true;
    expect(routeOf(game)).toBe('harbour');
    game.harbour.vehicleId = game.player.id;
    expect(routeOf(game)).toBe('swap');
    game.harbour.exchanged = true;
    expect(routeOf(game)).toBe('exit');
    game.onFoot = true;
    expect(routeOf(game)).toBe('walk');
  });
});

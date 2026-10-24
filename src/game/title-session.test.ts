import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from './game';
import { checkpointStorageKey, storageKeys } from './storage';
import { campaignDefinition } from '../campaign/content';
import { splashMarkup } from '../ui/splash';
import { drawerMarkup } from '../ui/drawer-view';
import { createSettings } from '../ui/settings';
import { AudioFX } from '../audio/audio';

function storage() {
  const values = new Map<string, string>();
  const api = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
  vi.stubGlobal('localStorage', api);
  return { values, api };
}
const morningKey = checkpointStorageKey(campaignDefinition.id);
afterEach(() => vi.unstubAllGlobals());

describe('suspended title sessions', () => {
  it.each(['fare', 'parcel'] as const)('freezes and resumes the same ordinary %s, bodies, narrative and timers without startup work', type => {
    const { values, api } = storage();
    const game = new Game().freshGame(); game.start();
    game.newJob(false, 'replaced', true);
    Object.assign(game.job, { type, stage: 'dropoff', elapsed: 17, comfort: 63 });
    game.player.upgrades.engine = 2; game.player.damage.health = 54;
    game.vehicles[1].damage.health = 42; game.world.props[0].hp = 20;
    game.heat = 55; game.escape = 2; game.comboTimer = 4;
    game.onFoot = true; game.driver.position = { x: 8, y: 32 };
    game.dialogue.start('test-live-beat', { speaker: 'lena', category: 'lore', channel: 'passenger', text: 'Still on board.' });
    game.dialogue.update(0.1); game.notify('Live notification', '', { duration: 8 });
    game.setMode('paused');
    const references = [game.job, game.world, game.player, game.vehicles, game.missions, game.dialogue.active, game.notifications.items[0]];
    const live = () => structuredClone({ snapshot: game.snapshot(), dialogue: game.dialogue.active, notices: game.notifications.items, props: game.world.props.map(p => p.hp), log: game.eventLog });
    const archived = values.get(morningKey), startup = [...game.eventLog];
    api.setItem.mockClear();
    game.returnToTitle();
    expect(game.mode).toBe('intro'); expect(game.sessionStarted).toBe(true); expect(game.titleSaveFailed).toBe(false);
    expect(api.setItem.mock.calls.map(call => call[0])).toEqual([storageKeys.save]);
    const frozen = live();
    for (let i = 0; i < 7200; i++) game.update(1 / 120);
    expect(live()).toEqual(frozen); expect(values.get(morningKey)).toBe(archived);
    const sync = vi.spyOn(game, 'syncMissionOffers');
    for (let round = 0; round < 3; round++) {
      game.start(); expect(game.mode).toBe('playing');
      expect([game.job, game.world, game.player, game.vehicles, game.missions, game.dialogue.active, game.notifications.items[0]].every((value, index) => value === references[index])).toBe(true);
      expect(game.job).toMatchObject({ type, stage: 'dropoff', elapsed: 17, comfort: 63 });
      expect(game.heat).toBe(55); expect(game.onFoot).toBe(true); expect(game.player.damage.health).toBe(54);
      game.setMode('paused'); game.returnToTitle();
    }
    expect(sync).not.toHaveBeenCalled(); expect(game.eventLog).toEqual(startup); expect(values.get(morningKey)).toBe(archived);
  });

  it('keeps Continue and the pause-menu return entry current without an initial save, and explains failed persistence on the title', () => {
    const { api } = storage(); const game = new Game().freshGame(); game.start(); game.setMode('paused');
    const settings = createSettings(() => game, new AudioFX());
    expect(splashMarkup(game, false)).toContain('id="return-to-title"');
    expect(drawerMarkup('shift', { game, settings, saved: true })).not.toContain('id="return-to-title"');
    api.setItem.mockImplementation(() => { throw Error('quota'); });
    game.returnToTitle(); expect(game.titleSaveFailed).toBe(true);
    const html = splashMarkup(game, game.sessionStarted);
    expect(html).toContain('Continue'); expect(html).toContain('role="alert"');
    expect(html).not.toContain('splash-save');
    expect(html).toContain('Progress could not be saved to the browser. Continue is still available while this page stays open.');
    expect(html).not.toContain('id="return-to-title"');
    game.start(); expect(game.mode).toBe('playing');
    api.setItem.mockImplementation(() => {}); game.setMode('paused'); game.returnToTitle();
    expect(game.titleSaveFailed).toBe(false);
  });

  it('keeps the suspended session intact when loading fails, and replaces it only with fresh or valid loaded instances', () => {
    const { values, api } = storage(); const original = new Game().freshGame(); original.start(); original.save.cash = 456;
    original.setMode('paused'); original.returnToTitle();
    const before = structuredClone(original.snapshot()), notices = [...original.eventLog];
    expect(original.loadMorning(7)).toBeNull();
    api.setItem.mockImplementation(() => { throw Error('quota'); });
    expect(original.loadMorning(1)).toBeNull(); expect(original.snapshot()).toEqual(before);
    api.setItem.mockImplementation((key, value) => { values.set(key, value); });
    const loaded = original.loadMorning(1)!;
    expect(loaded).not.toBe(original); expect(loaded.sessionStarted).toBe(false); loaded.start();
    expect(loaded.save.cash).toBe(80); loaded.setMode('paused'); loaded.returnToTitle(); loaded.start();
    expect(loaded.save.cash).toBe(80);
    const fresh = original.freshGame(); expect(fresh.sessionStarted).toBe(false); fresh.start();
    expect(fresh.save.cash).toBe(80); expect(original.snapshot()).toEqual(before); expect(original.eventLog).toEqual(notices);
  });

  it.each([true, false])('keeps isolated campaign=%s previews out of the normal title/save lifecycle', campaign => {
    const { api } = storage(); const game = new Game(undefined, false, campaign); game.start(); game.setMode('paused');
    api.getItem.mockClear(); api.setItem.mockClear();
    game.returnToTitle(); expect(game.mode).toBe('paused'); expect(game.canReturnToTitle).toBe(false);
    expect(splashMarkup(game, false)).not.toContain('id="return-to-title"');
    expect(api.getItem).not.toHaveBeenCalled(); expect(api.setItem).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../audio/audio-assets', () => ({ audioAssets: {} }));
import { AudioFX } from '../audio/audio';
import { Game, defaultSave } from './game';
import { readStorage, removeStorage, storageKeys } from './storage';
import { campaignDefinition } from '../campaign/content';

function mockStorage(entries: [string, string][] = []) {
  const values = new Map(entries);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
  vi.stubGlobal('localStorage', storage);
  return { values, storage };
}
afterEach(() => vi.unstubAllGlobals());

describe('Taxi Chaos current-format storage', () => {
  it('replaces progressed saves and runtime bodies with a fully initialized fresh game, keeping preferences', () => {
    const { values } = mockStorage();
    const previous = new Game();
    previous.configure({ gore: true, difficulty: 'chaos', invincible: true, noPolice: true, infiniteBoost: true });
    const audio = new AudioFX();
    audio.configure({ muted: true, volume: 0.31, playerEngine: 0.23, ambient: 0.44, sirens: 0.08 });
    previous.save.cash = 9876; previous.save.deliveries = 42; previous.save.best = 2100;
    previous.save.shiftStats = { earnings: 400, jobs: 9, smashed: 17, kills: 3 };
    Object.assign(previous.save.story, { chapter: 4, completed: ['old-mission'], failed: ['failed-mission'], flags: ['old-flag'], choices: { old: 'choice' }, relationships: { old: 12 }, retryAt: { old: 100 }, campaignSeconds: 1234, deliveries: 42 });
    previous.save.playerRecords.texts.push({ messageId: 'old-text', missionId: 'old-mission', character: 'dispatcher', sender: 'Dispatch', title: 'Old text', text: 'Old progress', pickup: 'Old stop', receivedAt: 10, readAt: 12 });
    previous.save.playerRecords.notebook.push({ id: 'old-record', title: 'Old note', text: 'Old progress', kind: 'receipt', shift: 2, at: 10 });
    previous.save.campaign.minute += 6000; previous.save.campaign.shift = 5;
    previous.save.campaign.finished = previous.save.campaign.endingSeen = true;
    previous.save.campaign.world.old = true;
    previous.save.campaign.newsroom = { received: { old: { at: 500, verifiedAt: 680 } }, cases: { old: { verifiedAt: 680, approvedAt: 700, editionAt: 900 } } };
    previous.save.campaign.publications.push({ allegation: 'old', submittedShift: 1, publishedShift: 2, at: 900 });
    previous.save.campaign.editions.push({ day: 5, at: 6000, articles: ['old'], briefs: [], read: true });
    previous.save.campaign.reactions.old = { at: 1000 };
    previous.save.campaign.regularRides.old = 4;
    previous.player = previous.vehicle('taxi', 90, 80, 0, '#f7ce55', 'pickup');
    previous.player.upgrades.engine = 3;
    previous.vehicle('traffic', 84, 80, 0, '#ffffff').upgrades.grip = 2;
    previous.player.damage.health = 14; previous.onFoot = true; previous.driverHealth = 40;
    previous.job.stage = 'dropoff'; previous.job.elapsed = 50;
    previous.time = 123; previous.heat = 60; previous.boost = 20; previous.smashed = 10;
    previous.world.props[0].alive = false; previous.keys.add('KeyW');
    previous.persist();
    const settings = values.get(storageKeys.settings), sound = values.get(storageKeys.audio);
    const oldSave = structuredClone(previous.save);
    const expected = new Game(previous.map, false, true, defaultSave(previous.campaignContent), previous.campaignContent);
    expected.persist();
    const fresh = previous.freshGame();
    expect(fresh).not.toBe(previous); expect(fresh.world).not.toBe(previous.world); expect(fresh.player).not.toBe(previous.player);
    expect(fresh.map).toBe(previous.map); expect(fresh.campaignContent).toBe(previous.campaignContent);
    expect(fresh.save).toEqual(expected.save);
    expect(fresh.snapshot()).toEqual({ ...expected.snapshot(), settings: fresh.settings });
    expect(fresh.keys.size).toBe(0); expect(fresh.mode).toBe('intro');
    expect(previous.save).toEqual(oldSave); expect(previous.onFoot).toBe(true); expect(previous.heat).toBe(60);
    expect(fresh.settings).toMatchObject({ gore: true, difficulty: 'chaos', invincible: false, noPolice: false, infiniteBoost: false });
    expect(values.get(storageKeys.settings)).toBe(settings); expect(values.get(storageKeys.audio)).toBe(sound);
    expect(new AudioFX().preferences).toEqual(audio.preferences);
    expect(JSON.parse(values.get(storageKeys.save)!)).toEqual(JSON.parse(JSON.stringify(fresh.save)));
    const reloaded = new Game();
    expect(reloaded.save).toEqual(fresh.save); expect(reloaded.player.upgrades).toEqual(fresh.player.upgrades);
    expect(reloaded.actor.position).toEqual(fresh.actor.position); expect(reloaded.onFoot).toBe(false);
    fresh.start(); reloaded.start();
    expect(reloaded.save.playerRecords).toEqual(fresh.save.playerRecords);
    expect(reloaded.job).toEqual(fresh.job); expect(reloaded.missionOffers).toEqual(fresh.missionOffers);
    expect(fresh.save.playerRecords.texts.length).toBeGreaterThan(0);
    expect(fresh.save.campaign.editions.length).toBeGreaterThan(0);
  });
  it('uses current campaign initialization and keeps isolated games from reading or writing normal storage', () => {
    const { storage } = mockStorage([[storageKeys.save, JSON.stringify({ ...defaultSave(), cash: 900 })]]);
    const definition = { ...campaignDefinition, initialWorld: { ...campaignDefinition.initialWorld, 'fresh-marker': 'opening' } };
    const isolated = new Game(undefined, false, true, undefined, definition);
    isolated.configure({ gore: true, difficulty: 'cruise' }); isolated.save.cash = 400;
    const fresh = isolated.freshGame();
    expect(fresh.persistenceEnabled).toBe(false); expect(fresh.campaignContent).toBe(definition);
    expect(fresh.save.campaign.world['fresh-marker']).toBe('opening');
    const expected = new Game(isolated.map, false, true, defaultSave(definition), definition); expected.persist();
    expect(fresh.save).toEqual(expected.save);
    expect(fresh.settings).toMatchObject({ gore: true, difficulty: 'cruise' });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(new Game().save.cash).toBe(900);
  });
  it('loads and updates current progress, settings and preferences', () => {
    const save = { ...defaultSave(), cash: 975, deliveries: 12, best: 600 };
    const settings = { gore: true, difficulty: 'chaos' }, preferences = { muted: true, volume: 0.4, playerEngine: 0.3, ambient: 0.6, sirens: 0.1 };
    const { values } = mockStorage([
      [storageKeys.save, JSON.stringify(save)], [storageKeys.settings, JSON.stringify(settings)], [storageKeys.audio, JSON.stringify(preferences)],
    ]);
    const game = new Game(), audio = new AudioFX();
    expect(game.save).toEqual(save); expect(game.settings).toMatchObject(settings); expect(audio.preferences).toEqual(preferences);
    game.save.cash += 100; game.persist(); game.configure({ difficulty: 'cruise' }); audio.configure({ muted: false });
    expect(JSON.parse(values.get(storageKeys.save)!)).toEqual({ ...JSON.parse(JSON.stringify(game.save)), cash: 1075 });
    expect(JSON.parse(values.get(storageKeys.settings)!)).toEqual({ gore: true, difficulty: 'cruise' });
    expect(JSON.parse(values.get(storageKeys.audio)!)).toEqual({ ...preferences, muted: false });
  });
  it('restores shift totals and accepts saves from before shift tracking', () => {
    const save = { ...defaultSave(), cash: 975, deliveries: 12, shiftStats: { earnings: 185, jobs: 2, smashed: 9, kills: 1 } };
    mockStorage([[storageKeys.save, JSON.stringify(save)]]);
    const game = new Game();
    expect(game.save.shiftStats).toEqual(save.shiftStats);
    game.save.shiftStats.earnings += 5; game.save.shiftStats.jobs++; game.save.shiftStats.smashed++; game.save.shiftStats.kills++; game.persist();
    expect(new Game().save.shiftStats).toEqual({ earnings: 190, jobs: 3, smashed: 10, kills: 2 });
    const { shiftStats, ...oldSave } = save;
    mockStorage([[storageKeys.save, JSON.stringify(oldSave)]]);
    expect(new Game().save).toEqual({ ...save, shiftStats: defaultSave().shiftStats });
    mockStorage([[storageKeys.save, JSON.stringify({ ...save, shiftStats: { earnings: -1, jobs: '12', smashed: 4.9, kills: null } })]]);
    expect(new Game().save.shiftStats).toEqual({ earnings: 0, jobs: 0, smashed: 4, kills: 0 });
  });
  it('ignores prior project names and reads only the current keys', () => {
    const { values, storage } = mockStorage([['fare-city-v1', JSON.stringify({ ...defaultSave(), cash: 420 })]]);
    expect(readStorage(storageKeys.save)).toBeNull();
    expect(new Game().save).toEqual(defaultSave());
    expect(values.has('fare-city-v1')).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
    mockStorage([['fare-city-v1', 'old'], [storageKeys.save, 'current']]);
    expect(readStorage(storageKeys.save)).toBe('current');
  });
  it('resets only the current save key', () => {
    const { values } = mockStorage([['fare-city-v1', 'old'], [storageKeys.save, 'current'], [storageKeys.settings, '{}']]);
    removeStorage(storageKeys.save);
    expect(readStorage(storageKeys.save)).toBeNull(); expect(new Game().save).toEqual(defaultSave());
    expect(values.has('fare-city-v1')).toBe(true); expect(values.has(storageKeys.settings)).toBe(true);
  });
  it('rejects incomplete old save records instead of keeping career values', () => {
    mockStorage([[storageKeys.save, JSON.stringify({ cash: 975, deliveries: 12, best: 600, upgrades: { engine: 2 } })]]);
    expect(new Game().save).toEqual(defaultSave());
  });
  it('rejects versioned but incomplete old player and campaign records', () => {
    const oldRecords = { ...defaultSave(), playerRecords: { version: 1, texts: [] } };
    const oldCampaign = { ...defaultSave(), campaign: { version: 2, minute: 420 } };
    const oldStory = { ...defaultSave(), story: { version: 1, chapter: 1, completed: [] } };
    for (const save of [oldRecords, oldCampaign, oldStory]) {
      mockStorage([[storageKeys.save, JSON.stringify(save)]]);
      expect(new Game().save).toEqual(defaultSave());
    }
  });
  it('keeps default progress and preferences when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('storage denied'); } });
    expect(new Game().save).toEqual(defaultSave());
    expect(new AudioFX().preferences).toEqual({ muted: false, volume: 0.65, playerEngine: 0.7, ambient: 1, sirens: 0.25 });
  });
  it('adds the player engine default to saved audio preferences and persists its independent level', () => {
    const { values } = mockStorage([[storageKeys.audio, JSON.stringify({ muted: true, volume: 0.4, sirens: 0.1 })]]);
    const audio = new AudioFX();
    expect(audio.preferences).toEqual({ muted: true, volume: 0.4, playerEngine: 0.7, ambient: 1, sirens: 0.1 });
    audio.configure({ playerEngine: 0 });
    expect(new AudioFX().preferences).toEqual({ muted: true, volume: 0.4, playerEngine: 0, ambient: 1, sirens: 0.1 });
    expect(JSON.parse(values.get(storageKeys.audio)!)).toEqual(audio.preferences);
  });
  it('adds ambient volume to existing preferences and persists changes independently of progress', () => {
    const previous = { muted: false, volume: 0.4, playerEngine: 0.2, sirens: 0.1 };
    const { values } = mockStorage([[storageKeys.audio, JSON.stringify(previous)]]);
    const audio = new AudioFX();
    expect(audio.preferences).toEqual({ ...previous, ambient: 1 });
    audio.configure({ ambient: 0.35 });
    expect(new AudioFX().preferences).toEqual({ ...previous, ambient: 0.35 });
    audio.configure({ ambient: 0 });
    expect(new AudioFX().preferences.ambient).toBe(0);
    expect(values.has(storageKeys.save)).toBe(false);
  });
});

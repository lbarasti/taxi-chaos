import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./audio/audio-assets', () => ({ audioAssets: {} }));
import { AudioFX } from './audio/audio';
import { Game, defaultSave } from './game';
import { readStorage, removeStorage, storageKeys } from './storage';

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
  it('loads and updates current progress, settings and preferences', () => {
    const save = { ...defaultSave(), cash: 975, deliveries: 12, best: 600 };
    const settings = { gore: true, difficulty: 'chaos' }, preferences = { muted: true, volume: 0.4, sirens: 0.1 };
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
    expect(new AudioFX().preferences).toEqual({ muted: false, volume: 0.65, sirens: 0.25 });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game, defaultSave } from './game';
import { readMorningCheckpoints, writeMorningCheckpoint } from './morning-checkpoints';
import { checkpointStorageKey, eraseSavedProgress, storageKeys } from './storage';
import { campaignDefinition } from '../campaign/content';
import { campaignDays, dayMinute } from '../campaign/clock';
import { GARAGE } from '../world/world';
import { vec } from '../physics/physics';

const key = checkpointStorageKey(campaignDefinition.id);
function storage() {
  const values = new Map<string, string>();
  const api = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }), removeItem: vi.fn((key: string) => { values.delete(key); }) };
  vi.stubGlobal('localStorage', api);
  return { values, api };
}
function play(game = new Game()) {
  game.start(); game.vehicles = [game.player]; game.trafficTarget = 0; game.settings.noPolice = true;
  return game;
}
const days = () => readMorningCheckpoints().map(c => c.day);
const morning = (day: number) => readMorningCheckpoints().find(c => c.day === day)!.save;
const step = (game: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 120); i++) game.update(1 / 120); };
afterEach(() => vi.unstubAllGlobals());

describe('automatic campaign morning checkpoints', () => {
  it('starts empty and creates Day 1 only after New game opening initialization', () => {
    const { api } = storage();
    const title = new Game(); expect(title.morningCheckpoints).toEqual([]); expect(api.setItem).not.toHaveBeenCalled();
    title.persist(); title.start(); title.persist(); expect(days()).toEqual([]);
    const fresh = title.freshGame(); expect(days()).toEqual([]);
    fresh.start(); expect(days()).toEqual([1]);
    expect(morning(1)).toEqual(new Game().save);
    expect(morning(1).playerRecords.texts.length).toBeGreaterThan(0);
    expect(morning(1).campaign.editions.length).toBeGreaterThan(0);
    expect(morning(1).garage?.current.position).toEqual(fresh.player.body.position);
    const archived = morning(1); fresh.save.cash = 333; fresh.persist(); fresh.start();
    expect(morning(1)).toEqual(archived);
  });

  it('captures the full live state crossing 07:00 without sleeping or dropping an active ride', () => {
    storage(); const game = play();
    game.player.body.position = { ...game.job.pickup }; step(game, 0.9);
    expect(game.job.stage).toBe('dropoff');
    game.advanceNarrativeTo(dayMinute(2) - 0.02);
    game.save.cash = 1234; game.save.best = 500; game.save.deliveries = 8;
    game.save.shiftStats = { earnings: 200, jobs: 3, smashed: 4, kills: 1 };
    game.player.upgrades.engine = 2; game.player.damage.health = 62; game.boost = 37;
    const job = game.job, stats = { ...game.save.shiftStats }, position = { ...game.player.body.position };
    step(game, 0.04);
    const saved = morning(2);
    expect(saved.campaign.minute).toBe(dayMinute(2)); expect(saved.campaign.shift).toBe(2);
    expect(saved).toMatchObject({ cash: 1234, best: 500, deliveries: 8, shiftStats: stats });
    expect(saved.garage?.current).toMatchObject({ position, upgrades: { engine: 2 }, damage: { health: 62 } });
    expect(saved.garage!.boost).toBeGreaterThan(37);
    expect(saved.campaign.activeRide).toMatchObject({ missionId: job.missionId, type: job.type });
    expect(saved.campaign.activeRide!.elapsed).toBeGreaterThan(0);
    expect(game.job).toBe(job); expect(game.save.shiftStats).toEqual(stats); expect(game.mode).toBe('playing');
    expect(saved.playerRecords.texts.some(t => t.missionId === 'lena-vehicle')).toBe(true);
    const restored = game.loadMorning(2)!;
    expect(restored.job).toMatchObject({ missionId: job.missionId, stage: 'dropoff', elapsed: saved.campaign.activeRide!.elapsed });
    expect(restored.player.body.position).toEqual(position);
  });

  it('detects a crossing from a restored timestamp immediately before 07:00', () => {
    storage(); const save = defaultSave(); save.campaign.minute = dayMinute(2) - 1e-7;
    const game = play(new Game(undefined, true, true, save));
    game.update(1 / 120);
    expect(days()).toEqual([2]); expect(morning(2).campaign.minute).toBe(dayMinute(2));
  });

  it.each(['paused', 'garage'] as const)('captures sleep from %s after personal recovery, world changes, shift reset and the new job', mode => {
    storage(); const game = play(); game.advanceNarrativeTo(dayMinute(2, 20));
    game.player.body.position = { ...GARAGE }; game.player.body.velocity = vec(); game.dialogue.clear();
    game.save.shiftStats = { earnings: 345, jobs: 5, smashed: 6, kills: 2 }; game.save.cash = 1200;
    game.driverHealth = 34; game.player.damage.health = 62; game.persist();
    expect(new Game().driverHealth).toBe(34);
    const damage = structuredClone(game.player.damage);
    game.setMode(mode); const player = game.player, previousJob = game.job;
    expect(game.sleep()).toBe(true);
    const saved = morning(3);
    expect(saved.campaign.minute).toBe(dayMinute(3)); expect(saved.campaign.world.cafe).toBe('boarded');
    expect(saved.campaign.occurrences['cafe-boarded'].at).toBe(dayMinute(3));
    expect(saved.shiftStats).toEqual({ earnings: 0, jobs: 0, smashed: 0, kills: 0 });
    expect(saved.cash).toBe(1200); expect(saved.garage?.current.position).toEqual(GARAGE);
    expect(saved.campaign.activeRide).toBeNull(); expect(game.player).toBe(player); expect(game.job).not.toBe(previousJob);
    expect(saved.story.failed).toContain('celia-barriers');
    expect(saved.playerRecords).toEqual(game.save.playerRecords); expect(saved.story).toEqual(game.save.story);
    expect(game.driverHealth).toBe(100); expect(game.player.damage).toEqual(damage);
    expect(saved.garage?.driverHealth).toBe(100); expect(saved.garage?.current.damage).toEqual(damage);
    const continued = new Game(), loaded = game.loadMorning(3)!;
    for (const restored of [continued, loaded]) {
      expect(restored.driverHealth).toBe(100); expect(restored.player.damage).toEqual(damage);
    }
    expect(game.sleep()).toBe(false);
  });

  it('ignores midnight, repeated time calls and autosaves at the same morning', () => {
    const { values } = storage(); const game = play();
    game.advanceNarrativeTo(dayMinute(2, 0)); expect(days()).toEqual([]);
    game.advanceNarrativeTo(dayMinute(2)); const archived = values.get(key);
    game.save.cash += 100; game.advanceNarrativeTo(dayMinute(2)); game.persist(); step(game, 0.1);
    expect(values.get(key)).toBe(archived); expect(days()).toEqual([2]);
  });

  it('keeps later days on load and New game, and overwrites each revisited morning individually', () => {
    const { values } = storage(); const game = play(new Game().freshGame());
    game.advanceNarrativeTo(dayMinute(8)); expect(days()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const day4 = morning(4), day5 = morning(5), day8 = morning(8), archive = values.get(key);
    const replay = play(game.loadMorning(3)!); expect(values.get(key)).toBe(archive);
    replay.save.cash = 999; replay.advanceNarrativeTo(dayMinute(4));
    expect(morning(4).cash).toBe(999); expect(morning(5)).toEqual(day5); expect(morning(8)).toEqual(day8);
    replay.save.cash = 777; replay.advanceNarrativeTo(dayMinute(5));
    expect(morning(5).cash).toBe(777); expect(morning(4).cash).toBe(999); expect(morning(8)).toEqual(day8);
    expect(morning(4)).not.toEqual(day4);
    const fresh = replay.freshGame(); fresh.start();
    expect(morning(1).cash).toBe(80); expect(morning(4).cash).toBe(999); expect(morning(5).cash).toBe(777);
    expect(days()).toHaveLength(8);
  });

  it('updates Continue immediately on load and keeps current preferences and runtime bindings', () => {
    const { values } = storage(); const game = play(); game.advanceNarrativeTo(dayMinute(3));
    game.save.cash = 8000; game.advanceNarrativeTo(dayMinute(8)); game.persist();
    game.configure({ gore: true, difficulty: 'cruise', invincible: true });
    values.set(storageKeys.audio, '{"muted":true}');
    game.notify('Old session notification', '', { category: 'services', duration: null });
    const archive = values.get(key), loaded = game.loadMorning(3)!;
    expect(loaded.notifications.items).toEqual([]);
    expect(game.notifications.current?.message).toBe('Old session notification');
    expect(loaded).not.toBe(game); expect(loaded.world).not.toBe(game.world); expect(loaded.player).not.toBe(game.player);
    expect(loaded.settings).toMatchObject({ gore: true, difficulty: 'cruise', invincible: false });
    expect(values.get(storageKeys.audio)).toBe('{"muted":true}');
    expect(new Game().save).toEqual(loaded.save); expect(loaded.save.campaign.minute).toBe(dayMinute(3));
    loaded.save.story.flags.push('test-restored'); expect(loaded.missions.progress).toBe(loaded.save.story);
    expect(values.get(key)).toBe(archive);
  });

  it('detaches archived snapshots from gameplay, text reading, newspaper reading and returned lists', () => {
    const { values } = storage(); const game = play(new Game().freshGame()); const archive = values.get(key);
    const snapshot = game.saveSnapshot(); snapshot.cash = -1; snapshot.garage!.current.upgrades.engine = 3;
    game.readTextMessages(game.save.playerRecords.texts.map(t => t.messageId)); game.readEdition(1);
    game.player.upgrades.grip = 3; game.save.campaign.world.cafe = 'closed'; game.save.cash = 99; game.persist();
    const listed = game.morningCheckpoints[0].save; listed.playerRecords.texts[0].readAt = 100; listed.campaign.world.cafe = 'closed';
    expect(values.get(key)).toBe(archive); expect(morning(1).playerRecords.texts[0].readAt).toBeNull();
    expect(morning(1).campaign.editions[0].read).toBe(false); expect(game.player.upgrades.engine).toBe(0);
  });

  it('preserves an existing rolling save without manufacturing older checkpoints', () => {
    const { values } = storage(); const save = defaultSave(); save.cash = 654; save.campaign.minute = dayMinute(5, 13); save.campaign.shift = 5;
    values.set(storageKeys.save, JSON.stringify(save)); const game = play();
    expect(game.save.cash).toBe(654); expect(days()).toEqual([]); game.persist(); expect(days()).toEqual([]);
    game.advanceNarrativeTo(dayMinute(6)); expect(days()).toEqual([6]);
  });

  it('isolates invalid slots and rejects missing/incompatible/corrupt checkpoints without changing the session', () => {
    const { values } = storage(); const game = play(); game.advanceNarrativeTo(dayMinute(4));
    const collection = JSON.parse(values.get(key)!);
    collection.days['1'] = { cash: 99 }; collection.days['2'].story.version = 20;
    collection.days['3'].garage.current.model = 'unknown'; collection.days['15'] = collection.days['4'];
    values.set(key, JSON.stringify(collection)); const current = values.get(storageKeys.save);
    expect(days()).toEqual([4]); expect(game.loadMorning(1)).toBeNull(); expect(game.loadMorning(2)).toBeNull();
    expect(game.loadMorning(3)).toBeNull(); expect(game.loadMorning(15)).toBeNull(); expect(game.loadMorning(NaN)).toBeNull();
    expect(values.get(storageKeys.save)).toBe(current); expect(game.loadMorning(4)).not.toBeNull();
    for (const raw of ['{', '{"version":2}', '{"version":1,"campaignId":"other","days":{}}']) {
      values.set(key, raw); expect(days()).toEqual([]); expect(writeMorningCheckpoint(morningFixture())).toBe(false); expect(values.get(key)).toBe(raw);
    }
  });

  it('excludes incomplete garages without touching Continue or hiding valid mornings', () => {
    const { values, api } = storage(); const game = play(new Game().freshGame());
    game.advanceNarrativeTo(dayMinute(2)); game.save.cash = 1234; game.persist();
    const collection = JSON.parse(values.get(key)!);
    const current = values.get(storageKeys.save), running = structuredClone(game.save);
    const incomplete = structuredClone(collection); delete incomplete.days['1'].garage.driverHealth;
    values.set(key, JSON.stringify(incomplete)); api.setItem.mockClear();
    expect(days()).toEqual([2]); expect(game.loadMorning(1)).toBeNull();
    expect(values.get(storageKeys.save)).toBe(current); expect(game.save).toEqual(running);
    expect(api.setItem).not.toHaveBeenCalled();
    // The same rejection applies to other required driver and vehicle fields.
    for (const path of ['boost', 'onFoot', 'driver.x', 'current.damage.health', 'current.upgrades.engine', 'parked.0.damage.critical.fuel']) {
      const broken = structuredClone(collection), garage = broken.days['1'].garage;
      garage.parked = [structuredClone(garage.current)];
      const parts = path.split('.'), field = parts.pop()!;
      const owner = parts.reduce((value, part) => value[part], garage); delete owner[field];
      values.set(key, JSON.stringify(broken));
      expect(days(), path).toEqual([2]); expect(game.loadMorning(1), path).toBeNull();
      expect(values.get(storageKeys.save), path).toBe(current);
    }
    incomplete.days['1'].garage = structuredClone(collection.days['1'].garage);
    incomplete.days['1'].garage.parked = [{ ...incomplete.days['1'].garage.current, model: 'unknown' }];
    values.set(key, JSON.stringify(incomplete));
    expect(days()).toEqual([2]); expect(game.loadMorning(1)).toBeNull();
    expect(values.get(storageKeys.save)).toBe(current);
    expect(api.setItem).not.toHaveBeenCalled();
    expect(game.loadMorning(2)).not.toBeNull();
  });

  it('keeps legacy Continue garage normalization separate from checkpoint validation', () => {
    const { values } = storage(); const game = play(new Game().freshGame());
    const save = JSON.parse(values.get(storageKeys.save)!); delete save.garage.driverHealth;
    values.set(storageKeys.save, JSON.stringify(save));
    const loaded = new Game();
    expect(loaded.driverHealth).toBe(0); expect(loaded.save.cash).toBe(game.save.cash);
    expect(loaded.save.garage).not.toBeNull(); expect(days()).toEqual([1]);
  });

  it('leaves old data intact and reports failed capture or rolling-save writes', () => {
    const { values, api } = storage(); const game = play(new Game().freshGame()); const archived = values.get(key), rolling = values.get(storageKeys.save);
    api.setItem.mockImplementation(() => { throw Error('quota'); });
    game.advanceNarrativeTo(dayMinute(2)); expect(values.get(key)).toBe(archived); expect(days()).toEqual([1]);
    expect(game.toast).toMatch(/could not be saved/); expect(game.persist()).toBe(false);
    expect(game.loadMorning(1)).toBeNull(); expect(values.get(storageKeys.save)).toBe(rolling);
    api.getItem.mockImplementation(() => { throw Error('denied'); });
    expect(game.morningCheckpoints).toEqual([]); expect(game.loadMorning(1)).toBeNull();
    expect(writeMorningCheckpoint(morningFixture())).toBe(false); expect(values.get(key)).toBe(archived);
  });

  it.each([true, false])('keeps persistence-disabled campaign=%s games away from checkpoints', story => {
    const { api } = storage(); const game = play(new Game(undefined, false, story));
    game.freshGame().start(); game.advanceNarrativeTo(dayMinute(8)); game.persist();
    expect(game.morningCheckpoints).toEqual([]); expect(game.loadMorning(1)).toBeNull();
    expect(api.getItem).not.toHaveBeenCalled(); expect(api.setItem).not.toHaveBeenCalled();
  });

  it.each(['drive', 'sleep'])('excludes the finishing boundary and arcade play (%s)', method => {
    const { values } = storage(); const game = play(); const count = campaignDays(game.campaignContent.timing);
    game.advanceNarrativeTo(dayMinute(count, 20)); const last = morning(count);
    if (method === 'sleep') { game.player.body.position = { ...GARAGE }; game.dialogue.clear(); game.setMode('paused'); expect(game.sleep()).toBe(true); }
    else game.advanceNarrativeTo(game.campaignContent.timing.end);
    expect(days()).toEqual(Array.from({ length: count - 1 }, (_, i) => i + 2)); expect(morning(count)).toEqual(last);
    const archive = values.get(key); game.continueArcade(); game.advanceNarrativeTo(dayMinute(20)); step(game, 0.1); game.persist();
    expect(values.get(key)).toBe(archive); expect(game.loadMorning(count + 1)).toBeNull();
  });

  it('erases both kinds of progress while retaining settings/audio and other campaigns', () => {
    const { values } = storage(); play(new Game().freshGame());
    for (const k of [storageKeys.settings, storageKeys.audio, checkpointStorageKey('other')]) values.set(k, '{}');
    eraseSavedProgress(campaignDefinition.id);
    expect(values.has(storageKeys.save)).toBe(false); expect(values.has(key)).toBe(false);
    expect([...values.keys()]).toEqual([storageKeys.settings, storageKeys.audio, checkpointStorageKey('other')]);
  });
});
function morningFixture() { return new Game(undefined, false).saveSnapshot(); }

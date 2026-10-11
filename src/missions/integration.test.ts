import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game, defaultSave } from '../game';
import { defaultCompiledMap } from '../map/compile';
import { dist, vec } from '../physics';
import { storageKeys } from '../storage';
import type { MissionCatalogue } from './schema';
import { compileMissions } from './compile';
import { MissionDirector, type DirectorContext } from './director';

const make = () => {
  const g = new Game(defaultCompiledMap, false);
  g.vehicles = [g.player]; g.trafficTarget = 0; g.settings.noPolice = true; g.start();
  return g;
};
const run = (g: Game, seconds: number, keys: string[] = []) => {
  g.keys = new Set(keys);
  for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120);
  g.keys.clear();
};
const collect = (g: Game) => { g.player.body.position = { ...g.job.pickup }; g.player.body.velocity = vec(); run(g, 0.9); };
const drop = (g: Game) => { g.player.body.position = { ...g.job.dropoff }; g.player.body.velocity = vec(); run(g, 0.9); };
const ctx = (over: Partial<DirectorContext> = {}): DirectorContext => ({ deliveries: 0, jobType: 'fare', model: 'car', kind: 'taxi', time: 0, ...over });

afterEach(() => vi.unstubAllGlobals());

describe('game mission integration', () => {
  it('opens a fresh save with the authored Mia mission and unchanged fare economics', () => {
    const g = make();
    expect(g.job.missionId).toBe('mia-meridian-lead');
    expect(g.job.name).toBe('Mia');
    expect(g.job.pickup).toEqual(vec(4, 14));
    expect(g.job.dropoff).toEqual(vec(44, 14));
    expect(g.job.fare).toBe(Math.round(55 + dist(g.job.pickup, g.job.dropoff) * 0.7));
    expect(g.dialogue.active).toBeNull();
  });

  it('marks the mission complete and pays exactly once on delivery', () => {
    const g = make(); collect(g); drop(g);
    expect(g.jobsDone).toBe(1);
    expect(g.save.story.completed).toEqual(['mia-meridian-lead']);
    const cash = g.save.cash;
    drop(g); run(g, 0.9);
    expect(g.save.cash).toBe(cash);
    expect(g.save.story.completed).toEqual(['mia-meridian-lead']);
  });

  it('keeps the story active but never completes it when the run is abandoned', () => {
    for (const abandon of [
      (g: Game) => { g.setMode('wasted'); g.recover(); },
      (g: Game) => { g.setMode('arrested'); g.recover(); },
      (g: Game) => g.resetRun(),
      (g: Game) => { g.interact(); },
    ]) {
      const g = make(); collect(g); abandon(g);
      expect(g.dialogue.active).toBeNull();
      expect(g.save.story.completed).toEqual([]);
      expect(g.save.story.failed).toEqual([]);
    }
    // Losing the waiting customer before the pickup abandons the mission too.
    const g = make();
    const person = g.world.people.find(p => p.id === g.job.customerId)!;
    g.death(person, vec(), 0, false);
    expect(g.missions.activeId).toBe('mia-meridian-lead');
    expect(g.missions.log.some(e => e.type === 'abandoned' && e.reason === 'customer-lost')).toBe(true);
    expect(g.save.story.completed).toEqual([]);
    expect(g.dialogue.active).toBeNull();
  });

  it('abandons a mission whose explicit vehicle policy rejects a vehicle change', () => {
    const stops = {
      schemaVersion: 1,
      stops: [
        { id: 'a', name: 'A', kind: 'city', position: { x: 4, y: 14 } },
        { id: 'b', name: 'B', kind: 'city', position: { x: 44, y: 14 } },
      ],
    };
    const catalogue = {
      schemaVersion: 1,
      dialogue: { line: { character: 'mia', category: 'plot', channel: 'passenger', text: 'Fare only.' } },
      missions: {
        'fare-only': {
          title: 'Fare only', chapter: 1, category: 'plot', repeat: 'once', abandon: { retry: 'always' },
          requires: { all: [] }, allowed: { jobs: ['fare'] }, stops: { pickup: 'a', dropoff: 'b' }, beats: { pickup: 'line' },
        },
      },
    } as unknown as MissionCatalogue;
    const g = make();
    g.missions = new MissionDirector(compileMissions(g.map, catalogue, stops), g.save.story);
    g.newJob(true);
    expect(g.job.missionId).toBe('fare-only');
    g.player = g.spawnVehicle({ kind: 'taxi', model: 'motorcycle', position: { ...g.player.body.position } });
    g.setJobType();
    expect(g.job.missionId).toBeUndefined();
    expect(g.missions.activeId).toBeNull();
    expect(g.save.story.completed).toEqual([]);
    expect(g.job.type).toBe('parcel');
  });

  it('enforces model restrictions even when both vehicles support fares, before boarding', () => {
    const g = make();
    const base = g.missions.catalogue;
    const mission = base.missions['mia-meridian-lead'];
    g.releaseMission();
    g.missions = new MissionDirector({ ...base, missions: { ...base.missions, [mission.id]: { ...mission, allowed: { jobs: ['fare'], models: ['car'] } } } }, g.save.story);
    g.newJob();
    const waiting = g.world.people.find(p => p.id === g.job.customerId)!;
    g.player = g.spawnVehicle({ kind: 'taxi', model: 'pickup', position: { ...g.job.pickup } });
    // Exercise the defensive pickup gate even if a caller forgot setJobType.
    run(g, 0.9);
    expect(waiting.aboard).not.toBe(true);
    expect(g.job.stage).toBe('pickup');
    expect(g.job.missionId).toBeUndefined();
    expect(g.save.story.completed).toEqual([]);
    expect(g.missions.log.some(e => e.type === 'abandoned' && e.reason === 'vehicle-change')).toBe(true);
    // Returning to a compatible model re-offers from config on the next dispatch.
    g.player = g.spawnVehicle({ kind: 'taxi', model: 'car', position: vec(4, 32) });
    g.newJob();
    expect(g.job.missionId).toBe(mission.id);
    g.player = g.spawnVehicle({ kind: 'taxi', model: 'pickup', position: vec(4, 32) });
    g.setJobType();
    expect(g.job.missionId).toBeUndefined();
  });

  it('keeps hospital dispatch local while leaving the authored retry available', () => {
    const g = make(); collect(g);
    g.setMode('wasted'); g.recover();
    expect(g.job.missionId).toBeUndefined();
    expect(g.job.pickup).toEqual(vec(164, 108));
    expect(g.missions.available(ctx({ kind: 'traffic' }))).toContain('mia-meridian-lead');
    expect(g.missions.log.some(e => e.type === 'abandoned' && e.reason === 'hospital')).toBe(true);
  });

  it('uses a neutral director for draft previews without disabling normal isolated stories', () => {
    const neutral = new Game(defaultCompiledMap, false, false);
    expect(neutral.missions.catalogue.order).toEqual([]);
    expect(neutral.job.missionId).toBeUndefined();
    expect(make().job.missionId).toBe('mia-meridian-lead');
  });

  it('preserves persistent story across recovery and new shifts, restoring it only on explicit reset', () => {
    const g = make(); collect(g); drop(g);
    expect(g.save.story.completed).toContain('mia-meridian-lead');
    g.resetRun();
    expect(g.save.story.completed).toContain('mia-meridian-lead');
    expect(g.job.missionId).toBeUndefined();
    g.resetStory();
    expect(g.save.story.completed).toEqual([]);
    expect(g.job.missionId).toBe('mia-meridian-lead');
  });

  it('uses fresh progress with persistence disabled and never reads the save', () => {
    const stored = defaultSave();
    stored.story.completed.push('mia-meridian-lead');
    const storage = { getItem: vi.fn(() => JSON.stringify(stored)), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    const preview = new Game(defaultCompiledMap, false);
    expect(preview.save.story.completed).toEqual([]);
    expect(storage.getItem).not.toHaveBeenCalled();
    const loaded = new Game(defaultCompiledMap, true);
    expect(loaded.save.story.completed).toContain('mia-meridian-lead');
  });

  it('loads legacy saves without story data and snapshots stay detached', () => {
    const legacy = defaultSave() as Record<string, unknown>;
    delete legacy.story;
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === storageKeys.save ? JSON.stringify(legacy) : null, setItem: vi.fn(), removeItem: vi.fn() });
    const g = new Game(defaultCompiledMap, true);
    expect(g.save.story.completed).toEqual([]);
    const snapshot = g.snapshot();
    snapshot.story!.progress.completed.push('tampered');
    snapshot.job.missionId = 'tampered';
    expect(g.save.story.completed).toEqual([]);
    expect(g.job.missionId).toBe('mia-meridian-lead');
    expect(g.missions.snapshot().progress.completed).toEqual([]);
  });

  it('lifecycle effects never change the simulation RNG stream', () => {
    const a = make(), b = make();
    a.missions.applyEffects([{ setFlag: 'met-mia' }, { setChapter: 3 }]);
    collect(a); collect(b);
    a.missions.complete(ctx());
    expect(a.save.story.completed).toContain('mia-meridian-lead');
    run(a, 3, ['KeyW']); run(b, 3, ['KeyW']);
    expect(a.world.random()).toBe(b.world.random());
    expect(a.player.body.position).toEqual(b.player.body.position);
  });
});

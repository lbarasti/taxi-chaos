import { describe, expect, it } from 'vitest';
import { defaultCompiledMap } from '../map/compile';
import type { MissionCatalogue } from './schema';
import { compileMissions } from './compile';
import { MissionDirector, type DirectorContext } from './director';
import { defaultMissionProgress, migrateMissionProgress } from './progress';

const STOPS = {
  schemaVersion: 1,
  stops: [
    { id: 'a', name: 'A', kind: 'city', position: { x: 4, y: 14 } },
    { id: 'b', name: 'B', kind: 'city', position: { x: 44, y: 14 } },
    { id: 'c', name: 'C', kind: 'city', position: { x: 84, y: 58 } },
    { id: 'd', name: 'D', kind: 'city', position: { x: 116, y: 84 } },
  ],
};

const mission = (over: Record<string, unknown> = {}) => ({
  title: 'Mission', chapter: 1, category: 'plot', repeat: 'once', abandon: { retry: 'always' },
  requires: { all: [] }, allowed: { jobs: ['fare'] }, stops: { pickup: 'a', dropoff: 'b' }, beats: { pickup: 'line' }, ...over,
});

const CATALOGUE = {
  schemaVersion: 1,
  dialogue: {
    line: { character: 'mia', category: 'plot', channel: 'passenger', text: 'Hello.' },
    note: { character: 'mia', category: 'plot', channel: 'sender', text: 'A note.' },
  },
  missions: {
    intro: mission({ effects: [{ setChapter: 2 }] }),
    after: mission({ chapter: 2, requires: { all: [{ missionCompleted: 'intro' }, { chapter: 2 }] }, stops: { pickup: 'b', dropoff: 'c' } }),
    veteran: mission({ requires: { minDeliveries: 3 }, stops: { pickup: 'c', dropoff: 'd' } }),
    loop: mission({ repeat: 'repeatable', stops: { pickup: 'c', dropoff: 'd' } }),
    branch: mission({
      effects: [{ setFlag: 'met-mia' }],
      allowed: { jobs: ['fare', 'parcel'] },
      beats: { pickup: 'line', pickupSender: 'note' },
      choices: [
        { id: 'route', commit: 'pickup', options: [{ id: 'fast', default: true, effects: [{ setFlag: 'sped' }] }, { id: 'safe', effects: [{ setFlag: 'careful' }] }] },
        { id: 'farewell', commit: 'completion', options: [{ id: 'tip', default: true, effects: [{ relationship: { character: 'mia', delta: 2 } }] }] },
      ],
    }),
    deadend: mission({ abandon: { retry: 'never' } }),
    deadloop: mission({ repeat: 'repeatable', abandon: { retry: 'never' }, stops: { pickup: 'a', dropoff: 'c' } }),
    cooldown: mission({ abandon: { retry: 'cooldown', cooldownSeconds: 10 }, stops: { pickup: 'a', dropoff: 'c' } }),
  },
} as unknown as MissionCatalogue;

const compiled = () => compileMissions(defaultCompiledMap, CATALOGUE, STOPS);
const ctx = (over: Partial<DirectorContext> = {}): DirectorContext => ({ deliveries: 0, jobType: 'fare', model: 'car', kind: 'taxi', time: 0, ...over });

// Conflicts that only surface at runtime (a player-committed non-default option
// facing a mission effect) are not statically rejectable by the compiler.
const RUNTIME_CATALOGUE = {
  schemaVersion: 1,
  dialogue: { line: { character: 'mia', category: 'plot', channel: 'passenger', text: 'Hello.' } },
  missions: {
    conflict: mission({
      choices: [{ id: 'mode', commit: 'pickup', options: [{ id: 'safe', effects: [{ setFlag: 'chose-safe' }] }, { id: 'fast' }] }],
      effects: [{ setFlag: 'settled' }, { setChoice: { group: 'mode', choice: 'fast' } }],
    }),
    'self-overwrite': mission({
      stops: { pickup: 'b', dropoff: 'c' },
      choices: [{ id: 'tone', commit: 'pickup', options: [{ id: 'kind', effects: [{ setChoice: { group: 'tone', choice: 'harsh' } }] }, { id: 'harsh' }] }],
    }),
  },
} as unknown as MissionCatalogue;
const runtimeCompiled = () => compileMissions(defaultCompiledMap, RUNTIME_CATALOGUE, STOPS);

describe('mission director', () => {
  it('offers missions in chapter then authored order and respects prerequisites', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    expect(d.nextOffer(ctx())).toBe('intro');
    expect(d.available(ctx())).toEqual(['intro', 'loop', 'branch', 'deadend', 'deadloop', 'cooldown']);
    expect(d.status('after', ctx())).toBe('locked');
    d.begin('intro', ctx()); d.pickup(ctx()); d.complete(ctx());
    expect(d.progress.completed).toContain('intro');
    expect(d.progress.chapter).toBe(2);
    expect(d.available(ctx())).toContain('after');
    expect(d.nextOffer(ctx({ deliveries: 3 }))).toBe('veteran');
  });

  it('gates on minDeliveries and chapter conditions', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    expect(d.available(ctx({ deliveries: 2 }))).not.toContain('veteran');
    expect(d.available(ctx({ deliveries: 3 }))).toContain('veteran');
    expect(d.evaluate({ chapter: 3 }, ctx())).toBe(false);
    d.applyEffects([{ setChapter: 3 }]);
    expect(d.evaluate({ chapter: 3 }, ctx())).toBe(true);
  });

  it('commits mutually exclusive choices idempotently and rejects switching', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    d.begin('branch', ctx());
    expect(d.commitChoice('route', 'safe', ctx())).toBe(true);
    expect(d.progress.flags).not.toContain('careful');
    expect(d.progress.choices.route).toBeUndefined();
    d.pickup(ctx());
    expect(d.progress.flags).toContain('careful');
    expect(d.commitChoice('route', 'safe', ctx())).toBe(false);
    expect(() => d.commitChoice('route', 'fast', ctx())).toThrow(/already committed/);
    expect(d.evaluate({ choiceEquals: { group: 'route', choice: 'safe' } }, ctx())).toBe(true);
    expect(d.evaluate({ choiceUnset: 'route' }, ctx())).toBe(false);
    expect(() => d.commitChoice('route', 'unknown', ctx())).toThrow(/not an option/);
  });

  it('commits pickup choices on pickup and completion choices on delivery', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    d.begin('branch', ctx());
    expect(d.progress.choices.route).toBeUndefined();
    const outcome = d.pickup(ctx());
    expect(outcome.beatId).toBe('line');
    expect(d.progress.choices.route).toBe('fast');
    expect(d.progress.flags).toContain('sped');
    expect(d.progress.choices.farewell).toBeUndefined();
    d.complete(ctx());
    expect(d.progress.choices.farewell).toBe('tip');
    expect(d.relationship('mia')).toBe(2);
    expect(d.progress.flags).toContain('met-mia');
  });

  it('resolves the sender beat for parcel pickups', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    d.begin('branch', ctx());
    const outcome = d.pickup(ctx({ jobType: 'parcel' }));
    expect(outcome).toMatchObject({ missionId: 'branch', beatId: 'note' });
    expect(outcome.message?.channel).toBe('sender');
  });

  it('leaves the mission active when the vehicle policy rejects the pickup ride', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    d.begin('intro', ctx());
    // The director refuses to resolve the pickup but keeps the lifecycle state
    // intact, so the caller can abandon it with the reason it actually knows.
    expect(d.pickup(ctx({ jobType: 'parcel' }))).toEqual({ missionId: null, beatId: null, message: null });
    expect(d.activeId).toBe('intro');
    expect(d.progress.completed).not.toContain('intro');
    d.abandon('vehicle-change', 0);
    expect(d.activeId).toBeNull();
  });

  it('runs lifecycle transitions once and never double-applies effects', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    d.begin('intro', ctx());
    expect(d.pickup(ctx()).missionId).toBe('intro');
    expect(d.pickup(ctx())).toEqual({ missionId: null, beatId: null, message: null });
    expect(d.complete(ctx())).toBe('intro');
    expect(d.complete(ctx())).toBeNull();
    expect(d.log.filter(e => e.type === 'pickup')).toHaveLength(1);
    expect(d.log.filter(e => e.type === 'completed')).toHaveLength(1);
    expect(d.progress.completed.filter(id => id === 'intro')).toHaveLength(1);
  });

  it('applies the abandonment retry policy explicitly', () => {
    const retry = new MissionDirector(compiled(), defaultMissionProgress());
    retry.begin('intro', ctx()); retry.abandon('left-vehicle', 0);
    expect(retry.available(ctx())).toContain('intro');

    const never = new MissionDirector(compiled(), defaultMissionProgress());
    never.begin('deadend', ctx()); never.abandon('customer-lost', 0);
    expect(never.available(ctx())).not.toContain('deadend');
    expect(never.progress.failed).toContain('deadend');

    const cool = new MissionDirector(compiled(), defaultMissionProgress());
    cool.begin('cooldown', ctx()); cool.abandon('reset', 1);
    expect(cool.available(ctx({ time: 5 }))).not.toContain('cooldown');
    expect(cool.available(ctx({ time: 20 }))).toContain('cooldown');
  });

  it('honours once vs repeatable completion', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    d.begin('intro', ctx()); d.pickup(ctx()); d.complete(ctx());
    expect(d.available(ctx())).not.toContain('intro');
    expect(d.status('intro', ctx())).toBe('completed');
    d.begin('loop', ctx()); d.pickup(ctx()); d.complete(ctx());
    expect(d.progress.completed).toContain('loop');
    expect(d.available(ctx())).toContain('loop');
    expect(d.status('loop', ctx())).toBe('available');
  });

  it('evaluates all/any/not, flags and choices without side effects', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    expect(d.evaluate({ all: [{ flag: 'x' }, { not: { flag: 'y' } }] }, ctx())).toBe(false);
    d.applyEffects([{ setFlag: 'x' }]);
    expect(d.evaluate({ all: [{ flag: 'x' }, { not: { flag: 'y' } }] }, ctx())).toBe(true);
    expect(d.evaluate({ any: [{ flag: 'nope' }, { flag: 'x' }] }, ctx())).toBe(true);
    d.applyEffects([{ setFlag: 'y' }]);
    expect(d.evaluate({ not: { flag: 'y' } }, ctx())).toBe(false);
    d.applyEffects([{ clearFlag: 'y' }]);
    expect(d.evaluate({ flag: 'y' }, ctx())).toBe(false);
  });

  it('applies effect batches atomically on conflicting choices', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    d.applyEffects([{ setChoice: { group: 'route', choice: 'fast' } }]);
    expect(() => d.applyEffects([{ setFlag: 'should-not-stick' }, { setChoice: { group: 'route', choice: 'safe' } }])).toThrow(/Conflicting setChoice/);
    expect(d.progress.flags).not.toContain('should-not-stick');
    expect(d.progress.choices.route).toBe('fast');
  });

  it('refuses to complete a mission before its pickup is resolved', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    d.begin('intro', ctx());
    expect(d.complete(ctx())).toBeNull();
    expect(d.activeId).toBe('intro');
    expect(d.progress.completed).not.toContain('intro');
    expect(d.progress.chapter).toBe(1);
    expect(d.pickup(ctx()).missionId).toBe('intro');
    expect(d.complete(ctx())).toBe('intro');
    expect(d.progress.chapter).toBe(2);
  });

  it('never lets begin overwrite a different active mission', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    expect(d.begin('intro', ctx())).toBe(true);
    expect(d.begin('loop', ctx())).toBe(false);
    expect(d.activeId).toBe('intro');
    expect(d.begin('intro', ctx())).toBe(true);
  });

  it('locks out a repeatable mission abandoned with a never retry policy', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    expect(d.begin('deadloop', ctx())).toBe(true);
    d.abandon('customer-lost', 0);
    expect(d.progress.failed).toContain('deadloop');
    expect(d.available(ctx())).not.toContain('deadloop');
    expect(d.begin('deadloop', ctx())).toBe(false);
  });

  it('leaves no partial progress when a lifecycle transaction fails', () => {
    const d = new MissionDirector(runtimeCompiled(), defaultMissionProgress());
    expect(d.begin('conflict', ctx())).toBe(true);
    expect(d.commitChoice('mode', 'safe', ctx())).toBe(true);
    expect(d.pickup(ctx()).missionId).toBe('conflict');
    expect(() => d.complete(ctx())).toThrow(/Conflicting setChoice/);
    expect(d.progress.flags).not.toContain('settled');
    expect(d.progress.completed).not.toContain('conflict');
    expect(d.progress.choices.mode).toBe('safe');
    expect(d.activeId).toBe('conflict');
    expect(d.snapshot().pickedUp).toBe(true);
    expect(d.log.some(e => e.type === 'completed')).toBe(false);
  });

  it('never lets an option effect overwrite its own group choice', () => {
    const d = new MissionDirector(runtimeCompiled(), defaultMissionProgress());
    d.begin('self-overwrite', ctx());
    expect(d.commitChoice('tone', 'kind', ctx())).toBe(true);
    expect(() => d.pickup(ctx())).toThrow(/Conflicting setChoice/);
    expect(d.progress.choices.tone).toBeUndefined();
    expect(d.log.some(e => e.type === 'choice' && e.group === 'tone')).toBe(false);
  });

  it('returns detached snapshots and resets story progress in place', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    d.begin('intro', ctx()); d.pickup(ctx()); d.complete(ctx());
    d.applyEffects([{ setFlag: 'kept' }]);
    const snapshot = d.snapshot();
    expect(snapshot.progress.completed).toContain('intro');
    snapshot.progress.flags.push('tampered');
    snapshot.progress.completed.push('tampered');
    expect(d.progress.flags).not.toContain('tampered');
    expect(d.progress.completed).not.toContain('tampered');
    const reference = d.progress;
    d.reset();
    expect(d.progress).toBe(reference);
    expect(d.progress.completed).toEqual([]);
    expect(d.progress.flags).toEqual([]);
    expect(d.activeId).toBeNull();
    expect(d.log).toEqual([]);
  });

  it('rejects future choices and premature completion selections without effects', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    const before = d.snapshot();
    expect(d.commitChoice('route', 'safe', ctx())).toBe(false);
    expect(d.snapshot()).toEqual(before);
    d.begin('intro', ctx());
    expect(d.commitChoice('route', 'safe', ctx())).toBe(false);
    d.abandon('replaced', 0); d.begin('branch', ctx());
    expect(d.commitChoice('farewell', 'tip', ctx())).toBe(false);
    d.pickup(ctx());
    expect(d.commitChoice('farewell', 'tip', ctx())).toBe(true);
    expect(d.relationship('mia')).toBe(0);
    d.complete(ctx());
    expect(d.relationship('mia')).toBe(2);
  });

  it('discards uncommitted selections on abandonment', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    d.begin('branch', ctx()); d.commitChoice('route', 'safe', ctx());
    d.abandon('left-vehicle', 1); d.begin('branch', ctx()); d.pickup(ctx());
    expect(d.progress.choices.route).toBe('fast');
    expect(d.progress.flags).not.toContain('careful');
  });

  it('keeps cooldown deadlines across save/load until exact campaign expiry', () => {
    const d = new MissionDirector(compiled(), defaultMissionProgress());
    d.progress.campaignSeconds = 100;
    d.begin('cooldown', ctx({ time: 100 })); d.abandon('shift', 100);
    const loaded = new MissionDirector(compiled(), migrateMissionProgress(JSON.parse(JSON.stringify(d.progress))));
    expect(loaded.progress.retryAt.cooldown).toBe(110);
    expect(loaded.available(ctx({ time: 109.99 }))).not.toContain('cooldown');
    expect(loaded.available(ctx({ time: 110 }))).toContain('cooldown');
    loaded.reset();
    expect(loaded.progress.retryAt).toEqual({});
  });

  it('ranks reversed catalogue order and reports ungated higher chapters without changing eligibility', () => {
    const catalogue = { ...structuredClone(CATALOGUE), missions: { later: mission({ chapter: 3 }), earlier: mission() } as MissionCatalogue['missions'] };
    const c = compileMissions(defaultCompiledMap, catalogue, STOPS);
    const d = new MissionDirector(c, defaultMissionProgress());
    expect(d.available(ctx())).toEqual(['earlier', 'later']);
    expect(d.nextOffer(ctx())).toBe('earlier');
    expect(c.warnings).toEqual([{ missionId: 'later', message: expect.stringContaining('only ranks offers') }]);
  });
});

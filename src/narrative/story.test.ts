import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { defaultCompiledMap } from '../map/compile';
import { vec } from '../physics';
import { STORY_LETTERS_PER_SECOND } from './story';
import { messageCharacter } from './characters';
import { resolvePortrait } from './portraits';

const make = () => {
  const g = new Game(defaultCompiledMap, false, 'legacy');
  g.vehicles = [g.player]; g.trafficTarget = 0; g.settings.noPolice = true; g.start();
  return g;
};
const run = (g: Game, seconds: number, keys: string[] = []) => {
  g.keys = new Set(keys);
  for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120);
  g.keys.clear();
};
const collect = (g: Game) => { g.player.body.position = { ...g.job.pickup }; g.player.body.velocity = vec(); run(g, 0.9); };

describe('authored pickup conversations', () => {
  it('starts only after a completed slow pickup and does not retrigger in the ring', () => {
    const g = make();
    expect(g.dialogue.active).toBeNull();
    g.player.body.position = { ...g.job.pickup }; g.player.body.velocity = vec(0, -12);
    run(g, 0.3); expect(g.dialogue.active).toBeNull();
    collect(g);
    expect(g.job.stage).toBe('dropoff');
    expect(g.job.missionId).toBe('mia-meridian-lead');
    expect(g.dialogue.active?.message).toMatchObject({ speaker: 'mia', channel: 'passenger', category: 'plot' });
    expect(g.dialogue.active?.message.text).toContain('Meridian vans');
    // The view resolves the display name and raster portrait from the character catalogue.
    const speaker = messageCharacter(g.dialogue.active!.message);
    expect(speaker.name).toBe('Mia');
    // `mia` keeps its stable id and display name, but resolves its own neutral legacy
    // placeholder rather than borrowing another cast member's supplied portrait.
    expect(resolvePortrait(speaker)).toMatchObject({ source: 'legacy-mia.png', format: 'png' });
    const active = g.dialogue.active;
    run(g, 1); expect(g.dialogue.active).toBe(active); expect(g.dialogue.letters).toBeGreaterThan(STORY_LETTERS_PER_SECOND);
  });

  it('uses the sender version when the first pickup becomes a parcel delivery', () => {
    const g = make();
    g.player = g.spawnVehicle({ kind: 'taxi', model: 'motorcycle', position: vec(4, 32) });
    g.setJobType(); collect(g);
    expect(g.job.type).toBe('parcel');
    expect(g.dialogue.active?.message.channel).toBe('sender');
    expect(g.dialogue.active?.message.text).toContain('Thanks for taking my parcel.');
  });

  it('freezes presentation in pause/garage/game-over and supports read-all, minimize and replay', () => {
    const g = make(); collect(g);
    for (const mode of ['paused', 'garage', 'wasted', 'arrested'] as const) {
      const before = g.dialogue.snapshot(); g.setMode(mode); run(g, 0.5);
      expect(g.dialogue.snapshot()).toEqual(before);
    }
    g.setMode('playing');
    g.dialogue.readAll(); expect(g.dialogue.complete).toBe(true);
    g.dialogue.replay(); expect(g.dialogue.letters).toBe(0);
    run(g, 0.5); expect(g.dialogue.letters).toBe(16);
    g.dialogue.collapse(); run(g, 0.5); expect(g.dialogue.letters).toBe(16);
    g.dialogue.replay(); expect(g.dialogue.active?.expanded).toBe(true);
    const snapshot = g.snapshot(); snapshot.dialogue!.elapsed = 99;
    expect(g.dialogue.active?.elapsed).toBe(0);
  });

  it('clears on completion, abandonment and explicit story reset; recurring ordinary fares are not story missions', () => {
    const g = make(); collect(g);
    g.player.body.position = { ...g.job.dropoff }; run(g, 0.9);
    expect(g.jobsDone).toBe(1); expect(g.dialogue.active).toBeNull();
    // Ordinary fares draw their name from the ambient passenger pool, which no longer
    // carries the story cast, so they stay plain jobs with no mission id.
    g.offer = 7; g.newJob(); expect(g.job.name).toBe('Cleo'); expect(g.job.missionId).toBeUndefined(); collect(g);
    expect(g.dialogue.active).toBeNull();
    // A new shift preserves persistent story; the opening mission does not replay.
    g.resetRun(); expect(g.dialogue.active).toBeNull(); collect(g);
    expect(g.dialogue.active).toBeNull();
    // Only the explicit new-story reset restores it.
    g.resetStory(); collect(g);
    expect(g.dialogue.active).not.toBeNull();
    expect(g.interact()).toBe(true); expect(g.dialogue.active).toBeNull();
    expect(g.jobsDone).toBe(0);
  });

  it('keeps driving, RNG and fare economics identical with or without a story beat', () => {
    const a = make(), b = make();
    // Same fare, but no active story mission so no dialogue is queued.
    b.missions.activeId = null; b.job.missionId = undefined;
    collect(a); collect(b); a.dialogue.readAll(); a.dialogue.replay(); a.dialogue.collapse();
    run(a, 2, ['KeyW']); run(b, 2, ['KeyW']);
    const { dialogue: _a, story: _sa, job: jobA, ...stateA } = a.snapshot();
    const { dialogue: _b, story: _sb, job: jobB, ...stateB } = b.snapshot();
    const { missionId: _m, ...ordinaryJobA } = jobA;
    expect(stateA).toEqual(stateB); expect(ordinaryJobA).toEqual(jobB);
    expect(a.world.random()).toBe(b.world.random());
  });
});

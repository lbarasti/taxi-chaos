import { describe, expect, it } from 'vitest';
import { dayMinute } from '../campaign/clock';
import { applyEffectsTo } from '../campaign/effects';
import type { CampaignContext, CampaignDefinition } from '../campaign/model';
import { advanceCampaignTo } from '../campaign/scheduler';
import { defaultCampaign } from '../campaign/state';
import { assertCampaignDefinition } from '../campaign/validate';
import { defaultCompiledMap } from '../map/compile';
import { compileMissions } from '../missions/compile';
import { campaignCondition } from '../missions/conditions';
import { MissionDirector, type DirectorContext } from '../missions/director';
import { defaultMissionProgress } from '../missions/progress';
import { defaultPlayerRecords } from '../narrative/player-records';
import {
  LINEN_CLOSE, LINEN_COUNT, LINEN_OPEN, linenArrivalVariants, linenCatalogue, linenHandlers,
  linenInitialWorld, linenJobWindows, linenOperations, linenRides, linenScenes, linenSites, linenStopovers,
} from './linen';

/** Run this local story independently, with no Open Shore identities, evidence or operations. */
const definition: CampaignDefinition = {
  id: 'linen-fixture', title: 'Borrowed linen', finishedLabel: 'Finished', completionText: 'Finished',
  timing: { start: dayMinute(1), end: dayMinute(9), lastEdition: dayMinute(8, 6), editionHour: 6 },
  initialWorld: linenInitialWorld, operations: linenOperations, materials: {}, claims: {},
  missions: linenCatalogue, jobWindows: linenJobWindows, jobNames: {}, handlers: linenHandlers,
  newsroom: { stop: 'old-town-south', name: 'Unused', editor: 'Unused', guide: 'Unused' },
  sites: linenSites, observations: [], vehicles: [], scenes: linenScenes, bulletins: [],
  rides: linenRides, everydayJobs: [], ordinaryResponses: [], dispatcher: 'bea',
};

function setup() {
  const progress = defaultMissionProgress(), records = defaultPlayerRecords(), state = defaultCampaign(definition);
  const ctx: CampaignContext = { state, progress, records, definition };
  const director = new MissionDirector(compileMissions(defaultCompiledMap, linenCatalogue), progress, () => ctx);
  const driving = (): DirectorContext => ({ deliveries: progress.deliveries, jobType: 'fare', model: 'car', kind: 'taxi', time: progress.campaignSeconds, minute: state.minute, shift: state.shift });
  const advance = (minute: number) => advanceCampaignTo(state, minute, ctx, definition);
  const begin = (id: string) => {
    expect(director.begin(id, driving())).toBe(true);
    expect(director.pickup(driving()).missionId).toBe(id);
  };
  const deliver = (id: string, comfort = 100) => {
    expect(director.complete(driving(), {
      type: 'ride-completed', missionId: id, name: linenCatalogue.missions[id].passenger!, comfort,
      receipt: { id: `fare-${id}`, kind: 'receipt', title: 'Paid fare', text: 'Transport completed.' },
    })).toBe(id);
  };
  const finish = (id: string, comfort = 100) => { begin(id); deliver(id, comfort); };
  return { ctx, state, progress, records, director, driving, advance, begin, deliver, finish };
}

describe('borrowed-linen local story', () => {
  it('compiles independently and keeps authored effects inside local facts', () => {
    expect(() => assertCampaignDefinition(definition)).not.toThrow();
    const effects = [
      ...Object.values(linenCatalogue.missions).flatMap(m => [...(m.effects ?? []), ...(m.contactLost?.effects ?? [])]),
      ...linenHandlers.flatMap(h => h.effects),
      ...linenOperations.flatMap(o => [...o.effects, ...(o.outcomes ?? []).flatMap(v => v.effects)]),
      ...Object.values(linenStopovers).flatMap(s => s.effects),
    ];
    expect(effects.length).toBeGreaterThan(0);
    for (const effect of effects) {
      if ('setWorld' in effect) expect(effect.setWorld.key).toMatch(/^linen-/);
      else if ('setFlag' in effect) expect(effect.setFlag).toMatch(/^linen-/);
      else throw new Error(`Local story leaked an unrelated effect: ${JSON.stringify(effect)}`);
    }
    for (const [id, mission] of Object.entries(linenCatalogue.missions)) {
      expect(mission.category).toBe('side-quest');
      for (const [otherId, other] of Object.entries(linenCatalogue.missions)) {
        if (otherId === id || other.passenger !== mission.passenger) continue;
        const a = linenJobWindows[id], b = linenJobWindows[otherId];
        expect(a.until <= b.from || b.until <= a.from).toBe(true);
      }
    }
  });

  it('lets an ignored reunion happen without revealing people or creating a failed investigation', () => {
    const f = setup();
    f.advance(LINEN_COUNT);
    expect(f.state.world).toMatchObject({ 'linen-event': 'finished', 'linen-tables': 'mismatched', 'linen-stock': 'no-loan' });
    expect(f.progress.flags).toEqual([]);
    expect(f.records.notebook).toEqual([]);
    expect(f.state.newsroom).toEqual({ received: {}, cases: {} });
    expect(f.director.status('linen-sam-aftermath', f.driving())).toBe('locked');
  });

  it.each(['linen-sam-clockoff', 'linen-oscar-setup'])('discovers the loan through the independent %s fare', entry => {
    const f = setup();
    f.advance(dayMinute(2));
    expect(f.director.status('linen-mags-loan', f.driving())).toBe('locked');
    f.finish(entry);
    expect(f.director.status('linen-mags-loan', f.driving())).toBe('available');
    expect(f.progress.flags).toContain(`linen-met-${linenCatalogue.missions[entry].passenger}`);
    expect(f.state.newsroom.received).toEqual({});
  });

  it('keeps Nell at her paid booking first, then lets her arrive as a guest', () => {
    const f = setup();
    f.advance(dayMinute(2)); f.finish('linen-oscar-setup');
    f.advance(dayMinute(4, 18));
    expect(f.director.status('linen-nell-guest', f.driving())).toBe('locked');
    f.finish('linen-nell-booking');
    expect(f.state.world['linen-guest']).toBe(false);
    f.advance(dayMinute(4, 21)); f.finish('linen-nell-guest');
    expect(f.state.world['linen-guest']).toBe(true);
    expect(f.state.world['linen-event']).toBe('open');
    expect(linenRides['linen-nell-guest'].arrival).toContain('case by the coats');
  });

  it('does not claim a missed paid gig happened or unlock an impossible return from it', () => {
    const f = setup();
    f.advance(dayMinute(2)); f.finish('linen-oscar-setup');
    f.advance(dayMinute(4, 19)); f.begin('linen-nell-booking');
    f.advance(dayMinute(4, 21)); f.deliver('linen-nell-booking');
    expect(f.state.world['linen-nell-gig']).toBe('missed');
    expect(f.director.status('linen-nell-guest', f.driving())).toBe('locked');
    expect(linenArrivalVariants['linen-nell-booking'].find(line => campaignCondition(line.requires, f.state, f.ctx))?.text).toContain('finished the set without me');
  });

  it.each([true, false])('remembers whether the returned bundle was washed: %s', wash => {
    const f = setup();
    f.advance(dayMinute(2)); f.finish('linen-sam-clockoff'); f.finish('linen-mags-loan');
    f.advance(LINEN_OPEN);
    expect(f.state.world['linen-tables']).toBe('borrowed');
    f.advance(LINEN_CLOSE); f.begin('linen-return');
    if (wash) applyEffectsTo(f.progress, linenStopovers['linen-return'].effects, f.ctx);
    f.deliver('linen-return');
    f.advance(LINEN_COUNT);
    expect(f.state.world['linen-stock']).toBe(wash ? 'clean' : 'wash-needed');
    expect(f.state.newsroom).toEqual({ received: {}, cases: {} });
    expect(f.director.status('linen-sam-aftermath', f.driving())).toBe('available');
  });

  it('allows an already boarded late return and preserves what the stock count saw', () => {
    const f = setup();
    f.advance(dayMinute(2)); f.finish('linen-sam-clockoff'); f.finish('linen-mags-loan');
    f.advance(LINEN_COUNT - 1); f.begin('linen-return');
    f.advance(LINEN_COUNT + 1);
    expect(f.state.occurrences['linen-stock-count'].outcome).toBe('missing-bundle');
    applyEffectsTo(f.progress, linenStopovers['linen-return'].effects, f.ctx);
    f.deliver('linen-return');
    expect(f.state.world['linen-stock']).toBe('late-clean');
    expect(f.state.occurrences['linen-stock-count'].outcome).toBe('missing-bundle');
    expect(linenArrivalVariants['linen-return'].find(line => campaignCondition(line.requires, f.state, f.ctx))?.text).toContain('returned late');
  });

  it('does not offer another paid wash after abandoning the collected bundle', () => {
    const f = setup();
    f.advance(dayMinute(2)); f.finish('linen-sam-clockoff'); f.finish('linen-mags-loan');
    f.advance(LINEN_CLOSE); f.begin('linen-return');
    applyEffectsTo(f.progress, linenStopovers['linen-return'].effects, f.ctx);
    f.director.abandon('shift', f.progress.campaignSeconds);
    expect(f.director.status('linen-return', f.driving())).toBe('missed');
    expect(f.director.begin('linen-return', f.driving())).toBe(false);
    expect(f.state.world['linen-washed']).toBe(true);
    expect(f.state.world['linen-returned']).toBe(false);
    f.advance(LINEN_COUNT);
    expect(f.state.world['linen-stock']).toBe('missing');
    expect(f.state.occurrences['linen-stock-count'].outcome).toBe('missing-bundle');
  });

  it('responds to the actual rough flower ride without rewinding the reunion', () => {
    const f = setup();
    f.advance(dayMinute(2)); f.finish('linen-oscar-setup', 40);
    expect(f.state.world['linen-flowers']).toBe('bruised');
    expect(linenArrivalVariants['linen-oscar-setup'].find(line => campaignCondition(line.requires, f.state, f.ctx))?.text).toContain('shorter vase');
    f.advance(LINEN_OPEN - 61); f.begin('linen-mags-loan');
    f.advance(LINEN_OPEN + 1); f.deliver('linen-mags-loan');
    expect(f.state.world['linen-supplies']).toBe(false);
    expect(f.state.world['linen-tables']).toBe('mismatched');
    expect(f.state.occurrences['linen-reunion-opens'].outcome).toBe('mismatched-tables');
    f.advance(LINEN_CLOSE);
    expect(f.director.status('linen-return', f.driving())).toBe('locked');
  });
});

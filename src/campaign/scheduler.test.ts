import { describe, expect, it } from 'vitest';
import { defaultCampaign, parseCampaign } from './state';
import { advanceCampaignTo, receiveMaterial } from './scheduler';
import { dayMinute } from './clock';
import { campaignDefinition, CAMPAIGN_END, LAST_EDITION } from './content';
import { assertWorldOperations, worldOperations } from './events';

const sources = ['eli-docket', 'contractor-register', 'patrol-register', 'complaint-log', 'hearing-copy', 'contract-carbon'];
describe('deterministic campaign scheduler', () => {
  it('gives sleep and uninterrupted driving the same occurrences with no automatic knowledge or editorial work', () => {
    const asleep = defaultCampaign(), awake = defaultCampaign();
    advanceCampaignTo(asleep, dayMinute(7));
    for (let minute = dayMinute(1); minute <= dayMinute(7); minute++) advanceCampaignTo(awake, minute);
    expect(asleep).toEqual(awake); expect(asleep.world.cafe).toBe('closed'); expect(asleep.newsroom.received).toEqual({});
    const copy = structuredClone(asleep); advanceCampaignTo(asleep, dayMinute(7)); expect(asleep).toEqual(copy);
    expect(advanceCampaignTo(asleep, dayMinute(3))).toBe(false);
  });

  it('records the hearing outcome once and refuses to change it through a later intervention', () => {
    const early = defaultCampaign(), late = defaultCampaign();
    advanceCampaignTo(early, dayMinute(5, 10), ['tenant-interview-reached']);
    advanceCampaignTo(late, dayMinute(5, 10)); advanceCampaignTo(late, dayMinute(8), ['tenant-interview-reached']);
    expect(early.world.cafe).toBe('tenancy-review'); expect(late.world.cafe).toBe('closed');
    expect(late.occurrences['tenancy-hearing']).toEqual({ at: dayMinute(5, 10), outcome: 'closed' });
  });

  it('automatically schedules checked stories but waits until their edition to publish', () => {
    const state = defaultCampaign(); advanceCampaignTo(state, dayMinute(11, 9));
    for (const id of sources) expect(receiveMaterial(state, id)).toBe(true);
    expect(receiveMaterial(state, 'unknown')).toBe(false); expect(receiveMaterial(state, sources[0])).toBe(false);
    advanceCampaignTo(state, dayMinute(11, 11, 59)); expect(state.newsroom.cases).toEqual({});
    advanceCampaignTo(state, dayMinute(11, 12)); expect(Object.keys(state.newsroom.cases)).toHaveLength(3);
    expect(Object.values(state.newsroom.cases).map(c => c?.editionAt)).toEqual([dayMinute(12, 6), dayMinute(12, 6), dayMinute(12, 6)]);
    expect(state.publications).toEqual([]); expect(state.reactions).toEqual({});
    advanceCampaignTo(state, dayMinute(12, 6)); expect(state.publications).toHaveLength(3);
  });

  it('publishes alternative sources in stable dependency order, with later independent reactions', () => {
    const state = defaultCampaign(); advanceCampaignTo(state, dayMinute(11, 9)); for (const id of sources) receiveMaterial(state, id);
    advanceCampaignTo(state, dayMinute(11, 12));
    advanceCampaignTo(state, dayMinute(12, 6)); expect(state.publications.map(p => p.allegation)).toEqual(['coordination', 'policing', 'knowledge']);
    expect(state.world.appearance).toBe('booked'); expect(state.reactions).toEqual({});
    advanceCampaignTo(state, dayMinute(12, 8)); expect(state.world.appearance).toBe('cancelled'); expect(state.world.security).toBe('suspended'); expect(state.world.patrol).toBe('inquiry');
    const roundTrip = parseCampaign(JSON.parse(JSON.stringify(state))); expect(roundTrip).toEqual(state);
    const before = structuredClone(roundTrip); advanceCampaignTo(roundTrip, dayMinute(12, 8)); expect(roundTrip).toEqual(before);
  });

  it('keeps a lone material as a checked lead and offers a ready case when more material arrives later', () => {
    const state = defaultCampaign(); receiveMaterial(state, 'eli-docket'); advanceCampaignTo(state, dayMinute(2));
    expect(state.newsroom.cases).toEqual({}); receiveMaterial(state, 'contractor-register'); advanceCampaignTo(state, dayMinute(2, 10));
    expect(state.newsroom.cases.coordination?.verifiedAt).toBe(dayMinute(2, 10)); expect(state.publications).toEqual([]);
  });

  it('makes live time and a long skip publish and react identically after submission', () => {
    const skipped = defaultCampaign(), live = defaultCampaign();
    for (const state of [skipped, live]) for (const id of sources) receiveMaterial(state, id);
    advanceCampaignTo(skipped, dayMinute(3, 8));
    for (let minute = dayMinute(1); minute <= dayMinute(3, 8); minute++) advanceCampaignTo(live, minute);
    expect(skipped).toEqual(live);
    expect(skipped.publications).toHaveLength(3);
    expect(Object.keys(skipped.reactions)).toHaveLength(3);
  });

  it.each([
    { checkedAt: LAST_EDITION - 0.001, editionAt: LAST_EDITION },
    { checkedAt: LAST_EDITION, editionAt: null },
    { checkedAt: LAST_EDITION + 0.001, editionAt: null },
  ])('honors the last edition cutoff for checks finishing at $checkedAt', ({ checkedAt, editionAt }) => {
    const state = defaultCampaign(); advanceCampaignTo(state, checkedAt - 180);
    for (const id of ['eli-docket', 'contractor-register']) receiveMaterial(state, id);
    advanceCampaignTo(state, checkedAt);
    expect(state.newsroom.cases.coordination).toEqual({ verifiedAt: checkedAt, editionAt });
    advanceCampaignTo(state, CAMPAIGN_END);
    expect(state.publications).toHaveLength(editionAt === null ? 0 : 1);
    expect(parseCampaign(state)).toEqual(state);
  });

  it('automatically retries a held story at later editions and stays within the authored work budget', () => {
    const definition = { ...campaignDefinition, claims: { delayed: {
      title: 'Delayed story', routes: [['eli-docket']], publishRequires: { minuteAtLeast: dayMinute(13, 6) }, reactionEffects: [],
    } } };
    const state = defaultCampaign(definition);
    receiveMaterial(state, 'eli-docket', {}, definition);
    advanceCampaignTo(state, dayMinute(3, 7), {}, definition);
    expect(state.occurrences['edition-delayed']).toEqual({ at: dayMinute(3, 6), outcome: 'held' });
    expect(state.newsroom.cases.delayed?.editionAt).toBe(dayMinute(4, 6));
    expect(parseCampaign(state, definition)).toEqual(state);
    advanceCampaignTo(state, CAMPAIGN_END, {}, definition);
    expect(state.publications).toMatchObject([{ allegation: 'delayed', at: dayMinute(13, 6) }]);
    expect(parseCampaign(state, definition)).toEqual(state);
  });

  it('migrates pending legacy stories without backdating publications or rewriting printed editions', () => {
    const checked = defaultCampaign(); advanceCampaignTo(checked, dayMinute(11, 9));
    for (const id of sources) receiveMaterial(checked, id);
    advanceCampaignTo(checked, dayMinute(11, 12));
    const old = defaultCampaign(); advanceCampaignTo(old, dayMinute(12, 12));
    const legacy = { ...old, newsroom: { ...checked.newsroom, cases: Object.fromEntries(Object.entries(checked.newsroom.cases).map(([id, c]) => [id, { ...c, approvedAt: null, editionAt: null }])) } };
    const migrated = parseCampaign(legacy);
    expect(migrated.publications).toEqual([]);
    expect(migrated.editions).toEqual(old.editions);
    expect(Object.values(migrated.newsroom.cases).map(c => c?.editionAt)).toEqual(Array(3).fill(dayMinute(13, 6)));
    expect(JSON.stringify(migrated)).not.toContain('approvedAt');
    expect(parseCampaign(migrated)).toEqual(migrated);
    advanceCampaignTo(migrated, dayMinute(13, 8));
    expect(migrated.publications).toHaveLength(3);
    expect(migrated.editions.slice(0, old.editions.length)).toEqual(old.editions);
    expect(parseCampaign(migrated)).toEqual(migrated);
  });

  it('preserves legacy authorized schedules, publications and responses without retaining authorization state', () => {
    const state = defaultCampaign(); advanceCampaignTo(state, dayMinute(11, 9));
    for (const id of sources) receiveMaterial(state, id);
    advanceCampaignTo(state, dayMinute(11, 12));
    const legacy = { ...state, newsroom: { ...state.newsroom, cases: Object.fromEntries(Object.entries(state.newsroom.cases).map(([id, c]) => [id, { ...c, approvedAt: state.minute, editionAt: dayMinute(13, 6) }])) } };
    const migrated = parseCampaign(legacy);
    expect(Object.values(migrated.newsroom.cases).every(c => c?.editionAt === dayMinute(13, 6))).toBe(true);
    advanceCampaignTo(migrated, dayMinute(13, 8));
    const publishedLegacy = { ...migrated, newsroom: { ...migrated.newsroom, cases: Object.fromEntries(Object.entries(migrated.newsroom.cases).map(([id, c]) => [id, { ...c, approvedAt: dayMinute(12, 12) }])) } };
    expect(parseCampaign(publishedLegacy)).toEqual(migrated);
  });

  it('closes editions precisely and stops large skips at the single ending boundary', () => {
    const state = defaultCampaign(); advanceCampaignTo(state, LAST_EDITION);
    expect(receiveMaterial(state, 'eli-docket')).toBe(false);
    advanceCampaignTo(state, CAMPAIGN_END + 50000); expect(state.minute).toBe(CAMPAIGN_END); expect(state.finished).toBe(true); expect(state.shift).toBe(14);
    const copy = structuredClone(state); expect(advanceCampaignTo(state, CAMPAIGN_END + 2)).toBe(false); expect(state).toEqual(copy);
  });

  it('rejects old or unknown campaign versions without importing their events', () => {
    expect(parseCampaign({ version: 1, shift: 6, submitted: ['barrier-receipt'], regularRides: { Ravi: 2 } })).toEqual(defaultCampaign());
    expect(parseCampaign({ version: 99, minute: Infinity })).toEqual(defaultCampaign());
    expect(parseCampaign({ version: 2, minute: NaN, newsroom: { received: { 'eli-docket': { at: -10, verifiedAt: 0 } } }, publications: [null] })).toEqual(defaultCampaign());
  });

  it('rejects duplicate IDs and out-of-campaign authored events', () => {
    expect(() => assertWorldOperations(worldOperations)).not.toThrow();
    expect(() => assertWorldOperations([...worldOperations, worldOperations[0]])).toThrow(/Duplicate/);
    expect(() => assertWorldOperations([{ id: 'bad-time', at: CAMPAIGN_END, effects: [] }])).toThrow(/time/);
  });
});

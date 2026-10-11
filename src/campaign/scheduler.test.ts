import { describe, expect, it } from 'vitest';
import { defaultCampaign, migrateCampaign } from './state';
import { approvePublication, advanceCampaignTo, receiveMaterial } from './scheduler';
import { CAMPAIGN_END, LAST_EDITION, dayMinute } from './clock';
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

  it('does not publish merely because independent records are received or verified', () => {
    const state = defaultCampaign(); advanceCampaignTo(state, dayMinute(11, 9));
    for (const id of sources) expect(receiveMaterial(state, id)).toBe(true);
    expect(receiveMaterial(state, 'unknown')).toBe(false); expect(receiveMaterial(state, sources[0])).toBe(false);
    advanceCampaignTo(state, dayMinute(11, 11, 59)); expect(state.newsroom.cases).toEqual({});
    advanceCampaignTo(state, dayMinute(11, 12)); expect(Object.keys(state.newsroom.cases)).toHaveLength(3);
    advanceCampaignTo(state, dayMinute(12, 7)); expect(state.publications).toEqual([]); expect(state.reactions).toEqual({});
  });

  it('publishes alternative sources in stable dependency order, with later independent reactions', () => {
    const state = defaultCampaign(); advanceCampaignTo(state, dayMinute(11, 9)); for (const id of sources) receiveMaterial(state, id);
    advanceCampaignTo(state, dayMinute(11, 12)); expect(approvePublication(state, 'knowledge')).toBe(false);
    expect(approvePublication(state, 'policing')).toBe(true); expect(approvePublication(state, 'coordination')).toBe(true); expect(approvePublication(state, 'knowledge')).toBe(true);
    expect(approvePublication(state, 'knowledge')).toBe(false);
    advanceCampaignTo(state, dayMinute(12, 6)); expect(state.publications.map(p => p.allegation)).toEqual(['coordination', 'policing', 'knowledge']);
    expect(state.world.appearance).toBe('booked'); expect(state.reactions).toEqual({});
    advanceCampaignTo(state, dayMinute(12, 8)); expect(state.world.appearance).toBe('cancelled'); expect(state.world.security).toBe('suspended'); expect(state.world.patrol).toBe('inquiry');
    const roundTrip = migrateCampaign(JSON.parse(JSON.stringify(state))); expect(roundTrip).toEqual(state);
    const before = structuredClone(roundTrip); advanceCampaignTo(roundTrip, dayMinute(12, 8)); expect(roundTrip).toEqual(before);
  });

  it('keeps a lone material as a checked lead and offers a ready case when more material arrives later', () => {
    const state = defaultCampaign(); receiveMaterial(state, 'eli-docket'); advanceCampaignTo(state, dayMinute(2));
    expect(state.newsroom.cases).toEqual({}); receiveMaterial(state, 'contractor-register'); advanceCampaignTo(state, dayMinute(2, 10));
    expect(state.newsroom.cases.coordination?.verifiedAt).toBe(dayMinute(2, 10)); expect(state.publications).toEqual([]);
  });

  it('closes editions precisely and stops large skips at the single ending boundary', () => {
    const state = defaultCampaign(); advanceCampaignTo(state, LAST_EDITION);
    expect(receiveMaterial(state, 'eli-docket')).toBe(false); expect(approvePublication(state, 'coordination')).toBe(false);
    advanceCampaignTo(state, CAMPAIGN_END + 50000); expect(state.minute).toBe(CAMPAIGN_END); expect(state.finished).toBe(true); expect(state.shift).toBe(14);
    const copy = structuredClone(state); expect(advanceCampaignTo(state, CAMPAIGN_END + 2)).toBe(false); expect(state).toEqual(copy);
  });

  it('migrates a manual shift without adding player knowledge, and validates corrupt or future saves', () => {
    const legacy = migrateCampaign({ version: 1, shift: 6, submitted: ['barrier-receipt', 'bad'], publications: [], regularRides: { Ravi: 2 } });
    expect(legacy.minute).toBe(dayMinute(6)); expect(legacy.world.cafe).toBe('closed'); expect(legacy.newsroom.received['barrier-receipt'].verifiedAt).toBeNull();
    expect(legacy.publications).toEqual([]); expect(legacy.regularRides.Ravi).toBe(2);
    expect(migrateCampaign({ version: 99, minute: Infinity })).toEqual(defaultCampaign());
    expect(migrateCampaign({ version: 2, minute: NaN, newsroom: { received: { 'eli-docket': { at: -10, verifiedAt: 0 } } }, publications: [null] })).toEqual(defaultCampaign());
  });

  it('retains valid legacy publications through the v2 migration and its next reload', () => {
    const legacy = migrateCampaign({ version: 1, shift: 13, submitted: sources, publications: [
      { allegation: 'coordination', submittedShift: 6, publishedShift: 7 },
      { allegation: 'policing', submittedShift: 9, publishedShift: 10 },
      { allegation: 'knowledge', submittedShift: 11, publishedShift: 12 },
    ] });
    expect(legacy.publications.map(p => p.allegation)).toEqual(['coordination', 'policing', 'knowledge']);
    expect(migrateCampaign(JSON.parse(JSON.stringify(legacy)))).toEqual(legacy);
  });

  it('rejects duplicate IDs and out-of-campaign authored events', () => {
    expect(() => assertWorldOperations(worldOperations)).not.toThrow();
    expect(() => assertWorldOperations([...worldOperations, worldOperations[0]])).toThrow(/Duplicate/);
    expect(() => assertWorldOperations([{ id: 'bad-time', at: CAMPAIGN_END, changes: {} }])).toThrow(/time/);
  });
});

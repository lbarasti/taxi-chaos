import { corroboration, jobWindows, materials, type Allegation } from './content';
import { CAMPAIGN_END, CAMPAIGN_START, LAST_EDITION, campaignDay, dayMinute } from './clock';
import { defaultWorld, worldOperations, type Occurrence, type WorldState } from './events';
import { advanceCampaignTo } from './scheduler';

export type Publication = { allegation: Allegation; submittedShift: number; publishedShift: number; at: number };
export type EditorialCase = { verifiedAt: number; approvedAt: number | null; editionAt: number | null };
export type ActiveRide = { missionId: string; type: 'fare' | 'parcel'; elapsed: number; comfort: number; rideBeat: number };
export type Campaign = {
  version: 2; minute: number; shift: number; finished: boolean;
  occurrences: Record<string, Occurrence>; world: WorldState;
  newsroom: { received: Record<string, { at: number; verifiedAt: number | null }>; cases: Partial<Record<Allegation, EditorialCase>> };
  publications: Publication[]; reactions: Partial<Record<Allegation, { at: number }>>;
  regularRides: Record<string, number>; ordinarySinceStory: number; activeRide: ActiveRide | null;
};
export const defaultCampaign = (): Campaign => ({ version: 2, minute: CAMPAIGN_START, shift: 1, finished: false, occurrences: {}, world: defaultWorld(), newsroom: { received: {}, cases: {} }, publications: [], reactions: {}, regularRides: {}, ordinarySinceStory: 0, activeRide: null });
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const time = (value: unknown, until: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= CAMPAIGN_START && value <= until;

/** Validated v2 snapshots and a one-way migration from manual shifts. No invented records. */
export function migrateCampaign(raw: unknown): Campaign {
  const state = defaultCampaign(), s = object(raw);
  if (s.version !== 1 && s.version !== 2) return state;
  if (s.version === 1) {
    const shift = typeof s.shift === 'number' && Number.isInteger(s.shift) ? Math.max(1, Math.min(14, s.shift)) : 1;
    advanceCampaignTo(state, shift === 14 && s.finished === true ? CAMPAIGN_END : dayMinute(shift));
    if (Array.isArray(s.submitted)) for (const id of s.submitted.slice(0, 100)) {
      if (typeof id === 'string' && Object.hasOwn(materials, id)) state.newsroom.received[id] = { at: state.minute, verifiedAt: null };
    }
    if (Array.isArray(s.publications)) for (const value of s.publications.slice(0, 3)) {
      const p = object(value), allegation = p.allegation as Allegation;
      if (!Object.hasOwn(corroboration, allegation) || state.publications.some(old => old.allegation === allegation)) continue;
      if (typeof p.submittedShift !== 'number' || !Number.isInteger(p.submittedShift) || p.submittedShift < 1 || typeof p.publishedShift !== 'number' || p.publishedShift !== p.submittedShift + 1 || p.publishedShift > state.shift) continue;
      if (!corroboration[allegation].some(route => route.every(id => Object.hasOwn(state.newsroom.received, id)))) continue;
      const at = dayMinute(p.publishedShift, 6), receivedAt = dayMinute(p.submittedShift), verifiedAt = receivedAt + 180;
      for (const route of corroboration[allegation]) for (const id of route) if (state.newsroom.received[id]) state.newsroom.received[id] = { at: receivedAt, verifiedAt };
      state.newsroom.cases[allegation] = { verifiedAt, approvedAt: at - 1, editionAt: at };
      state.publications.push({ allegation, submittedShift: campaignDay(receivedAt), publishedShift: campaignDay(at), at });
      state.occurrences[`edition-${allegation}`] = { at, outcome: 'published' };
      if (at + 120 <= state.minute) { state.reactions[allegation] = { at: at + 120 }; state.occurrences[`reaction-${allegation}`] = { at: at + 120, outcome: 'occurred' }; }
    }
  } else {
    state.minute = time(s.minute, CAMPAIGN_END) ? s.minute : CAMPAIGN_START;
    state.shift = campaignDay(state.minute); state.finished = state.minute === CAMPAIGN_END;
    const occurrences = object(s.occurrences);
    // Rebuild typed physical consequences from the finite authored ledger.
    for (const op of worldOperations) if (op.at <= state.minute) {
      const saved = object(occurrences[op.id]);
      const outcome = op.tenantOutcome && saved.outcome === 'tenancy-review' ? 'tenancy-review' : op.tenantOutcome ? 'closed' : 'occurred';
      state.occurrences[op.id] = { at: op.at, outcome };
      Object.assign(state.world, op.changes, op.tenantOutcome ? { cafe: outcome } : {});
    }
    const newsroom = object(s.newsroom);
    for (const [id, value] of Object.entries(object(newsroom.received)).slice(0, 100)) {
      const r = object(value);
      if (!Object.hasOwn(materials, id) || !time(r.at, state.minute)) continue;
      state.newsroom.received[id] = { at: r.at, verifiedAt: time(r.verifiedAt, state.minute) && r.verifiedAt >= r.at + 180 ? r.verifiedAt : null };
    }
    const cases = object(newsroom.cases);
    for (const allegation of Object.keys(corroboration) as Allegation[]) {
      const c = object(cases[allegation]);
      const supported = corroboration[allegation].some(route => route.every(id => state.newsroom.received[id]?.verifiedAt !== null && state.newsroom.received[id]?.verifiedAt !== undefined));
      if (!supported || !time(c.verifiedAt, state.minute) || !corroboration[allegation].some(route => route.every(id => state.newsroom.received[id]?.verifiedAt != null && state.newsroom.received[id].verifiedAt! <= (c.verifiedAt as number)))) continue;
      const approvedAt = time(c.approvedAt, state.minute) && c.approvedAt >= c.verifiedAt ? c.approvedAt : null;
      const editionAt = approvedAt !== null && time(c.editionAt, LAST_EDITION) && c.editionAt > approvedAt && c.editionAt % 1440 === 360 ? c.editionAt : null;
      state.newsroom.cases[allegation] = { verifiedAt: c.verifiedAt, approvedAt, editionAt };
    }
    if (Array.isArray(s.publications)) for (const value of s.publications.slice(0, 3)) {
      const p = object(value), allegation = p.allegation as Allegation, c = state.newsroom.cases[allegation];
      if (!c || !time(p.at, state.minute) || c.editionAt !== p.at || state.publications.some(old => old.allegation === allegation)) continue;
      state.publications.push({ allegation, submittedShift: campaignDay(c.verifiedAt - 180), publishedShift: campaignDay(p.at), at: p.at });
      state.occurrences[`edition-${allegation}`] = { at: p.at, outcome: 'published' };
    }
    const reactions = object(s.reactions);
    for (const pub of state.publications) {
      const r = object(reactions[pub.allegation]);
      if (time(r.at, state.minute) && r.at === pub.at + 120) { state.reactions[pub.allegation] = { at: r.at }; state.occurrences[`reaction-${pub.allegation}`] = { at: r.at, outcome: 'occurred' }; }
    }
    const active = object(s.activeRide);
    if (typeof active.missionId === 'string' && Object.hasOwn(jobWindows, active.missionId) && (active.type === 'fare' || active.type === 'parcel')) {
      state.activeRide = { missionId: active.missionId, type: active.type, elapsed: typeof active.elapsed === 'number' && Number.isFinite(active.elapsed) ? Math.max(0, Math.min(1e6, active.elapsed)) : 0, comfort: typeof active.comfort === 'number' && Number.isFinite(active.comfort) ? Math.max(0, Math.min(100, active.comfort)) : 100, rideBeat: active.rideBeat === 1 ? 1 : 0 };
    }
  }
  if (!['coordination', 'policing'].every(id => state.newsroom.cases[id as Allegation])) delete state.newsroom.cases.knowledge;
  if (!['coordination', 'policing'].every(id => state.publications.some(p => p.allegation === id))) {
    state.publications = state.publications.filter(p => p.allegation !== 'knowledge'); delete state.reactions.knowledge;
  }
  for (const allegation of Object.keys(state.reactions) as Allegation[]) {
    if (allegation === 'coordination') state.world.security = 'suspended';
    if (allegation === 'policing') state.world.patrol = 'inquiry';
    if (allegation === 'knowledge') state.world.appearance = 'cancelled';
  }
  for (const [name, count] of Object.entries(object(s.regularRides)).slice(0, 16)) if (/^[A-Za-z]{1,20}$/.test(name) && typeof count === 'number' && Number.isInteger(count) && count >= 0) state.regularRides[name] = Math.min(1e6, count);
  state.ordinarySinceStory = typeof s.ordinarySinceStory === 'number' && Number.isInteger(s.ordinarySinceStory) ? Math.max(0, Math.min(2, s.ordinarySinceStory)) : 0;
  return state;
}

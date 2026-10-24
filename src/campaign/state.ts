import { campaignDefinition } from './content';
import type { Allegation, CampaignDefinition, CampaignInputs, WorldState } from './model';
import { campaignCondition } from '../missions/conditions';
import { claimOrder } from './validate';
import type { Effect } from '../missions/schema';
import { campaignDay, nextEdition } from './clock';
import { advanceCampaignTo } from './scheduler';
import { compareCampaignBoundaries } from './history';
import { restoreEditions } from './editions';
import { scheduledEdition, type Occurrence } from './events';
import type { CharacterId } from '../narrative/characters';

export type PrintedEdition = { day: number; at: number; articles: string[]; briefs: string[]; read: boolean };
export type Publication = { allegation: Allegation; submittedShift: number; publishedShift: number; at: number };
export type PublicationCase = { verifiedAt: number; editionAt: number | null };
export type RideStopover = { started: boolean; completed: boolean; elapsed: number; detourAllowance: number; routed: boolean };
export type ActiveRide = {
  missionId?: string; ordinary?: { character: CharacterId; journeyId: string };
  procedural?: { pickup: { x: number; y: number }; dropoff: { x: number; y: number }; name: string; destination: string; fare: number; time: number };
  incidentalId?: string;
  type: 'fare' | 'parcel'; elapsed: number; comfort: number; rideBeat: number; rideDistance?: number; stopover?: RideStopover;
};
export type Campaign = {
  editions: PrintedEdition[]; endingSeen: boolean;
  version: 2; minute: number; shift: number; finished: boolean;
  occurrences: Record<string, Occurrence>; world: WorldState;
  newsroom: { received: Record<string, { at: number; verifiedAt: number | null }>; cases: Partial<Record<Allegation, PublicationCase>> };
  publications: Publication[]; reactions: Partial<Record<Allegation, { at: number }>>;
  regularRides: Record<string, number>; ordinarySinceStory: number; activeRide: ActiveRide | null;
};
function initialCampaign(definition: CampaignDefinition): Campaign {
  return { version: 2, minute: definition.timing.start, shift: 1, finished: false, editions: [], endingSeen: false, occurrences: {}, world: { ...definition.initialWorld }, newsroom: { received: {}, cases: {} }, publications: [], reactions: {}, regularRides: {}, ordinarySinceStory: 0, activeRide: null };
}
export function defaultCampaign(definition: CampaignDefinition = campaignDefinition, inputs: CampaignInputs = {}): Campaign {
  const state = initialCampaign(definition);
  advanceCampaignTo(state, definition.timing.start, inputs, definition);
  return state;
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Validate current snapshots in chronological domain order, without replaying gameplay effects. */
export function parseCampaign(raw: unknown, definition: CampaignDefinition = campaignDefinition, inputs: CampaignInputs = {}): Campaign {
  const s = object(raw);
  if (s.version !== 2) return defaultCampaign(definition, inputs);
  // Loading uses ledger reconstruction, never startup gameplay effects.
  const state = initialCampaign(definition);
  const time = (value: unknown, until: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= definition.timing.start && value <= until;
  const minute = time(s.minute, definition.timing.end) ? s.minute : definition.timing.start;
  const allegations = claimOrder(definition), rank = (id: string) => allegations.indexOf(id);
  const savedWorld: WorldState = {};
  for (const [key, value] of Object.entries(object(s.world))) if (Object.hasOwn(definition.initialWorld, key) && typeof value === typeof definition.initialWorld[key] && (typeof value !== 'number' || Number.isFinite(value))) savedWorld[key] = value as WorldState[string];
  // Non-clock effects are saved as domain snapshots; timed consequences are rebuilt below.
  Object.assign(state.world, savedWorld);
  const timeline: { at: number; phase: number; id: string; apply: () => void | false }[] = [];
  const worldEffects = (effects: readonly Effect[]) => { for (const e of effects) if ('setWorld' in e) state.world[e.setWorld.key] = e.setWorld.value; };
  // Milestones latch their admission. Mutable flags, world values and knowledge may
  // have changed since admission, so only durable ledger/time prerequisites replay.
  const historical = (c: import('../missions/schema').Condition): boolean | undefined => {
    if ('all' in c) { const children = c.all.map(historical); return children.includes(false) ? false : children.includes(undefined) ? undefined : true; }
    if ('any' in c) { const children = c.any.map(historical); return children.includes(true) ? true : children.includes(undefined) ? undefined : false; }
    if ('not' in c) { const nested = historical(c.not); return nested === undefined ? undefined : !nested; }
    if ('caseState' in c || 'materialState' in c || 'published' in c || 'reacted' in c || 'occurred' in c || 'minuteAtLeast' in c || 'minuteBefore' in c || 'shiftAtLeast' in c || 'shiftAtMost' in c) return campaignCondition(c, state, inputs);
    return undefined;
  };
  const matches = (condition: import('../missions/schema').Condition | undefined) => !condition || historical(condition) !== false;
  const occurrences = object(s.occurrences);
  for (const op of definition.operations) if (op.at <= minute) {
    const saved = object(occurrences[op.id]);
    const branch = op.outcomes?.find(o => o.id === saved.outcome) ?? op.outcomes?.at(-1);
    timeline.push({ at: op.at, phase: 0, id: op.id, apply: () => {
      state.occurrences[op.id] = { at: op.at, outcome: branch?.id ?? 'occurred' };
      worldEffects([...op.effects, ...(branch?.effects ?? [])]);
    } });
  }
  const newsroom = object(s.newsroom);
  for (const [id, value] of Object.entries(object(newsroom.received)).slice(0, 100)) {
    const r = object(value);
    if (!Object.hasOwn(definition.materials, id) || !time(r.at, minute)) continue;
    const at = r.at;
    timeline.push({ at, phase: 1, id, apply: () => { state.newsroom.received[id] = { at, verifiedAt: null }; } });
    if (time(r.verifiedAt, minute) && r.verifiedAt === at + 180) {
      const verifiedAt = r.verifiedAt;
      timeline.push({ at: verifiedAt, phase: 2, id, apply: () => { state.newsroom.received[id].verifiedAt = verifiedAt; } });
    }
  }
  const cases = object(newsroom.cases);
  for (const id of allegations) {
    const c = object(cases[id]), claim = definition.claims[id];
    if (!time(c.verifiedAt, minute)) continue;
    const verifiedAt = c.verifiedAt;
    timeline.push({ at: verifiedAt, phase: 3 + rank(id), id, apply: () => {
      if (!claim.routes.some(route => route.every(material => state.newsroom.received[material]?.verifiedAt != null)) || !matches(claim.verifyRequires)) return false;
      // Keep existing edition dates, including legacy saves whose player authorized
      // publication later. Authorization itself is no longer campaign state.
      const editionAt = time(c.editionAt, definition.timing.lastEdition) && c.editionAt >= nextEdition(verifiedAt, definition.timing)
        && nextEdition(c.editionAt - 1, definition.timing) === c.editionAt ? c.editionAt : null;
      state.newsroom.cases[id] = { verifiedAt, editionAt };
    } });
  }
  if (Array.isArray(s.publications)) for (const value of s.publications.slice(0, allegations.length)) {
    const p = object(value), id = p.allegation;
    if (typeof id !== 'string' || !Object.hasOwn(definition.claims, id) || !time(p.at, minute)) continue;
    const at = p.at;
    timeline.push({ at, phase: 3 + allegations.length * 2 + rank(id), id, apply: () => {
      const c = state.newsroom.cases[id];
      if (!c || c.editionAt !== at || state.publications.some(p => p.allegation === id) || !matches(definition.claims[id].publishRequires)) return false;
      state.publications.push({ allegation: id, submittedShift: campaignDay(c.verifiedAt - 180, definition.timing), publishedShift: campaignDay(at, definition.timing), at });
      state.occurrences[`edition-${id}`] = { at, outcome: 'published' };
    } });
  }
  for (const id of allegations) {
    const held = object(occurrences[`edition-${id}`]);
    if (held.outcome !== 'held' || !time(held.at, minute) || held.at > definition.timing.lastEdition) continue;
    const at = held.at;
    timeline.push({ at, phase: 3 + allegations.length * 2 + rank(id), id, apply: () => {
      const c = state.newsroom.cases[id];
      if (!c || at < nextEdition(c.verifiedAt, definition.timing) || nextEdition(at - 1, definition.timing) !== at
        || c.editionAt !== scheduledEdition(at, definition.timing) || state.publications.some(p => p.allegation === id)) return false;
      state.occurrences[`edition-${id}`] = { at, outcome: 'held' };
    } });
  }
  for (const [id, value] of Object.entries(object(s.reactions))) {
    const r = object(value);
    if (!Object.hasOwn(definition.claims, id) || !time(r.at, minute)) continue;
    const at = r.at;
    timeline.push({ at, phase: 3 + allegations.length * 3, id, apply: () => {
      const pub = state.publications.find(p => p.allegation === id);
      if (!pub || at !== pub.at + 120) return false;
      state.reactions[id] = { at }; state.occurrences[`reaction-${id}`] = { at, outcome: 'occurred' };
      worldEffects(definition.claims[id].reactionEffects);
    } });
  }
  timeline.sort(compareCampaignBoundaries);
  for (let i = 0; i < timeline.length;) {
    const at = timeline[i].at; state.minute = at; state.shift = campaignDay(at, definition.timing);
    const group = []; while (i < timeline.length && timeline[i].at === at) group.push(timeline[i++]);
    // A case can be admitted by an edition at the same timestamp. Retry blocked
    // milestones after other domain phases have committed, until no work remains.
    let pending = group;
    for (let pass = 0; pass < group.length; pass++) {
      const retry = pending.filter(event => event.apply() === false);
      if (retry.length === pending.length || !retry.length) break;
      pending = retry;
    }
  }
  state.minute = minute; state.shift = campaignDay(minute, definition.timing); state.finished = minute === definition.timing.end;
  // Never invent past publications when migrating a checked, unapproved legacy
  // story or an overdue schedule. Resume unpublished work at the next edition.
  for (const [id, c] of Object.entries(state.newsroom.cases)) {
    if (c && !state.publications.some(p => p.allegation === id) && (c.editionAt === null || c.editionAt <= minute)) c.editionAt = scheduledEdition(minute, definition.timing);
  }
  Object.assign(state.world, savedWorld);
  const active = object(s.activeRide);
  const finite = (v: unknown, max: number, fallback = 0): number => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : fallback;
  if (active.type === 'fare' || active.type === 'parcel') {
    const ride: ActiveRide = { type: active.type, elapsed: finite(active.elapsed, 1e6), comfort: finite(active.comfort, 100, 100), rideBeat: active.rideBeat === 1 ? 1 : 0, rideDistance: finite(active.rideDistance, 1e6) };
    if (typeof active.missionId === 'string' && Object.hasOwn(definition.missions.missions, active.missionId)) {
      ride.missionId = active.missionId;
      state.activeRide = ride;
    } else {
      const ordinary = object(active.ordinary), regular = definition.everydayJobs.find(job => job.character === ordinary.character);
      const journeys = active.type === 'parcel' ? regular?.parcelJourneys : regular?.journeys;
      if (regular && journeys?.some(journey => journey.id === ordinary.journeyId)) {
        ride.ordinary = { character: regular.character, journeyId: ordinary.journeyId as string }; state.activeRide = ride;
      } else if (typeof active.incidentalId === 'string' && definition.proceduralStopovers?.some(spec => spec.id === active.incidentalId)) {
        const saved = object(active.procedural), p = object(saved.pickup), d = object(saved.dropoff);
        if ([p.x, p.y, d.x, d.y].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e5)
          && typeof saved.name === 'string' && saved.name.length > 0 && saved.name.length <= 80
          && typeof saved.destination === 'string' && saved.destination.length > 0 && saved.destination.length <= 120
          && typeof saved.fare === 'number' && Number.isFinite(saved.fare) && saved.fare >= 0 && saved.fare < 1e6
          && typeof saved.time === 'number' && Number.isFinite(saved.time) && saved.time >= 0 && saved.time < 1e6) {
          ride.procedural = { pickup: { x: p.x as number, y: p.y as number }, dropoff: { x: d.x as number, y: d.y as number },
            name: saved.name, destination: saved.destination, fare: saved.fare, time: saved.time };
          ride.incidentalId = active.incidentalId; state.activeRide = ride;
        }
      }
    }
    const spec = ride.missionId ? definition.stopovers?.[ride.missionId]
      : ride.ordinary ? (ride.type === 'parcel'
          ? definition.everydayJobs.find(job => job.character === ride.ordinary!.character)?.parcelJourneys
          : definition.everydayJobs.find(job => job.character === ride.ordinary!.character)?.journeys)?.find(j => j.id === ride.ordinary!.journeyId)?.stopover
      : definition.proceduralStopovers?.find(stop => stop.id === ride.incidentalId);
    const saved = object(active.stopover);
    if (state.activeRide && spec && active.stopover) ride.stopover = {
      started: saved.started === true && saved.completed !== true, completed: saved.completed === true,
      elapsed: saved.completed === true ? spec.seconds : finite(saved.elapsed, spec.seconds),
      detourAllowance: finite(saved.detourAllowance, 600), routed: saved.routed === true && saved.completed !== true,
    };
  }
  for (const [name, count] of Object.entries(object(s.regularRides)).slice(0, definition.everydayJobs.length)) if (definition.everydayJobs.some(job => job.name === name) && typeof count === 'number' && Number.isInteger(count) && count >= 0) state.regularRides[name] = Math.min(1e6, count);
  state.ordinarySinceStory = typeof s.ordinarySinceStory === 'number' && Number.isInteger(s.ordinarySinceStory) ? Math.max(0, Math.min(2, s.ordinarySinceStory)) : 0;
  restoreEditions(state, s.editions, definition);
  state.endingSeen = state.finished && s.endingSeen === true;
  return state;
}

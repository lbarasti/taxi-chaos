import { corroboration, materials, type Allegation } from './content';
import { CAMPAIGN_END, LAST_EDITION, campaignDay, nextEdition } from './clock';
import { worldOperations } from './events';
import type { Campaign } from './state';

const allegations = Object.keys(corroboration) as Allegation[];
export const VERIFICATION_MINUTES = 180;
export const REACTION_MINUTES = 120;

function verifyCases(state: Campaign, at: number) {
  for (const allegation of allegations) {
    if (state.newsroom.cases[allegation]) continue;
    if (allegation === 'knowledge' && !['coordination', 'policing'].every(id => state.newsroom.cases[id as Allegation])) continue;
    if (corroboration[allegation].some(route => route.every(id => state.newsroom.received[id]?.verifiedAt != null))) state.newsroom.cases[allegation] = { verifiedAt: at, approvedAt: null, editionAt: null };
  }
}

/** Explicit receipt: possessing material and submitting material are separate commands. */
export function receiveMaterial(state: Campaign, id: string): boolean {
  if (state.finished || state.minute >= LAST_EDITION || !Object.hasOwn(materials, id) || Object.hasOwn(state.newsroom.received, id)) return false;
  state.newsroom.received[id] = { at: state.minute, verifiedAt: null };
  return true;
}

/** The driver brings a ready story to the editor; authentication alone never prints it. */
export function approvePublication(state: Campaign, allegation: Allegation): boolean {
  const c = state.newsroom.cases[allegation];
  if (!c || c.approvedAt !== null || state.finished || nextEdition(state.minute) > LAST_EDITION) return false;
  if (allegation === 'knowledge' && !['coordination', 'policing'].every(id => state.newsroom.cases[id as Allegation]?.approvedAt != null)) return false;
  c.approvedAt = state.minute; c.editionAt = nextEdition(state.minute);
  return true;
}

type Boundary = { at: number; phase: number; id: string; apply: () => void };
/** Bounded chronological transactions; sleeping uses this path without stepping physics. */
export function advanceCampaignTo(state: Campaign, requested: number, flags: readonly string[] = []): boolean {
  if (!Number.isFinite(requested) || requested < state.minute || state.finished) return false;
  const target = Math.min(CAMPAIGN_END, requested);
  let changed = target !== state.minute;
  // At most eight world operations, fifteen authentications, three editions and reactions.
  for (let work = 0; work < 100; work++) {
    const due: Boundary[] = [];
    for (const op of worldOperations) if (!Object.hasOwn(state.occurrences, op.id) && op.at <= target) due.push({ at: op.at, phase: 0, id: op.id, apply: () => {
      const outcome = op.tenantOutcome ? flags.includes('tenant-interview-reached') ? 'tenancy-review' : 'closed' : 'occurred';
      state.occurrences[op.id] = { at: op.at, outcome };
      Object.assign(state.world, op.changes, op.tenantOutcome ? { cafe: outcome } : {});
    } });
    for (const [id, r] of Object.entries(state.newsroom.received)) if (r.verifiedAt === null && r.at + VERIFICATION_MINUTES <= target) due.push({ at: r.at + VERIFICATION_MINUTES, phase: 1, id, apply: () => {
      r.verifiedAt = r.at + VERIFICATION_MINUTES; verifyCases(state, r.verifiedAt);
    } });
    for (const [index, allegation] of allegations.entries()) {
      const c = state.newsroom.cases[allegation];
      if (c?.editionAt != null && c.editionAt <= Math.min(target, LAST_EDITION) && !state.publications.some(p => p.allegation === allegation)) due.push({ at: c.editionAt, phase: 2 + index, id: `edition-${allegation}`, apply: () => {
        const ready = allegation !== 'knowledge' || ['coordination', 'policing'].every(id => state.publications.some(p => p.allegation === id));
        state.occurrences[`edition-${allegation}`] = { at: c.editionAt!, outcome: ready ? 'published' : 'held' };
        if (ready) state.publications.push({ allegation, submittedShift: campaignDay(c.verifiedAt - VERIFICATION_MINUTES), publishedShift: campaignDay(c.editionAt!), at: c.editionAt! });
        else c.editionAt = null;
      } });
      const pub = state.publications.find(p => p.allegation === allegation);
      if (pub && !state.reactions[allegation] && pub.at + REACTION_MINUTES <= target) due.push({ at: pub.at + REACTION_MINUTES, phase: 5, id: `reaction-${allegation}`, apply: () => {
        const at = pub.at + REACTION_MINUTES;
        state.reactions[allegation] = { at }; state.occurrences[`reaction-${allegation}`] = { at, outcome: 'occurred' };
        if (allegation === 'coordination') state.world.security = 'suspended';
        if (allegation === 'policing') state.world.patrol = 'inquiry';
        if (allegation === 'knowledge') state.world.appearance = 'cancelled';
      } });
    }
    due.sort((a, b) => a.at - b.at || a.phase - b.phase || a.id.localeCompare(b.id));
    if (!due.length) { state.minute = target; state.shift = campaignDay(target); state.finished = target === CAMPAIGN_END; return changed; }
    const next = due[0]; state.minute = Math.max(state.minute, next.at); next.apply(); changed = true;
  }
  throw new Error('Campaign scheduler exceeded its authored work budget');
}

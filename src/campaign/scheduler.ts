import { campaignDefinition } from './content';
import { CAMPAIGN_END, LAST_EDITION, campaignDay } from './clock';
import { dispatchCampaignEvent, reduceCampaignEvent, settleCases } from './events';
import { campaignTransaction } from './effects';
import { campaignCondition } from '../missions/conditions';
import { defaultMissionProgress } from '../missions/progress';
import { claimOrder, conditionTimes } from './validate';
import type { Allegation, CampaignContext, CampaignDefinition, CampaignInputs, CampaignEvent, WorldOperation } from './model';
import type { Campaign } from './state';

export const VERIFICATION_MINUTES = 180;
export const REACTION_MINUTES = 120;
const context = (state: Campaign, inputs: CampaignInputs, definition: CampaignDefinition): CampaignContext => ({ ...inputs, state, definition });

export function receiveMaterial(state: Campaign, id: string, inputs: CampaignInputs = {}, definition = campaignDefinition): boolean {
  return dispatchCampaignEvent(context(state, inputs, definition), { type: 'material-submitted', id });
}
export function approvePublication(state: Campaign, allegation: Allegation, inputs: CampaignInputs = {}, definition = campaignDefinition): boolean {
  return dispatchCampaignEvent(context(state, inputs, definition), { type: 'publication-requested', id: allegation });
}
export function operationOutcome(op: WorldOperation, ctx: CampaignContext) {
  const outcome = op.outcomes?.find(o => campaignCondition(o.requires, ctx.state, ctx));
  return { outcome: outcome?.id ?? 'occurred', effects: [...op.effects, ...(outcome?.effects ?? [])] };
}

type Boundary = { at: number; phase: number; id: string; event: () => CampaignEvent };
/** All skipping and live-time boundaries use the same atomic event reducer. */
export function advanceCampaignTo(state: Campaign, requested: number, inputs: CampaignInputs | readonly string[] = {}, definition = campaignDefinition): boolean {
  if (!Number.isFinite(requested) || requested < state.minute || state.finished) return false;
  const resolved: CampaignInputs = Array.isArray(inputs) ? { progress: { ...defaultMissionProgress(), flags: [...inputs] } } : inputs as CampaignInputs;
  return campaignTransaction(context(state, resolved, definition), ctx => {
    const s = ctx.state, target = Math.min(CAMPAIGN_END, requested), claims = claimOrder(definition);
    let changed = target !== s.minute;
    // Derived from validated content, rather than a story-specific event count.
    const times = [...new Set(claims.flatMap(id => conditionTimes(definition.claims[id].verifyRequires)))];
    const budget = definition.operations.length + Object.keys(definition.materials).length + claims.length * 3 + times.length + 2;
    for (let work = 0; work < budget; work++) {
      if (settleCases(ctx)) changed = true;
      const due: Boundary[] = [];
      for (const at of times) if (at > s.minute && at <= target) due.push({ at, phase: 0, id: `clock-${at}`, event: () => ({ type: 'clock', at }) });
      for (const op of definition.operations) if (!Object.hasOwn(s.occurrences, op.id) && op.at <= target) due.push({ at: op.at, phase: 0, id: op.id, event: () => ({ type: 'operation', id: op.id, ...operationOutcome(op, ctx) }) });
      for (const [id, r] of Object.entries(s.newsroom.received)) if (r.verifiedAt === null && r.at + VERIFICATION_MINUTES <= target) due.push({ at: r.at + VERIFICATION_MINUTES, phase: 1, id, event: () => ({ type: 'material-verified', id, at: r.at + VERIFICATION_MINUTES }) });
      for (const [index, id] of claims.entries()) {
        const c = s.newsroom.cases[id];
        if (c?.editionAt != null && c.editionAt <= Math.min(target, LAST_EDITION) && !s.publications.some(p => p.allegation === id)) due.push({ at: c.editionAt, phase: 3 + index, id: `edition-${id}`, event: () => ({ type: 'edition', id, at: c.editionAt! }) });
        const pub = s.publications.find(p => p.allegation === id);
        if (pub && !s.reactions[id] && pub.at + REACTION_MINUTES <= target) due.push({ at: pub.at + REACTION_MINUTES, phase: 3 + claims.length, id: `reaction-${id}`, event: () => ({ type: 'reaction', id, at: pub.at + REACTION_MINUTES }) });
      }
      due.sort((a, b) => a.at - b.at || a.phase - b.phase || a.id.localeCompare(b.id));
      if (!due.length && s.minute !== target) { s.minute = target; s.shift = campaignDay(target); continue; }
      if (!due.length) { s.minute = target; s.shift = campaignDay(target); s.finished = target === CAMPAIGN_END; return changed; }
      const next = due[0]; s.minute = Math.max(s.minute, next.at); s.shift = campaignDay(s.minute);
      reduceCampaignEvent(ctx, next.event()); changed = true;
    }
    throw new Error('Campaign scheduler exceeded its authored work budget');
  });
}

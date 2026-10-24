import { campaignCondition } from '../missions/conditions';
import type { CampaignContext, CampaignEvent, WorldOperation } from './model';
import { applyEffectsTo, campaignTransaction, recordNote } from './effects';
import { campaignDay, nextEdition } from './clock';
import { campaignDefinition } from './content';
import { assertCampaignDefinition, claimOrder } from './validate';

export type Occurrence = { at: number; outcome: string };
export type { WorldState, WorldOperation } from './model';
export const worldOperations = campaignDefinition.operations;
export const defaultWorld = () => ({ ...campaignDefinition.initialWorld });
export const assertWorldOperations = (operations: readonly WorldOperation[]) => assertCampaignDefinition({ ...campaignDefinition, operations });

export function scheduledEdition(at: number, timing: CampaignContext['definition']['timing']): number | null {
  const edition = nextEdition(at, timing);
  return edition <= timing.lastEdition ? edition : null;
}

/** Typed reducer. Authored handlers see the event's result, in author order. */
export function reduceCampaignEvent(ctx: CampaignContext, event: CampaignEvent): boolean {
  const s = ctx.state;
  const id = 'id' in event ? event.id : 'missionId' in event ? event.missionId : event.type === 'choice' ? event.group : undefined;
  switch (event.type) {
    case 'material-submitted':
      if (s.finished || s.minute >= ctx.definition.timing.lastEdition || !Object.hasOwn(ctx.definition.materials, event.id) || Object.hasOwn(s.newsroom.received, event.id)) return false;
      s.newsroom.received[event.id] = { at: s.minute, verifiedAt: null }; break;
    case 'operation':
      if (s.occurrences[event.id]) return false;
      s.occurrences[event.id] = { at: s.minute, outcome: event.outcome };
      applyEffectsTo(ctx.progress, event.effects, ctx); break;
    case 'material-verified': {
      const r = s.newsroom.received[event.id]; if (!r || r.verifiedAt !== null) return false;
      r.verifiedAt = event.at; break;
    }
    case 'case-verified':
      if (s.newsroom.cases[event.id]) return false;
      s.newsroom.cases[event.id] = { verifiedAt: event.at, editionAt: scheduledEdition(event.at, ctx.definition.timing) }; break;
    case 'edition': {
      const c = s.newsroom.cases[event.id], claim = ctx.definition.claims[event.id];
      if (!c || !claim || s.publications.some(p => p.allegation === event.id)) return false;
      const ready = campaignCondition(claim.publishRequires, s, ctx);
      s.occurrences[`edition-${event.id}`] = { at: event.at, outcome: ready ? 'published' : 'held' };
      if (ready) s.publications.push({ allegation: event.id, submittedShift: campaignDay(c.verifiedAt - 180, ctx.definition.timing), publishedShift: campaignDay(event.at, ctx.definition.timing), at: event.at });
      else c.editionAt = scheduledEdition(event.at, ctx.definition.timing);
      break;
    }
    case 'reaction':
      if (s.reactions[event.id]) return false;
      s.reactions[event.id] = { at: event.at }; s.occurrences[`reaction-${event.id}`] = { at: event.at, outcome: 'occurred' };
      applyEffectsTo(ctx.progress, ctx.definition.claims[event.id].reactionEffects, ctx); break;
    case 'observation': {
      const observation = ctx.definition.observations.find(o => o.id === event.id);
      if (!observation || !campaignCondition(observation.requires, s, ctx)) return false;
      applyEffectsTo(ctx.progress, [{ acquireMaterial: event.id }], ctx); break;
    }
    case 'ride-completed':
      s.ordinarySinceStory = event.missionId && ctx.definition.missions.missions[event.missionId]?.category !== 'side-quest' ? 0 : Math.min(2, s.ordinarySinceStory + 1);
      if (!event.missionId) s.regularRides[event.name] = (s.regularRides[event.name] ?? 0) + 1;
      recordNote(ctx, event.receipt); break;
    case 'stopover-completed': {
      const stopover = ctx.definition.stopovers?.[event.missionId];
      if (!stopover) return false;
      applyEffectsTo(ctx.progress, stopover.effects, ctx); break;
    }
  }
  const inputs = event.type === 'ride-completed' && Number.isFinite(event.comfort) ? { ...ctx, ride: { comfort: event.comfort! } } : ctx;
  for (const handler of ctx.definition.handlers) if (handler.on === event.type && (handler.id === undefined || handler.id === id) && campaignCondition(handler.requires, s, inputs)) applyEffectsTo(ctx.progress, handler.effects, ctx);
  if (event.type !== 'case-verified') settleCases(ctx);
  return true;
}

/** Reevaluate storylets after every domain transition, at that exact campaign time. */
export function settleCases(ctx: CampaignContext): number {
  const ids = claimOrder(ctx.definition); let admitted = 0;
  for (let pass = 0; pass < ids.length; pass++) {
    const before = admitted;
    for (const id of ids) {
      const claim = ctx.definition.claims[id];
      if (ctx.state.newsroom.cases[id] || !claim.routes.some(route => route.every(material => ctx.state.newsroom.received[material]?.verifiedAt != null)) || !campaignCondition(claim.verifyRequires, ctx.state, ctx)) continue;
      reduceCampaignEvent(ctx, { type: 'case-verified', id, at: ctx.state.minute }); admitted++;
    }
    if (admitted === before) break;
  }
  return admitted;
}

export function dispatchCampaignEvent(ctx: CampaignContext, event: CampaignEvent): boolean {
  return campaignTransaction(ctx, draft => reduceCampaignEvent(draft, event));
}

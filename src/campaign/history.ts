import { campaignDay } from './clock';
import type { CampaignDefinition } from './model';
import type { Campaign } from './state';

/** Scheduling, save parsing and historical projections share the same tie-breaks. */
export const compareCampaignBoundaries = (a: { at: number; phase: number; id: string }, b: { at: number; phase: number; id: string }) => a.at - b.at || a.phase - b.phase || a.id.localeCompare(b.id);

/** Rebuild scheduled facts for edition predicates, without replaying gameplay effects. */
export function campaignAt(state: Campaign, at: number, definition: CampaignDefinition): Campaign {
  const history: Campaign = {
    ...state, minute: at, shift: campaignDay(at, definition.timing), finished: at >= definition.timing.end,
    editions: [], world: { ...definition.initialWorld },
    // User actions have no print-order ledger, so briefs cannot inspect these.
    newsroom: { received: {}, cases: {} },
    publications: state.publications.filter(p => p.at <= at),
    reactions: Object.fromEntries(Object.entries(state.reactions).filter(([, r]) => r && r.at <= at)),
    occurrences: Object.fromEntries(Object.entries(state.occurrences).filter(([, o]) => o.at <= at)),
  };
  const effects = [
    ...definition.operations.filter(op => history.occurrences[op.id]).map(op => ({ at: op.at, phase: 0, id: op.id,
      effects: [...op.effects, ...(op.outcomes?.find(outcome => outcome.id === history.occurrences[op.id].outcome)?.effects ?? [])] })),
    ...Object.entries(history.reactions).map(([id, reaction]) => ({ at: reaction!.at, phase: 1, id: `reaction-${id}`, effects: definition.claims[id].reactionEffects })),
  ].sort(compareCampaignBoundaries);
  for (const event of effects) for (const effect of event.effects) if ('setWorld' in effect) history.world[effect.setWorld.key] = effect.setWorld.value;
  return history;
}

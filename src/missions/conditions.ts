import type { CampaignInputs } from '../campaign/model';
import type { Campaign } from '../campaign/state';
import type { MissionProgress } from './progress';
import type { Condition } from './schema';

export type ConditionContext = CampaignInputs & {
  campaign?: Campaign; minute?: number; shift?: number; deliveries?: number; careerDeliveries?: number;
};

/** One predicate interpreter for mission offers, scheduled outcomes and presentation. */
export function evaluateCondition(condition: Condition, ctx: ConditionContext): boolean {
  const p = ctx.progress, s = ctx.campaign;
  if ('all' in condition) return condition.all.every(c => evaluateCondition(c, ctx));
  if ('any' in condition) return condition.any.some(c => evaluateCondition(c, ctx));
  if ('not' in condition) return !evaluateCondition(condition.not, ctx);
  if ('missionCompleted' in condition) return p?.completed.includes(condition.missionCompleted) ?? false;
  if ('flag' in condition) return p?.flags.includes(condition.flag) ?? false;
  if ('choiceEquals' in condition) return p?.choices[condition.choiceEquals.group] === condition.choiceEquals.choice;
  if ('choiceUnset' in condition) return p?.choices[condition.choiceUnset] === undefined;
  if ('minDeliveries' in condition) return (ctx.deliveries ?? 0) >= condition.minDeliveries;
  if ('minCareerDeliveries' in condition) return (ctx.careerDeliveries ?? 0) >= condition.minCareerDeliveries;
  if ('minuteAtLeast' in condition) return (ctx.minute ?? s?.minute ?? 420) >= condition.minuteAtLeast;
  if ('minuteBefore' in condition) return (ctx.minute ?? s?.minute ?? 420) < condition.minuteBefore;
  if ('shiftAtLeast' in condition) return (ctx.shift ?? s?.shift ?? 1) >= condition.shiftAtLeast;
  if ('shiftAtMost' in condition) return (ctx.shift ?? s?.shift ?? 1) <= condition.shiftAtMost;
  if ('chapter' in condition) return (p?.chapter ?? 1) >= condition.chapter;
  if ('worldEquals' in condition) return s?.world[condition.worldEquals.key] === condition.worldEquals.value;
  if ('worldAtLeast' in condition) { const value = s?.world[condition.worldAtLeast.key]; return typeof value === 'number' && value >= condition.worldAtLeast.value; }
  if ('knows' in condition) return ctx.records?.notebook.some(e => e.id === condition.knows) ?? false;
  if ('materialState' in condition) {
    const r = s?.newsroom.received[condition.materialState.id];
    return !!r && (condition.materialState.state === 'received' || r.verifiedAt !== null);
  }
  if ('caseState' in condition) {
    const c = s?.newsroom.cases[condition.caseState.id];
    return !!c && (condition.caseState.state === 'verified' || c.approvedAt !== null);
  }
  if ('published' in condition) return s?.publications.some(p => p.allegation === condition.published) ?? false;
  if ('reacted' in condition) return !!s?.reactions[condition.reacted];
  if ('occurred' in condition) return !!s?.occurrences[condition.occurred];
  if ('relationshipAtLeast' in condition) return (p?.relationships[condition.relationshipAtLeast.character] ?? 0) >= condition.relationshipAtLeast.value;
  if ('rideComfortAtLeast' in condition) return ctx.ride !== undefined && ctx.ride.comfort >= condition.rideComfortAtLeast;
  const exhaustive: never = condition; throw new Error(`Unknown condition: ${JSON.stringify(exhaustive)}`);
}

export function campaignCondition(condition: Condition | undefined, state: Campaign, inputs: CampaignInputs = {}): boolean {
  return !condition || evaluateCondition(condition, { ...inputs, campaign: state });
}

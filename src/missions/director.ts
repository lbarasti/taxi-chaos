import type { BeatId, StoryMessage } from '../story';
import type { VehicleModel, VehicleRole } from '../vehicles';
import type { CompiledChoiceGroup, CompiledChoiceOption, CompiledMission, CompiledMissions } from './compile';
import { clearMissionProgress, cloneMissionProgress, type MissionProgress } from './progress';
import type { ChoiceGroupId, ChoiceId, Condition, Effect, MissionId } from './schema';

export type MissionStatus = 'locked' | 'available' | 'active' | 'completed';

export type AbandonReason =
  | 'replaced' | 'customer-lost' | 'left-vehicle' | 'ejected'
  | 'hospital' | 'arrested' | 'reset' | 'shift' | 'vehicle-change';

export type DirectorContext = Readonly<{
  deliveries: number;
  careerDeliveries?: number;
  jobType: 'fare' | 'parcel';
  model: VehicleModel;
  kind: VehicleRole;
  time: number;
}>;

export type MissionEvent =
  | { type: 'accepted'; missionId: MissionId; at: number }
  | { type: 'pickup'; missionId: MissionId; at: number }
  | { type: 'completed'; missionId: MissionId; at: number }
  | { type: 'abandoned'; missionId: MissionId; reason: AbandonReason; at: number }
  | { type: 'choice'; group: ChoiceGroupId; choice: ChoiceId; at: number };

export type PickupOutcome = Readonly<{ missionId: MissionId | null; beatId: BeatId | null; message: StoryMessage | null }>;

export type DirectorSnapshot = Readonly<{
  activeId: MissionId | null;
  pickedUp: boolean;
  progress: MissionProgress;
  events: readonly MissionEvent[];
}>;

const NOTHING: PickupOutcome = Object.freeze({ missionId: null, beatId: null, message: null });

/**
 * DOM-free mission engine. It owns the persistent story progress (shared by
 * reference with the save), the transient active mission and a bounded lifecycle
 * event log for the upcoming multi-offer and choice UI.
 *
 * Every lifecycle mutation stages its effects on a detached copy of the progress
 * and only commits when the whole plan validates, so a rejected policy or a
 * contradictory choice can never leave partial progress behind.
 */
export class MissionDirector {
  activeId: MissionId | null = null;
  private pickedUp = false;
  private selections: Record<string, string> = {};
  private events: MissionEvent[] = [];

  constructor(readonly catalogue: CompiledMissions, public progress: MissionProgress) {}

  mission(id: MissionId): CompiledMission { return this.catalogue.missions[id]; }
  get active(): CompiledMission | null { return this.activeId ? this.mission(this.activeId) : null; }
  get log(): readonly MissionEvent[] { return this.events; }
  relationship(character: string): number { return this.progress.relationships[character] ?? 0; }

  /** Central vehicle gate: whether this mission permits the given ride context. */
  canRide(id: MissionId, ctx: DirectorContext): boolean {
    const mission = this.mission(id);
    return !!mission && this.allowedFor(mission, ctx);
  }

  private push(event: MissionEvent): MissionEvent {
    this.events.push(event);
    if (this.events.length > 32) this.events.shift();
    return event;
  }

  /** Commits a detached draft only after the whole plan builds without conflict. */
  private transact(events: MissionEvent[], build: (draft: MissionProgress) => void): void {
    const draft = cloneMissionProgress(this.progress);
    build(draft);
    this.progress.chapter = draft.chapter;
    this.progress.completed = draft.completed;
    this.progress.failed = draft.failed;
    this.progress.flags = draft.flags;
    this.progress.choices = draft.choices;
    this.progress.relationships = draft.relationships;
    this.progress.retryAt = draft.retryAt;
    for (const event of events) this.push(event);
  }

  /** Offers outstanding story missions in authored chapter then catalogue order. */
  available(ctx: DirectorContext): MissionId[] {
    return this.catalogue.order.filter(id => this.canOffer(this.mission(id), ctx))
      .sort((a, b) => this.mission(a).chapter - this.mission(b).chapter || this.catalogue.order.indexOf(a) - this.catalogue.order.indexOf(b));
  }

  nextOffer(ctx: DirectorContext): MissionId | null {
    return this.available(ctx)[0] ?? null;
  }

  status(id: MissionId, ctx: DirectorContext): MissionStatus {
    const mission = this.mission(id);
    if (this.activeId === id) return 'active';
    if (this.progress.completed.includes(id) && mission.repeat === 'once') return 'completed';
    return this.canOffer(mission, ctx) ? 'available' : 'locked';
  }

  /** Locks the next mission in for the current fare without consuming RNG. */
  begin(id: MissionId, ctx: DirectorContext): boolean {
    if (this.activeId === id) return true;
    // A different mission already owns the fare; callers must abandon it first.
    if (this.activeId !== null) return false;
    const mission = this.mission(id);
    if (!this.canOffer(mission, ctx)) return false;
    this.activeId = id;
    this.selections = {};
    this.pickedUp = false;
    this.push({ type: 'accepted', missionId: id, at: ctx.time });
    return true;
  }

  /**
   * Resolves the pickup beat (sender variant on a parcel run) and commits pickup
   * choices as one transaction. When the ride no longer satisfies the mission's
   * policy it returns nothing and leaves all progress and lifecycle state intact
   * for the caller to abandon explicitly.
   */
  pickup(ctx: DirectorContext): PickupOutcome {
    const mission = this.active;
    if (!mission || this.pickedUp) return NOTHING;
    if (!this.allowedFor(mission, ctx)) return NOTHING;
    const events: MissionEvent[] = [{ type: 'pickup', missionId: mission.id, at: ctx.time }];
    this.transact(events, draft => {
      if (mission.pickupChoice) {
        const group = this.findGroup(mission.pickupChoice.group)!;
        const option = group.options.find(o => o.id === mission.pickupChoice!.choice)!;
        if (option.requires && !this.evaluateWith(draft, option.requires, ctx)) throw new Error(`Pickup choice ${option.id} is no longer eligible`);
        this.commitOptionTo(draft, group, option, ctx.time, events);
      }
      for (const group of mission.choices) if (group.commit === 'pickup') this.commitDefaultTo(draft, group, ctx, events);
    });
    this.pickedUp = true;
    const beat = ctx.jobType === 'parcel' && mission.beats.pickupSender ? mission.beats.pickupSender : mission.beats.pickup;
    return Object.freeze({ missionId: mission.id, beatId: beat.beatId, message: beat.message });
  }

  /** Marks the delivery complete, applies mission effects once and is idempotent. */
  complete(ctx: DirectorContext): MissionId | null {
    const mission = this.active;
    // Delivery only settles a fare whose pickup beat has actually resolved.
    if (!mission || !this.pickedUp) return null;
    const events: MissionEvent[] = [];
    this.transact(events, draft => {
      for (const group of mission.choices) if (group.commit === 'completion') this.commitDefaultTo(draft, group, ctx, events);
      this.applyEffectsTo(draft, mission.effects);
      if (!draft.completed.includes(mission.id)) draft.completed.push(mission.id);
      events.push({ type: 'completed', missionId: mission.id, at: ctx.time });
    });
    this.activeId = null; this.pickedUp = false; this.selections = {};
    return mission.id;
  }

  /** Records an abandonment and applies the authored retry policy. */
  abandon(reason: AbandonReason, time: number): MissionId | null {
    const mission = this.active;
    if (!mission) return null;
    const { retry, cooldownSeconds } = mission.abandon;
    if (retry === 'never') {
      if (!this.progress.failed.includes(mission.id)) this.progress.failed.push(mission.id);
    } else if (retry === 'cooldown') {
      this.progress.retryAt[mission.id] = time + (cooldownSeconds ?? 0);
    }
    this.push({ type: 'abandoned', missionId: mission.id, reason, at: time });
    this.activeId = null; this.pickedUp = false; this.selections = {};
    return mission.id;
  }

  /**
   * Selects an option for the active mission. No progress or effects change until
   * pickup()/complete() reaches the group's authored boundary. Selections are
   * transient and discarded on abandonment; future missions cannot be selected.
   */
  commitChoice(groupId: ChoiceGroupId, choiceId: ChoiceId, ctx: DirectorContext): boolean {
    const group = this.findGroup(groupId);
    if (!group) throw new Error(`Unknown choice group ${groupId}`);
    const option = group.options.find(o => o.id === choiceId);
    if (!option) throw new Error(`Choice ${choiceId} is not an option of ${groupId}`);
    if (!this.active?.choices.some(g => g.id === groupId)) return false;
    const existing = this.progress.choices[groupId];
    if (existing === choiceId) return false;
    if (existing !== undefined) throw new Error(`Choice group ${groupId} is already committed to ${existing}`);
    if (group.commit === 'pickup' ? this.pickedUp : !this.pickedUp) return false;
    if (option.requires && !this.evaluate(option.requires, ctx)) return false;
    if (this.selections[groupId] === choiceId) return false;
    this.selections[groupId] = choiceId;
    return true;
  }

  private commitOptionTo(draft: MissionProgress, group: CompiledChoiceGroup, option: CompiledChoiceOption, time: number, events: MissionEvent[]): boolean {
    const existing = draft.choices[group.id];
    if (existing === option.id) return false;
    if (existing !== undefined) throw new Error(`Choice group ${group.id} is already committed to ${existing}`);
    // Pin the winning option before its effects run, so an option can never
    // silently overwrite the choice its own group just committed to.
    draft.choices[group.id] = option.id;
    this.applyEffectsTo(draft, option.effects);
    events.push({ type: 'choice', group: group.id, choice: option.id, at: time });
    return true;
  }

  private commitDefaultTo(draft: MissionProgress, group: CompiledChoiceGroup, ctx: DirectorContext, events: MissionEvent[]): void {
    if (draft.choices[group.id] !== undefined) return;
    const selected = this.selections[group.id];
    const option = selected ? group.options.find(o => o.id === selected) : group.options.find(o => o.default);
    if (selected && option?.requires && !this.evaluateWith(draft, option.requires, ctx)) throw new Error(`Selected choice ${selected} is no longer eligible`);
    if (option && (!option.requires || this.evaluateWith(draft, option.requires, ctx))) this.commitOptionTo(draft, group, option, ctx.time, events);
  }

  private findGroup(groupId: ChoiceGroupId): CompiledChoiceGroup | undefined {
    for (const mission of Object.values(this.catalogue.missions)) {
      const group = mission.choices.find(g => g.id === groupId);
      if (group) return group;
    }
    return undefined;
  }

  private canOffer(mission: CompiledMission, ctx: DirectorContext): boolean {
    if (mission.pickupChoice) {
      const { group, choice } = mission.pickupChoice;
      const existing = this.progress.choices[group];
      if (existing !== undefined && existing !== choice) return false;
      const option = this.findGroup(group)!.options.find(o => o.id === choice)!;
      if (option.requires && !this.evaluate(option.requires, ctx)) return false;
    }
    if (this.activeId === mission.id) return false;
    if (this.progress.failed.includes(mission.id)) return false;
    if (mission.repeat === 'once' && this.progress.completed.includes(mission.id)) return false;
    const until = this.progress.retryAt[mission.id];
    if (until !== undefined && ctx.time < until) return false;
    if (!this.allowedFor(mission, ctx)) return false;
    return this.evaluate(mission.requires, ctx);
  }

  private allowedFor(mission: CompiledMission, ctx: DirectorContext): boolean {
    if (!mission.allowed.jobs.includes(ctx.jobType)) return false;
    if (mission.allowed.models && !mission.allowed.models.includes(ctx.model)) return false;
    if (mission.allowed.kinds && !mission.allowed.kinds.includes(ctx.kind)) return false;
    return true;
  }

  evaluate(condition: Condition, ctx?: DirectorContext): boolean {
    return this.evaluateWith(this.progress, condition, ctx);
  }

  private evaluateWith(draft: MissionProgress, condition: Condition, ctx?: DirectorContext): boolean {
    if ('all' in condition) return condition.all.every(c => this.evaluateWith(draft, c, ctx));
    if ('any' in condition) return condition.any.some(c => this.evaluateWith(draft, c, ctx));
    if ('not' in condition) return !this.evaluateWith(draft, condition.not, ctx);
    if ('missionCompleted' in condition) return draft.completed.includes(condition.missionCompleted);
    if ('flag' in condition) return draft.flags.includes(condition.flag);
    if ('choiceEquals' in condition) return draft.choices[condition.choiceEquals.group] === condition.choiceEquals.choice;
    if ('choiceUnset' in condition) return draft.choices[condition.choiceUnset] === undefined;
    if ('minDeliveries' in condition) return (ctx?.deliveries ?? 0) >= condition.minDeliveries;
    if ('minCareerDeliveries' in condition) return (ctx?.careerDeliveries ?? 0) >= condition.minCareerDeliveries;
    return draft.chapter >= condition.chapter;
  }

  /** Applies a bounded effect list atomically: a conflict leaves progress untouched. */
  applyEffects(effects: readonly Effect[]): void {
    this.transact([], draft => this.applyEffectsTo(draft, effects));
  }

  private applyEffectsTo(draft: MissionProgress, effects: readonly Effect[]): void {
    const pending = new Map<string, string>();
    for (const effect of effects) {
      if ('setChoice' in effect) {
        const { group, choice } = effect.setChoice;
        const existing = draft.choices[group];
        if ((existing !== undefined && existing !== choice) || (pending.has(group) && pending.get(group) !== choice)) {
          throw new Error(`Conflicting setChoice for ${group}: ${existing ?? pending.get(group)} vs ${choice}`);
        }
        pending.set(group, choice);
      }
    }
    for (const effect of effects) {
      if ('setFlag' in effect) { if (!draft.flags.includes(effect.setFlag)) draft.flags.push(effect.setFlag); }
      else if ('clearFlag' in effect) { const i = draft.flags.indexOf(effect.clearFlag); if (i >= 0) draft.flags.splice(i, 1); }
      else if ('setChapter' in effect) { draft.chapter = Math.max(draft.chapter, effect.setChapter); }
      else if ('setChoice' in effect) { draft.choices[effect.setChoice.group] = effect.setChoice.choice; }
      else if ('relationship' in effect) { draft.relationships[effect.relationship.character] = Math.max(-1000, Math.min(1000, (draft.relationships[effect.relationship.character] ?? 0) + effect.relationship.delta)); }
    }
  }

  /** Clears story progress in place (explicit new-story reset). */
  reset(): void {
    clearMissionProgress(this.progress);
    this.activeId = null; this.pickedUp = false; this.selections = {}; this.events = [];
  }

  snapshot(): DirectorSnapshot {
    return Object.freeze({
      activeId: this.activeId,
      pickedUp: this.pickedUp,
      progress: cloneMissionProgress(this.progress),
      events: structuredClone(this.events),
    });
  }
}

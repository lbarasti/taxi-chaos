import catalogueData from './catalogue.json';
import stopsData from './stops.json';
import { campaignDefinition } from '../campaign/content';
import type { CampaignDefinition } from '../campaign/model';
import { assertCampaignDefinition } from '../campaign/validate';
import { isCharacterId, type CharacterId } from '../narrative/characters';
import { vehicleDefinitions, type VehicleModel, type VehicleRole } from '../vehicles/vehicles';
import { dist, type Vec } from '../physics';
import type { CompiledMap } from '../map/compile';
import { createNavigation } from '../world/world';
import type { BeatId, StoryCategory, StoryMessage } from '../narrative/story';
import { assertMissionCatalogue, type ChoiceGroupId, type ChoiceId, type Condition, type Effect, type MissionCatalogue, type MissionId } from './schema';
import { compileStops, type CompiledStops } from './stops';

export type CompiledDialogue = Readonly<{ beatId: BeatId; message: StoryMessage }>;

export type CompiledChoiceOption = Readonly<{ id: ChoiceId; effects: readonly Effect[]; requires?: Condition; default: boolean }>;
export type CompiledChoiceGroup = Readonly<{ id: ChoiceGroupId; commit: 'pickup' | 'completion'; options: readonly CompiledChoiceOption[] }>;

export type CompiledMission = Readonly<{
  id: MissionId;
  title: string;
  chapter: number;
  dispatchRadius: number;
  category: StoryCategory;
  repeat: 'once' | 'repeatable';
  abandon: Readonly<{ retry: 'always' | 'cooldown' | 'never'; cooldownSeconds?: number }>;
  passenger?: CharacterId;
  offer?: Readonly<{ messageId: string; character: CharacterId; text: string }>;
  pickupChoice?: Readonly<{ group: ChoiceGroupId; choice: ChoiceId }>;
  contactLost: Readonly<{ effects: readonly Effect[] }>;
  requires: Condition;
  allowed: Readonly<{ jobs: readonly ('fare' | 'parcel')[]; models?: readonly VehicleModel[]; kinds?: readonly VehicleRole[] }>;
  stopIds: Readonly<{ pickup: string; dropoff: string }>;
  stops: Readonly<{ pickup: Vec; dropoff: Vec }>;
  beats: Readonly<{ pickup: CompiledDialogue; pickupSender?: CompiledDialogue }>;
  choices: readonly CompiledChoiceGroup[];
  effects: readonly Effect[];
}>;

export type CompiledMissions = Readonly<{
  revision: string;
  schemaVersion: 1;
  stops: CompiledStops;
  dialogue: Readonly<Record<BeatId, StoryMessage>>;
  missions: Readonly<Record<MissionId, CompiledMission>>;
  order: readonly MissionId[];
  warnings: readonly Readonly<{ missionId: MissionId; message: string }>[];
}>;

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const defaultCatalogue = catalogueData as unknown as MissionCatalogue;
const defaultStops = stopsData as unknown;

const pathLength = (points: readonly Vec[]) => points.reduce((sum, p, i) => sum + (i ? dist(points[i - 1], p) : 0), 0);

function conditionRefs(condition: Condition, missions: (id: string) => void, groups: (group: ChoiceGroupId, choice?: ChoiceId) => void): void {
  if ('all' in condition) for (const child of condition.all) conditionRefs(child, missions, groups);
  else if ('any' in condition) for (const child of condition.any) conditionRefs(child, missions, groups);
  else if ('not' in condition) conditionRefs(condition.not, missions, groups);
  else if ('missionCompleted' in condition) missions(condition.missionCompleted);
  else if ('choiceEquals' in condition) groups(condition.choiceEquals.group, condition.choiceEquals.choice);
  else if ('choiceUnset' in condition) groups(condition.choiceUnset);
}

function effectRefs(effect: Effect, groups: (group: ChoiceGroupId, choice?: ChoiceId) => void, character: (id: string) => void): void {
  if ('setChoice' in effect) groups(effect.setChoice.group, effect.setChoice.choice);
  else if ('relationship' in effect) character(effect.relationship.character);
}

/**
 * Resolves and freezes an authored catalogue against the authoritative map and
 * character catalogue. DOM-free: it never touches the browser portrait registry.
 */
export function compileMissions(map: CompiledMap, catalogue: MissionCatalogue = defaultCatalogue, stops: unknown = defaultStops): CompiledMissions {
  assertMissionCatalogue(catalogue);
  const compiledStops = compileStops(stops, map);
  const navigation = createNavigation(map);

  const dialogue: Record<BeatId, StoryMessage> = {};
  for (const [beatId, beat] of Object.entries(catalogue.dialogue)) {
    if (!isCharacterId(beat.character)) throw new Error(`dialogue.${beatId}: unknown character ${beat.character}`);
    dialogue[beatId] = Object.freeze({ speaker: beat.character, category: beat.category, channel: beat.channel, text: beat.text });
  }

  const groups = new Map<ChoiceGroupId, Set<ChoiceId>>();
  for (const [missionId, mission] of Object.entries(catalogue.missions)) for (const group of mission.choices ?? []) {
    if (groups.has(group.id)) throw new Error(`mission ${missionId}: choice group ${group.id} must be unique across the catalogue`);
    groups.set(group.id, new Set(group.options.map(o => o.id)));
  }
  const requireGroup = (group: ChoiceGroupId, choice?: ChoiceId, where = 'reference') => {
    const options = groups.get(group);
    if (!options) throw new Error(`${where}: unknown choice group ${group}`);
    if (choice && !options.has(choice)) throw new Error(`${where}: choice ${choice} is not an option of ${group}`);
  };

  const order = Object.keys(catalogue.missions);
  const missions: Record<MissionId, CompiledMission> = {};
  const warnings: { missionId: MissionId; message: string }[] = [];
  for (const [missionId, mission] of Object.entries(catalogue.missions)) {
    const where = `mission ${missionId}`;
    if (mission.offer && !isCharacterId(mission.offer.character)) throw new Error(`${where}: unknown offer character ${mission.offer.character}`);
    if (mission.pickupChoice) {
      requireGroup(mission.pickupChoice.group, mission.pickupChoice.choice, where);
      const group = Object.values(catalogue.missions).flatMap(m => m.choices ?? []).find(g => g.id === mission.pickupChoice!.group)!;
      if (group.commit !== 'pickup') throw new Error(`${where}: pickupChoice requires a pickup group`);
    }
    if (mission.chapter > 1 && 'all' in mission.requires && mission.requires.all.length === 0) {
      warnings.push({ missionId, message: `Chapter ${mission.chapter} only ranks offers; empty prerequisites make this mission eligible in chapter 1. Add an explicit chapter prerequisite if intended.` });
    }
    const rawPassenger = mission.passenger;
    if (rawPassenger && !isCharacterId(rawPassenger)) throw new Error(`${where}: unknown passenger ${rawPassenger}`);
    const passenger: CharacterId | undefined = rawPassenger && isCharacterId(rawPassenger) ? rawPassenger : undefined;
    const allowed: { jobs: ('fare' | 'parcel')[]; models?: VehicleModel[]; kinds?: VehicleRole[] } = { jobs: [...mission.allowed.jobs] };
    if (mission.allowed.models) {
      for (const model of mission.allowed.models) if (!Object.hasOwn(vehicleDefinitions, model)) throw new Error(`${where}: unknown allowed model ${model}`);
      allowed.models = [...(mission.allowed.models as VehicleModel[])];
    }
    if (mission.allowed.kinds) allowed.kinds = [...mission.allowed.kinds];

    const pickupStop = compiledStops.byId[mission.stops.pickup];
    const dropoffStop = compiledStops.byId[mission.stops.dropoff];
    if (!pickupStop) throw new Error(`${where}: unknown pickup stop ${mission.stops.pickup}`);
    if (!dropoffStop) throw new Error(`${where}: unknown dropoff stop ${mission.stops.dropoff}`);
    if (mission.stops.pickup === mission.stops.dropoff) throw new Error(`${where}: pickup and dropoff must differ`);
    const route = navigation.roadPath(pickupStop.position, dropoffStop.position);
    if (route.length < 2 || pathLength(route) < 1) throw new Error(`${where}: no drivable route between ${mission.stops.pickup} and ${mission.stops.dropoff}`);

    const resolveBeat = (beatId: string | undefined, field: string): CompiledDialogue => {
      if (!beatId) throw new Error(`${where}: ${field} is required`);
      const message = dialogue[beatId];
      if (!message) throw new Error(`${where}: unknown dialogue beat ${beatId}`);
      return Object.freeze({ beatId, message });
    };

    conditionRefs(mission.requires, ref => { if (!Object.hasOwn(catalogue.missions, ref)) throw new Error(`${where}: requires unknown mission ${ref}`); }, (group, choice) => requireGroup(group, choice, where));

    const choices: CompiledChoiceGroup[] = (mission.choices ?? []).map(group => {
      const options: CompiledChoiceOption[] = group.options.map(option => {
        const effects = option.effects ?? [];
        for (const effect of effects) effectRefs(effect, (g, c) => requireGroup(g, c, `${where}.${group.id}`), ref => { if (!isCharacterId(ref)) throw new Error(`${where}: unknown relationship character ${ref}`); });
        if (option.requires) conditionRefs(option.requires, ref => { if (!Object.hasOwn(catalogue.missions, ref)) throw new Error(`${where}: option requires unknown mission ${ref}`); }, (g, c) => requireGroup(g, c, `${where}.${group.id}`));
        return Object.freeze({ id: option.id, effects: Object.freeze([...effects]), ...(option.requires ? { requires: option.requires } : {}), default: option.default === true });
      });
      return Object.freeze({ id: group.id, commit: group.commit, options: Object.freeze(options) });
    });

    const effects = mission.effects ?? [];
    const contactLostEffects = mission.contactLost?.effects ?? [];
    for (const effect of contactLostEffects) effectRefs(effect, (g, c) => requireGroup(g, c, `${where}.contactLost`), ref => { if (!isCharacterId(ref)) throw new Error(`${where}: unknown relationship character ${ref}`); });
    for (const effect of effects) effectRefs(effect, (g, c) => requireGroup(g, c, where), ref => { if (!isCharacterId(ref)) throw new Error(`${where}: unknown relationship character ${ref}`); });

    // Deterministic conflicts between unconditional assignments (mission effects
    // and default options) are rejected at compile time instead of at runtime.
    // A default option statically claims its own group, and its effects may claim
    // further groups; all of these run regardless of the player's input.
    const unconditional = new Map<string, { choice: string; source: string }>();
    const assign = (group: string, choice: string, source: string) => {
      const existing = unconditional.get(group);
      if (existing && existing.choice !== choice) throw new Error(`${where}: ${source} sets ${group}=${choice}, conflicting with ${existing.source}`);
      unconditional.set(group, { choice, source });
    };
    for (const effect of effects) if ('setChoice' in effect) assign(effect.setChoice.group, effect.setChoice.choice, 'effects');
    if (mission.pickupChoice) assign(mission.pickupChoice.group, mission.pickupChoice.choice, 'pickupChoice');
    for (const group of choices) {
      const fallback = group.options.find(o => o.default);
      if (!fallback) continue;
      const source = `default choice ${group.id}`;
      assign(group.id, fallback.id, source);
      for (const effect of fallback.effects) if ('setChoice' in effect) assign(effect.setChoice.group, effect.setChoice.choice, source);
    }

    missions[missionId] = Object.freeze({
      id: missionId,
      title: mission.title,
      chapter: mission.chapter,
      dispatchRadius: mission.dispatchRadius ?? 160,
      category: mission.category,
      repeat: mission.repeat,
      abandon: Object.freeze({ retry: mission.abandon.retry, ...(mission.abandon.cooldownSeconds !== undefined ? { cooldownSeconds: mission.abandon.cooldownSeconds } : {}) }),
      ...(passenger ? { passenger } : {}),
      ...(mission.offer ? { offer: { ...mission.offer, messageId: `${missionId}-text`, character: mission.offer.character as CharacterId } } : {}),
      ...(mission.pickupChoice ? { pickupChoice: { ...mission.pickupChoice } } : {}),
      contactLost: { effects: [...contactLostEffects] },
      requires: mission.requires,
      allowed: Object.freeze(allowed),
      stopIds: Object.freeze({ pickup: mission.stops.pickup, dropoff: mission.stops.dropoff }),
      stops: Object.freeze({ pickup: pickupStop.position, dropoff: dropoffStop.position }),
      beats: Object.freeze({ pickup: resolveBeat(mission.beats.pickup, 'beats.pickup'), ...(mission.beats.pickupSender ? { pickupSender: resolveBeat(mission.beats.pickupSender, 'beats.pickupSender') } : {}) }),
      choices: Object.freeze(choices),
      effects: Object.freeze([...effects]),
    });
  }

  // Authored prerequisite cycles would make their missions permanently unreachable.
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, trail: string[]): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') throw new Error(`mission prerequisite cycle: ${[...trail, id].join(' -> ')}`);
    state.set(id, 'visiting');
    const requires = missions[id].requires;
    const refs: string[] = [];
    conditionRefs(requires, ref => refs.push(ref), () => {});
    for (const ref of refs) visit(ref, [...trail, id]);
    state.set(id, 'done');
  };
  for (const id of order) visit(id, []);

  return deepFreeze({
    revision: `${map.revision}:${catalogue.schemaVersion}`,
    schemaVersion: 1 as const,
    stops: compiledStops,
    dialogue: Object.freeze(dialogue),
    missions: Object.freeze(missions),
    order: Object.freeze(order),
    warnings: Object.freeze(warnings),
  });
}

const cache = new WeakMap<object, CompiledMissions>();
const neutralCache = new WeakMap<object, CompiledMissions>();
const campaignCache = new WeakMap<object, CompiledMissions>();

export function campaignMissions(map: CompiledMap, definition: CampaignDefinition = campaignDefinition): CompiledMissions {
  assertCampaignDefinition(definition);
  if (definition !== campaignDefinition) return compileMissions(map, definition.missions);
  const cached = campaignCache.get(map);
  if (cached) return cached;
  const compiled = compileMissions(map, definition.missions);
  campaignCache.set(map, compiled);
  return compiled;
}

/** Compiled default catalogue, memoized per compiled map identity. */
export function missionsFor(map: CompiledMap): CompiledMissions {
  const cached = cache.get(map);
  if (cached) return cached;
  const compiled = compileMissions(map);
  cache.set(map, compiled);
  return compiled;
}

/**
 * Draft-safe director catalogue for isolated map previews: no missions or
 * dialogue, and stop geometry that never blocks a legitimate draft map. Normal
 * persistence-disabled gameplay still uses `missionsFor` so the lab keeps fresh
 * stories for story QA.
 */
export function neutralMissions(map: CompiledMap): CompiledMissions {
  const cached = neutralCache.get(map);
  if (cached) return cached;
  const compiled = deepFreeze({
    revision: `${map.revision}:neutral`,
    schemaVersion: 1 as const,
    stops: compileStops(defaultStops, map, false),
    dialogue: Object.freeze({}) as Readonly<Record<BeatId, StoryMessage>>,
    missions: Object.freeze({}) as Readonly<Record<MissionId, CompiledMission>>,
    order: Object.freeze([]) as readonly MissionId[],
    warnings: Object.freeze([]),
  });
  neutralCache.set(map, compiled);
  return compiled;
}

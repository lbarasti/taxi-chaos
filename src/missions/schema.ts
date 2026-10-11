import type { StoryCategory } from '../story';

export type MissionId = string;
export type FlagId = string;
export type ChoiceGroupId = string;
export type ChoiceId = string;

/** Authored prerequisite expressions. Bounded in depth and node count. */
export type Condition =
  | { all: readonly Condition[] }
  | { any: readonly Condition[] }
  | { not: Condition }
  | { missionCompleted: MissionId }
  | { flag: FlagId }
  | { choiceEquals: { group: ChoiceGroupId; choice: ChoiceId } }
  | { choiceUnset: ChoiceGroupId }
  | { minDeliveries: number }
  | { minCareerDeliveries: number }
  | { minuteAtLeast: number }
  | { minuteBefore: number }
  | { shiftAtLeast: number }
  | { shiftAtMost: number }
  | { chapter: number };

/** Authored outcome effects. Each list is bounded and applied atomically. */
export type Effect =
  | { setFlag: FlagId }
  | { clearFlag: FlagId }
  | { setChoice: { group: ChoiceGroupId; choice: ChoiceId } }
  | { setChapter: number }
  | { relationship: { character: string; delta: number } };

export type MissionDialogueBeat = Readonly<{
  character: string;
  category: StoryCategory;
  channel: 'passenger' | 'sender';
  text: string;
}>;

export type ChoiceOption = Readonly<{
  id: ChoiceId;
  effects?: readonly Effect[];
  requires?: Condition;
  default?: boolean;
}>;

export type ChoiceGroup = Readonly<{
  id: ChoiceGroupId;
  /** When the outcome is locked in: on the pickup stop, or on delivery. */
  commit: 'pickup' | 'completion';
  options: readonly ChoiceOption[];
}>;

export type Mission = Readonly<{
  title: string;
  chapter: number;
  dispatchRadius?: number;
  category: StoryCategory;
  repeat: 'once' | 'repeatable';
  abandon: Readonly<{ retry: 'always' | 'cooldown' | 'never'; cooldownSeconds?: number }>;
  /** Optional fare character used for the HUD name. */
  passenger?: string;
  /** Text offers stay unaccepted until the physical pickup. */
  offer?: Readonly<{ character: string; text: string }>;
  pickupChoice?: Readonly<{ group: ChoiceGroupId; choice: ChoiceId }>;
  /** A missing/dead waiting contact closes this opportunity, without resurrection. */
  contactLost?: Readonly<{ effects?: readonly Effect[] }>;
  requires: Condition;
  allowed: Readonly<{ jobs: readonly ('fare' | 'parcel')[]; models?: readonly string[]; kinds?: readonly ('taxi' | 'traffic' | 'police')[] }>;
  stops: Readonly<{ pickup: string; dropoff: string }>;
  beats: Readonly<{ pickup: string; pickupSender?: string }>;
  choices?: readonly ChoiceGroup[];
  effects?: readonly Effect[];
}>;

export type MissionCatalogue = Readonly<{
  schemaVersion: 1;
  dialogue: Readonly<Record<string, MissionDialogueBeat>>;
  missions: Readonly<Record<string, Mission>>;
}>;

export const missionLimits = Object.freeze({
  missions: 100, dialogue: 500, text: 600,
  conditionNodes: 64, conditionDepth: 8,
  effects: 16, choices: 12, options: 12,
});

const ID = /^[a-z][a-z0-9-]*$/;
const categories: readonly StoryCategory[] = ['plot', 'side-quest', 'lore'];
const missionKeys = ['title', 'chapter', 'category', 'repeat', 'abandon', 'requires', 'allowed', 'stops', 'beats'];

/** Strict shape checking bounds the authored workload before any resolver runs. */
export function assertMissionCatalogue(value: unknown): asserts value is MissionCatalogue {
  const fail = (path: string, why: string): never => { throw new Error(`${path}: ${why}`); };
  const object = (v: unknown, path: string, required: string[], optional: string[] = []): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(path, 'expected object');
    const obj = v as Record<string, unknown>;
    const allowed = [...required, ...optional];
    if (Object.keys(obj).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(obj, k))) fail(path, `expected fields ${required.join(', ')}${optional.length ? ` (optional ${optional.join(', ')})` : ''}`);
    return obj;
  };
  const text = (v: unknown, path: string, max = 160): string => typeof v === 'string' && v.length > 0 && v.length <= max ? v : fail(path, `expected nonempty string (max ${max})`);
  const id = (v: unknown, path: string): string => { const s = text(v, path, 80); if (!ID.test(s)) fail(path, 'expected a stable lowercase id'); return s; };
  const num = (v: unknown, path: string, min: number, max: number): number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail(path, `expected finite number in [${min}, ${max}]`);
  const int = (v: unknown, path: string, min: number, max: number): number => { const n = num(v, path, min, max); if (!Number.isInteger(n)) fail(path, 'expected integer'); return n; };
  const bool = (v: unknown, path: string) => typeof v === 'boolean' ? v : fail(path, 'expected boolean');
  const list = (v: unknown, path: string, min: number, max: number): unknown[] => Array.isArray(v) && v.length >= min && v.length <= max ? v : fail(path, `expected array (${min}–${max} items)`);
  const entries = (v: unknown, path: string, min: number, max: number): [string, unknown][] => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(path, 'expected object');
    const items = Object.entries(v as Record<string, unknown>);
    if (items.length < min || items.length > max) fail(path, `expected ${min}–${max} entries`);
    return items;
  };
  const oneOf = <T extends string>(v: unknown, path: string, values: readonly T[]): T => { if (typeof v !== 'string' || !values.includes(v as T)) fail(path, `expected one of ${values.join(', ')}`); return v as T; };

  // The node budget is per individual condition expression, so a catalogue with
  // many simple missions cannot exhaust a shared counter.
  const condition = (v: unknown, path: string): void => {
    let nodes = 0;
    const walk = (value: unknown, at: string, depth: number): void => {
      if (depth > missionLimits.conditionDepth) fail(at, 'condition nesting too deep');
      if (++nodes > missionLimits.conditionNodes) fail(at, `too many condition nodes (max ${missionLimits.conditionNodes})`);
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1) fail(at, 'condition must have exactly one operator');
      const key = Object.keys(value as object)[0];
      const obj = object(value, at, [key]);
      if (key === 'all' || key === 'any') {
        for (const [i, child] of list(obj[key], `${at}.${key}`, 0, missionLimits.conditionNodes).entries()) walk(child, `${at}.${key}[${i}]`, depth + 1);
        return;
      }
      switch (key) {
        case 'not': return walk(obj.not, `${at}.not`, depth + 1);
        case 'missionCompleted': id(obj.missionCompleted, `${at}.missionCompleted`); return;
        case 'flag': id(obj.flag, `${at}.flag`); return;
        case 'choiceUnset': id(obj.choiceUnset, `${at}.choiceUnset`); return;
        case 'minDeliveries': int(obj.minDeliveries, `${at}.minDeliveries`, 0, 1e9); return;
        case 'minCareerDeliveries': int(obj.minCareerDeliveries, `${at}.minCareerDeliveries`, 0, 1e9); return;
        case 'minuteAtLeast': case 'minuteBefore': int(obj[key], `${at}.${key}`, 420, 20580); return;
        case 'shiftAtLeast': case 'shiftAtMost': int(obj[key], `${at}.${key}`, 1, 14); return;
        case 'chapter': int(obj.chapter, `${at}.chapter`, 0, 1e6); return;
        case 'choiceEquals': { const p = object(obj.choiceEquals, `${at}.choiceEquals`, ['group', 'choice']); id(p.group, `${at}.choiceEquals.group`); id(p.choice, `${at}.choiceEquals.choice`); return; }
        default: return fail(at, `unknown condition operator ${key}`);
      }
    };
    walk(v, path, 0);
  };

  const effect = (v: unknown, path: string): void => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== 1) fail(path, 'effect must have exactly one operator');
    const key = Object.keys(v as object)[0];
    const obj = object(v, path, [key]);
    switch (key) {
      case 'setFlag': case 'clearFlag': id(obj[key], `${path}.${key}`); return;
      case 'setChapter': int(obj.setChapter, `${path}.setChapter`, 0, 1e6); return;
      case 'setChoice': { const p = object(obj.setChoice, `${path}.setChoice`, ['group', 'choice']); id(p.group, `${path}.setChoice.group`); id(p.choice, `${path}.setChoice.choice`); return; }
      case 'relationship': { const p = object(obj.relationship, `${path}.relationship`, ['character', 'delta']); id(p.character, `${path}.relationship.character`); num(p.delta, `${path}.relationship.delta`, -100, 100); return; }
      default: return fail(path, `unknown effect operator ${key}`);
    }
  };

  const effects = (v: unknown, path: string): void => {
    for (const [i, e] of list(v, path, 0, missionLimits.effects).entries()) effect(e, `${path}[${i}]`);
  };

  const root = object(value, 'catalogue', ['schemaVersion', 'dialogue', 'missions']);
  if (root.schemaVersion !== 1) fail('catalogue', 'unsupported schema version');

  for (const [beatId, raw] of entries(root.dialogue, 'dialogue', 1, missionLimits.dialogue)) {
    id(beatId, `dialogue.${beatId}`);
    const beat = object(raw, `dialogue.${beatId}`, ['character', 'category', 'channel', 'text']);
    id(beat.character, `dialogue.${beatId}.character`);
    oneOf(beat.category, `dialogue.${beatId}.category`, categories);
    oneOf(beat.channel, `dialogue.${beatId}.channel`, ['passenger', 'sender'] as const);
    text(beat.text, `dialogue.${beatId}.text`, missionLimits.text);
  }

  const groupIds = new Set<string>();
  for (const [missionId, raw] of entries(root.missions, 'missions', 1, missionLimits.missions)) {
    const path = `missions.${missionId}`;
    id(missionId, path);
    const mission = object(raw, path, missionKeys, ['passenger', 'choices', 'effects', 'dispatchRadius', 'offer', 'pickupChoice', 'contactLost']);
    if (mission.contactLost !== undefined) {
      const lost = object(mission.contactLost, `${path}.contactLost`, [], ['effects']);
      if (lost.effects !== undefined) effects(lost.effects, `${path}.contactLost.effects`);
    }
    if (mission.offer !== undefined) {
      const offer = object(mission.offer, `${path}.offer`, ['character', 'text']);
      id(offer.character, `${path}.offer.character`); text(offer.text, `${path}.offer.text`, missionLimits.text);
    }
    if (mission.pickupChoice !== undefined) {
      const choice = object(mission.pickupChoice, `${path}.pickupChoice`, ['group', 'choice']);
      id(choice.group, `${path}.pickupChoice.group`); id(choice.choice, `${path}.pickupChoice.choice`);
    }
    text(mission.title, `${path}.title`, 160);
    int(mission.chapter, `${path}.chapter`, 0, 1e6);
    if (Object.hasOwn(mission, 'dispatchRadius')) num(mission.dispatchRadius, `${path}.dispatchRadius`, 10, 1000);
    oneOf(mission.category, `${path}.category`, categories);
    oneOf(mission.repeat, `${path}.repeat`, ['once', 'repeatable'] as const);
    if (Object.hasOwn(mission, 'passenger')) id(mission.passenger, `${path}.passenger`);

    const abandon = object(mission.abandon, `${path}.abandon`, ['retry'], ['cooldownSeconds']);
    if (Object.hasOwn(abandon, 'cooldownSeconds')) num(abandon.cooldownSeconds, `${path}.abandon.cooldownSeconds`, 0.1, 1e6);
    const retry = oneOf(abandon.retry, `${path}.abandon.retry`, ['always', 'cooldown', 'never'] as const);
    if (retry === 'cooldown' && !Object.hasOwn(abandon, 'cooldownSeconds')) fail(`${path}.abandon`, 'cooldown retry needs cooldownSeconds');

    condition(mission.requires, `${path}.requires`);

    const allowed = object(mission.allowed, `${path}.allowed`, ['jobs'], ['models', 'kinds']);
    list(allowed.jobs, `${path}.allowed.jobs`, 1, 2).forEach((j, i) => oneOf(j, `${path}.allowed.jobs[${i}]`, ['fare', 'parcel'] as const));
    if (Object.hasOwn(allowed, 'models')) list(allowed.models, `${path}.allowed.models`, 1, 32).forEach((m, i) => text(m, `${path}.allowed.models[${i}]`, 80));
    if (Object.hasOwn(allowed, 'kinds')) list(allowed.kinds, `${path}.allowed.kinds`, 1, 8).forEach((k, i) => oneOf(k, `${path}.allowed.kinds[${i}]`, ['taxi', 'traffic', 'police'] as const));

    const stops = object(mission.stops, `${path}.stops`, ['pickup', 'dropoff']);
    id(stops.pickup, `${path}.stops.pickup`); id(stops.dropoff, `${path}.stops.dropoff`);

    const beats = object(mission.beats, `${path}.beats`, ['pickup'], ['pickupSender']);
    id(beats.pickup, `${path}.beats.pickup`);
    if (Object.hasOwn(beats, 'pickupSender')) id(beats.pickupSender, `${path}.beats.pickupSender`);

    if (Object.hasOwn(mission, 'effects')) effects(mission.effects, `${path}.effects`);
    if (Object.hasOwn(mission, 'choices')) {
      for (const [i, rawGroup] of list(mission.choices, `${path}.choices`, 0, missionLimits.choices).entries()) {
        const gpath = `${path}.choices[${i}]`;
        const group = object(rawGroup, gpath, ['id', 'commit', 'options']);
        const groupId = id(group.id, `${gpath}.id`);
        if (groupIds.has(groupId)) fail(`${gpath}.id`, 'choice group id must be unique across the catalogue');
        groupIds.add(groupId);
        oneOf(group.commit, `${gpath}.commit`, ['pickup', 'completion'] as const);
        const optionIds = new Set<string>();
        let defaults = 0;
        for (const [j, rawOption] of list(group.options, `${gpath}.options`, 1, missionLimits.options).entries()) {
          const opath = `${gpath}.options[${j}]`;
          const option = object(rawOption, opath, ['id'], ['effects', 'requires', 'default']);
          const optionId = id(option.id, `${opath}.id`);
          if (optionIds.has(optionId)) fail(`${opath}.id`, 'duplicate option id');
          optionIds.add(optionId);
          if (Object.hasOwn(option, 'effects')) effects(option.effects, `${opath}.effects`);
          if (Object.hasOwn(option, 'requires')) condition(option.requires, `${opath}.requires`);
          if (Object.hasOwn(option, 'default') && bool(option.default, `${opath}.default`)) defaults++;
        }
        if (defaults > 1) fail(gpath, 'at most one default option');
      }
    }
  }
}

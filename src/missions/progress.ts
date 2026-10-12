export const MISSION_PROGRESS_VERSION = 1;

/**
 * Persistent story progress. Versioned and saved beside the economy save; the
 * transient active mission, offer and dialogue are never serialized here.
 */
export type MissionProgress = {
  version: 1;
  chapter: number;
  completed: string[];
  failed: string[];
  flags: string[];
  choices: Record<string, string>;
  relationships: Record<string, number>;
  campaignSeconds: number;
  deliveries: number;
  retryAt: Record<string, number>;
};

const ID = /^[a-z][a-z0-9-]*$/;
const MAX_ENTRIES = 400;
const MAX_RELATIONSHIP = 1000;

export const defaultMissionProgress = (): MissionProgress =>
  ({ version: MISSION_PROGRESS_VERSION, chapter: 1, completed: [], failed: [], flags: [], choices: {}, relationships: {}, campaignSeconds: 0, deliveries: 0, retryAt: {} });

export function cloneMissionProgress(progress: MissionProgress): MissionProgress {
  return {
    version: MISSION_PROGRESS_VERSION,
    chapter: progress.chapter,
    completed: [...progress.completed],
    failed: [...progress.failed],
    flags: [...progress.flags],
    choices: { ...progress.choices },
    relationships: { ...progress.relationships },
    campaignSeconds: progress.campaignSeconds,
    deliveries: progress.deliveries,
    retryAt: { ...progress.retryAt },
  };
}

/** Resets story progress in place so callers holding the reference stay in sync. */
export function clearMissionProgress(progress: MissionProgress): MissionProgress {
  progress.version = MISSION_PROGRESS_VERSION;
  progress.chapter = 1;
  progress.campaignSeconds = 0;
  progress.deliveries = 0;
  progress.retryAt = {};
  progress.completed.length = 0;
  progress.failed.length = 0;
  progress.flags.length = 0;
  for (const key of Object.keys(progress.choices)) delete progress.choices[key];
  for (const key of Object.keys(progress.relationships)) delete progress.relationships[key];
  return progress;
}

const stringIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value.slice(0, MAX_ENTRIES)) if (typeof item === 'string' && ID.test(item) && !seen.has(item)) seen.add(item);
  return [...seen];
};

const choiceMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, choice] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ENTRIES)) {
    if (ID.test(key) && typeof choice === 'string' && ID.test(choice)) result[key] = choice;
  }
  return result;
};

const relationshipMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, amount] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ENTRIES)) {
    if (ID.test(key) && typeof amount === 'number' && Number.isFinite(amount)) result[key] = Math.max(-MAX_RELATIONSHIP, Math.min(MAX_RELATIONSHIP, amount));
  }
  return result;
};

const nonnegative = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, value)) : 0;

const deadlines = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, time] of Object.entries(value).slice(0, MAX_ENTRIES)) {
    if (ID.test(key) && typeof time === 'number' && Number.isFinite(time) && time >= 0) result[key] = nonnegative(time);
  }
  return result;
};

/** Validate the current story-progress snapshot; invalid records start a fresh story. */
export function parseMissionProgress(raw: unknown): MissionProgress {
  const fallback = defaultMissionProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const source = raw as Partial<Record<keyof MissionProgress, unknown>>;
  if (source.version !== MISSION_PROGRESS_VERSION) return fallback;
  const chapter = typeof source.chapter === 'number' && Number.isFinite(source.chapter) ? Math.max(0, Math.min(1e6, Math.floor(source.chapter))) : 1;
  return {
    version: MISSION_PROGRESS_VERSION,
    chapter,
    completed: stringIds(source.completed),
    failed: stringIds(source.failed),
    flags: stringIds(source.flags),
    choices: choiceMap(source.choices),
    relationships: relationshipMap(source.relationships),
    campaignSeconds: nonnegative(source.campaignSeconds),
    deliveries: Math.floor(nonnegative(source.deliveries)),
    retryAt: deadlines(source.retryAt),
  };
}

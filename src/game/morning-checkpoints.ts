import { campaignDefinition } from '../campaign/content';
import { campaignDays } from '../campaign/clock';
import type { CampaignDefinition } from '../campaign/model';
import { defaultSave, parseSave, type Save } from './save';
import { checkpointStorageKey, readStorage, writeStorage } from './storage';

export type MorningCheckpoint = { day: number; save: Save };
type Collection = { version: 1; campaignId: string; days: Record<string, unknown> };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Require complete current snapshot domains before using the save's normal parsers.
 * In particular, their fallback defaults must never turn a broken slot into New game. */
function hasShape(value: unknown, shape: unknown): boolean {
  if (shape === null) return true;
  if (Array.isArray(shape)) return Array.isArray(value);
  if (object(shape)) return object(value) && Object.entries(shape).every(([key, child]) => Object.hasOwn(value, key) && hasShape(value[key], child));
  return typeof value === typeof shape && (typeof value !== 'number' || Number.isFinite(value));
}
function parseCheckpoint(raw: unknown, day: number, definition: CampaignDefinition): Save | null {
  if (!Number.isInteger(day) || day < 1 || day > campaignDays(definition.timing) || !hasShape(raw, defaultSave(definition))) return null;
  const source = raw as Save;
  if (source.campaign.minute !== definition.timing.start + (day - 1) * 1440 || source.campaign.minute >= definition.timing.end || source.campaign.shift !== day || source.campaign.finished) return null;
  const save = parseSave(raw, definition);
  return save?.garage ? save : null;
}
function readCollection(definition: CampaignDefinition): Collection {
  const raw = readStorage(checkpointStorageKey(definition.id));
  if (raw === null) return { version: 1, campaignId: definition.id, days: {} };
  const value: unknown = JSON.parse(raw);
  if (!object(value) || value.version !== 1 || value.campaignId !== definition.id || !object(value.days)) throw new Error('Invalid morning checkpoint collection');
  return value as Collection;
}
export function readMorningCheckpoints(definition = campaignDefinition): MorningCheckpoint[] {
  try {
    const collection = readCollection(definition);
    const result: MorningCheckpoint[] = [];
    for (let day = 1; day <= campaignDays(definition.timing); day++) {
      const save = parseCheckpoint(collection.days[String(day)], day, definition);
      if (save) result.push({ day, save });
    }
    return result;
  } catch { return []; }
}
export function writeMorningCheckpoint(snapshot: Save, definition = campaignDefinition): boolean {
  const day = (snapshot.campaign.minute - definition.timing.start) / 1440 + 1;
  if (!parseCheckpoint(snapshot, day, definition)) return false;
  try {
    // Read/modify/write only this day. Preserve every other entry, including ones
    // this build cannot load. A failed read or atomic localStorage write leaves it intact.
    const collection = readCollection(definition);
    collection.days[String(day)] = snapshot;
    return writeStorage(checkpointStorageKey(definition.id), collection);
  } catch { return false; }
}

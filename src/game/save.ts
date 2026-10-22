import { clamp } from '../physics/physics';
import { defaultMissionProgress, parseMissionProgress, type MissionProgress } from '../missions/progress';
import { defaultPlayerRecords, parsePlayerRecords, type PlayerRecords } from '../narrative/player-records';
import { defaultCampaign, parseCampaign, type Campaign } from '../campaign/state';
import { campaignDefinition } from '../campaign/content';
import { parseGarage, legacyGarage, type GarageSave } from '../vehicles/garage-save';
import { readStorage, storageKeys } from './storage';

// One saved shift lasts until the next successful sleep, including reloads and recovery.
export type ShiftStats = { earnings: number; jobs: number; smashed: number; kills: number };
export const emptyShiftStats = (): ShiftStats => ({ earnings: 0, jobs: 0, smashed: 0, kills: 0 });
export type Save = { shiftStats: ShiftStats; cash: number; deliveries: number; garage: GarageSave | null; best: number; story: MissionProgress; playerRecords: PlayerRecords; campaign: Campaign };
export function defaultSave(definition = campaignDefinition): Save {
  const story = defaultMissionProgress(), playerRecords = defaultPlayerRecords();
  return { shiftStats: emptyShiftStats(), cash: 80, deliveries: 0, garage: null, best: 0, story, playerRecords, campaign: defaultCampaign(definition, { progress: story, records: playerRecords }) };
}
function parseShiftStats(value: unknown): ShiftStats {
  const stats = emptyShiftStats();
  for (const key of Object.keys(stats) as (keyof ShiftStats)[]) {
    const count = (value as Partial<ShiftStats> | null)?.[key];
    stats[key] = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  }
  return stats;
}
/** Rolling saves retain their existing tolerant normalization and legacy garage support. */
export function parseSave(s: any, definition = campaignDefinition): Save | null {
  try {
    if (!s || s.story?.version !== 1 || s.playerRecords?.version !== 1 || s.campaign?.version !== 2) return null;
    const d = defaultSave(definition);
    d.shiftStats = parseShiftStats(s.shiftStats);
    d.cash = clamp(Number(s.cash) || 0, 0, 1e7);
    d.deliveries = clamp(Number(s.deliveries) || 0, 0, 1e5);
    d.best = Number(s.best) || 0;
    d.story = parseMissionProgress(s.story);
    d.playerRecords = parsePlayerRecords(s.playerRecords);
    d.campaign = parseCampaign(s.campaign, definition, { progress: d.story, records: d.playerRecords });
    d.garage = s.garage ? parseGarage(s.garage) : s.upgrades ? legacyGarage(s.upgrades) : null;
    return d;
  } catch { return null; }
}
export function loadSave(definition = campaignDefinition): Save {
  try { return parseSave(JSON.parse(readStorage(storageKeys.save) ?? 'null'), definition) ?? defaultSave(definition); }
  catch { return defaultSave(definition); }
}

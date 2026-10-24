import type { StoryMessage } from '../narrative/story';
import { campaignDefinition } from './content';
import type { Campaign } from './state';
import type { CampaignDefinition, CampaignInputs, EverydayJob, EverydayJourney } from './model';
import { campaignCondition } from '../missions/conditions';

export function rideMessage(id: string, stage: 'during' | 'arrival', parcel = false, definition: CampaignDefinition = campaignDefinition, state?: Campaign, inputs: CampaignInputs = {}): StoryMessage | null {
  const mission = definition.missions.missions[id], lines = definition.rides[id];
  if (!mission || !lines) return null;
  const variant = state && definition.rideVariants?.[id]?.[stage]?.find(line => campaignCondition(line.requires, state, inputs));
  return { speaker: mission.passenger as StoryMessage['speaker'], category: mission.category, channel: parcel ? 'sender' : lines.channel ?? 'passenger', text: variant?.text ?? lines[stage] };
}
export const rideDialogueIds = Object.freeze(Object.keys(campaignDefinition.rides));

/** Select the whole booking before creating a job, so its route and voice agree. */
export function selectEverydayJourney(job: EverydayJob, completedCount: number, state: Campaign, inputs: CampaignInputs = {}, parcel = false): EverydayJourney | null {
  const eligible = (parcel ? job.parcelJourneys : job.journeys)?.filter(journey => campaignCondition(journey.requires, state, inputs)) ?? [];
  if (!eligible.length) return null;
  const index = Number.isFinite(completedCount) ? Math.max(0, Math.floor(completedCount)) : 0;
  return eligible[index % eligible.length];
}

/** Legacy/custom definitions retain their own voice; public news does not invent relatives. */
export function ordinaryDuring(name: string, _state: Campaign, _inputs: CampaignInputs = {}, definition: CampaignDefinition = campaignDefinition): string {
  return definition.everydayJobs.find(job => job.name === name)?.during ?? '';
}

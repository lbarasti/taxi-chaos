import type { StoryMessage } from '../narrative/story';
import { campaignDefinition } from './content';
import type { Campaign } from './state';
import type { CampaignDefinition, CampaignInputs } from './model';
import { campaignCondition } from '../missions/conditions';

export function rideMessage(id: string, stage: 'during' | 'arrival', parcel = false, definition: CampaignDefinition = campaignDefinition): StoryMessage | null {
  const mission = definition.missions.missions[id], lines = definition.rides[id];
  if (!mission || !lines) return null;
  return { speaker: mission.passenger as StoryMessage['speaker'], category: mission.category, channel: parcel ? 'sender' : lines.channel ?? 'passenger', text: lines[stage] };
}
export const rideDialogueIds = Object.freeze(Object.keys(campaignDefinition.rides));

export function ordinaryDuring(name: string, state: Campaign, inputs: CampaignInputs = {}, definition: CampaignDefinition = campaignDefinition): string {
  return definition.ordinaryResponses.find(r => campaignCondition(r.requires, state, inputs))?.text ?? definition.everydayJobs.find(job => job.name === name)?.during ?? '';
}

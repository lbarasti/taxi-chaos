import { campaignDefinition } from './content';
import { campaignCondition } from '../missions/conditions';
import type { Campaign } from './state';
import type { CampaignDefinition, CampaignInputs } from './model';

export function cityBulletin(state: Campaign, inputs: CampaignInputs = {}, definition: CampaignDefinition = campaignDefinition): string {
  return definition.bulletins.find(b => campaignCondition(b.requires, state, inputs))?.text ?? '';
}

import { describe, expect, it } from 'vitest';
import { campaignDefinition, everydayJobs } from './content';
import type { CampaignDefinition, EverydayJourney } from './model';
import { assertCampaignDefinition } from './validate';

const regular = everydayJobs[0], journey = regular.journeys![0];
const withJourney = (overrides: Partial<EverydayJourney>): CampaignDefinition => ({
  ...campaignDefinition, everydayJobs: [{ ...regular, journeys: [{ ...journey, ...overrides }] }],
});

describe('ordinary journey authoring validation', () => {
  it('accepts the authored bookings and legacy custom regulars without journey fields', () => {
    expect(() => assertCampaignDefinition(campaignDefinition)).not.toThrow();
    expect(() => assertCampaignDefinition({ ...campaignDefinition, everydayJobs: [{ character: 'eli', name: 'Ash', family: 'Festival staff', lines: ['Off to work.'], during: 'The lamps look lovely.' }] })).not.toThrow();
  });

  it('bounds journey IDs, text, distinct endpoints and pool sizes', () => {
    expect(() => assertCampaignDefinition(withJourney({ id: 'Invalid ID' }))).toThrow(/Invalid campaign id/);
    expect(() => assertCampaignDefinition(withJourney({ arrival: 'x'.repeat(601) }))).toThrow(/Invalid everyday journey/);
    expect(() => assertCampaignDefinition(withJourney({ roughArrival: ' ' }))).toThrow(/Invalid everyday journey/);
    expect(() => assertCampaignDefinition(withJourney({ dropoff: journey.pickup }))).toThrow(/Invalid everyday journey/);
    expect(() => assertCampaignDefinition({ ...campaignDefinition, everydayJobs: [{ ...regular, journeys: Array.from({ length: 17 }, (_, index) => ({ ...journey, id: `journey-${index}` })) }] })).toThrow(/Invalid everyday journeys/);
    expect(() => assertCampaignDefinition({ ...campaignDefinition, everydayJobs: [{ ...regular, journeys: [journey, journey] }] })).toThrow(/Duplicate everyday journey/);
  });

  it('validates journey prerequisites against campaign facts', () => {
    expect(() => assertCampaignDefinition(withJourney({ requires: { worldEquals: { key: 'nonexistent-world-key', value: true } } }))).toThrow(/Unknown world key/);
    expect(() => assertCampaignDefinition(withJourney({ requires: { missionCompleted: 'nonexistent-mission' } }))).toThrow(/Unknown mission/);
  });
});

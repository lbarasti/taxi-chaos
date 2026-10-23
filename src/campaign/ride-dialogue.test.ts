import { describe, expect, it } from 'vitest';
import { defaultCompiledMap } from '../map/compile';
import { defaultMissionProgress } from '../missions/progress';
import rawStops from '../missions/stops.json';
import { compileStops } from '../missions/stops';
import { campaignDefinition, everydayJobs } from './content';
import { dispatchCampaignEvent } from './events';
import type { CampaignDefinition, EverydayJob, EverydayJourney } from './model';
import { ordinaryDuring, rideMessage, selectEverydayJourney } from './ride-dialogue';
import { defaultCampaign } from './state';

describe('coherent ordinary bookings', () => {
  it('binds every fare and parcel to distinct valid stops and a complete conversation', () => {
    const stops = compileStops(rawStops, defaultCompiledMap);
    const ids = new Set<string>();
    for (const regular of everydayJobs) for (const journey of [...regular.journeys!, ...regular.parcelJourneys!]) {
      expect(ids.has(journey.id), journey.id).toBe(false); ids.add(journey.id);
      expect(stops.byId[journey.pickup], journey.id).toBeDefined();
      expect(stops.byId[journey.dropoff], journey.id).toBeDefined();
      expect(journey.pickup, journey.id).not.toBe(journey.dropoff);
      expect(journey.line.trim(), journey.id).not.toBe('');
      expect(journey.during.trim(), journey.id).not.toBe('');
      expect(journey.arrival.trim(), journey.id).not.toBe('');
      expect(journey.line.length, journey.id).toBeLessThanOrEqual(600);
      expect(journey.during.length, journey.id).toBeLessThanOrEqual(600);
      expect(journey.arrival.length, journey.id).toBeLessThanOrEqual(600);
    }
  });

  it('keeps the spoken purpose and route together after repeated visits', () => {
    const ravi = everydayJobs.find(job => job.character === 'ravi')!;
    const state = defaultCampaign();
    const first = selectEverydayJourney(ravi, 0, state)!;
    expect(first).toMatchObject({ id: 'ravi-arcade', dropoff: 'the-arcade' });
    expect(first.line).toContain('The Arcade');
    const later = Array.from({ length: 9 }, (_, i) => selectEverydayJourney(ravi, i + 3, state)!);
    expect(new Set(later.map(journey => journey.id)).size).toBe(3);
    for (const journey of later) expect(ravi.journeys).toContain(journey);
    // Count only selects another daily situation; it never starts a career milestone.
    expect(later.map(journey => journey.line).join(' ')).not.toMatch(/first payday|got the job|interview/i);
  });

  it('selects sender-specific parcel work without advancing a personal story', () => {
    const state = defaultCampaign(), before = structuredClone(state);
    for (const regular of everydayJobs) {
      const parcel = selectEverydayJourney(regular, 2, state, {}, true)!;
      expect(regular.parcelJourneys).toContain(parcel);
      expect(regular.journeys).not.toContain(parcel);
      expect(parcel.line).not.toContain('ordinary delivery');
    }
    expect(state).toEqual(before);
  });

  it('does not give all regulars the same family or campaign reaction', () => {
    const state = defaultCampaign();
    Object.assign(state.world, { cafe: 'boarded', security: 'suspended', appearance: 'cancelled' });
    const during = everydayJobs.map(job => ordinaryDuring(job.name, state));
    expect(new Set(during).size).toBe(everydayJobs.length);
    for (const job of everydayJobs) expect(ordinaryDuring(job.name, state)).toBe(job.during);
    expect(during.join(' ')).not.toContain('My sister');
  });

  it('admits only situations supported by known facts and leaves all-locked pools empty', () => {
    const source = everydayJobs[0], state = defaultCampaign(), progress = defaultMissionProgress();
    const locked: EverydayJourney = { ...source.journeys![0], id: 'known-request', requires: { flag: 'promised-return' } };
    const job: EverydayJob = { ...source, journeys: [locked, source.journeys![1]] };
    expect(selectEverydayJourney(job, 0, state, { progress })).toBe(source.journeys![1]);
    progress.flags.push('promised-return');
    expect(selectEverydayJourney(job, 0, state, { progress })).toBe(locked);
    expect(selectEverydayJourney({ ...job, journeys: [locked] }, 0, state)).toBeNull();
  });

  it('preserves a custom campaign with only its original ordinary-dialogue fields', () => {
    const job: EverydayJob = { character: 'eli', name: 'Ash', family: 'Festival staff', lines: ['Off to work.'], during: 'The lamps look lovely.' };
    const definition: CampaignDefinition = { ...campaignDefinition, everydayJobs: [job], ordinaryResponses: [{ text: 'A city-wide announcement.' }] };
    const state = defaultCampaign(definition);
    expect(selectEverydayJourney(job, 0, state)).toBeNull();
    expect(selectEverydayJourney(job, 0, state, {}, true)).toBeNull();
    expect(ordinaryDuring('Ash', state, {}, definition)).toBe('The lamps look lovely.');
    expect(ordinaryDuring('Unknown', state, {}, definition)).toBe('');
  });
});

describe('conditional ride dialogue', () => {
  const missionId = 'bea-first-shift';
  const definition: CampaignDefinition = {
    ...campaignDefinition,
    initialWorld: { ...campaignDefinition.initialWorld, 'packet-collected': false },
    stopovers: {
      [missionId]: { stop: 'market-quarter', title: 'Collect a packet', request: 'Wait while I collect this.', seconds: 3, completedText: 'Got it.', effects: [{ setWorld: { key: 'packet-collected', value: true } }, { setFlag: 'waited-for-packet' }] },
    },
    rideVariants: {
      [missionId]: { arrival: [
        { requires: { all: [{ worldEquals: { key: 'packet-collected', value: true } }, { flag: 'waited-for-packet' }, { rideComfortAtLeast: 60 }] }, text: 'The packet is here, and the glass inside survived. Thank you for waiting.' },
        { requires: { worldEquals: { key: 'packet-collected', value: true } }, text: 'I have the packet. I will check the glass when I get inside.' },
      ] },
    },
  };

  it('selects the first applicable line from post-effect state and the supplied ride inputs', () => {
    const state = defaultCampaign(definition), progress = defaultMissionProgress();
    const ctx = { state, progress, definition };
    expect(dispatchCampaignEvent(ctx, { type: 'stopover-completed', missionId })).toBe(true);
    expect(rideMessage(missionId, 'arrival', false, definition, state, { progress, ride: { comfort: 90 } })?.text).toContain('survived');
    expect(rideMessage(missionId, 'arrival', false, definition, state, { progress, ride: { comfort: 30 } })?.text).toContain('check the glass');
    expect(rideMessage(missionId, 'arrival', true, definition, state, { progress, ride: { comfort: 90 } })?.channel).toBe('sender');
  });

  it('keeps the authored base line when state, an applicable variant or a stage is absent', () => {
    const state = defaultCampaign(definition);
    expect(rideMessage(missionId, 'arrival', false, definition)?.text).toBe(definition.rides[missionId].arrival);
    expect(rideMessage(missionId, 'arrival', false, definition, state)?.text).toBe(definition.rides[missionId].arrival);
    expect(rideMessage(missionId, 'during', false, definition, state)?.text).toBe(definition.rides[missionId].during);
    expect(rideMessage(missionId, 'arrival', false, { ...definition, rideVariants: undefined }, state)?.text).toBe(definition.rides[missionId].arrival);
    expect(rideMessage('unknown-ride', 'arrival', false, definition, state)).toBeNull();
  });
});

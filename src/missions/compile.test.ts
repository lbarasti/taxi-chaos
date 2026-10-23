import { describe, expect, it } from 'vitest';
import { campaignDefinition, everydayJobs } from '../campaign/content';
import type { CampaignDefinition } from '../campaign/model';
import { defaultCompiledMap } from '../map/compile';
import { campaignMissions, compileMissions } from './compile';
import type { MissionCatalogue } from './schema';

const STOPS = {
  schemaVersion: 1,
  stops: [
    { id: 'a', name: 'A', kind: 'city', position: { x: 4, y: 14 } },
    { id: 'b', name: 'B', kind: 'city', position: { x: 44, y: 14 } },
    { id: 'c', name: 'C', kind: 'city', position: { x: 84, y: 58 } },
  ],
};

const mission = (over: Record<string, unknown> = {}) => ({
  title: 'Mission', chapter: 1, category: 'plot', repeat: 'once', abandon: { retry: 'always' },
  requires: { all: [] }, allowed: { jobs: ['fare'] }, stops: { pickup: 'a', dropoff: 'b' }, beats: { pickup: 'line' }, ...over,
});

describe('campaign stop references', () => {
  it('resolves ordinary fare and parcel journeys against actual stops', () => {
    const regular = everydayJobs[0];
    const unknownPickup: CampaignDefinition = { ...campaignDefinition, everydayJobs: [{ ...regular, journeys: [{ ...regular.journeys![0], pickup: 'missing-stop' }] }] };
    expect(() => campaignMissions(defaultCompiledMap, unknownPickup)).toThrow(/everyday journey .* pickup: unknown stop missing-stop/);
    const unknownDropoff: CampaignDefinition = { ...campaignDefinition, everydayJobs: [{ ...regular, parcelJourneys: [{ ...regular.parcelJourneys![0], dropoff: 'missing-stop' }] }] };
    expect(() => campaignMissions(defaultCompiledMap, unknownDropoff)).toThrow(/everyday journey .* dropoff: unknown stop missing-stop/);
  });

  it('rejects an optional stopover that is absent from the map stop catalogue', () => {
    const definition: CampaignDefinition = { ...campaignDefinition, stopovers: {
      'bea-first-shift': { stop: 'missing-stop', title: 'A quick stop', request: 'Please wait here.', seconds: 3, completedText: 'Ready.', effects: [] },
    } };
    expect(() => campaignMissions(defaultCompiledMap, definition)).toThrow(/mission bea-first-shift stopover: unknown stop missing-stop/);
  });
});

const catalogue = (missions: Record<string, unknown>, dialogue: Record<string, unknown> = {
  line: { character: 'mia', category: 'plot', channel: 'passenger', text: 'Hello.' },
}) => ({ schemaVersion: 1, dialogue, missions } as unknown as MissionCatalogue);

const compile = (missions: Record<string, unknown>, dialogue?: Record<string, unknown>) => compileMissions(defaultCompiledMap, catalogue(missions, dialogue), STOPS);

describe('mission compilation', () => {
  it('resolves dialogue identities and freezes the result', () => {
    const compiled = compile({ one: mission() });
    expect(compiled.missions.one.beats.pickup.message).toMatchObject({ speaker: 'mia', channel: 'passenger' });
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.missions.one)).toBe(true);
    expect(Object.isFrozen(compiled.missions.one.beats.pickup.message)).toBe(true);
    expect(Object.isFrozen(compiled.stops.byId.a.position)).toBe(true);
  });

  it('rejects unknown dialogue, character, stop and passenger references', () => {
    expect(() => compile({ one: mission({ beats: { pickup: 'missing' } }) })).toThrow(/unknown dialogue beat missing/);
    expect(() => compile({ one: mission() }, { line: { character: 'ghost', category: 'plot', channel: 'passenger', text: 'Hi' } })).toThrow(/unknown character ghost/);
    expect(() => compile({ one: mission({ passenger: 'ghost' }) })).toThrow(/unknown passenger ghost/);
    expect(() => compile({ one: mission({ stops: { pickup: 'missing', dropoff: 'b' } }) })).toThrow(/unknown pickup stop missing/);
    expect(() => compile({ one: mission({ stops: { pickup: 'a', dropoff: 'a' } }) })).toThrow(/must differ/);
  });

  it('rejects unknown choice groups, options and relationship characters', () => {
    const choice = { id: 'route', commit: 'pickup', options: [{ id: 'left', default: true }] };
    expect(() => compile({ one: mission({ choices: [choice], requires: { flag: 'x' } }), two: mission({ requires: { choiceEquals: { group: 'missing', choice: 'left' } } }) })).toThrow(/unknown choice group missing/);
    expect(() => compile({ one: mission({ choices: [choice], requires: { choiceEquals: { group: 'route', choice: 'right' } } }) })).toThrow(/not an option/);
    expect(() => compile({ one: mission({ effects: [{ setChoice: { group: 'route', choice: 'left' } }] }) })).toThrow(/unknown choice group route/);
    expect(() => compile({ one: mission({ effects: [{ relationship: { character: 'ghost', delta: 1 } }] }) })).toThrow(/unknown relationship character ghost/);
  });

  it('rejects unknown allowed models and kinds', () => {
    expect(() => compile({ one: mission({ allowed: { jobs: ['fare'], models: ['hovercraft'] } }) })).toThrow(/unknown allowed model/);
    expect(() => compile({ one: mission({ allowed: { jobs: ['fare'], models: ['car'] } }) })).not.toThrow();
  });

  it('rejects direct and indirect prerequisite cycles', () => {
    expect(() => compile({ one: mission({ requires: { missionCompleted: 'one' } }) })).toThrow(/cycle/);
    expect(() => compile({
      one: mission({ requires: { missionCompleted: 'two' } }),
      two: mission({ requires: { missionCompleted: 'three' } }),
      three: mission({ requires: { missionCompleted: 'one' } }),
    })).toThrow(/one -> two -> three -> one|one -> three -> two -> one/);
  });

  it('rejects unknown prerequisite missions', () => {
    expect(() => compile({ one: mission({ requires: { missionCompleted: 'missing' } }) })).toThrow(/unknown mission missing/);
  });

  it('rejects statically conflicting unconditional setChoice assignments', () => {
    const route = (options: unknown[], commit = 'pickup') => ({ id: 'route', commit, options });
    // A default option statically claims its own group, so the mission effects
    // cannot contradict it.
    expect(() => compile({
      one: mission({
        choices: [route([{ id: 'fast', default: true }, { id: 'safe' }])],
        effects: [{ setChoice: { group: 'route', choice: 'safe' } }],
      }),
    })).toThrow(/conflicting/);
    // The default option's own effects cannot override its own group assignment.
    expect(() => compile({
      one: mission({ choices: [route([{ id: 'fast', default: true, effects: [{ setChoice: { group: 'route', choice: 'safe' } }] }, { id: 'safe' }])] }),
    })).toThrow(/conflicting/);
    // A default option's effect cannot contradict another group's default.
    expect(() => compile({
      one: mission({
        choices: [
          route([{ id: 'fast', default: true, effects: [{ setChoice: { group: 'mood', choice: 'sad' } }] }, { id: 'safe' }]),
          { id: 'mood', commit: 'pickup', options: [{ id: 'happy', default: true }, { id: 'sad' }] },
        ],
      }),
    })).toThrow(/conflicting/);
    // Assigning the same option twice stays valid.
    expect(() => compile({
      one: mission({
        choices: [route([{ id: 'fast', default: true }, { id: 'safe' }])],
        effects: [{ setChoice: { group: 'route', choice: 'fast' } }],
      }),
    })).not.toThrow();
  });

  it('accepts empty effects and choices arrays', () => {
    expect(() => compile({ one: mission({ effects: [], choices: [] }) })).not.toThrow();
    expect(() => compile({
      one: mission({ choices: [{ id: 'route', commit: 'pickup', options: [{ id: 'left', default: true, effects: [] }, { id: 'right' }] }] }),
    })).not.toThrow();
  });
});

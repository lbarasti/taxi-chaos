import { describe, expect, it } from 'vitest';
import { assertMissionCatalogue, missionLimits, type MissionCatalogue } from './schema';

const base = (): MissionCatalogue => ({
  schemaVersion: 1,
  dialogue: { 'mia-line': { character: 'mia', category: 'plot', channel: 'passenger', text: 'Hello there.' } },
  missions: {
    'm-one': {
      title: 'One', chapter: 1, category: 'plot', repeat: 'once', abandon: { retry: 'always' },
      requires: { all: [] }, allowed: { jobs: ['fare'] }, stops: { pickup: 'a', dropoff: 'b' }, beats: { pickup: 'mia-line' },
    },
  },
}) as unknown as MissionCatalogue;

const mutate = (fn: (doc: any) => void): unknown => { const doc = structuredClone(base()) as any; fn(doc); return doc; };
const message = (value: unknown) => { try { assertMissionCatalogue(value); return ''; } catch (error) { return (error as Error).message; } };

describe('mission catalogue schema', () => {
  it('accepts a minimal valid catalogue', () => {
    expect(() => assertMissionCatalogue(base())).not.toThrow();
  });

  it('bounds the top-level shape and version', () => {
    expect(message(mutate(d => { d.schemaVersion = 2; }))).toMatch(/unsupported schema version/);
    expect(message(mutate(d => { d.missions = {}; }))).toMatch(/missions/);
    expect(message(mutate(d => { d.dialogue = {}; }))).toMatch(/dialogue/);
    expect(message(mutate(d => { d.extra = true; }))).toMatch(/expected fields/);
  });

  it('rejects bad dialogue beats', () => {
    expect(message(mutate(d => { d.dialogue['mia-line'].channel = 'radio'; }))).toMatch(/channel/);
    expect(message(mutate(d => { d.dialogue['mia-line'].category = 'gossip'; }))).toMatch(/category/);
    expect(message(mutate(d => { d.dialogue['mia-line'].text = ''; }))).toMatch(/text/);
    expect(message(mutate(d => { d.dialogue['mia-line'].text = 'x'.repeat(missionLimits.text + 1); }))).toMatch(/text/);
    expect(message(mutate(d => { d.dialogue['Bad Id'] = d.dialogue['mia-line']; delete d.dialogue['mia-line']; }))).toMatch(/id/);
  });

  it('rejects malformed missions, bounds and unknown keys', () => {
    expect(message(mutate(d => { delete d.missions['m-one'].title; }))).toMatch(/expected fields/);
    expect(message(mutate(d => { d.missions['m-one'].repeat = 'sometimes'; }))).toMatch(/repeat/);
    expect(message(mutate(d => { d.missions['m-one'].allowed.jobs = []; }))).toMatch(/jobs/);
    expect(message(mutate(d => { d.missions['m-one'].allowed.jobs = ['teleport']; }))).toMatch(/fare, parcel/);
    expect(message(mutate(d => { d.missions['m-one'].reward = 5; }))).toMatch(/expected fields/);
    expect(message(mutate(d => { d.missions['m-one'].abandon = { retry: 'cooldown' }; }))).toMatch(/cooldownSeconds/);
    expect(message(mutate(d => { d.missions['m-one'].abandon.cooldownSeconds = 0; }))).toMatch(/cooldownSeconds/);
  });

  it('rejects unknown condition and effect operators, and bounds nesting', () => {
    expect(message(mutate(d => { d.missions['m-one'].requires = { always: true }; }))).toMatch(/unknown condition operator/);
    expect(message(mutate(d => { d.missions['m-one'].requires = { all: [{ all: [] }], any: [] }; }))).toMatch(/exactly one operator/);
    expect(message(mutate(d => { d.missions['m-one'].effects = [{ teleport: 'somewhere' }]; }))).toMatch(/unknown effect operator/);
    expect(message(mutate(d => { d.missions['m-one'].effects = [{ relationship: { character: 'mia', delta: 500 } }]; }))).toMatch(/delta/);
    let deep: any = { flag: 'f' };
    for (let i = 0; i < missionLimits.conditionDepth + 1; i++) deep = { not: deep };
    expect(message(mutate(d => { d.missions['m-one'].requires = deep; }))).toMatch(/nesting too deep/);
    const wide = { all: Array.from({ length: missionLimits.conditionNodes + 5 }, () => ({ flag: 'f' })) };
    expect(message(mutate(d => { d.missions['m-one'].requires = wide; }))).toMatch(/expected array|too many condition nodes/);
  });

  it('rejects duplicate choice groups across the catalogue and duplicate options', () => {
    const choice = (id: string, optionId = 'left') => ({ id, commit: 'pickup', options: [{ id: optionId, default: true }] });
    expect(message(mutate(d => {
      d.missions['m-one'].choices = [choice('route')];
      d.missions['m-two'] = { ...d.missions['m-one'], title: 'Two', choices: [choice('route')] } as never;
    }))).toMatch(/unique across the catalogue/);
    expect(message(mutate(d => { d.missions['m-one'].choices = [{ id: 'route', commit: 'pickup', options: [{ id: 'left' }, { id: 'left' }] }]; }))).toMatch(/duplicate option id/);
    expect(message(mutate(d => { d.missions['m-one'].choices = [{ id: 'route', commit: 'pickup', options: [{ id: 'a', default: true }, { id: 'b', default: true }] }]; }))).toMatch(/at most one default/);
  });

  it('validates the default option flag strictly and accepts empty arrays', () => {
    expect(message(mutate(d => { d.missions['m-one'].choices = [{ id: 'route', commit: 'pickup', options: [{ id: 'left', default: 'yes' }] }]; }))).toMatch(/boolean/);
    expect(() => assertMissionCatalogue(mutate(d => { d.missions['m-one'].effects = []; d.missions['m-one'].choices = []; }))).not.toThrow();
    expect(() => assertMissionCatalogue(mutate(d => {
      d.missions['m-one'].choices = [{ id: 'route', commit: 'pickup', options: [{ id: 'left', default: true, effects: [] }] }];
    }))).not.toThrow();
  });

  it('budgets condition nodes per expression so many simple missions are allowed', () => {
    const count = missionLimits.conditionNodes + 6;
    const doc = structuredClone(base()) as any;
    for (let i = 0; i < count; i++) doc.missions[`m-${i}`] = { ...doc.missions['m-one'], title: `M${i}`, requires: { flag: 'f' } };
    expect(Object.keys(doc.missions).length).toBeGreaterThan(missionLimits.conditionNodes);
    expect(() => assertMissionCatalogue(doc)).not.toThrow();
  });
});

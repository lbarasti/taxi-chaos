import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { defaultCompiledMap } from '../map/compile';
import { compileMissions } from '../missions/compile';
import { MissionDirector, type DirectorContext } from '../missions/director';
import { defaultMissionProgress } from '../missions/progress';
import { defaultPlayerRecords } from '../player-records';
import { campaignCondition } from '../missions/conditions';
import { assertMissionCatalogue } from '../missions/schema';
import { dayMinute } from './clock';
import { defaultCampaign, parseCampaign } from './state';
import { advanceCampaignTo, approvePublication, receiveMaterial } from './scheduler';
import { dispatchCampaignEvent } from './events';
import { assertCampaignDefinition } from './validate';
import type { CampaignContext, CampaignDefinition } from './model';

/** Independent authored thread: no Open Shore operations, claims or world keys. */
const festival: CampaignDefinition = {
  id: 'lantern-festival', title: 'Lantern Festival', finishedLabel: 'Festival finished', completionText: 'Festival complete.',
  dispatcher: 'bea', initialWorld: { quay: 'locked', attendance: 0, ferry: 'waiting' },
  materials: {
    'lamp-log': { title: 'Lamp delivery log', text: 'A signed stock count.', kind: 'receipt', source: 'lamp-makers' },
    'ferry-report': { title: 'Ferry report', text: 'An independent crossing report.', kind: 'document', source: 'ferry-office' },
  },
  // Deliberately declare the dependent claim first.
  claims: {
    crossings: { title: 'Safe crossings', routes: [['ferry-report']], verifyRequires: { published: 'lanterns' }, reactionEffects: [{ setWorld: { key: 'ferry', value: 'cleared' } }] },
    lanterns: { title: 'Lamp supply', routes: [['lamp-log']], verifyRequires: { all: [{ worldAtLeast: { key: 'attendance', value: 10 } }, { minuteAtLeast: 650 }] }, reactionEffects: [] },
  },
  missions: { schemaVersion: 1, dialogue: { welcome: { character: 'bea', category: 'lore', channel: 'passenger', text: 'Take these lanterns to the quay.' } }, missions: {
    'lantern-run': { title: 'Lamp delivery', chapter: 1, category: 'lore', repeat: 'once', abandon: { retry: 'always' }, passenger: 'bea', requires: { all: [] }, allowed: { jobs: ['fare'] }, stops: { pickup: 'the-arcade', dropoff: 'east-village' }, beats: { pickup: 'welcome' }, choices: [{ id: 'dispatch-slot', commit: 'pickup', options: [{ id: 'first' }, { id: 'other' }] }], effects: [{ acquireMaterial: 'lamp-log' }, { setWorld: { key: 'quay', value: 'open' } }] },
    'ferry-run': { title: 'Ferry shift', chapter: 1, category: 'lore', repeat: 'once', abandon: { retry: 'always' }, passenger: 'bea',
      requires: { all: [{ worldEquals: { key: 'quay', value: 'open' } }, { knows: 'lamp-log' }, { materialState: { id: 'lamp-log', state: 'verified' } }, { caseState: { id: 'lanterns', state: 'approved' } }, { published: 'lanterns' }, { relationshipAtLeast: { character: 'bea', value: 1 } }] },
      allowed: { jobs: ['fare'] }, stops: { pickup: 'east-village', dropoff: 'the-arcade' }, beats: { pickup: 'welcome' } },
  } },
  jobWindows: { 'lantern-run': { from: 420, until: dayMinute(4) }, 'ferry-run': { from: 420, until: dayMinute(4) } }, jobNames: {},
  handlers: [
    { on: 'accepted', id: 'lantern-run', effects: [{ setFlag: 'driver-booked' }] },
    { on: 'completed', id: 'lantern-run', requires: { knows: 'lamp-log' }, effects: [{ setWorld: { key: 'attendance', value: 10 } }, { relationship: { character: 'bea', delta: 1 } }] },
  ],
  operations: [{ id: 'ferry-inspection', at: dayMinute(2, 7), effects: [], outcomes: [
    { id: 'passed', requires: { all: [{ worldEquals: { key: 'quay', value: 'open' } }, { knows: 'lamp-log' }, { materialState: { id: 'lamp-log', state: 'verified' } }, { caseState: { id: 'lanterns', state: 'approved' } }, { published: 'lanterns' }] }, effects: [{ setWorld: { key: 'ferry', value: 'inspected' } }] },
    { id: 'deferred', effects: [{ setWorld: { key: 'ferry', value: 'delayed' } }] },
  ] }],
  newsroom: { stop: 'east-village', name: 'Quay office', editor: 'Festival editor', guide: 'Bring your records here.' },
  sites: { office: 'east-village' }, observations: [], vehicles: [], scenes: [], bulletins: [{ text: 'The lantern festival is underway.' }],
  rides: {}, everydayJobs: [{ name: 'Ash', family: 'Festival staff', lines: ['Off to work.'], during: 'The lamps look lovely.' }], ordinaryResponses: [],
};
const driving: DirectorContext = { deliveries: 0, jobType: 'fare', model: 'car', kind: 'taxi', time: 0 };
function setup(definition = festival) {
  const state = defaultCampaign(definition), progress = defaultMissionProgress(), records = defaultPlayerRecords();
  const ctx: CampaignContext = { state, progress, records, definition };
  const director = new MissionDirector(compileMissions(defaultCompiledMap, definition.missions), progress, () => ctx);
  return { state, progress, records, ctx, director };
}
function finishLampRide(f: ReturnType<typeof setup>) {
  expect(f.director.begin('lantern-run', driving)).toBe(true);
  f.director.pickup(driving);
  return f.director.complete(driving, { type: 'ride-completed', missionId: 'lantern-run', name: 'Lamp maker', receipt: { id: 'fare-one', title: 'Paid fare', text: 'A completed delivery.', kind: 'receipt' } });
}

describe('content-independent campaign engine', () => {
  it('runs a different narrative in Game without story-specific adapters', () => {
    expect(() => assertCampaignDefinition(festival)).not.toThrow();
    const g = new Game(defaultCompiledMap, false, true, undefined, festival);
    expect(g.save.campaign.world).toEqual(festival.initialWorld);
    expect(g.missions.catalogue.order).toEqual(['lantern-run', 'ferry-run']);
    expect(g.campaignBulletin).toBe('The lantern festival is underway.');
    expect(Object.keys(g.campaignSites)).toEqual(['office']);
    expect(g.vehicles.some(v => g.isCampaignVehicle(v.sourceId))).toBe(false);
    expect(g.observeScene()).toBe(false);
  });

  it('shares predicates and atomically commits mission effects, handlers and delivery records once', () => {
    const f = setup(); f.state.ordinarySinceStory = 2;
    expect(finishLampRide(f)).toBe('lantern-run');
    expect(f.progress.flags).toContain('driver-booked');
    expect(f.state.world).toMatchObject({ quay: 'open', attendance: 10 });
    expect(f.progress.relationships.bea).toBe(1);
    expect(f.records.notebook.map(e => e.id)).toEqual(['lamp-log', 'fare-one']);
    expect(f.state.ordinarySinceStory).toBe(0);
    const before = structuredClone({ state: f.state, records: f.records, progress: f.progress });
    expect(f.director.complete(driving)).toBeNull();
    expect({ state: f.state, records: f.records, progress: f.progress }).toEqual(before);
    expect(f.director.evaluate(festival.missions.missions['ferry-run'].requires, driving)).toBe(false);
    receiveMaterial(f.state, 'lamp-log', f.ctx, festival); receiveMaterial(f.state, 'ferry-report', f.ctx, festival);
    advanceCampaignTo(f.state, 650, f.ctx, festival); approvePublication(f.state, 'lanterns', f.ctx, festival);
    advanceCampaignTo(f.state, dayMinute(2, 6), f.ctx, festival);
    expect(f.director.evaluate(festival.missions.missions['ferry-run'].requires, driving)).toBe(true);
    expect(campaignCondition({ caseState: { id: 'crossings', state: 'verified' } }, f.state, f.ctx)).toBe(true);
    expect(parseCampaign(JSON.parse(JSON.stringify(f.state)), festival, f.ctx)).toEqual(f.state);
    advanceCampaignTo(f.state, dayMinute(2, 7), f.ctx, festival);
    expect(f.state.occurrences['ferry-inspection'].outcome).toBe('passed');
  });

  it('uses precise condition boundaries during skips and leaves backstage events separate from knowledge', () => {
    const skipped = setup(), live = setup();
    for (const f of [skipped, live]) { finishLampRide(f); receiveMaterial(f.state, 'lamp-log', f.ctx, festival); }
    advanceCampaignTo(skipped.state, dayMinute(2, 7), skipped.ctx, festival);
    for (let minute = 420; minute <= dayMinute(2, 7); minute++) advanceCampaignTo(live.state, minute, live.ctx, festival);
    expect(skipped.state).toEqual(live.state);
    expect(skipped.state.newsroom.cases.lanterns?.verifiedAt).toBe(650);
    expect(skipped.state.occurrences['ferry-inspection'].outcome).toBe('deferred');
    const unobserved = setup(); advanceCampaignTo(unobserved.state, dayMinute(2, 7), unobserved.ctx, festival);
    expect(unobserved.records.notebook).toEqual([]);
    expect(unobserved.state.newsroom.received).toEqual({});
  });

  it('preserves publication-based unlocks, reactions and latched admissions across reload', () => {
    const f = setup(); finishLampRide(f);
    for (const id of ['lamp-log', 'ferry-report']) receiveMaterial(f.state, id, f.ctx, festival);
    advanceCampaignTo(f.state, 650, f.ctx, festival); approvePublication(f.state, 'lanterns', f.ctx, festival);
    advanceCampaignTo(f.state, dayMinute(2, 6), f.ctx, festival);
    expect(f.state.newsroom.cases.crossings?.verifiedAt).toBe(dayMinute(2, 6));
    approvePublication(f.state, 'crossings', f.ctx, festival);
    advanceCampaignTo(f.state, dayMinute(3, 8), f.ctx, festival);
    f.state.world.attendance = 0; // Later world changes must not revoke a checked case.
    expect(parseCampaign(f.state, festival, f.ctx)).toEqual(f.state);
    expect(f.state.world.ferry).toBe('cleared');
  });

  it('admits checked storylets immediately when a gameplay event satisfies their remaining gate', () => {
    const f = setup(); receiveMaterial(f.state, 'lamp-log', f.ctx, festival);
    advanceCampaignTo(f.state, 650, f.ctx, festival);
    expect(f.state.newsroom.cases.lanterns).toBeUndefined();
    finishLampRide(f);
    expect(f.state.newsroom.cases.lanterns?.verifiedAt).toBe(650);
  });

  it('retains latched cases with compound negated mutable prerequisites on reload', () => {
    const definition = structuredClone(festival);
    Object.assign(definition.claims, { quiet: { title: 'Quiet quay', routes: [['lamp-log']], verifyRequires: { all: [{ minuteAtLeast: 650 }, { not: { all: [{ worldAtLeast: { key: 'attendance', value: 20 } }, { caseState: { id: 'lanterns', state: 'verified' } }] } }] }, reactionEffects: [] } });
    const f = setup(definition); finishLampRide(f); receiveMaterial(f.state, 'lamp-log', f.ctx, definition);
    advanceCampaignTo(f.state, 650, f.ctx, definition); expect(f.state.newsroom.cases.quiet).toBeDefined();
    f.state.world.attendance = 30;
    expect(parseCampaign(f.state, definition, f.ctx)).toEqual(f.state);
  });

  it('rolls back every domain if a completion handler conflicts', () => {
    const bad = structuredClone(festival);
    (bad.handlers as unknown[]).push({ on: 'completed', id: 'lantern-run', effects: [{ setChoice: { group: 'dispatch-slot', choice: 'other' } }] });
    const f = setup(bad); f.progress.choices['dispatch-slot'] = 'first';
    f.director.begin('lantern-run', driving); f.director.pickup(driving);
    const before = structuredClone({ state: f.state, records: f.records, progress: f.progress, log: f.director.log });
    expect(() => f.director.complete(driving)).toThrow(/Conflicting/);
    expect({ state: f.state, records: f.records, progress: f.progress, log: f.director.log }).toEqual(before);
    expect(f.director.activeId).toBe('lantern-run');
    const eventBefore = structuredClone(f.ctx.state);
    expect(() => dispatchCampaignEvent(f.ctx, { type: 'operation', id: 'bad-operation', outcome: 'occurred', effects: [{ setWorld: { key: 'quay', value: 'open' } }, { acquireMaterial: 'missing-record' }] })).toThrow();
    expect(f.ctx.state).toEqual(eventBefore);
  });

  it('rejects invalid condition/effect shapes, unknown references and claim cycles', () => {
    const unknown = structuredClone(festival);
    (unknown.operations as unknown[]).push({ id: 'unknown-material', at: 800, effects: [{ acquireMaterial: 'missing-record' }] });
    expect(() => assertCampaignDefinition(unknown)).toThrow(/Unknown material/);
    const cycle = structuredClone(festival);
    (cycle.claims.lanterns as { verifyRequires: unknown }).verifyRequires = { published: 'crossings' };
    expect(() => assertCampaignDefinition(cycle)).toThrow(/cycle/);
    const typo = structuredClone(festival.missions);
    (typo.missions['lantern-run'] as { requires: unknown }).requires = { materialState: { id: 'lamp-log', state: 'printed' } };
    expect(() => assertMissionCatalogue(typo)).toThrow();
    (typo.missions['lantern-run'] as { requires: unknown }).requires = { worldEquals: { key: 'quay', value: null } };
    expect(() => assertMissionCatalogue(typo)).toThrow();
  });

  it('keeps narrative identifiers out of the generic runtime', () => {
    const paths = ['game.ts', 'main.ts', 'renderer.ts', 'missions/compile.ts', 'missions/director.ts', 'missions/conditions.ts', 'scenarios/runner.ts', ...['events', 'effects', 'state', 'scheduler', 'view', 'bulletin', 'ride-dialogue', 'validate', 'model'].map(name => `campaign/${name}.ts`)];
    for (const path of paths) expect(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), path).not.toMatch(/tenantOutcome|tenant-interview-reached|tenancy-review|campaign-ms14|openShore|OPEN SHORE|['"]coordination['"]|['"]policing['"]|['"]knowledge['"]|MERIDIAN|APPEARANCE CANCELLED/);
  });
});

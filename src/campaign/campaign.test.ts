import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game, defaultSave } from '../game';
import { defaultCompiledMap } from '../map/compile';
import { openShoreMissions } from '../missions/compile';
import { assertMissionCatalogue } from '../missions/schema';
import { vec } from '../physics';
import { storageKeys } from '../storage';
import { migratePlayerRecords } from '../player-records';
import { campaignCast, corroboration, jobMaterials, jobNames, materials, openShoreCatalogue } from './content';
import { advanceCampaign, defaultCampaign, migrateCampaign } from './state';
import { notebookMarkup } from './view';

const make = () => { const g = new Game(defaultCompiledMap, false); g.vehicles = [g.player]; g.trafficTarget = 0; g.settings.noPolice = true; g.start(); return g; };
const step = (g: Game, seconds = 0.9) => { for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120); };
const arrive = (g: Game, point: { x: number; y: number }) => { g.player.body.position = { ...point }; g.player.body.velocity = vec(); step(g); };
const shift = (g: Game, until: number) => { while (g.save.campaign.shift < until) { g.setMode('paused'); expect(g.endShift()).toBe(true); } };
const deliver = (g: Game, id: string) => { expect(g.routeMissionOffer(id)).toBe(true); arrive(g, g.job.pickup); expect(g.job.missionId).toBe(id); expect(g.job.stage).toBe('dropoff'); arrive(g, g.job.dropoff); expect(g.save.story.completed).toContain(id); };

afterEach(() => vi.unstubAllGlobals());
describe('Open Shore authored campaign', () => {
  it('compiles the twelve-character cast, bounded jobs and two independent routes per allegation against the actual map', () => {
    expect(campaignCast).toHaveLength(12);
    const compiled = openShoreMissions(defaultCompiledMap);
    expect(() => assertMissionCatalogue(openShoreCatalogue)).not.toThrow();
    expect(compiled.warnings).toEqual([]); expect(Object.isFrozen(compiled)).toBe(true);
    expect(new Set(Object.values(compiled.missions).map(m => m.passenger))).toEqual(new Set(campaignCast));
    const authored = new Set(Object.values(jobMaterials).flat()); authored.add('cafe-photo');
    for (const routes of Object.values(corroboration)) {
      expect(routes).toHaveLength(2);
      expect(routes[0].some(id => routes[1].includes(id as never))).toBe(false);
      for (const route of routes) { expect(new Set(route.map(id => materials[id].source)).size).toBe(route.length); for (const id of route) expect(authored.has(id)).toBe(true); }
    }
    for (let date = 1; date <= 14; date++) {
      const g = make(); g.save.campaign.shift = date; g.syncMissionOffers();
      const identities = [...g.missionOffers.keys()].map(id => jobNames[id] ?? g.missions.mission(id).passenger);
      expect(new Set(identities).size).toBe(identities.length);
    }
  });

  it('starts with paid ordinary work, archives dialogue on pickup and never grants a delivery record early', () => {
    const g = make(); expect(g.job.missionId).toBe('bea-first-shift');
    arrive(g, g.job.pickup);
    expect(g.save.playerRecords.notebook.some(e => e.id === 'ride-bea-first-shift')).toBe(true);
    arrive(g, g.job.dropoff); const cash = g.save.cash;
    deliver(g, 'celia-barriers');
    expect(g.save.cash).toBeGreaterThan(cash);
    expect(g.save.playerRecords.notebook.find(e => e.id === 'barrier-receipt')).toMatchObject({ kind: 'receipt', shift: 1 });
    expect(g.save.campaign.submitted).toEqual([]); expect(g.save.campaign.publications).toEqual([]);
    expect(g.job.missionId).toBeUndefined(); expect(g.job.everyday).toBeDefined();
  });

  it('advances only on explicit shift end; pausing, run reset and recovery do not consume dates', () => {
    const g = make(); step(g, 2); const time = g.save.story.campaignSeconds;
    g.setMode('paused'); step(g, 1); expect(g.save.story.campaignSeconds).toBe(time);
    g.resetRun(); expect(g.save.campaign.shift).toBe(1);
    g.setMode('wasted'); g.recover(); expect(g.save.campaign.shift).toBe(1);
    g.setMode('paused'); expect(g.endShift()).toBe(true); expect(g.save.campaign.shift).toBe(2);
    expect(g.endShift()).toBe(false); // already back playing, prevents double clicks
  });

  it('does not abandon a passenger or commit choices through a calendar button', () => {
    const g = make(); arrive(g, g.job.pickup); g.setMode('paused');
    const saved = structuredClone(g.save); expect(g.endShift()).toBe(false); expect(g.save).toEqual(saved);
  });

  it('closes expired offers permanently while retaining the actual received messages', () => {
    const g = make(), receipt = g.save.playerRecords.texts.find(t => t.missionId === 'celia-barriers')!;
    shift(g, 3); expect(g.routeMissionOffer('celia-barriers')).toBe(false);
    expect(g.save.playerRecords.texts).toContainEqual(receipt);
    expect(g.campaignBulletin).toContain('windows broken'); expect(g.save.playerRecords.notebook).toEqual([]);
    g.resetRun(); expect(g.routeMissionOffer('celia-barriers')).toBe(false);
  });

  it('requires a deliberate physical visit to bookmark the café, without auto-acquiring the observation', () => {
    const g = make(); expect(g.photographCafe()).toBe(false); shift(g, 3);
    expect(g.photographCafe()).toBe(false); g.player.body.position = { ...g.missions.catalogue.stops.byId['garden-cafe'].position };
    expect(g.photographCafe()).toBe(true); expect(g.photographCafe()).toBe(true);
    expect(g.save.playerRecords.notebook.filter(e => e.id === 'cafe-photo')).toHaveLength(1);
  });

  it('commits the competing safe ride on physical pickup and preserves that outcome through abandonment', () => {
    const g = make(); shift(g, 3); expect(g.routeMissionOffer('nico-safe-ride')).toBe(true);
    expect(g.save.story.choices).toEqual({}); arrive(g, g.job.pickup);
    expect(g.job.name).toBe('Nico'); expect(g.save.story.choices['nico-trip']).toBe('room');
    expect(g.save.story.flags).not.toContain('nico-safe');
    g.setMode('wasted'); g.recover(); g.resetRun();
    expect(g.missionOffers.has('nico-safe-ride')).toBe(true); expect(g.missionOffers.has('celia-roster')).toBe(false);
    deliver(g, 'nico-safe-ride'); expect(g.save.story.flags).toContain('nico-safe');
  });

  it('keeps an independent corroboration route when a waiting source is killed, without recreating that source', () => {
    const g = make(); shift(g, 6);
    const job = g.missionOffers.get('eli-originals')!, person = g.world.people.find(p => p.id === job.customerId)!;
    person.alive = false; g.death(person, vec(), 1, false); step(g);
    expect(g.save.story.flags).toContain('contact-eli-lost'); expect(g.missionOffers.has('eli-originals')).toBe(false);
    g.resetRun(); expect(g.missionOffers.has('eli-originals')).toBe(false);
    expect(g.missionOffers.has('nico-safe-ride')).toBe(true);
  });

  it('releases a routed booking when its source becomes unavailable', () => {
    const g = make(); shift(g, 7); expect(g.routeMissionOffer('tom-patrol-copy')).toBe(true);
    const job = g.missionOffers.get('tom-patrol-copy')!, person = g.world.people.find(p => p.id === job.customerId)!;
    person.alive = false; g.death(person, vec(), 1, false);
    expect(g.missionOffers.has('tom-patrol-copy')).toBe(false);
    expect(g.job.missionId).not.toBe('tom-patrol-copy');
    expect(g.save.story.flags).toContain('contact-tom-lost');
  });

  it('submits only acquired material at the newsroom, keeps originals, and rejects election-day publication', () => {
    const g = make(); deliver(g, 'celia-barriers');
    expect(g.submitMaterial('barrier-receipt')).toBe(false);
    g.player.body.position = { ...g.newsroom }; g.player.body.velocity = vec(); g.setMode('paused');
    expect(g.submitMaterial('leila-warning')).toBe(false);
    expect(g.submitMaterial('barrier-receipt')).toBe(true); expect(g.submitMaterial('barrier-receipt')).toBe(false);
    expect(g.save.playerRecords.notebook.some(e => e.id === 'barrier-receipt')).toBe(true);
    expect(g.save.campaign.publications).toEqual([]);
    shift(g, 14); expect(g.submitMaterial('barrier-receipt')).toBe(false);
  });

  it('keeps newsroom navigation separate from accepting a co-located fare', () => {
    const g = make(); shift(g, 4); g.job.pickup = { ...g.newsroom }; g.navigateNewsroom();
    arrive(g, g.newsroom);
    expect(g.job.stage).toBe('pickup'); expect(g.snapshot().navigation).toBe('newsroom'); expect(g.target).toEqual(g.newsroom);
    g.navigateNewsroom(); step(g); expect(g.job.stage).toBe('dropoff');
  });

  it('separates a lead, supported allegations, public coverage and a fully substantiated political connection', () => {
    const state = defaultCampaign(); state.shift = 10;
    state.submitted = ['barrier-receipt', 'barrier-receipt', 'leila-warning', 'vale-authority'];
    advanceCampaign(state); expect(state.publications).toEqual([]);
    state.submitted.push('eli-docket', 'contractor-register'); advanceCampaign(state);
    expect(state.publications.map(p => p.allegation)).toEqual(['coordination']);
    state.submitted.push('patrol-register', 'complaint-log'); advanceCampaign(state);
    expect(state.publications.map(p => p.allegation)).toEqual(['coordination', 'policing', 'knowledge']);
    expect(state.publications.find(p => p.allegation === 'knowledge')?.publishedShift).toBe(13);
    expect(migrateCampaign(JSON.parse(JSON.stringify(state)))).toEqual({ ...state, submitted: [...new Set(state.submitted)] });
  });

  it('supports exposure using only the alternative sources, without Leila or a protected cleaner', () => {
    const state = defaultCampaign(); state.shift = 12;
    state.submitted = ['eli-docket', 'contractor-register', 'patrol-register', 'complaint-log', 'hearing-copy', 'contract-carbon'];
    expect(state.publications).toEqual([]); advanceCampaign(state);
    expect(state.publications.map(p => p.allegation)).toEqual(['coordination', 'policing', 'knowledge']);
  });

  it('lets a completely uninvolved driver finish fourteen shifts and keep working with no missing-plot score', () => {
    const g = make(); shift(g, 14);
    expect(g.campaignBulletin).toContain('remains the favourite'); expect(g.missionOffers.has('bea-vote')).toBe(true);
    g.setMode('paused'); expect(g.endShift()).toBe(true); expect(g.save.campaign.finished).toBe(true);
    expect(g.endShift()).toBe(false); g.setMode('playing'); g.newJob();
    expect(g.job.missionId).toBeUndefined(); expect(g.job.everyday).toBeDefined();
    expect(g.save.campaign.publications).toEqual([]); expect(g.save.story.completed).toEqual([]);
    expect(notebookMarkup(g)).not.toMatch(/\d+%|evidence:|truth score/i);
  });

  it('persists dates, outcomes and detached records; old saves invent no past knowledge', () => {
    const g = make(); deliver(g, 'celia-barriers'); shift(g, 4);
    const stored = JSON.stringify(g.save);
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === storageKeys.save ? stored : null, setItem: vi.fn(), removeItem: vi.fn() });
    const loaded = new Game(); expect(loaded.save.campaign.shift).toBe(4); expect(loaded.save.playerRecords.notebook).toEqual(g.save.playerRecords.notebook);
    expect(loaded.missionOffers.has('celia-barriers')).toBe(false);
    const snapshot = loaded.snapshot(); snapshot.campaign!.shift = 14; expect(loaded.save.campaign.shift).toBe(4);
    expect(migrateCampaign(undefined)).toEqual(defaultCampaign()); expect(migratePlayerRecords({ version: 1, texts: [] }).notebook).toEqual([]);
    loaded.resetStory(); expect(loaded.save.campaign).toEqual(defaultCampaign()); expect(loaded.save.playerRecords.notebook).toEqual([]);
    expect(loaded.save.deliveries).toBe(g.save.deliveries);
  });

  it('does not read or migrate user state in map previews or isolated campaigns', () => {
    const storage = { getItem: vi.fn(() => JSON.stringify(defaultSave())), setItem: vi.fn(), removeItem: vi.fn() }; vi.stubGlobal('localStorage', storage);
    const preview = new Game(defaultCompiledMap, false, false), isolated = make();
    expect(preview.campaignEnabled).toBe(false); expect(preview.missions.catalogue.order).toEqual([]);
    expect(isolated.save.campaign.shift).toBe(1); expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('rejects malformed calendar conditions and notebook records with detached bounded migration', () => {
    const catalogue = structuredClone(openShoreCatalogue); (catalogue.missions['bea-first-shift'] as { requires: unknown }).requires = { shiftAtLeast: 15 };
    expect(() => assertMissionCatalogue(catalogue)).toThrow(/14/);
    const raw = { version: 1, texts: [], notebook: [{ id: 'cafe-photo', ...materials['cafe-photo'], shift: 3, at: 5 }, { id: 'bad', title: 'X', text: 'Y', shift: 99, at: 0, kind: 'observation' }] };
    const records = migratePlayerRecords(raw); expect(records.notebook).toHaveLength(1); records.notebook[0].text = 'Changed'; expect(raw.notebook[0].text).not.toBe('Changed');
  });
});

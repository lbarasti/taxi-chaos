import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game, defaultSave } from '../game/game';
import { defaultCompiledMap } from '../map/compile';
import { campaignMissions } from '../missions/compile';
import { assertMissionCatalogue } from '../missions/schema';
import { contact, vec } from '../physics/physics';
import { GARAGE } from '../world/world';
import { storageKeys } from '../game/storage';
import { MAX_NOTEBOOK_ENTRIES, parsePlayerRecords } from '../narrative/player-records';
import { campaignCast, corroboration, jobMaterials, jobNames, jobWindows, materials, openShoreCatalogue } from './content';
import { defaultCampaign, parseCampaign } from './state';
import { dayMinute } from './clock';
import { CAMPAIGN_END, LAST_EDITION } from './content';
import { notebookMarkup } from './view';
import { rideDialogueIds } from './ride-dialogue';

const make = () => { const g = new Game(defaultCompiledMap, false); g.vehicles = [g.player]; g.trafficTarget = 0; g.settings.noPolice = true; g.start(); return g; };
const step = (g: Game, seconds = 0.9) => { for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120); };
const arrive = (g: Game, point: { x: number; y: number }) => { g.player.body.position = { ...point }; g.player.body.velocity = vec(); step(g); };
const advance = (g: Game, day: number) => { g.advanceNarrativeTo(dayMinute(day)); g.syncMissionOffers(); };
const finish = (g: Game) => { arrive(g, g.job.pickup); g.dialogue.readAll(); step(g, 0.01); arrive(g, g.job.dropoff); };
const deliver = (g: Game, id: string) => { expect(g.routeMissionOffer(id)).toBe(true); finish(g); expect(g.save.story.completed).toContain(id); };
afterEach(() => vi.unstubAllGlobals());

describe('Open Shore world-driven campaign', () => {
  it('compiles bounded routes, cast, exact windows, all ride conversations and independent sources', () => {
    const compiled = campaignMissions(defaultCompiledMap);
    expect(campaignCast).toHaveLength(12); expect(compiled.warnings).toEqual([]); expect(Object.isFrozen(compiled)).toBe(true);
    expect(() => assertMissionCatalogue(openShoreCatalogue)).not.toThrow();
    expect(new Set(Object.values(compiled.missions).map(m => m.passenger))).toEqual(new Set(campaignCast));
    expect(new Set(rideDialogueIds)).toEqual(new Set(compiled.order));
    const authored = new Set(Object.values(jobMaterials).flat()); authored.add('cafe-photo');
    for (const routes of Object.values(corroboration)) for (const route of routes) {
      expect(new Set(route.map(id => materials[id].source)).size).toBe(route.length);
      for (const id of route) expect(authored.has(id)).toBe(true);
    }
    for (let day = 1; day <= 14; day++) {
      const g = make(); advance(g, day);
      const identities = [...g.missionOffers.keys()].map(id => jobNames[id] ?? g.missions.mission(id).passenger);
      expect(new Set(identities).size).toBe(identities.length);
    }
  });

  it('brings story rides through normal dispatch while keeping ordinary work between them', () => {
    const g = make(); expect(g.job.missionId).toBe('bea-first-shift'); finish(g);
    expect(g.job.everyday).toBeDefined(); finish(g);
    expect(g.job.missionId).toBe('celia-barriers'); expect(g.save.story.choices).toEqual({});
    finish(g); expect(g.save.playerRecords.notebook.some(e => e.id === 'barrier-receipt')).toBe(true);
    expect(g.job.everyday).toBeDefined(); expect(g.save.campaign.newsroom.received).toEqual({});
    expect(g.save.campaign.publications).toEqual([]);
  });

  it('can skip even the opening suggestion without accepting it', () => {
    const g = make(); g.newJob(false, 'replaced', true);
    expect(g.job.missionId).toBeUndefined(); expect(g.job.everyday).toBeDefined();
    expect(g.save.story.completed).toEqual([]); expect(g.save.story.choices).toEqual({});
  });

  it('keeps acquired materials when a full notebook receives authored rides and later ordinary entries', () => {
    const g = make();
    g.save.playerRecords.notebook = Array.from({ length: MAX_NOTEBOOK_ENTRIES }, (_, i) => ({
      id: `fare-old-${i}`, title: 'Ordinary fare', text: 'Signed receipt', kind: 'receipt' as const, shift: 1, at: i,
    }));
    deliver(g, 'celia-barriers');
    expect(g.save.playerRecords.notebook).toHaveLength(MAX_NOTEBOOK_ENTRIES);
    expect(g.save.playerRecords.notebook.some(e => e.id === 'barrier-receipt')).toBe(true);
    advance(g, 3); deliver(g, 'nico-safe-ride');
    g.player.body.position = { ...g.missions.catalogue.stops.byId['garden-cafe'].position };
    expect(g.observeScene()).toBe(true); expect(g.observeScene()).toBe(true);
    g.newJob(false, 'replaced', true); finish(g);
    expect(g.save.playerRecords.notebook).toHaveLength(MAX_NOTEBOOK_ENTRIES);
    const records = parsePlayerRecords(JSON.parse(JSON.stringify(g.save.playerRecords)));
    expect(records.notebook).toEqual(g.save.playerRecords.notebook);
    expect(records.notebook.filter(e => e.id === 'cafe-photo')).toHaveLength(1);
    g.player.body.position = { ...g.newsroom };
    for (const id of ['barrier-receipt', 'cleaner-note', 'cafe-photo']) expect(g.submitMaterial(id)).toBe(true);
    g.advanceNarrativeTo(g.save.campaign.minute + 180);
    expect(g.requestPublication('coordination')).toBe(true);
  });

  it('offers a during-ride exchange only after real movement and retains arrival dialogue across next dispatch', () => {
    const g = make(); arrive(g, g.job.pickup); g.dialogue.readAll(); step(g, 0.01);
    expect(g.save.playerRecords.notebook.some(e => e.id === 'ride-bea-first-shift-pickup')).toBe(true);
    step(g, 8); expect(g.dialogue.active?.beatId).toBe('ride-bea-first-shift-pickup');
    g.player.body.position.y -= 12; step(g, 0.1);
    expect(g.dialogue.active?.beatId).toBe('ride-bea-first-shift-during');
    g.dialogue.readAll(); step(g, 0.01); arrive(g, g.job.dropoff);
    expect(g.dialogue.active?.beatId).toBe('ride-bea-first-shift-arrival'); expect(g.job.stage).toBe('pickup');
    expect(g.save.playerRecords.notebook.some(e => e.id === 'ride-bea-first-shift-during')).toBe(true);
  });

  it('advances while driving, freezes in menus and keeps the canonical time through resets and recovery', () => {
    const g = make(); g.advanceNarrativeTo(dayMinute(2, 23, 59)); step(g, 2);
    expect(g.save.campaign.minute).toBeCloseTo(dayMinute(3, 0, 1), 6);
    expect(g.save.campaign.shift).toBe(2); // the second night ends at 07:00
    const minute = g.save.campaign.minute; g.setMode('paused'); step(g, 1); expect(g.save.campaign.minute).toBe(minute);
    g.resetRun(); expect(g.save.campaign.minute).toBe(minute); expect(g.dayNight.snapshot().time).toBe('00:01');
    g.setMode('wasted'); g.recover(); expect(g.save.campaign.minute).toBe(minute);
    g.dayNight.configure({ hour: 20, rate: 60 }); step(g, 1); expect(g.save.campaign.minute).toBeCloseTo(minute + 1, 5);
    expect(g.save.campaign.shift).toBe(2);
  });

  it('sleeps only at a safe parked Pit Stop, traverses events, and preserves physics and economy', () => {
    const g = make(); g.player.body.position = { ...GARAGE }; g.advanceNarrativeTo(dayMinute(2, 20)); g.setMode('paused');
    const cash = g.save.cash, time = g.time, health = g.health, player = g.player, keys = g.world;
    expect(g.sleepPreview.label).toBe('Day 3 · 07:00'); expect(g.sleepPreview.expiring).toContain('Temporary barriers');
    expect(g.sleep()).toBe(true); expect(g.save.campaign.world.cafe).toBe('boarded');
    expect(g.save.campaign.occurrences['cafe-windows-broken'].at).toBe(dayMinute(2, 23));
    expect(g.save.playerRecords.notebook).toEqual([]); expect(g.save.cash).toBe(cash);
    expect(g.player).toBe(player); expect(g.world).toBe(keys); expect(g.health).toBe(health); expect(g.time).toBe(time);
    expect(g.sleep()).toBe(false); // playing; duplicate clicks cannot consume another day
  });

  it('rejects sleep with passengers, pursuits, burning vehicles and away from Pit Stop', () => {
    const g = make(); arrive(g, g.job.pickup); g.player.body.position = { ...GARAGE }; g.setMode('paused');
    const snapshot = structuredClone(g.save); expect(g.sleep()).toBe(false); expect(g.save).toEqual(snapshot);
    g.newJob(false, 'shift'); g.heat = 1; expect(g.sleep()).toBe(false);
    g.heat = 0; g.player.damage.status = 'burning'; expect(g.sleep()).toBe(false);
    g.player.damage.status = 'intact'; g.player.body.position = vec(84, 58); expect(g.sleep()).toBe(false);
  });

  it('expires half-open pickup windows permanently without killing contacts or resurrecting offers', () => {
    const g = make(); const until = jobWindows['celia-barriers'].until;
    g.advanceNarrativeTo(until - 0.01); g.syncMissionOffers(); expect(g.routeMissionOffer('celia-barriers')).toBe(true);
    g.advanceNarrativeTo(until); g.syncMissionOffers(); expect(g.routeMissionOffer('celia-barriers')).toBe(false);
    expect(g.save.story.failed).toContain('celia-barriers'); expect(g.save.story.flags).not.toContain('contact-celia-lost');
    expect(g.save.playerRecords.texts.some(t => t.missionId === 'celia-barriers')).toBe(true);
    g.resetRun(); expect(g.missionOffers.has('celia-barriers')).toBe(false);
  });

  it('dates received texts on the campaign calendar across skipped time and save reloads', () => {
    const g = make(), first = structuredClone(g.save.playerRecords.texts.find(t => t.missionId === 'celia-barriers')!);
    expect(first.receivedMinute).toBe(dayMinute(1));
    expect(first.expiresMinute).toBe(jobWindows['celia-barriers'].until);
    advance(g, 3);
    const latest = g.save.playerRecords.texts.find(t => t.missionId === 'nico-safe-ride')!;
    expect(latest.receivedMinute).toBe(dayMinute(3));
    expect(latest.receivedAt).toBe(first.receivedAt); // No driving elapsed during the jump.
    expect(g.save.playerRecords.texts.find(t => t.messageId === first.messageId)).toEqual(first);
    const restored = new Game(defaultCompiledMap, false, true, structuredClone(g.save));
    expect(restored.save.playerRecords.texts).toEqual(g.save.playerRecords.texts);
    for (const t of restored.save.playerRecords.texts) expect(t.expiresMinute! - t.receivedMinute!).toBeGreaterThan(0);
    for (const mission of Object.values(openShoreCatalogue.missions)) if (mission.offer) {
      expect(mission.offer.text).not.toMatch(/(?:Available through|Through day|Pickup before|day \d+ only)/i);
    }
  });

  it('keeps an accepted passenger aboard after the text deadline', () => {
    const g = make(); expect(g.routeMissionOffer('celia-barriers')).toBe(true);
    arrive(g, g.job.pickup); expect(g.job.stage).toBe('dropoff');
    g.advanceNarrativeTo(jobWindows['celia-barriers'].until); g.syncMissionOffers();
    expect(g.job.missionId).toBe('celia-barriers'); expect(g.job.stage).toBe('dropoff');
    expect(g.save.story.failed).not.toContain('celia-barriers');
  });

  it('requires a deliberate café visit to acquire an observation and projects a real contractor van', () => {
    const g = make(); g.advanceNarrativeTo(dayMinute(2, 22));
    const van = g.vehicles.find(v => v.sourceId === 'campaign-ms14'); expect(van).toBeDefined();
    expect(g.world.props.filter(p => p.alive).some(p => contact(van!.body, p.body))).toBe(false);
    expect(g.save.playerRecords.notebook).toEqual([]); expect(g.observeScene()).toBe(false);
    advance(g, 3); g.player.body.position = { ...g.missions.catalogue.stops.byId['garden-cafe'].position };
    expect(g.observeScene()).toBe(true); expect(g.observeScene()).toBe(true);
    expect(g.save.playerRecords.notebook.filter(e => e.id === 'cafe-photo')).toHaveLength(1);
    g.advanceNarrativeTo(dayMinute(3, 12)); expect(van!.parked).toBe(false); expect(van!.alive).toBe(true); expect(van!.path.length).toBeGreaterThan(1);
  });

  it('commits competing bookings only at an explicitly selected physical pickup', () => {
    const g = make(); advance(g, 3); expect(g.routeMissionOffer('nico-safe-ride')).toBe(true);
    expect(g.save.story.choices).toEqual({}); arrive(g, g.job.pickup);
    expect(g.job.name).toBe('Nico'); expect(g.save.story.choices['nico-trip']).toBe('room');
    expect(g.save.story.flags).not.toContain('nico-safe');
    g.setMode('wasted'); g.recover(); g.resetRun();
    expect(g.missionOffers.has('nico-safe-ride')).toBe(true); expect(g.missionOffers.has('celia-roster')).toBe(false);
    deliver(g, 'nico-safe-ride'); expect(g.save.story.flags).toContain('nico-safe');
    const other = make(); advance(other, 3); other.save.campaign.ordinarySinceStory = 2; other.newJob();
    expect(other.missions.mission(other.job.missionId!)?.pickupChoice).toBeUndefined(); expect(other.save.story.choices).toEqual({});
  });

  it.each(['at-cafe', 'departed'] as const)('removes the old MS-14 van and spawns it once in a new campaign after %s', phase => {
    const g = make(); g.advanceNarrativeTo(dayMinute(2, 22));
    const old = g.vehicles.find(v => v.sourceId === 'campaign-ms14')!;
    expect(old).toBeDefined();
    if (phase === 'departed') g.advanceNarrativeTo(dayMinute(3, 12));
    g.resetStory();
    expect(g.save.campaign).toEqual(defaultCampaign());
    expect(g.vehicles.some(v => v.sourceId === 'campaign-ms14')).toBe(false);
    expect(old.alive).toBe(false);
    g.advanceNarrativeTo(dayMinute(2, 22));
    const vans = g.vehicles.filter(v => v.sourceId === 'campaign-ms14');
    expect(vans).toHaveLength(1); expect(vans[0]).not.toBe(old); expect(vans[0].parked).toBe(true);
    g.advanceNarrativeTo(dayMinute(2, 22, 1));
    expect(g.vehicles.filter(v => v.sourceId === 'campaign-ms14')).toEqual(vans);
  });

  it('preserves source loss and an independent evidence path', () => {
    const g = make(); advance(g, 6);
    const job = g.missionOffers.get('eli-originals')!, person = g.world.people.find(p => p.id === job.customerId)!;
    person.alive = false; g.death(person, vec(), 1, false); step(g);
    expect(g.save.story.flags).toContain('contact-eli-lost'); g.resetRun();
    expect(g.missionOffers.has('eli-originals')).toBe(false); expect(g.missionOffers.has('nico-safe-ride')).toBe(true);
  });

  it('uses a physical newsroom visit and distinguishes receipt, checks, editorial request, edition and response', () => {
    const g = make(); deliver(g, 'celia-barriers'); advance(g, 3); deliver(g, 'nico-safe-ride');
    arrive(g, g.missions.catalogue.stops.byId['garden-cafe'].position); expect(g.observeScene()).toBe(true);
    expect(g.submitMaterial('barrier-receipt')).toBe(false); arrive(g, g.newsroom); g.setMode('paused');
    expect(g.submitMaterial('leila-warning')).toBe(false);
    for (const id of ['barrier-receipt', 'cleaner-note', 'cafe-photo']) expect(g.submitMaterial(id)).toBe(true);
    const received = g.save.campaign.minute; expect(g.requestPublication('coordination')).toBe(false);
    g.advanceNarrativeTo(received + 180); expect(g.save.campaign.newsroom.cases.coordination?.approvedAt).toBeNull();
    expect(g.save.campaign.publications).toEqual([]); expect(g.requestPublication('coordination')).toBe(true);
    const edition = g.save.campaign.newsroom.cases.coordination!.editionAt!;
    g.advanceNarrativeTo(edition); expect(g.save.campaign.publications).toHaveLength(1); expect(g.save.campaign.world.security).toBe('contracted');
    expect(g.campaignBulletin).toContain('pending a response');
    g.advanceNarrativeTo(edition + 120); expect(g.save.campaign.world.security).toBe('suspended');
    expect(g.campaignBulletin).toContain('notice has come down'); expect(g.save.playerRecords.notebook.some(e => e.id === 'cafe-photo')).toBe(true);
  });

  it('keeps newsroom navigation separate from a co-located fare', () => {
    const g = make(); advance(g, 4); g.job.pickup = { ...g.newsroom }; g.navigateNewsroom(); arrive(g, g.newsroom);
    expect(g.job.stage).toBe('pickup'); expect(g.snapshot().navigation).toBe('newsroom');
    g.navigateNewsroom(); step(g); expect(g.job.stage).toBe('dropoff');
  });

  it.each(['bailout', 'hospital'] as const)('prioritizes replacement navigation after %s while retaining the newsroom route', recovery => {
    const g = make(); g.navigateNewsroom();
    g.player.damage.status = 'burning';
    const replacement = g.spawnVehicle({ position: vec(14, 34.6), parked: true });
    if (recovery === 'bailout') expect(g.interact()).toBe(true);
    else { g.player.damage.status = 'wreck'; g.setMode('wasted'); g.recover(); }
    expect(g.onFoot).toBe(true); expect(g.navToNewsroom).toBe(true);
    expect(g.target).toEqual(replacement.body.position);
    expect(g.snapshot().navigation).toBe('replacement');
    g.driver.position = replacement.body.toWorld(vec(0, 2));
    expect(g.interact()).toBe(true); expect(g.onFoot).toBe(false);
    expect(g.target).toEqual(g.newsroom); expect(g.snapshot().navigation).toBe('newsroom');
  });

  it('verifies fractional-time receipts during active play in time to approve the last edition', () => {
    const g = make(); deliver(g, 'celia-barriers'); advance(g, 3); deliver(g, 'nico-safe-ride');
    g.player.body.position = { ...g.missions.catalogue.stops.byId['garden-cafe'].position };
    expect(g.observeScene()).toBe(true);
    const due = LAST_EDITION - 0.5;
    g.advanceNarrativeTo(due - 180); g.player.body.position = { ...g.newsroom };
    for (const id of ['barrier-receipt', 'cleaner-note', 'cafe-photo']) expect(g.submitMaterial(id)).toBe(true);
    g.advanceNarrativeTo(due - 0.02);
    g.update(0.01); expect(g.save.campaign.newsroom.cases.coordination).toBeUndefined();
    expect(g.requestPublication('coordination')).toBe(false);
    g.update(0.02);
    expect(g.save.campaign.minute).toBeLessThan(LAST_EDITION);
    expect(g.save.campaign.newsroom.cases.coordination?.verifiedAt).toBe(due);
    expect(g.requestPublication('coordination')).toBe(true);
    step(g, 0.5);
    expect(g.save.campaign.publications).toMatchObject([{ allegation: 'coordination', at: LAST_EDITION }]);
  });

  it('ends at the fourteenth-night cutoff once; an uninterested driver can continue working', () => {
    const g = make(); g.advanceNarrativeTo(CAMPAIGN_END - 1); step(g, 2);
    expect(g.save.campaign.finished).toBe(true); expect(g.save.campaign.minute).toBe(CAMPAIGN_END);
    expect(g.campaignBulletin).toContain('remains the favourite'); g.newJob();
    expect(g.job.missionId).toBeUndefined(); expect(g.job.everyday).toBeDefined();
    expect(g.save.campaign.publications).toEqual([]); expect(notebookMarkup(g)).not.toMatch(/\d+%|truth score/i);
  });

  it('resumes an accepted ride and preserves all domains, without replaying its choice', () => {
    const g = make(); advance(g, 3); g.routeMissionOffer('nico-safe-ride'); arrive(g, g.job.pickup); g.persist();
    const stored = JSON.stringify(g.save);
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === storageKeys.save ? stored : null, setItem: vi.fn(), removeItem: vi.fn() });
    const loaded = new Game(); expect(loaded.save.campaign.minute).toBeCloseTo(g.save.campaign.minute);
    expect(loaded.job).toMatchObject({ missionId: 'nico-safe-ride', stage: 'dropoff' });
    expect(loaded.save.story.choices).toEqual({ 'nico-trip': 'room' });
    loaded.vehicles = [loaded.player]; loaded.trafficTarget = 0; loaded.settings.noPolice = true; loaded.start(); arrive(loaded, loaded.job.dropoff);
    expect(loaded.save.story.flags).toContain('nico-safe'); expect(loaded.save.story.completed.filter(id => id === 'nico-safe-ride')).toHaveLength(1);
    const snap = loaded.snapshot(); snap.campaign!.world.cafe = 'open'; expect(loaded.save.campaign.world.cafe).toBe('boarded');
    loaded.resetStory(); expect(loaded.save.campaign).toEqual(defaultCampaign()); expect(loaded.save.playerRecords.notebook).toEqual([]);
    expect(loaded.save.deliveries).toBe(1);
  });

  it('isolates map previews and temporary Lab games without reading or writing user storage', () => {
    const storage = { getItem: vi.fn(() => JSON.stringify(defaultSave())), setItem: vi.fn(), removeItem: vi.fn() }; vi.stubGlobal('localStorage', storage);
    const preview = new Game(defaultCompiledMap, false, false), laboratory = new Game(defaultCompiledMap, false, true, defaultSave());
    laboratory.advanceNarrativeTo(dayMinute(8)); laboratory.persist();
    expect(preview.campaignEnabled).toBe(false); expect(preview.missions.catalogue.order).toEqual([]);
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('rejects malformed calendar conditions and malformed record metadata', () => {
    const catalogue = structuredClone(openShoreCatalogue); (catalogue.missions['bea-first-shift'] as { requires: unknown }).requires = { minuteBefore: 20581 };
    expect(() => assertMissionCatalogue(catalogue)).toThrow();
    expect(parseCampaign(undefined)).toEqual(defaultCampaign());
    expect(parsePlayerRecords({ version: 1, texts: [], notebook: [{ id: 'bad', title: 'X', text: 'Y', shift: 99, at: 0, kind: 'observation' }] }).notebook).toEqual([]);
  });
});

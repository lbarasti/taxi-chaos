import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultCampaign, parseCampaign } from './state';
import { campaignDefinition, CAMPAIGN_END } from './content';
import { campaignDays, dayMinute, displayDay, editionTime } from './clock';
import { advanceCampaignTo, approvePublication, receiveMaterial } from './scheduler';
import { editionArticle } from './editions';
import { assertCampaignDefinition } from './validate';
import { Game, defaultSave } from '../game/game';
import { finaleMarkup, publicationsMarkup } from './newspaper-view';
import { playerHudState } from '../ui/player-hud';
import type { CampaignDefinition, EditionCondition } from './model';
import type { Condition, Effect } from '../missions/schema';
import { defaultMissionProgress } from '../missions/progress';
import { defaultPlayerRecords } from '../narrative/player-records';
import { escape } from './view';

function reported(definition = campaignDefinition) {
  const state = defaultCampaign(definition);
  advanceCampaignTo(state, dayMinute(11, 9), {}, definition);
  for (const id of ['eli-docket', 'contractor-register', 'patrol-register', 'complaint-log', 'hearing-copy', 'contract-carbon']) receiveMaterial(state, id, {}, definition);
  advanceCampaignTo(state, dayMinute(11, 12), {}, definition);
  for (const id of ['coordination', 'policing', 'knowledge']) expect(approvePublication(state, id, {}, definition)).toBe(true);
  return state;
}

describe('daily editions and campaign finale', () => {
  it('packages complete WebP files for every supplied newspaper photograph', () => {
    const directory = new URL('../assets/newspapers/', import.meta.url);
    const files = readdirSync(directory).filter(file => file.endsWith('.webp'));
    expect(files).toHaveLength(7);
    for (const file of files) {
      const bytes = readFileSync(new URL(file, directory));
      expect(bytes.length, file).toBeGreaterThan(1024);
      expect(bytes.toString('ascii', 0, 4), file).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 12), file).toBe('WEBP');
      expect(bytes.readUInt32LE(4) + 8, file).toBe(bytes.length);
    }
  });

  it('starts with a readable opening edition and prints at 06:00 independently of the overnight shift', () => {
    const state = defaultCampaign();
    expect(state.editions).toMatchObject([{ day: 1, at: dayMinute(1), articles: ['day-1'], read: false }]);
    advanceCampaignTo(state, dayMinute(2, 5, 59)); expect(state.editions).toHaveLength(1);
    advanceCampaignTo(state, dayMinute(2, 6)); expect(state.editions.at(-1)).toMatchObject({ day: 2, at: dayMinute(2, 6) });
    expect(state.shift).toBe(1); expect(displayDay(state.minute, campaignDefinition.timing)).toBe(2);
  });

  it('prints every due edition during skips, without duplicate issues or automatic reporting', () => {
    const state = defaultCampaign(); advanceCampaignTo(state, CAMPAIGN_END + 100);
    expect(state.editions.map(issue => issue.day)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(state.publications).toEqual([]);
    const history = structuredClone(state.editions); advanceCampaignTo(state, CAMPAIGN_END + 100);
    expect(state.editions).toEqual(history);
    const pictures = state.editions.map(issue => editionArticle(campaignDefinition, issue.articles[0])?.image).filter(Boolean);
    expect(pictures).toHaveLength(7); expect(new Set(pictures).size).toBe(pictures.length);
  });

  it('includes all simultaneous investigations before selecting the front page and never anticipates reactions', () => {
    const state = reported(); advanceCampaignTo(state, dayMinute(12, 6));
    const printed = structuredClone(state.editions.at(-1)!);
    expect(printed.articles).toEqual(['warning-investigation', 'patrol-investigation', 'closure-investigation', 'day-12']);
    expect(printed.briefs).not.toEqual(expect.arrayContaining(['contract-suspended', 'patrol-inquiry', 'appearance-cancelled']));
    advanceCampaignTo(state, dayMinute(13, 6));
    expect(state.editions.find(issue => issue.day === 12)).toEqual(printed);
    expect(state.editions.at(-1)?.briefs).toEqual(expect.arrayContaining(['contract-suspended', 'patrol-inquiry', 'appearance-cancelled']));
  });

  it('keeps printed selections and read status across reloads and later mutable world changes', () => {
    const state = reported(); advanceCampaignTo(state, dayMinute(13, 8));
    state.editions[0].read = true;
    const parsed = parseCampaign(JSON.parse(JSON.stringify(state)));
    expect(parsed).toEqual(state);
    const original = structuredClone(state.editions);
    state.world.cafe = 'open';
    expect(parseCampaign(state).editions).toEqual(original);
  });

  it('migrates existing saves without revealing later findings or public reactions in earlier editions', () => {
    const state = reported(); advanceCampaignTo(state, CAMPAIGN_END);
    const raw = { ...state, editions: undefined, endingSeen: undefined };
    const migrated = parseCampaign(raw);
    expect(migrated.editions).toEqual(state.editions);
    expect(migrated.endingSeen).toBe(false);
    expect(migrated.editions[0].briefs).toEqual([]);
    expect(migrated.editions[2].articles).toEqual(['day-3']);
  });

  it('discards corrupt archive references and ignores invented future editions', () => {
    const state = defaultCampaign(); advanceCampaignTo(state, dayMinute(3));
    const raw = structuredClone(state);
    raw.editions[1].articles = ['warning-investigation', '<script>bad</script>'];
    raw.editions.push({ day: 14, at: dayMinute(14, 6), articles: ['day-14'], briefs: [], read: true });
    expect(parseCampaign(raw).editions).toEqual(state.editions);
  });

  it('supports an independently authored three-day campaign and its own edition hour', () => {
    const definition: CampaignDefinition = { ...campaignDefinition, id: 'three-days', timing: { start: dayMinute(1), end: dayMinute(4), lastEdition: dayMinute(3, 5), editionHour: 5 },
      operations: [], claims: {}, materials: {}, missions: { schemaVersion: 1, dialogue: { welcome: { character: 'bea', category: 'lore', channel: 'passenger', text: 'A lift to the quay.' } }, missions: { 'quay-fare': { title: 'Quay fare', chapter: 1, category: 'lore', repeat: 'once', abandon: { retry: 'always' }, allowed: { jobs: ['fare'] }, requires: { minuteBefore: dayMinute(4) }, stops: { pickup: 'old-town-rank', dropoff: 'dockside-deli' }, beats: { pickup: 'welcome' } } } }, jobWindows: { 'quay-fare': { from: dayMinute(1), until: dayMinute(4) } }, observations: [], vehicles: [], scenes: [], bulletins: [], ordinaryResponses: [], milestones: [],
      newspaper: { ...campaignDefinition.newspaper!, daily: campaignDefinition.newspaper!.daily.slice(0, 3), investigations: {}, briefs: [] } };
    expect(() => assertCampaignDefinition(definition)).not.toThrow();
    const state = defaultCampaign(definition); advanceCampaignTo(state, dayMinute(20), {}, definition);
    expect(state.minute).toBe(dayMinute(4)); expect(state.finished).toBe(true); expect(campaignDays(definition.timing)).toBe(3);
    expect(state.editions.map(issue => issue.at)).toEqual([dayMinute(1), dayMinute(2, 5), dayMinute(3, 5)]);
    expect(parseCampaign(state, definition)).toEqual(state);
    const game = new Game(undefined, false, true, undefined, definition); game.start(); game.advanceNarrativeTo(dayMinute(20));
    expect(game.save.campaign.finished).toBe(true); expect(finaleMarkup(game)).toContain('3-DAY STORY');
  });

  it('persists reading without changing time, cash, dispatch or the physical world', () => {
    const game = new Game(undefined, false); game.start();
    const before = { time: game.time, minute: game.save.campaign.minute, cash: game.save.cash, job: structuredClone(game.job), position: { ...game.actor.position } };
    expect(game.readEdition(1)).toBe(true); expect(game.readEdition(1)).toBe(true); expect(game.readEdition(100)).toBe(false);
    expect(game.save.campaign.editions[0].read).toBe(true);
    expect({ time: game.time, minute: game.save.campaign.minute, cash: game.save.cash, job: game.job, position: game.actor.position }).toEqual(before);
    expect(parseCampaign(game.save.campaign).editions[0].read).toBe(true);
  });

  it('waits for fares, driving, dialogue and emergencies before the automatic finale', () => {
    const game = new Game(undefined, false); game.start(); game.advanceNarrativeTo(CAMPAIGN_END);
    game.heat = 0; game.player.body.velocity = { x: 0, y: 0 };
    expect(game.campaignFinaleReady).toBe(true);
    game.player.body.velocity.x = 2; expect(game.campaignFinaleReady).toBe(false); game.player.body.velocity.x = 0;
    game.job.stage = 'dropoff'; expect(game.campaignFinaleReady).toBe(false); game.job.stage = 'pickup';
    game.heat = 1; expect(game.campaignFinaleReady).toBe(false); game.heat = 0;
    game.player.damage.status = 'burning'; expect(game.campaignFinaleReady).toBe(false); game.player.damage.status = 'intact';
    expect(parseCampaign(game.save.campaign).endingSeen).toBe(false);
  });

  it('acknowledges completion once while keeping career assets and dispatch available in arcade mode', () => {
    const game = new Game(undefined, false); game.start();
    expect(game.continueArcade()).toBe(false);
    game.save.cash = 1234; game.save.deliveries = 12; game.player.upgrades.engine = 2; game.persist();
    game.advanceNarrativeTo(CAMPAIGN_END);
    const garage = structuredClone(game.save.garage);
    expect(finaleMarkup(game)).toContain('Closure arrangements remained unresolved');
    expect(finaleMarkup(game)).toContain('Continue in arcade mode');
    expect(game.continueArcade()).toBe(true); expect(game.campaignFinaleReady).toBe(false);
    expect(parseCampaign(game.save.campaign).endingSeen).toBe(true);
    game.newJob(false, 'replaced', true); expect(game.job.missionId).toBeUndefined();
    expect(game.save.cash).toBe(1234); expect(game.save.deliveries).toBe(12); expect(game.save.garage).toEqual(garage); expect(game.player.upgrades.engine).toBe(2);
    const time = game.dayNight.snapshot().time; game.update(60); expect(game.dayNight.snapshot().time).not.toBe(time);
    expect(playerHudState(game).day).toBe('Arcade');
  });

  it('renders the archived front page with its own picture and keeps unverified allegations out', () => {
    const game = new Game(undefined, false); game.advanceNarrativeTo(dayMinute(5));
    const html = publicationsMarkup(game, 3);
    expect(html).toContain('Garden Café windows broken overnight'); expect(html).toContain('data-edition-day="3"');
    expect(html).toContain(`src="${campaignDefinition.newspaper!.daily[2].image}"`);
    expect(html).not.toContain('Vale retained Meridian'); expect(html).not.toContain('Patrol inquiry opened');
    expect(html).toContain('Edition archive');
    expect(publicationsMarkup(game, 5)).not.toContain('data-edition-day="6"');
  });


  it('settles start-time operations in scheduler order before the opening paper, exactly once', () => {
    const press = campaignDefinition.newspaper!;
    const definition: CampaignDefinition = { ...campaignDefinition,
      initialWorld: { ...campaignDefinition.initialWorld, opening: 'pending' },
      operations: [
        { id: 'z-opening', at: campaignDefinition.timing.start, effects: [], outcomes: [
          { id: 'ready', requires: { worldEquals: { key: 'opening', value: 'ready' } }, effects: [
            { setWorld: { key: 'opening', value: 'printed' } }, { setFlag: 'opening-recorded' },
            { relationship: { character: 'bea', delta: 1 } }, { acquireMaterial: 'eli-docket' },
          ] }, { id: 'missed', effects: [] },
        ] },
        { id: 'a-opening', at: campaignDefinition.timing.start, effects: [{ setWorld: { key: 'opening', value: 'ready' } }] },
        ...campaignDefinition.operations,
      ],
      newspaper: { ...press, briefs: [
        { id: 'opening-ready', requires: { all: [{ occurred: 'z-opening' }, { worldEquals: { key: 'opening', value: 'printed' } }] }, title: 'Opening news', text: 'The opening operations have settled.' },
        { id: 'opening-pending', requires: { worldEquals: { key: 'opening', value: 'pending' } }, title: 'Pending news', text: 'This should never print.' },
      ] },
    };
    expect(() => assertCampaignDefinition(definition)).not.toThrow();
    const save = defaultSave(definition);
    expect(save.campaign.occurrences['z-opening'].outcome).toBe('ready');
    expect(save.campaign.editions[0].briefs).toEqual(['opening-ready']);
    expect(save.story.flags).toContain('opening-recorded');
    expect(save.story.relationships.bea).toBe(1);
    expect(save.playerRecords.notebook.map(entry => entry.id)).toContain('eli-docket');
    const inputs = { progress: save.story, records: save.playerRecords };
    const before = structuredClone(save);
    expect(advanceCampaignTo(save.campaign, definition.timing.start, inputs, definition)).toBe(false);
    const parsed = parseCampaign({ ...save.campaign, editions: undefined }, definition, inputs);
    expect(parsed).toEqual(save.campaign);
    expect(save).toEqual(before); // Loading must not repeat relationship or knowledge effects.
    advanceCampaignTo(save.campaign, dayMinute(4), inputs, definition);
    expect(parseCampaign({ ...save.campaign, editions: undefined }, definition, inputs).editions).toEqual(save.campaign.editions);
    expect(save.story.relationships.bea).toBe(1);
  });

  it('reconstructs every supported brief predicate at its own printing boundary', () => {
    const press = campaignDefinition.newspaper!;
    const conditions: Record<string, EditionCondition> = {
      'later-shift': { shiftAtLeast: 3 }, 'opening-shift': { shiftAtMost: 1 },
      'later-time': { minuteAtLeast: dayMinute(5, 6) }, 'early-time': { minuteBefore: dayMinute(5, 6) },
      'count-ready': { worldAtLeast: { key: 'history-count', value: 1 } },
      'count-exact': { worldEquals: { key: 'history-count', value: 1 } },
      'branch-recorded': { worldEquals: { key: 'history-branch', value: 'chosen' } },
      'operation-recorded': { occurred: 'z-history' },
      'report-published': { published: 'knowledge' }, 'response-recorded': { reacted: 'knowledge' },
      'nested-facts': { all: [{ any: [{ shiftAtMost: 1 }, { worldAtLeast: { key: 'history-count', value: 1 } }] }, { not: { published: 'knowledge' } }] },
    };
    const definition: CampaignDefinition = { ...campaignDefinition,
      initialWorld: { ...campaignDefinition.initialWorld, 'history-count': 0, 'history-branch': 'pending' },
      operations: [
        { id: 'z-history', at: dayMinute(2, 6), effects: [{ setWorld: { key: 'history-count', value: 1 } }], outcomes: [
          { id: 'selected', requires: { flag: 'historical-choice' }, effects: [{ setWorld: { key: 'history-branch', value: 'chosen' } }] },
          { id: 'fallback', effects: [] },
        ] },
        { id: 'a-history', at: dayMinute(2, 6), effects: [{ setWorld: { key: 'history-count', value: 2 } }] },
        { id: 'reset-history', at: dayMinute(5, 6), effects: [{ setWorld: { key: 'history-count', value: 0 } }] },
        ...campaignDefinition.operations,
      ],
      newspaper: { ...press, briefs: Object.entries(conditions).map(([id, requires]) => ({ id, requires, title: id, text: 'Historical coverage.' })) },
    };
    expect(() => assertCampaignDefinition(definition)).not.toThrow();
    const progress = defaultMissionProgress(), records = defaultPlayerRecords(), inputs = { progress, records };
    progress.flags.push('historical-choice');
    const state = defaultCampaign(definition, inputs);
    // Printing live in small steps and skipping must agree with reconstruction.
    for (let day = 1; day <= 11; day++) advanceCampaignTo(state, dayMinute(day, 9), inputs, definition);
    for (const id of ['eli-docket', 'contractor-register', 'patrol-register', 'complaint-log', 'hearing-copy', 'contract-carbon']) receiveMaterial(state, id, inputs, definition);
    advanceCampaignTo(state, dayMinute(11, 12), inputs, definition);
    for (const id of ['coordination', 'policing', 'knowledge']) expect(approvePublication(state, id, inputs, definition)).toBe(true);
    advanceCampaignTo(state, definition.timing.end, inputs, definition);
    progress.flags = []; // Reconstruct the recorded branch, not its final prerequisite.
    const before = structuredClone(state);
    const migrated = parseCampaign({ ...state, editions: undefined }, definition);
    expect(migrated.editions).toEqual(state.editions);
    expect(state).toEqual(before);
    expect(migrated.editions[0].briefs).toEqual(['opening-shift', 'early-time', 'nested-facts']);
    expect(migrated.editions[1].briefs).toContain('count-ready');
    expect(migrated.editions[1].briefs).toContain('branch-recorded');
    expect(migrated.editions[1].briefs).not.toContain('later-shift');
    expect(migrated.editions[4].briefs).not.toContain('count-ready');
    expect(migrated.editions[11].briefs).toContain('report-published');
    expect(migrated.editions[11].briefs).not.toContain('response-recorded');
    expect(migrated.editions[12].briefs).toContain('response-recorded');
  });

  it.each<Condition>([
    { flag: 'mutable-flag' }, { knows: 'eli-docket' }, { materialState: { id: 'eli-docket', state: 'verified' } },
    { caseState: { id: 'knowledge', state: 'approved' } }, { minDeliveries: 1 }, { minCareerDeliveries: 1 },
    { chapter: 2 }, { relationshipAtLeast: { character: 'bea', value: 1 } },
    { missionCompleted: Object.keys(campaignDefinition.missions.missions)[0] },
    { choiceUnset: Object.values(campaignDefinition.missions.missions).flatMap(mission => mission.choices ?? [])[0].id },
    { choiceEquals: { group: Object.values(campaignDefinition.missions.missions).flatMap(mission => mission.choices ?? [])[0].id, choice: Object.values(campaignDefinition.missions.missions).flatMap(mission => mission.choices ?? [])[0].options[0].id } },
  ])('rejects brief predicates whose history is not reconstructible: %j', requires => {
    const press = campaignDefinition.newspaper!;
    // Imported content must be checked recursively, even if it bypasses TypeScript.
    const definition = { ...campaignDefinition, newspaper: { ...press, briefs: [{ id: 'unsafe-history', title: 'Unsafe', text: 'Unsafe.', requires: { all: [{ any: [{ not: requires }] }] } }] } } as CampaignDefinition;
    expect(() => assertCampaignDefinition(definition)).toThrow(/reconstructible historical predicate/);
  });

  it.each(['handler', 'mission', 'contact', 'choice'] as const)('rejects world briefs with unrecorded %s writes', source => {
    const press = campaignDefinition.newspaper!, write: Effect = { setWorld: { key: 'cafe', value: 'open' } };
    const [id, mission] = Object.entries(campaignDefinition.missions.missions)[0];
    const definition: CampaignDefinition = { ...campaignDefinition,
      handlers: source === 'handler' ? [...campaignDefinition.handlers, { on: 'pickup', effects: [write] }] : campaignDefinition.handlers,
      missions: { ...campaignDefinition.missions, missions: { ...campaignDefinition.missions.missions, [id]: { ...mission,
        ...(source === 'mission' ? { effects: [write] } : {}),
        ...(source === 'contact' ? { contactLost: { effects: [write] } } : {}),
        ...(source === 'choice' ? { choices: [{ id: 'history-choice', commit: 'pickup', options: [{ id: 'write', effects: [write] }] }] } : {}),
      } } },
      newspaper: { ...press, briefs: [{ id: 'unsafe-world', title: 'Unsafe', text: 'Unsafe.', requires: { worldEquals: { key: 'cafe', value: 'open' } } }] },
    };
    expect(() => assertCampaignDefinition(definition)).toThrow(/unrecorded world changes/);
  });

  it('makes every simultaneously published article readable without changing the front-page hierarchy', () => {
    const game = new Game(undefined, false);
    const state = reported(); advanceCampaignTo(state, dayMinute(12, 6));
    game.save.campaign = state;
    const snapshot = structuredClone(state), issue = state.editions.at(-1)!;
    const front = publicationsMarkup(game, 12);
    expect(front).toContain('data-article="warning-investigation"');
    expect(front.match(/data-read-article=/g)).toHaveLength(3);
    for (const id of issue.articles) {
      const article = editionArticle(game.campaignContent, id)!;
      const html = publicationsMarkup(game, 12, 'newsroom', id);
      expect(html).toContain(`data-article="${id}"`);
      expect(html).toContain('Back to front page');
      for (const paragraph of article.body) expect(html).toContain(`<p>${escape(paragraph)}</p>`);
    }
    expect(publicationsMarkup(game, 12, 'newsroom', 'day-14')).toEqual(front);
    expect(publicationsMarkup(game, 12, 'newsroom', 'invented-article')).toEqual(front);
    expect(state).toEqual(snapshot);
  });

  it('validates timing, IDs and distinct supplied photographs', () => {
    expect(() => assertCampaignDefinition({ ...campaignDefinition, timing: { ...campaignDefinition.timing, end: Infinity } })).toThrow(/timing/);
    const press = campaignDefinition.newspaper!;
    expect(() => assertCampaignDefinition({ ...campaignDefinition, newspaper: { ...press, daily: [press.daily[0]] } })).toThrow(/Every campaign day/);
    const duplicate = press.daily.map((article, i) => i === 1 ? { ...article, image: press.daily[0].image } : article);
    expect(() => assertCampaignDefinition({ ...campaignDefinition, newspaper: { ...press, daily: duplicate } })).toThrow(/distinct/);
    expect(editionTime(14, campaignDefinition.timing)).toBe(campaignDefinition.timing.lastEdition);
  });
});

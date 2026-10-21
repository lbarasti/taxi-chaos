import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultCampaign, parseCampaign } from './state';
import { campaignDefinition, CAMPAIGN_END } from './content';
import { campaignDays, dayMinute, displayDay, editionTime } from './clock';
import { advanceCampaignTo, approvePublication, receiveMaterial } from './scheduler';
import { editionArticle } from './editions';
import { assertCampaignDefinition } from './validate';
import { Game } from '../game/game';
import { finaleMarkup, publicationsMarkup } from './newspaper-view';
import { playerHudState } from '../ui/player-hud';
import type { CampaignDefinition } from './model';

function reported() {
  const state = defaultCampaign();
  advanceCampaignTo(state, dayMinute(11, 9));
  for (const id of ['eli-docket', 'contractor-register', 'patrol-register', 'complaint-log', 'hearing-copy', 'contract-carbon']) receiveMaterial(state, id);
  advanceCampaignTo(state, dayMinute(11, 12));
  for (const id of ['coordination', 'policing', 'knowledge']) expect(approvePublication(state, id)).toBe(true);
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

  it('validates timing, IDs and distinct supplied photographs', () => {
    expect(() => assertCampaignDefinition({ ...campaignDefinition, timing: { ...campaignDefinition.timing, end: Infinity } })).toThrow(/timing/);
    const press = campaignDefinition.newspaper!;
    expect(() => assertCampaignDefinition({ ...campaignDefinition, newspaper: { ...press, daily: [press.daily[0]] } })).toThrow(/Every campaign day/);
    const duplicate = press.daily.map((article, i) => i === 1 ? { ...article, image: press.daily[0].image } : article);
    expect(() => assertCampaignDefinition({ ...campaignDefinition, newspaper: { ...press, daily: duplicate } })).toThrow(/distinct/);
    expect(editionTime(14, campaignDefinition.timing)).toBe(campaignDefinition.timing.lastEdition);
  });
});

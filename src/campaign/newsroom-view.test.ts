import { describe, expect, it } from 'vitest';
import { Game } from '../game/game';
import { recordNote } from './effects';
import { campaignDefinition } from './content';
import { calendarLabel, dayMinute } from './clock';
import { LAST_EDITION } from './content';
import { approvePublication, receiveMaterial } from './scheduler';
import { notebookMarkup, recordMarkup } from './view';
import { newsroomMarkup, newsroomRecords, newsroomSummary } from './newsroom-view';
import { drawerParent, isDrawerPage } from '../ui/drawer-view';

function collect(game: Game, ...ids: string[]) {
  for (const id of ids) recordNote(game.campaignContext, { id, ...(game.campaignContent.materials[id] ?? { title: 'Ordinary fare', text: 'A regular journey.', kind: 'receipt' as const }) });
}
function submit(game: Game, ...ids: string[]) {
  for (const id of ids) expect(receiveMaterial(game.save.campaign, id, game.campaignContext, game.campaignContent)).toBe(true);
}

describe('newsroom drawer', () => {
  it('summarizes discovered sources without counting general records or revealing future material', () => {
    const game = new Game(undefined, false);
    expect(newsroomSummary(game)).toMatchObject({ toSubmit: 0, checking: 0, ready: 0 });
    collect(game, 'cafe-photo', 'barrier-receipt', 'cleaner-note', 'bea-repair', 'ordinary-fare');
    collect(game, 'cafe-photo');
    submit(game, 'cleaner-note', 'bea-repair');
    const before = structuredClone(game.save);
    expect(newsroomSummary(game).summary).toBe('2 sources to submit · 1 source being checked · No stories ready for the editor');
    const html = newsroomMarkup(game);
    expect(html).toContain('class="game-menu"'); expect(html).toContain('class="menu-item"');
    expect(html).toContain('Route to newsroom'); expect(html).not.toContain('Dispatch notebook');
    expect(html).not.toContain('Other notes');
    expect(html).not.toContain('data-publish');
    for (const entry of game.save.playerRecords.notebook) expect(html).not.toContain(entry.title);
    for (const [id, material] of Object.entries(game.campaignContent.materials)) {
      if (!game.save.playerRecords.notebook.some(entry => entry.id === id)) expect(html).not.toContain(material.title);
    }
    for (const claim of Object.values(game.campaignContent.claims)) expect(html).not.toContain(claim.title);
    expect(html).not.toContain('data-submit="bea-repair"');
    expect(html).not.toContain('data-submit="ordinary-fare"');
    expect(game.save).toEqual(before);
  });

  it('partitions discovered records exactly once and reuses notebook widgets without advertising general notes', () => {
    const game = new Game(undefined, false);
    collect(game, 'cafe-photo', 'barrier-receipt', 'cleaner-note', 'bea-repair', 'ordinary-fare');
    recordNote(game.campaignContext, { id: 'conversation', title: 'A conversation', text: 'Just chatting.', kind: 'conversation' });
    submit(game, 'cleaner-note', 'bea-repair');
    const records = newsroomRecords(game);
    expect(records.toSubmit.map(e => e.id)).toEqual(['barrier-receipt', 'cafe-photo']);
    expect(records.checking.map(e => e.id)).toEqual(['cleaner-note']);
    expect(records.checked).toEqual([]);
    const html = newsroomMarkup(game);
    for (const [key, title] of [['sources', 'Sources'], ['stories', 'Stories at the editor']]) {
      expect(html).toContain(`data-newsroom-section="${key}"`);
      expect(html).toContain(`<span>${title}</span>`);
      expect(html).toContain(`aria-controls="newsroom-detail" aria-pressed="false"`);
    }
    expect(html).not.toContain('data-record=');
    const detail = newsroomMarkup(game, 'sources');
    for (const [key, entries] of [['to-submit', records.toSubmit], ['checking', records.checking], ['checked', records.checked]] as const) {
      expect(html).not.toContain(`data-newsroom-section="${key}"`);
      expect(detail).toContain(`id="newsroom-${key}"`);
      const group = detail.split(`id="newsroom-${key}"`)[1].split('</section>')[0];
      for (const entry of entries) {
        expect(detail.match(new RegExp(`data-record="${entry.id}"`, 'g'))).toHaveLength(1);
        expect(group).toContain(recordMarkup(game, entry, true, true));
      }
      for (const id of ['conversation', 'ordinary-fare', 'bea-repair']) expect(detail).not.toContain(`data-record="${id}"`);
    }
    expect(detail).toContain(`source check due ${calendarLabel(game.save.campaign.newsroom.received['cleaner-note'].at + 180)}`);
    expect(detail.indexOf('id="newsroom-to-submit"')).toBeLessThan(detail.indexOf('id="newsroom-checking"'));
    expect(detail.indexOf('id="newsroom-checking"')).toBeLessThan(detail.indexOf('id="newsroom-checked"'));
    // A duplicated legacy entry cannot inflate the source list or summary.
    game.save.playerRecords.notebook.push({ ...records.toSubmit[0] });
    expect(newsroomRecords(game).toSubmit).toHaveLength(2);
    expect(newsroomSummary(game).toSubmit).toBe(2);
  });

  it('moves sources at the exact check boundary, retains copies and does not invent a story', () => {
    const game = new Game(undefined, false);
    collect(game, 'cleaner-note'); submit(game, 'cleaner-note');
    game.advanceNarrativeTo(game.save.campaign.minute + 179);
    expect(newsroomRecords(game).checking.map(e => e.id)).toEqual(['cleaner-note']);
    game.advanceNarrativeTo(game.save.campaign.minute + 1);
    expect(newsroomRecords(game).checking).toEqual([]);
    expect(newsroomRecords(game).checked.map(e => e.id)).toEqual(['cleaner-note']);
    expect(newsroomMarkup(game, 'sources')).toContain('Source checked · copy retained');
    expect(newsroomMarkup(game, 'sources')).toContain('Verified material, not necessarily a complete story.');
    expect(newsroomMarkup(game, 'stories')).not.toContain('data-story=');
    expect(game.save.playerRecords.notebook).toHaveLength(1);
  });

  it('starts the detail pane with Back and makes every source one selectable row with only valid actions', () => {
    const game = new Game(undefined, false);
    game.start(); game.player.body.position = { ...game.newsroom }; game.setMode('paused');
    collect(game, 'cafe-photo', 'cleaner-note', 'barrier-receipt');
    submit(game, 'cleaner-note'); game.advanceNarrativeTo(game.save.campaign.minute + 180);
    submit(game, 'barrier-receipt');
    const html = newsroomMarkup(game, 'sources').split('id="newsroom-detail"')[1];
    expect(html.indexOf('id="newsroom-menu"')).toBeLessThan(html.indexOf('id="newsroom-detail-title"'));
    expect(html.match(/class="menu-item newsroom-source"/g)).toHaveLength(3);
    for (const id of ['cafe-photo', 'cleaner-note', 'barrier-receipt']) {
      const row = html.split(`data-record="${id}"`)[1].split('</article>')[0];
      expect(row.match(/<button /g)).toHaveLength(1);
      expect(row).not.toMatch(/\sdisabled(?:\s|>)/);
      expect(row).toContain(`id="submit-${id}"`);
      if (id === 'cafe-photo') {
        expect(row).toContain('data-submit="cafe-photo"');
        expect(row).not.toContain('aria-disabled');
      } else {
        expect(row).toContain('aria-disabled="true"');
        expect(row).not.toContain('data-submit');
      }
    }
  });

  it('does not equate a checked source or a fully collected route with a ready story', () => {
    const game = new Game(undefined, false);
    collect(game, 'eli-docket', 'contractor-register');
    expect(newsroomSummary(game)).toMatchObject({ toSubmit: 2, ready: 0 });
    submit(game, 'eli-docket'); game.advanceNarrativeTo(game.save.campaign.minute + 180);
    expect(newsroomSummary(game)).toMatchObject({ toSubmit: 1, checking: 0, ready: 0 });
    submit(game, 'contractor-register');
    expect(newsroomSummary(game)).toMatchObject({ checking: 1, ready: 0 });
    game.advanceNarrativeTo(game.save.campaign.minute + 179);
    expect(newsroomSummary(game).ready).toBe(0);
    game.advanceNarrativeTo(game.save.campaign.minute + 1);
    expect(newsroomSummary(game).summary).toBe('0 sources to submit · 0 sources being checked · 1 story ready for the editor');
    expect(newsroomMarkup(game, 'stories')).toContain('Ready for editorial review.');
    expect(approvePublication(game.save.campaign, 'coordination', game.campaignContext)).toBe(true);
    expect(newsroomSummary(game).ready).toBe(0);
    expect(newsroomMarkup(game, 'stories')).toContain(`Editor accepted · ${calendarLabel(dayMinute(2, 6))} edition.`);
    game.advanceNarrativeTo(dayMinute(2, 6));
    expect(game.save.campaign.publications).toHaveLength(1);
    expect(newsroomSummary(game).ready).toBe(0);
    expect(newsroomMarkup(game, 'stories')).toContain(`Published · ${calendarLabel(dayMinute(2, 6))} edition.`);
    expect(newsroomMarkup(game, 'stories')).not.toContain('data-publish=');
  });

  it('uses approval dependencies independently from verification and publication conditions', () => {
    const game = new Game(undefined, false);
    collect(game, 'eli-docket', 'contractor-register', 'lena-order', 'harker-docket', 'hearing-copy', 'contract-carbon');
    submit(game, ...game.save.playerRecords.notebook.map(entry => entry.id));
    game.advanceNarrativeTo(game.save.campaign.minute + 180);
    expect(Object.keys(game.save.campaign.newsroom.cases)).toHaveLength(3);
    expect(newsroomSummary(game).ready).toBe(2); // knowledge awaits both approvals
    const knowledge = newsroomMarkup(game, 'stories').split('data-story="knowledge"')[1].split('</article>')[0];
    expect(knowledge).toContain('Not ready for editorial review.');
    expect(knowledge).not.toContain('Ready for editorial review.');
    expect(approvePublication(game.save.campaign, 'coordination', game.campaignContext)).toBe(true);
    expect(newsroomSummary(game).ready).toBe(1);
    expect(approvePublication(game.save.campaign, 'policing', game.campaignContext)).toBe(true);
    expect(game.save.campaign.publications).toHaveLength(0);
    expect(newsroomSummary(game).ready).toBe(1); // publication dependencies do not block review
    expect(approvePublication(game.save.campaign, 'knowledge', game.campaignContext)).toBe(true);
    expect(newsroomSummary(game).ready).toBe(0);
  });

  it('honors deadlines and finished campaigns while retaining records', () => {
    const game = new Game(undefined, false);
    collect(game, 'cafe-photo');
    game.save.campaign.newsroom.cases.coordination = { verifiedAt: 600, approvedAt: null, editionAt: null };
    expect(newsroomSummary(game).ready).toBe(1);
    game.save.campaign.minute = LAST_EDITION;
    expect(newsroomSummary(game)).toMatchObject({ toSubmit: 1, ready: 0, closed: true });
    expect(newsroomMarkup(game)).toContain('The final edition has closed.');
    expect(newsroomMarkup(game, 'sources')).toContain('Final edition closed · unsubmitted copies retained.');
    expect(newsroomMarkup(game, 'stories')).toContain('Publication deadline passed.');
    expect(newsroomMarkup(game, 'sources')).toContain('Edition closed · record retained');
    expect(newsroomSummary(game).summary).toContain('1 source not submitted');
    game.save.campaign.minute = 600; game.save.campaign.finished = true;
    expect(newsroomSummary(game)).toMatchObject({ ready: 0, closed: true });
    expect(game.save.playerRecords.notebook).toHaveLength(1);
  });

  it('counts shared sources once and supports independently authored claim IDs', () => {
    const definition = { ...campaignDefinition, claims: { ...campaignDefinition.claims,
      first: { title: 'First story', routes: [['cafe-photo']], reactionEffects: [] },
      second: { title: 'Second story', routes: [['cafe-photo']], reactionEffects: [] },
    } };
    const game = new Game(undefined, false, true, undefined, definition);
    collect(game, 'cafe-photo'); expect(newsroomSummary(game).toSubmit).toBe(1);
    submit(game, 'cafe-photo'); game.advanceNarrativeTo(game.save.campaign.minute + 180);
    expect(newsroomSummary(game).summary).toBe('0 sources to submit · 0 sources being checked · 2 stories ready for the editor');
  });

  it('keeps the notebook back destination tied to the entry point', () => {
    const game = new Game(undefined, false);
    expect(isDrawerPage('newsroom')).toBe(true);
    expect(drawerParent('newsroom')).toBeNull();
    expect(drawerParent('notebook')).toBe('home');
    expect(drawerParent('notebook', 'newsroom')).toBe('newsroom');
    expect(drawerParent('notebook-guide', 'newsroom')).toBe('notebook');
    expect(notebookMarkup(game)).toContain('Back to pause menu');
    expect(notebookMarkup(game, 'newsroom')).toContain('data-page="newsroom"><span>Back to newsroom');
    game.navToNewsroom = true;
    expect(newsroomMarkup(game)).toContain('Cancel newsroom route');
  });
});

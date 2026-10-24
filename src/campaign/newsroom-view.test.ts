import { describe, expect, it } from 'vitest';
import { Game } from '../game/game';
import { recordNote } from './effects';
import { campaignDefinition } from './content';
import { calendarLabel, dayMinute } from './clock';
import { LAST_EDITION } from './content';
import { receiveMaterial } from './scheduler';
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
    expect(newsroomSummary(game)).toMatchObject({ toSubmit: 0, checking: 0 });
    collect(game, 'cafe-photo', 'barrier-receipt', 'cleaner-note', 'bea-repair', 'ordinary-fare');
    collect(game, 'cafe-photo');
    submit(game, 'cleaner-note', 'bea-repair');
    const before = structuredClone(game.save);
    expect(newsroomSummary(game).summary).toBe('2 sources to submit · 1 source being checked');
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
    for (const [key, title] of [['sources', 'Sources']]) {
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
    expect(game.save.campaign.newsroom.cases).toEqual({});
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

  it('keeps publication authorization and story sections out of both newsroom and notebook', () => {
    const game = new Game(undefined, false);
    collect(game, 'eli-docket', 'contractor-register');
    submit(game, 'eli-docket', 'contractor-register');
    game.advanceNarrativeTo(game.save.campaign.minute + 180);
    expect(game.save.campaign.newsroom.cases.coordination?.editionAt).toBe(dayMinute(2, 6));
    for (const html of [newsroomMarkup(game), newsroomMarkup(game, 'sources'), notebookMarkup(game)]) {
      expect(html).not.toMatch(/data-publish|data-story|Stories at the editor|At the editor’s desk|editorial review/);
    }
    expect(newsroomSummary(game).summary).toBe('0 sources to submit · 0 sources being checked');
    expect(newsroomMarkup(game)).toContain('Complete stories are automatically scheduled for the next edition.');
    game.advanceNarrativeTo(dayMinute(2, 6));
    expect(game.save.campaign.publications).toHaveLength(1);
  });

  it('honors deadlines and finished campaigns while retaining records', () => {
    const game = new Game(undefined, false);
    collect(game, 'cafe-photo');
    game.save.campaign.minute = LAST_EDITION;
    expect(newsroomSummary(game)).toMatchObject({ toSubmit: 1, closed: true });
    expect(newsroomMarkup(game)).toContain('The final edition has closed.');
    expect(newsroomMarkup(game, 'sources')).toContain('Final edition closed · unsubmitted copies retained.');
    expect(newsroomMarkup(game, 'sources')).toContain('Edition closed · record retained');
    expect(newsroomSummary(game).summary).toContain('1 source not submitted');
    game.save.campaign.minute = 600; game.save.campaign.finished = true;
    expect(newsroomSummary(game)).toMatchObject({ closed: true });
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
    expect(newsroomSummary(game).summary).toBe('0 sources to submit · 0 sources being checked');
  });

  it('keeps the notebook inside the shift rather than a standalone drawer page', () => {
    const game = new Game(undefined, false);
    expect(isDrawerPage('newsroom')).toBe(true);
    expect(drawerParent('newsroom')).toBeNull();
    expect(drawerParent('shift')).toBe('home');
    expect(isDrawerPage('notebook')).toBe(false);
    expect(isDrawerPage('notebook-guide')).toBe(false);
    game.navToNewsroom = true;
    expect(newsroomMarkup(game)).toContain('Cancel newsroom route');
  });
});

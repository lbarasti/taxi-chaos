import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { recordNote } from './effects';
import { campaignDefinition } from './content';
import { dayMinute, LAST_EDITION } from './clock';
import { approvePublication, receiveMaterial } from './scheduler';
import { notebookMarkup } from './view';
import { newsroomMarkup, newsroomSummary } from './newsroom-view';
import { drawerParent, isDrawerPage } from '../drawer-view';

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
    expect(html).toContain('Route to newsroom'); expect(html).toContain('Dispatch notebook');
    expect(html).not.toContain('data-submit'); expect(html).not.toContain('data-publish');
    for (const material of Object.values(game.campaignContent.materials)) expect(html).not.toContain(material.title);
    expect(game.save).toEqual(before);
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
    expect(approvePublication(game.save.campaign, 'coordination', game.campaignContext)).toBe(true);
    expect(newsroomSummary(game).ready).toBe(0);
    game.advanceNarrativeTo(dayMinute(2, 6));
    expect(game.save.campaign.publications).toHaveLength(1);
    expect(newsroomSummary(game).ready).toBe(0);
  });

  it('uses approval dependencies independently from verification and publication conditions', () => {
    const game = new Game(undefined, false);
    collect(game, 'eli-docket', 'contractor-register', 'lena-order', 'harker-docket', 'hearing-copy', 'contract-carbon');
    submit(game, ...game.save.playerRecords.notebook.map(entry => entry.id));
    game.advanceNarrativeTo(game.save.campaign.minute + 180);
    expect(Object.keys(game.save.campaign.newsroom.cases)).toHaveLength(3);
    expect(newsroomSummary(game).ready).toBe(2); // knowledge awaits both approvals
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

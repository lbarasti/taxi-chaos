import type { Game } from '../game';
import { menuItem } from '../drawer-markup';
import { LAST_EDITION } from './clock';
import { canApprove } from './events';
import { editorialMarkup, recordMarkup } from './view';

/** Route membership, not merely authored-material membership, makes a publication source. */
const publicationSources = (game: Game) => new Set(Object.values(game.campaignContent.claims).flatMap(claim => claim.routes.flat()));
const sections = { 'to-submit': 'To submit', checking: 'Being checked', checked: 'Checked sources', stories: 'Published stories' } as const;
export type NewsroomSection = keyof typeof sections;
export const isNewsroomSection = (id: string): id is NewsroomSection => Object.hasOwn(sections, id);

export function newsroomRecords(game: Game) {
  const sources = publicationSources(game), received = game.save.campaign.newsroom.received;
  // Keep the notebook's newest-first order, and never synthesize undiscovered records.
  const entries = [...new Map(game.save.playerRecords.notebook.map(entry => [entry.id, entry])).values()].reverse();
  return {
    toSubmit: entries.filter(entry => sources.has(entry.id) && !Object.hasOwn(received, entry.id)),
    checking: entries.filter(entry => sources.has(entry.id) && received[entry.id]?.verifiedAt === null),
    checked: entries.filter(entry => sources.has(entry.id) && received[entry.id]?.verifiedAt != null),
  };
}

/** Only discovered publication sources and authoritative editorial eligibility count. */
export function newsroomSummary(game: Game) {
  const campaign = game.save.campaign;
  const records = newsroomRecords(game);
  const toSubmit = records.toSubmit.length, checking = records.checking.length;
  const ready = Object.keys(campaign.newsroom.cases).filter(id => canApprove(game.campaignContext, id)).length;
  const closed = campaign.finished || campaign.minute >= LAST_EDITION;
  const summary = [
    `${toSubmit} ${toSubmit === 1 ? 'source' : 'sources'} ${closed ? 'not submitted' : 'to submit'}`,
    `${checking} ${checking === 1 ? 'source' : 'sources'} being checked`,
    ready ? `${ready} ${ready === 1 ? 'story' : 'stories'} ready for the editor` : 'No stories ready for the editor',
  ].join(' · ');
  return { toSubmit, checking, ready, closed, summary };
}

export function newsroomMarkup(game: Game, selected: NewsroomSection | null = null): string {
  const { summary, closed } = newsroomSummary(game);
  const records = newsroomRecords(game);
  const list = (entries: typeof records.toSubmit, empty: string) => entries.length ? entries.map(entry => recordMarkup(game, entry, true)).join('') : `<p class="newsroom-empty">${empty}</p>`;
  let copy = '', body = '';
  switch (selected) {
    case 'to-submit':
      copy = closed ? 'Final edition closed · unsubmitted copies retained.' : 'Collected publication sources · bring copies to the newsroom.';
      body = list(records.toSubmit, 'No collected sources awaiting submission.'); break;
    case 'checking':
      copy = 'Submitted copies · checks take three game hours.';
      body = list(records.checking, 'No source checks underway.'); break;
    case 'checked':
      copy = 'Verified material, not necessarily a complete story.';
      body = list(records.checked, 'No checked sources yet.'); break;
    case 'stories':
      copy = 'Editorial review, scheduled editions and publications.';
      body = editorialMarkup(game) || '<p class="newsroom-empty">No stories at the editor’s desk yet.</p>'; break;
  }
  return `<div class="newsroom-columns"><div class="newsroom-menu-panel">
    <div class="intro-eyebrow">DISPATCH / RECORDS</div><h2 id="modal-title">Newsroom.</h2>
    <p class="intro-copy" id="newsroom-summary">${summary}</p>
    <p>${closed ? 'The final edition has closed. Your collected records are retained.' : 'A useful source is not necessarily a complete story. Bring copies to the newsroom for source checks, then visit the editor when a story is ready.'}</p>
    <nav class="game-menu" aria-label="Newsroom actions">
      ${menuItem(game.navToNewsroom ? 'Cancel newsroom route' : 'Route to newsroom', { id: 'notebook-route' })}
      ${Object.entries(sections).map(([id, label]) => `<button class="menu-item" id="newsroom-open-${id}" data-newsroom-section="${id}" aria-controls="newsroom-detail" aria-pressed="${selected === id}"><span>${label}</span></button>`).join('')}
      ${menuItem('Back to the streets', { id: 'start' })}
    </nav><p class="menu-hint" id="menu-hint"></p></div>
    <section class="newsroom-section" id="newsroom-detail" aria-labelledby="newsroom-detail-title" tabindex="-1">
      <h3 id="newsroom-detail-title">${selected ? selected === 'stories' ? 'Stories' : sections[selected] : 'Your newsroom records'}</h3>
      <p>${selected ? copy : 'Choose a section to view collected sources, source checks or stories.'}</p>
      <div class="notebook-entries">${body}</div>
      ${selected ? menuItem('Back to newsroom menu', { id: 'newsroom-menu' }) : ''}
    </section></div>`;
}

import type { Game } from '../game/game';
import { menuItem } from '../ui/drawer-markup';
import { menuHintMarkup } from '../ui/menu-hint';
import { recordMarkup } from './view';

/** Route membership, not merely authored-material membership, makes a publication source. */
const publicationSources = (game: Game) => new Set(Object.values(game.campaignContent.claims).flatMap(claim => claim.routes.flat()));
const sections = { sources: 'Sources' } as const;
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

/** Count only discovered publication sources. */
export function newsroomSummary(game: Game) {
  const campaign = game.save.campaign;
  const records = newsroomRecords(game);
  const toSubmit = records.toSubmit.length, checking = records.checking.length;
  const closed = campaign.finished || campaign.minute >= game.campaignContent.timing.lastEdition;
  const summary = [
    `${toSubmit} ${toSubmit === 1 ? 'source' : 'sources'} ${closed ? 'not submitted' : 'to submit'}`,
    `${checking} ${checking === 1 ? 'source' : 'sources'} being checked`,
  ].join(' · ');
  return { toSubmit, checking, closed, summary };
}

export function newsroomMarkup(game: Game, selected: NewsroomSection | null = null): string {
  const { summary, closed } = newsroomSummary(game);
  const records = newsroomRecords(game);
  const list = (entries: typeof records.toSubmit, empty: string) => entries.length ? entries.map(entry => recordMarkup(game, entry, true, true)).join('') : `<p class="newsroom-empty">${empty}</p>`;
  const group = (id: string, title: string, description: string, entries: typeof records.toSubmit, empty: string) => `<section class="newsroom-source-group" aria-labelledby="newsroom-${id}"><h4 id="newsroom-${id}">${title}</h4><p>${description}</p><div class="notebook-entries">${list(entries, empty)}</div></section>`;
  let copy = '', body = '';
  switch (selected) {
    case 'sources':
      copy = 'All collected publication sources, grouped by status.';
      body = group('to-submit', 'To submit', closed ? 'Final edition closed · unsubmitted copies retained.' : 'Bring copies to the newsroom.', records.toSubmit, 'No collected sources awaiting submission.')
        + group('checking', 'Being checked', 'Submitted copies · checks take three game hours.', records.checking, 'No source checks underway.')
        + group('checked', 'Checked sources', 'Verified material, not necessarily a complete story.', records.checked, 'No checked sources yet.'); break;
  }
  return `<div class="newsroom-columns"><div class="newsroom-menu-panel" data-menu-scope><div class="newsroom-menu-content">
    <div class="intro-eyebrow">DISPATCH / RECORDS</div><h2 id="modal-title">Newsroom.</h2>
    <p class="intro-copy" id="newsroom-summary">${summary}</p>
    <p>${closed ? 'The final edition has closed. Your collected records are retained.' : 'A useful source is not necessarily a complete story. Bring copies to the newsroom for source checks. Complete stories are automatically scheduled for the next edition.'}</p>
    <nav class="game-menu" aria-label="Newsroom actions">
      ${menuItem(game.navToNewsroom ? 'Cancel newsroom route' : 'Route to newsroom', { id: 'notebook-route' })}
      ${Object.entries(sections).map(([id, label]) => `<button class="menu-item" id="newsroom-open-${id}" data-newsroom-section="${id}" aria-controls="newsroom-detail" aria-pressed="${selected === id}"><span>${label}</span></button>`).join('')}
      ${menuItem('Publications', { id: 'newsroom-publications', page: 'publications' })}
      ${menuItem('Back to the streets', { id: 'start' })}
    </nav>${menuHintMarkup()}</div></div>
    <section class="newsroom-section" id="newsroom-detail" aria-labelledby="newsroom-detail-title" data-menu-scope tabindex="-1">
      ${selected ? menuItem('Back', { id: 'newsroom-menu' }) : ''}
      <h3 id="newsroom-detail-title">${selected ? sections[selected] : 'Your newsroom records'}</h3>
      <p>${selected ? copy : 'Choose Sources to view collected material and source checks.'}</p>
      <div class="notebook-entries">${body}</div>
    </section></div>`;
}

import type { Game } from '../game';
import { menuItem } from '../drawer-markup';
import { LAST_EDITION } from './clock';
import { canApprove } from './events';

/** Only discovered publication sources and authoritative editorial eligibility count. */
export function newsroomSummary(game: Game) {
  const campaign = game.save.campaign;
  const sources = new Set(Object.values(game.campaignContent.claims).flatMap(claim => claim.routes.flat()));
  const collected = new Set(game.save.playerRecords.notebook.map(entry => entry.id));
  const toSubmit = [...collected].filter(id => sources.has(id) && !Object.hasOwn(campaign.newsroom.received, id)).length;
  const checking = Object.entries(campaign.newsroom.received).filter(([id, receipt]) => sources.has(id) && receipt.verifiedAt === null).length;
  const ready = Object.keys(campaign.newsroom.cases).filter(id => canApprove(game.campaignContext, id)).length;
  const closed = campaign.finished || campaign.minute >= LAST_EDITION;
  const summary = [
    `${toSubmit} ${toSubmit === 1 ? 'source' : 'sources'} ${closed ? 'not submitted' : 'to submit'}`,
    `${checking} ${checking === 1 ? 'source' : 'sources'} being checked`,
    ready ? `${ready} ${ready === 1 ? 'story' : 'stories'} ready for the editor` : 'No stories ready for the editor',
  ].join(' · ');
  return { toSubmit, checking, ready, closed, summary };
}

export function newsroomMarkup(game: Game): string {
  const { summary, closed } = newsroomSummary(game);
  return `<div class="intro-eyebrow">DISPATCH / RECORDS</div><h2 id="modal-title">Newsroom.</h2>
    <p class="intro-copy" id="newsroom-summary">${summary}</p>
    <p>${closed ? 'The final edition has closed. Your records stay in the Dispatch notebook.' : 'A useful source is not necessarily a complete story. Bring copies to the newsroom for source checks, then visit the editor when a story is ready.'}</p>
    <nav class="game-menu" aria-label="Newsroom actions">
      ${menuItem(game.navToNewsroom ? 'Cancel newsroom route' : 'Route to newsroom', { id: 'notebook-route' })}
      ${menuItem('Dispatch notebook', { id: 'newsroom-notebook', page: 'notebook' })}
      ${menuItem('Back to the streets', { id: 'start' })}
    </nav><p class="menu-hint" id="menu-hint"></p>`;
}

import { menuItem } from '../ui/drawer-markup';
import type { Game } from '../game/game';
import type { NotebookEntry } from '../narrative/player-records';
import { canApprove } from './events';
import { LAST_EDITION, calendarLabel } from './clock';
import { VERIFICATION_MINUTES } from './scheduler';

export const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Shared notebook record widget; general notes can explicitly omit source controls. */
export function recordMarkup(game: Game, entry: NotebookEntry, source = Object.hasOwn(game.campaignContent.materials, entry.id), selectable = false): string {
  const campaign = game.save.campaign, closed = campaign.minute >= LAST_EDITION || campaign.finished;
  const receipt = campaign.newsroom.received[entry.id];
  const label = receipt ? receipt.verifiedAt !== null ? 'Source checked · copy retained' : `Received · source check due ${calendarLabel(receipt.at + VERIFICATION_MINUTES)}` : closed ? 'Edition closed · record retained' : game.newsroomNear ? 'Leave a copy at the newsroom' : `Bring to ${escape(game.campaignContent.newsroom.name)}`;
  const metadata = `${entry.minute !== undefined ? calendarLabel(entry.minute).toUpperCase() : `DAY ${entry.shift}`} · ${entry.kind.toUpperCase()}`;
  const available = source && !receipt && game.newsroomNear && !closed;
  if (selectable) return `<article data-record="${escape(entry.id)}"><button class="menu-item newsroom-source" id="submit-${escape(entry.id)}" ${available ? `data-submit="${escape(entry.id)}"` : 'aria-disabled="true"'}><span class="source-meta">${metadata}</span><span class="source-title">${escape(entry.title)}</span><span class="source-text">${escape(entry.text)}</span><span class="source-action">${label}</span></button></article>`;
  return `<article data-record="${escape(entry.id)}"><small>${metadata}</small><h3>${escape(entry.title)}</h3><p>${escape(entry.text)}</p>${source ? `<button class="menu-item" id="submit-${escape(entry.id)}" data-submit="${escape(entry.id)}" ${available ? '' : 'disabled'}>${label}</button>` : ''}</article>`;
}

/** Only admitted cases are shown here; detailed incomplete-story guidance is separate. */
export function editorialMarkup(game: Game): string {
  const campaign = game.save.campaign, closed = campaign.minute >= LAST_EDITION || campaign.finished;
  const { claims, newsroom } = game.campaignContent;
  return Object.entries(campaign.newsroom.cases).filter(([id]) => Object.hasOwn(claims, id)).map(([id, editorial]) => {
    if (!editorial) return '';
    const publication = campaign.publications.find(p => p.allegation === id);
    const ready = canApprove(game.campaignContext, id), available = game.newsroomNear && ready;
    const status = publication ? `Published · ${calendarLabel(publication.at)} edition.`
      : editorial.editionAt !== null ? `Editor accepted · ${calendarLabel(editorial.editionAt)} edition.`
      : editorial.approvedAt !== null ? 'Editor accepted · no edition scheduled.'
      : closed ? 'Publication deadline passed.'
      : ready ? 'Ready for editorial review.' : 'Not ready for editorial review.';
    return `<article data-story="${escape(id)}"><h3>${escape(claims[id].title)}</h3><p>${status}</p>${!publication && editorial.approvedAt === null ? `<button class="menu-item" id="publish-${escape(id)}" data-publish="${escape(id)}" ${available ? '' : 'disabled'}>${closed ? 'Last edition closed' : game.newsroomNear ? `Ask ${escape(newsroom.editor)} to run this story` : `Visit the editor at ${escape(newsroom.name)}`}</button>` : ''}</article>`;
  }).join('');
}

export function notebookMarkup(game: Game, back: 'home' | 'newsroom' = 'home'): string {
  const campaign = game.save.campaign;
  const entries = [...game.save.playerRecords.notebook].reverse();
  const cases = editorialMarkup(game);
  return `<div class="eyebrow">DISPATCH NOTEBOOK · DAY ${campaign.shift} / 14 · ${calendarLabel(campaign.minute).split(' · ')[1]}</div>
    <h2 id="modal-title">Your working day.</h2>
    <p>Signed slips, things people said, and scenes you bookmarked. Keep your own interpretation.</p>
    <div class="city-bulletin"><small>LOCAL COVERAGE</small><p>${escape(game.campaignBulletin)}</p></div>
    ${menuItem('Keeping records & visiting the newsroom', { id: 'menu-notebook-guide', page: 'notebook-guide' })}
    <div class="notebook-actions">${menuItem(game.navToNewsroom ? 'Cancel newsroom route' : 'Route to newsroom', { id: 'notebook-route' })}${menuItem(back === 'newsroom' ? 'Back to newsroom' : 'Back to pause menu', { id: 'notebook-back', page: back })}</div>
    ${cases ? `<section class="editorial-cases"><h3>At the editor’s desk</h3>${cases}</section>` : ''}
    <label class="notebook-search menu-field">Find a record <input id="notebook-search" type="search" placeholder="Name, address or words…"></label>
    <div class="notebook-entries">${entries.length ? entries.map(entry => recordMarkup(game, entry)).join('') : '<p>No records yet. Work a fare, or bookmark a scene you want to remember.</p>'}</div>`;
}

export function notebookGuideMarkup(game: Game) {
  return `<p>${escape(game.campaignContent.newsroom.guide)}</p>`;
}

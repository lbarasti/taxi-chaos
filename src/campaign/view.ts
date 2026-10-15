import { menuItem } from '../drawer-markup';
import type { Game } from '../game';
import type { Allegation } from './model';
import { canApprove } from './events';
import { LAST_EDITION, calendarLabel } from './clock';

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function notebookMarkup(game: Game): string {
  const { materials, claims, newsroom } = game.campaignContent;
  const campaign = game.save.campaign, closed = campaign.minute >= LAST_EDITION || campaign.finished;
  const entries = [...game.save.playerRecords.notebook].reverse();
  const cases = (Object.entries(campaign.newsroom.cases) as [Allegation, NonNullable<typeof campaign.newsroom.cases[Allegation]>][]).map(([id, editorial]) => {
    const published = campaign.publications.some(p => p.allegation === id);
    const available = game.newsroomNear && canApprove(game.campaignContext, id);
    return `<article><h3>${escape(claims[id].title)}</h3><p>${published ? 'In the paper · see local coverage.' : editorial.editionAt !== null ? `Editor accepted · ${calendarLabel(editorial.editionAt)} edition.` : 'Source checks complete · ready for the editor.'}</p>${!published && editorial.approvedAt === null ? `<button class="menu-item" id="publish-${escape(id)}" data-publish="${escape(id)}" ${available ? '' : 'disabled'}>${closed ? 'Last edition closed' : game.newsroomNear ? `Ask ${escape(newsroom.editor)} to run this story` : `Visit the editor at ${escape(newsroom.name)}`}</button>` : ''}</article>`;
  }).join('');
  return `<div class="eyebrow">DISPATCH NOTEBOOK · DAY ${campaign.shift} / 14 · ${calendarLabel(campaign.minute).split(' · ')[1]}</div>
    <h2 id="modal-title">Your working day.</h2>
    <p>Signed slips, things people said, and scenes you bookmarked. Keep your own interpretation.</p>
    <div class="city-bulletin"><small>LOCAL COVERAGE</small><p>${escape(game.campaignBulletin)}</p></div>
    ${menuItem('Keeping records & visiting the newsroom', { id: 'menu-notebook-guide', page: 'notebook-guide' })}
    <div class="notebook-actions">${menuItem(game.navToNewsroom ? 'Cancel newsroom route' : 'Route to newsroom', { id: 'notebook-route' })}${menuItem('Back to pause menu', { id: 'notebook-back', page: 'home' })}</div>
    ${cases ? `<section class="editorial-cases"><h3>At the editor’s desk</h3>${cases}</section>` : ''}
    <label class="notebook-search menu-field">Find a record <input id="notebook-search" type="search" placeholder="Name, address or words…"></label>
    <div class="notebook-entries">${entries.length ? entries.map(entry => {
      const receipt = campaign.newsroom.received[entry.id], evidence = Object.hasOwn(materials, entry.id);
      const label = receipt ? receipt.verifiedAt !== null ? 'Source checked · copy retained' : `Received · source check due ${calendarLabel(receipt.at + 180)}` : closed ? 'Edition closed · record retained' : game.newsroomNear ? 'Leave a copy at the newsroom' : `Bring to ${escape(newsroom.name)}`;
      return `<article data-record="${escape(entry.id)}"><small>${entry.minute !== undefined ? calendarLabel(entry.minute).toUpperCase() : `DAY ${entry.shift}`} · ${entry.kind.toUpperCase()}</small><h3>${escape(entry.title)}</h3><p>${escape(entry.text)}</p>${evidence ? `<button class="menu-item" id="submit-${escape(entry.id)}" data-submit="${escape(entry.id)}" ${receipt || !game.newsroomNear || closed ? 'disabled' : ''}>${label}</button>` : ''}</article>`;
    }).join('') : '<p>No records yet. Work a fare, or bookmark a scene you want to remember.</p>'}</div>`;
}

export function notebookGuideMarkup(game: Game) {
  return `<p>${escape(game.campaignContent.newsroom.guide)}</p>`;
}

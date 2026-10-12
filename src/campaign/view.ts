import type { Game } from '../game';
import { materials, type Allegation } from './content';
import { LAST_EDITION, calendarLabel, nextEdition } from './clock';

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const headlines: Record<Allegation, string> = { coordination: 'The café closure and contractor records', policing: 'The withdrawn waterfront patrols', knowledge: 'Vale’s warning and the retained agreement' };
export function notebookMarkup(game: Game): string {
  const campaign = game.save.campaign, closed = campaign.minute >= LAST_EDITION || campaign.finished;
  const entries = [...game.save.playerRecords.notebook].reverse();
  const cases = (Object.entries(campaign.newsroom.cases) as [Allegation, NonNullable<typeof campaign.newsroom.cases[Allegation]>][]).map(([id, editorial]) => {
    const published = campaign.publications.some(p => p.allegation === id);
    const available = game.newsroomNear && !closed && editorial.approvedAt === null && nextEdition(campaign.minute) <= LAST_EDITION && (id !== 'knowledge' || ['coordination', 'policing'].every(link => campaign.newsroom.cases[link as Allegation]?.approvedAt != null));
    return `<article><h3>${headlines[id]}</h3><p>${published ? 'In the paper · see local coverage.' : editorial.editionAt !== null ? `Editor accepted · ${calendarLabel(editorial.editionAt)} edition.` : 'Source checks complete · ready for the editor.'}</p>${!published && editorial.approvedAt === null ? `<button class="secondary" data-publish="${id}" ${available ? '' : 'disabled'}>${closed ? 'Last edition closed' : game.newsroomNear ? 'Ask Ruth to run this story' : 'Visit the editor at Old Town South'}</button>` : ''}</article>`;
  }).join('');
  return `<div class="eyebrow">DISPATCH NOTEBOOK · DAY ${campaign.shift} / 14 · ${calendarLabel(campaign.minute).split(' · ')[1]}</div>
    <h2 id="modal-title">Your working day.</h2>
    <p>Signed slips, things people said, and scenes you bookmarked. Keep your own interpretation.</p>
    <div class="city-bulletin"><small>LOCAL COVERAGE</small><p>${escape(game.campaignBulletin)}</p></div>
    <details class="notebook-guide"><summary>Keeping records & visiting the newsroom</summary><p>Dispatch mixes ordinary work with recurring customers. Texts let you choose a booking; its deadline is for pickup. Stop near the boarded Garden Café and choose “Bookmark café frontage” to keep an observation. The newsroom is at Old Town South: stop nearby and choose material to leave. Source checks take three game hours. Return to ask Ruth to run a ready story in the next 06:00 edition. Public responses happen later. The last edition is Day 14 at 06:00.</p></details>
    <div class="notebook-actions"><button class="secondary" id="notebook-route">${game.navToNewsroom ? 'Cancel newsroom route' : 'Route to newsroom'}</button><button class="secondary" id="notebook-back">Back to pause menu</button></div>
    ${cases ? `<section class="editorial-cases"><h3>At the editor’s desk</h3>${cases}</section>` : ''}
    <label class="notebook-search">Find a record <input id="notebook-search" type="search" placeholder="Name, address or words…"></label>
    <div class="notebook-entries">${entries.length ? entries.map(entry => {
      const receipt = campaign.newsroom.received[entry.id], evidence = Object.hasOwn(materials, entry.id);
      const label = receipt ? receipt.verifiedAt !== null ? 'Source checked · copy retained' : `Received · source check due ${calendarLabel(receipt.at + 180)}` : closed ? 'Edition closed · record retained' : game.newsroomNear ? 'Leave a copy at the newsroom' : 'Bring to Old Town South';
      return `<article data-record="${escape(entry.id)}"><small>${entry.minute !== undefined ? calendarLabel(entry.minute).toUpperCase() : `DAY ${entry.shift}`} · ${entry.kind.toUpperCase()}</small><h3>${escape(entry.title)}</h3><p>${escape(entry.text)}</p>${evidence ? `<button class="secondary" data-submit="${entry.id}" ${receipt || !game.newsroomNear || closed ? 'disabled' : ''}>${label}</button>` : ''}</article>`;
    }).join('') : '<p>No records yet. Work a fare, or bookmark a scene you want to remember.</p>'}</div>`;
}

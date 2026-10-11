import type { Game } from '../game';
import { materials } from './content';

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function notebookMarkup(game: Game): string {
  const campaign = game.save.campaign;
  const entries = [...game.save.playerRecords.notebook].reverse();
  return `<div class="eyebrow">DISPATCH NOTEBOOK · SHIFT ${campaign.shift} / 14</div>
    <h2 id="modal-title">Your working day.</h2>
    <p>Signed slips, things people said, and scenes you bookmarked. Keep your own interpretation.</p>
    <div class="city-bulletin"><small>LOCAL COVERAGE</small><p>${escape(game.campaignBulletin)}</p></div>
    <details class="notebook-guide"><summary>Keeping records & visiting the newsroom</summary><p>Paid jobs keep a receipt. Conversations remain here after the ride. Stop near Garden Café and use “Bookmark café frontage” in the Taxi menu to keep an observation. The newsroom is at Old Town South: route there, stop nearby, then choose individual material to leave. Copies stay here. Verification takes until the next shift and needs independent sources; submission does not guarantee publication. Material left on election day is too late for this edition.</p></details>
    <div class="notebook-actions"><button class="secondary" id="notebook-route">${game.navToNewsroom ? 'Cancel newsroom route' : 'Route to newsroom'}</button><button class="secondary" id="notebook-back">Back to pause menu</button></div>
    <label class="notebook-search">Find a record <input id="notebook-search" type="search" placeholder="Name, address or words…"></label>
    <div class="notebook-entries">${entries.length ? entries.map(entry => {
      const submitted = campaign.submitted.includes(entry.id), evidence = Object.hasOwn(materials, entry.id);
      return `<article data-record="${escape(entry.id)}"><small>SHIFT ${entry.shift} · ${entry.kind.toUpperCase()}</small><h3>${escape(entry.title)}</h3><p>${escape(entry.text)}</p>${evidence ? `<button class="secondary" data-submit="${entry.id}" ${submitted || !game.newsroomNear || campaign.shift === 14 || campaign.finished ? 'disabled' : ''}>${submitted ? 'Copy received · retained here' : campaign.shift === 14 || campaign.finished ? 'Edition closed · record retained' : game.newsroomNear ? 'Leave a copy at the newsroom' : 'Bring to Old Town South'}</button>` : ''}</article>`;
    }).join('') : '<p>No records yet. Work a fare, or bookmark a scene you want to remember.</p>'}</div>`;
}

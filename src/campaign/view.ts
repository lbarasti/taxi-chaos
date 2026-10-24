import type { Game } from '../game/game';
import type { NotebookEntry } from '../narrative/player-records';
import { calendarLabel } from './clock';
import { VERIFICATION_MINUTES } from './scheduler';
import { characters, type Character } from '../narrative/characters';
import { portraitLayout } from '../narrative/portraits';
import { notebookGroups, type NotebookGroup } from './notebook';

export const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Shared notebook record widget; general notes can explicitly omit source controls. */
export function recordMarkup(game: Game, entry: NotebookEntry, source = Object.hasOwn(game.campaignContent.materials, entry.id), selectable = false, grouped = false): string {
  const campaign = game.save.campaign, closed = campaign.minute >= game.campaignContent.timing.lastEdition || campaign.finished;
  const receipt = campaign.newsroom.received[entry.id];
  const label = receipt ? receipt.verifiedAt !== null ? 'Source checked · copy retained' : `Received · source check due ${calendarLabel(receipt.at + VERIFICATION_MINUTES)}` : closed ? 'Edition closed · record retained' : game.newsroomNear ? 'Leave a copy at the newsroom' : `Bring to ${escape(game.campaignContent.newsroom.name)}`;
  const metadata = `${entry.minute !== undefined ? calendarLabel(entry.minute).toUpperCase() : `DAY ${entry.shift}`} · ${entry.kind.toUpperCase()}`;
  const available = source && !receipt && game.newsroomNear && !closed;
  if (selectable) return `<article data-record="${escape(entry.id)}"><button class="menu-item newsroom-source" id="submit-${escape(entry.id)}" ${available ? `data-submit="${escape(entry.id)}"` : 'aria-disabled="true"'}><span class="source-meta">${metadata}</span><span class="source-title">${escape(entry.title)}</span><span class="source-text">${escape(entry.text)}</span><span class="source-action">${label}</span></button></article>`;
  return `<article data-record="${escape(entry.id)}">${grouped ? entry.kind === 'conversation' ? '' : `<h4>${escape(entry.title)}</h4>` : `<small>${metadata}</small><h3>${escape(entry.title)}</h3>`}<p>${escape(entry.text)}</p>${source ? `<button class="menu-item" id="submit-${escape(entry.id)}" data-submit="${escape(entry.id)}" ${available ? '' : 'disabled'}>${label}</button>` : ''}</article>`;
}

function runMarkup(game: Game, group: NotebookGroup): string {
  if (!group.run) return `<section class="notebook-item" id="notebook-${escape(group.id)}" data-menu-item tabindex="-1" aria-label="${escape(group.entries[0].title)}">${group.entries.map(entry => recordMarkup(game, entry)).join('')}</section>`;
  const run = group.run;
  const character: Character = run.character ? characters[run.character] : { id: run.id, name: run.customer, portrait: { sources: [], placeholder: true }, attribution: '' };
  const portrait = portraitLayout(character), parcel = run.type === 'parcel';
  const path = parcel ? '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9 9-4M12 12 3 8m9 4v9M7.5 5.5l9 5"/>' : '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>';
  const receipt = group.entries.find(entry => /^fare-\d+$/.test(entry.id) && entry.kind === 'receipt');
  return `<section class="notebook-run" id="notebook-${escape(group.id)}" data-menu-item tabindex="-1" data-run="${escape(group.id)}" aria-labelledby="${escape(group.id)}-title">
    <header class="notebook-run-header">
      <span class="notebook-portrait"><img alt="" src="${escape(portrait.src)}" style="object-position:${portrait.objectPosition};width:${portrait.width};height:${portrait.height};left:${portrait.left};top:${portrait.top}"></span>
      <div class="notebook-run-heading"><small>${calendarLabel(run.minute).toUpperCase()}</small><h3 id="${escape(group.id)}-title">${escape(run.customer)}<svg class="notebook-run-icon" role="img" aria-label="${parcel ? 'Parcel delivery' : 'Passenger fare'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg></h3>
      <p class="notebook-run-summary"${receipt ? ` data-record="${escape(receipt.id)}"` : ''}>${run.destination ? `<span>To ${escape(run.destination)}</span>` : ''}${run.totalFare !== undefined ? `<span class="notebook-run-total">Total fare <strong>$${run.totalFare}</strong></span>` : ''}</p></div>
    </header>
    <div class="notebook-run-records">${group.entries.filter(entry => entry !== receipt).map(entry => recordMarkup(game, entry, Object.hasOwn(game.campaignContent.materials, entry.id), false, true)).join('')}</div>
  </section>`;
}

export function notebookMarkup(game: Game): string {
  const groups = notebookGroups(game.save.playerRecords.notebook, game.campaignContent, game.missions.catalogue.stops);
  return `<div class="notebook-entries">${groups.length ? groups.map(group => runMarkup(game, group)).join('') : '<p>No records yet. Work a fare, or bookmark a scene you want to remember.</p>'}</div>`;
}

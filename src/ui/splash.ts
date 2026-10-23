import { menuItem } from './drawer-markup';
import type { Game } from '../game/game';
import { campaignDays, displayDay, calendarLabel } from '../campaign/clock';
import { readStorage, storageKeys } from '../game/storage';
import titleCabBadge from '../assets/ui/title-cab-badge.webp?inline';

export type InputDevice = 'keyboard' | 'touch' | 'xbox' | 'playstation';
export function savedCampaignAvailable(): boolean {
  try {
    const save = JSON.parse(readStorage(storageKeys.save) ?? 'null');
    return save?.story?.version === 1 && save?.playerRecords?.version === 1 && save?.campaign?.version === 2;
  } catch { return false; }
}
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export function splashPrompts(device: InputDevice): string {
  const prompts = device === 'touch' ? [['DRAG', 'drive'], ['DRIFT', 'handbrake'], ['BOOST', 'boost']]
    : device === 'xbox' || device === 'playstation' ? [['LS + RT / LT', 'drive'], [device === 'playstation' ? '□' : 'X', 'handbrake'], [device === 'playstation' ? '×' : 'A', 'boost']]
    : [['WASD / ↑↓←→', 'drive'], ['SPACE', 'handbrake'], ['SHIFT', 'boost']];
  return prompts.map(([key, action]) => `<span><kbd>${key}</kbd> ${action}</span>`).join('');
}
export function shiftStatsMarkup(game: Game) {
  return `<p class="campaign-hint">Since you last woke up.</p><div class="shift-stats"><div><small>SHIFT EARNINGS</small><strong>$${game.save.shiftStats.earnings}</strong></div><div><small>JOBS COMPLETE</small><strong>${game.save.shiftStats.jobs}</strong></div><div><small>OBJECTS SMASHED</small><strong>${game.save.shiftStats.smashed}</strong></div><div><small>PEDESTRIAN FATALITIES</small><strong>${game.save.shiftStats.kills}</strong></div></div>`;
}
export function shiftMarkup(game: Game, actions: string) {
  return shiftStatsMarkup(game) + actions;
}
export function splashMarkup(game: Game, saved: boolean): string {
  const paused = game.mode === 'paused', suspended = !paused && game.sessionStarted;
  const job = game.job;
  return `<h2 id="modal-title" class="splash-brand"><img src="${titleCabBadge}" alt="Taxi Chaos" width="768" height="680" draggable="false"></h2>
    <section class="splash-save" aria-label="${paused || suspended ? 'Current shift' : saved ? 'Saved campaign' : 'Your first shift'}">
      <div class="splash-save-heading"><span class="live-dot"></span><span>${paused ? 'YOUR CURRENT SHIFT · PAUSED' : suspended ? 'YOUR CURRENT SHIFT · SUSPENDED' : saved ? 'YOUR SAVED SHIFT' : 'THE CITY IS YOURS'}</span><small>${escape(game.save.campaign.finished ? `Arcade · ${game.dayNight.snapshot().time}` : calendarLabel(game.save.campaign.minute))}</small></div>
      ${paused ? shiftStatsMarkup(game) : `<div class="splash-snapshot"><div><small>WALLET</small><strong>$${game.save.cash.toLocaleString()}</strong></div><div><small>TOTAL DELIVERIES</small><strong>${game.save.deliveries}</strong></div><div><small>CAMPAIGN</small><strong>${game.save.campaign.finished ? 'Complete' : `Day ${displayDay(game.save.campaign.minute, game.campaignContent.timing)}<span> / ${campaignDays(game.campaignContent.timing)}</span>`}</strong></div></div>`}
      <div class="splash-mission"><small>${job.stage === 'dropoff' ? 'RIDE IN PROGRESS · NEXT STOP' : 'NEXT FARE · PICKUP'}</small><strong>${escape(job.stage === 'dropoff' ? job.destination : job.name)}</strong><p>${job.stage === 'dropoff' ? 'Your passenger is aboard. Finish the delivery.' : `Heading to ${escape(job.destination)}. Stop inside the yellow ring.`} <span>$${job.fare} base fare</span></p></div>
    </section>
    ${!paused && game.titleSaveFailed ? '<p class="campaign-hint" role="alert">Progress could not be saved to the browser. Continue is still available while this page stays open.</p>' : ''}
    <nav class="game-menu" aria-label="${paused ? 'Pause menu' : 'Main menu'}">
      ${paused || saved ? menuItem(paused ? 'Resume your shift' : 'Continue', { id: 'start' }) : ''}
      ${game.canReturnToTitle ? menuItem('Return to title', { id: 'return-to-title' }) : ''}
      ${!paused ? menuItem('New game', { id: 'new-game' }) : ''}
      ${!paused ? menuItem('Load game', { id: 'menu-load-game', page: 'load-game' }) : ''}
      ${menuItem('Settings', { id: 'menu-settings', page: 'settings' })}
      ${menuItem('Credits', { id: 'menu-credits', page: 'credits' })}
      ${paused && game.campaignEnabled && game.save.campaign.finished ? menuItem('Campaign recap', { id: 'menu-finale', page: 'finale' }) : ''}
    </nav>
    <p class="menu-hint" id="menu-hint">↑ ↓ Select · Enter Confirm</p><div class="intro-controls" id="splash-prompts"></div>`;
}

import type { Game } from './game';
import { calendarLabel } from './campaign/clock';
import { readStorage, storageKeys } from './storage';

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
export type DrawerPage = 'home' | 'settings' | 'rules' | 'shift' | 'credits' | 'notebook' | 'notebook-guide';
export const menuItem = (label: string, attributes: string) => `<button class="menu-item" ${attributes}><span>${label}</span><span class="menu-cursor" aria-hidden="true">›</span></button>`;
export function drawerHeading(title: string, back: DrawerPage = 'home') {
  return `<div class="intro-eyebrow">TAXI CHAOS / MENU</div><h2 id="modal-title">${title}</h2>${menuItem('Back', `id="drawer-back" data-page="${back}"`)}`;
}
export function streetRulesMarkup() {
  return `<div class="intro-grid"><div><span>01</span><strong>Chase the fare.</strong><p>Yellow ring to pick up. Green to deliver. Fast, smooth rides earn bigger tips.</p></div><div><span>02</span><strong>Make your own route.</strong><p>Drift corners. Smash crates, kiosks and hydrants. Buildings bite back. Hold W + Shift for a nitro burst.</p></div><div><span>03</span><strong>Stay one step ahead.</strong><p>Speeding and damage attract cops. Break line of sight to escape.</p><p><small>Physics foundation: Pat Kerr's Motion Lab v0.8.2.</small></p></div></div><div class="intro-controls" id="splash-prompts"></div>`;
}
export function shiftMarkup(game: Game, actions: string) {
  return `<div class="shift-stats"><div><small>SHIFT EARNINGS</small><strong>$${game.shiftEarnings}</strong></div><div><small>JOBS COMPLETE</small><strong>${game.jobsDone}</strong></div><div><small>OBJECTS SMASHED</small><strong>${game.smashed}</strong></div><div><small>PEDESTRIAN FATALITIES</small><strong>${game.kills}</strong></div></div>${actions}`;
}
export function splashMarkup(game: Game, saved: boolean): string {
  const paused = game.mode === 'paused';
  const job = game.job;
  return `<div class="intro-eyebrow"><span class="live-dot"></span> WELCOME TO TAXI CHAOS</div>
    <h2 id="modal-title">A little cab.<br><em>A lot of trouble.</em></h2>
    <p class="intro-copy">Pick up. Drop off. Get paid.<br>How you get there is entirely your business.</p>
    <section class="splash-save" aria-label="${paused ? 'Current shift' : saved ? 'Saved campaign' : 'Your first shift'}">
      <div class="splash-save-heading"><span class="live-dot"></span><span>${paused ? 'YOUR CURRENT SHIFT · PAUSED' : saved ? 'YOUR SAVED SHIFT' : 'THE CITY IS YOURS'}</span><small>${escape(calendarLabel(game.save.campaign.minute))}</small></div>
      <div class="splash-snapshot"><div><small>WALLET</small><strong>$${game.save.cash.toLocaleString()}</strong></div><div><small>DELIVERIES</small><strong>${game.save.deliveries}</strong></div><div><small>CAMPAIGN</small><strong>Day ${game.save.campaign.shift}<span> / 14</span></strong></div></div>
      <div class="splash-mission"><small>${job.stage === 'dropoff' ? 'RIDE IN PROGRESS · NEXT STOP' : 'NEXT FARE · PICKUP'}</small><strong>${escape(job.stage === 'dropoff' ? job.destination : job.name)}</strong><p>${job.stage === 'dropoff' ? 'Your passenger is aboard. Finish the delivery.' : `Heading to ${escape(job.destination)}. Stop inside the yellow ring.`} <span>$${job.fare} base fare</span></p></div>
    </section>
    <nav class="game-menu" aria-label="${paused ? 'Pause menu' : 'Main menu'}">
      ${menuItem(paused ? 'Resume your shift' : saved ? 'Continue' : 'Start your shift', 'id="start"')}
      ${menuItem('The street rules', 'id="menu-rules" data-page="rules"')}
      ${menuItem('Settings', 'id="menu-settings" data-page="settings"')}
      ${paused ? `${game.campaignEnabled ? menuItem('Dispatch notebook', 'id="open-notebook"') : ''}${menuItem('This shift', 'id="menu-shift" data-page="shift"')}` : ''}
    </nav>
    <p class="menu-hint" id="menu-hint">↑ ↓ Select · Enter Confirm</p><div class="intro-controls" id="splash-prompts"></div>`;
}

import { menuItem, type DrawerPage } from './drawer-markup';
import { menuHintMarkup, type InputDevice } from './menu-hint';
import type { Game } from '../game/game';
import { readStorage, storageKeys } from '../game/storage';
import titleCabBadge from '../assets/ui/title-cab-badge.webp?inline';

export function savedCampaignAvailable(): boolean {
  try {
    const save = JSON.parse(readStorage(storageKeys.save) ?? 'null');
    return save?.story?.version === 1 && save?.playerRecords?.version === 1 && save?.campaign?.version === 2;
  } catch { return false; }
}
export function splashPrompts(device: InputDevice): string {
  const prompts = device === 'touch' ? [['DRAG', 'drive'], ['DRIFT', 'handbrake'], ['BOOST', 'boost']]
    : device === 'xbox' || device === 'playstation' ? [['LS + RT / LT', 'drive'], [device === 'playstation' ? '□' : 'X', 'handbrake'], [device === 'playstation' ? '×' : 'A', 'boost']]
    : [['WASD / ↑↓←→', 'drive'], ['SPACE', 'handbrake'], ['SHIFT', 'boost']];
  return prompts.map(([key, action]) => `<span><kbd>${key}</kbd> ${action}</span>`).join('');
}
export function shiftStatsMarkup(game: Game) {
  return `<div class="shift-stats"><div><small>SHIFT EARNINGS</small><strong>$${game.save.shiftStats.earnings}</strong></div><div><small>JOBS COMPLETE</small><strong>${game.save.shiftStats.jobs}</strong></div><div><small>OBJECTS SMASHED</small><strong>${game.save.shiftStats.smashed}</strong></div><div><small>PEDESTRIAN FATALITIES</small><strong>${game.save.shiftStats.kills}</strong></div></div>`;
}
export function shiftMarkup(game: Game, actions: string) {
  return shiftStatsMarkup(game) + actions;
}

type SplashMenuItem = { label: string; id: string; page?: DrawerPage; visible?: boolean };
type SplashScreen = { menuLabel: string; notice?: string; items: readonly SplashMenuItem[] };

function titleScreen(game: Game, saved: boolean): SplashScreen {
  return {
    menuLabel: 'Main menu',
    notice: game.titleSaveFailed ? 'Progress could not be saved to the browser. Continue is still available while this page stays open.' : undefined,
    items: [
      { label: 'Continue', id: 'start', visible: saved },
      { label: 'New game', id: 'new-game' },
      { label: 'Load game', id: 'menu-load-game', page: 'load-game' },
      { label: 'Settings', id: 'menu-settings', page: 'settings' },
      { label: 'Credits', id: 'menu-credits', page: 'credits' },
    ],
  };
}

function pauseScreen(game: Game): SplashScreen {
  return {
    menuLabel: 'Pause menu',
    items: [
      { label: 'Resume your shift', id: 'start' },
      { label: 'Settings', id: 'menu-settings', page: 'settings' },
      { label: 'Return to title', id: 'return-to-title', visible: game.canReturnToTitle },
      { label: 'Campaign recap', id: 'menu-finale', page: 'finale', visible: game.campaignEnabled && game.save.campaign.finished },
    ],
  };
}

export function splashMarkup(game: Game, saved: boolean): string {
  const screen = game.mode === 'paused' ? pauseScreen(game) : titleScreen(game, saved);
  return `<h2 id="modal-title" class="splash-brand"><img src="${titleCabBadge}" alt="Taxi Chaos" width="768" height="680" draggable="false"></h2>
    <p class="splash-tagline"><span>A little cab.</span> <em>A lot of trouble.</em></p>
    ${screen.notice ? `<p class="campaign-hint" role="alert">${screen.notice}</p>` : ''}
    <nav class="game-menu" aria-label="${screen.menuLabel}">
      ${screen.items.filter(({ visible = true }) => visible).map(({ label, id, page }) => menuItem(label, { id, page })).join('\n      ')}
    </nav>
    ${menuHintMarkup()}<div class="intro-controls" id="splash-prompts"></div>`;
}

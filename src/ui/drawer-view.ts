import type { Game } from '../game/game';
import type { SettingsControls } from './settings';
import { settingRow } from './setting-controls';
import { campaignDays, displayDay, calendarLabel } from '../campaign/clock';
import { notebookMarkup, notebookGuideMarkup } from '../campaign/view';
import { newsroomMarkup, type NewsroomSection } from '../campaign/newsroom-view';
import { publicationsMarkup, finaleMarkup } from '../campaign/newspaper-view';
import { creditsMarkup } from './credits';
import { splashMarkup, shiftMarkup } from './splash';
import { drawerHeading, menuItem, type DrawerPage } from './drawer-markup';

const pages = {
  home: { title: '', parent: null },
  'load-game': { title: 'Load game.', parent: 'home' },
  'new-game': { title: '', parent: 'home' },
  settings: { title: 'Settings.', parent: 'home' },
  shift: { title: 'This shift.', parent: 'home' },
  credits: { title: 'Credits.', parent: 'home' },
  newsroom: { title: '', parent: null },
  publications: { title: '', parent: 'newsroom' },
  finale: { title: '', parent: null },
  notebook: { title: '', parent: 'home' },
  'notebook-guide': { title: 'Keeping records.', parent: 'notebook' },
} as const satisfies Record<DrawerPage, { title: string; parent: DrawerPage | null }>;
export const drawerParent = (page: DrawerPage, entry: 'home' | 'newsroom' = 'home') => page === 'notebook' ? entry : pages[page].parent;
export const isDrawerPage = (page: string): page is DrawerPage => Object.hasOwn(pages, page);

function settingsMarkup(settings: SettingsControls) {
  return `<fieldset class="settings-group"><legend>GAMEPLAY</legend>
    ${settingRow(settings.gore)}
    ${settingRow(settings.difficulty)}
  </fieldset><fieldset class="settings-group"><legend>AUDIO</legend>
    ${settingRow(settings.muted)}
    ${settingRow(settings.volume)}
    ${settingRow(settings.playerEngine)}
    ${settingRow(settings.ambient)}
    ${settingRow(settings.sirens)}
  </fieldset>`;
}
function campaignMarkup(game: Game) {
  if (game.mode !== 'paused' || !game.campaignEnabled) return '';
  const preview = game.sleepPreview;
  return `<div class="campaign-summary"><small>${game.save.campaign.finished ? game.campaignContent.finishedLabel : `${game.campaignContent.title.toUpperCase()} · DAY ${displayDay(game.save.campaign.minute, game.campaignContent.timing)} OF ${campaignDays(game.campaignContent.timing)} · ${calendarLabel(game.save.campaign.minute).split(' · ')[1]}`}</small><p>${game.campaignBulletin}</p>
    ${menuItem('Dispatch notebook', { id: 'open-notebook', page: 'notebook' })}
    ${menuItem(game.sleepReason ?? `Sleep at Pit Stop · wake ${preview.label}`, { id: 'sleep', disabled: !!game.sleepReason })}
    <p class="campaign-hint">The city clock advances while you drive. Sleep skips ${preview.hours.toFixed(1)} game hours; the world keeps changing. ${preview.expiring.length ? `Known bookings closing: ${preview.expiring.join(', ')}.` : 'No known bookings close during this sleep.'} Your parked car and cash stay as they are.</p>
    ${!game.garageNear && !game.save.campaign.finished ? menuItem('Route to Pit Stop', { id: 'sleep-route' }) : ''}
    ${game.job.stage === 'dropoff' ? menuItem('Abandon this ride', { id: 'abandon-ride' }) : menuItem('Ask dispatch for an ordinary fare', { id: 'ordinary-fare' })}</div>`;
}
export function drawerMarkup(page: DrawerPage, { game, settings, saved, entry = 'home', newsroomSection = null, editionDay, publicationBack = 'newsroom', articleId, loadFailed = false }: { game: Game; settings: SettingsControls; saved: boolean; entry?: 'home' | 'newsroom'; newsroomSection?: NewsroomSection | null; editionDay?: number; publicationBack?: DrawerPage; articleId?: string; loadFailed?: boolean }): string {
  let body: string;
  switch (page) {
    case 'home': return splashMarkup(game, saved);
    case 'load-game': {
      const checkpoints = game.mode === 'intro' ? game.morningCheckpoints : [];
      return drawerHeading('Load game.', 'home') + `<p class="intro-copy">${checkpoints.length ? 'Choose a morning to return to. Other saved days stay available; reaching a morning again replaces that day.' : 'No mornings saved yet. Mornings are saved automatically at 07:00, starting when you begin a New game.'}</p>
        ${loadFailed ? '<p class="campaign-hint" role="alert">This morning could not be loaded. The checkpoint may be unavailable or browser storage may be full.</p>' : ''}
        <nav class="game-menu" aria-label="Saved mornings">${checkpoints.map(({ day }) => menuItem(`Day ${day} · 07:00`, { id: `load-day-${day}` })).join('')}</nav>
        <p class="menu-hint" id="menu-hint">↑ ↓ Select · Enter Confirm</p>`;
    }
    case 'new-game': return `<div class="intro-eyebrow">TAXI CHAOS / NEW GAME</div><h2 id="modal-title">Start a new game?</h2>
      <p class="intro-copy">Your current progress will be replaced. Your settings will be kept.</p>
      <p class="campaign-hint">Day 1’s morning will be replaced. Later saved mornings stay available until you reach them again.</p>
      <nav class="game-menu" aria-label="New game confirmation">
        ${menuItem('Cancel', { id: 'cancel-new-game', page: 'home' })}
        ${menuItem('New game', { id: 'confirm-new-game' })}
      </nav><p class="menu-hint" id="menu-hint">↑ ↓ Select · Enter Confirm</p>`;
    case 'publications': return publicationsMarkup(game, editionDay, publicationBack, articleId);
    case 'finale': return finaleMarkup(game);
    case 'newsroom': return newsroomMarkup(game, newsroomSection);
    case 'notebook': return notebookMarkup(game, entry);
    case 'settings': body = settingsMarkup(settings); break;
    case 'shift': return `<div class="intro-eyebrow">TAXI CHAOS / SHIFT</div><h2 id="modal-title">This shift.</h2>${menuItem('Resume your shift', { id: 'start' })}${shiftMarkup(game, campaignMarkup(game))}${game.canReturnToTitle ? menuItem('Return to title', { id: 'return-to-title' }) : ''}`;
    case 'credits': body = creditsMarkup(); break;
    case 'notebook-guide': body = notebookGuideMarkup(game); break;
  }
  const { title, parent } = pages[page];
  return drawerHeading(title, parent) + body;
}

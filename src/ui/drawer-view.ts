import type { Game } from '../game/game';
import type { SettingsControls } from './settings';
import { settingRow } from './setting-controls';
import { campaignDays, displayDay, calendarLabel } from '../campaign/clock';
import { notebookMarkup } from '../campaign/view';
import { newsroomMarkup, type NewsroomSection } from '../campaign/newsroom-view';
import { publicationsMarkup, finaleMarkup } from '../campaign/newspaper-view';
import { creditsMarkup } from './credits';
import { splashMarkup, shiftMarkup } from './splash';
import { drawerHeading, menuItem, type DrawerPage } from './drawer-markup';
import { menuHintMarkup } from './menu-hint';

const pages = {
  home: { title: '', parent: null },
  'load-game': { title: 'Load game.', parent: 'home' },
  'new-game': { title: '', parent: 'home' },
  settings: { title: 'Settings.', parent: 'home' },
  shift: { title: '', parent: 'home' },
  credits: { title: 'Credits.', parent: 'home' },
  newsroom: { title: '', parent: null },
  publications: { title: '', parent: 'newsroom' },
  finale: { title: '', parent: null },
} as const satisfies Record<DrawerPage, { title: string; parent: DrawerPage | null }>;
export const drawerParent = (page: DrawerPage) => pages[page].parent;
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
  return `<div class="campaign-summary"><small>${game.save.campaign.finished ? game.campaignContent.finishedLabel : `${game.campaignContent.title.toUpperCase()} · DAY ${displayDay(game.save.campaign.minute, game.campaignContent.timing)} OF ${campaignDays(game.campaignContent.timing)} · ${calendarLabel(game.save.campaign.minute).split(' · ')[1]}`}</small><p>${game.campaignBulletin}</p></div>`;
}
function campaignActionsMarkup(game: Game, notebookSelected: boolean) {
  if (game.mode !== 'paused' || !game.campaignEnabled) return '';
  const preview = game.sleepPreview;
  return `<button class="menu-item" id="open-notebook" aria-controls="shift-detail" aria-pressed="${notebookSelected}"><span>Dispatch notebook</span></button>
    ${menuItem(game.sleepReason ?? `Sleep at Pit Stop · wake ${preview.label}`, { id: 'sleep', disabled: !!game.sleepReason })}
    ${!game.garageNear && !game.save.campaign.finished ? menuItem('Route to Pit Stop', { id: 'sleep-route' }) : ''}
    ${game.job.stage === 'dropoff' ? menuItem('Abandon this ride', { id: 'abandon-ride' }) : menuItem('Ask dispatch for an ordinary fare', { id: 'ordinary-fare' })}`;
}
export function drawerMarkup(page: DrawerPage, { game, settings, saved, newsroomSection = null, notebookSelected = false, editionDay, publicationBack = 'newsroom', articleId, loadFailed = false }: { game: Game; settings: SettingsControls; saved: boolean; newsroomSection?: NewsroomSection | null; notebookSelected?: boolean; editionDay?: number; publicationBack?: DrawerPage; articleId?: string; loadFailed?: boolean }): string {
  let body: string;
  switch (page) {
    case 'home': return splashMarkup(game, saved);
    case 'load-game': {
      const checkpoints = game.mode === 'intro' ? game.morningCheckpoints : [];
      return drawerHeading('Load game.', 'home') + `<p class="intro-copy">${checkpoints.length ? 'Choose a morning to return to. Other saved days stay available; reaching a morning again replaces that day.' : 'No mornings saved yet. Mornings are saved automatically at 07:00, starting when you begin a New game.'}</p>
        ${loadFailed ? '<p class="campaign-hint" role="alert">This morning could not be loaded. The checkpoint may be unavailable or browser storage may be full.</p>' : ''}
        <nav class="game-menu" aria-label="Saved mornings">${checkpoints.map(({ day }) => menuItem(`Day ${day} · 07:00`, { id: `load-day-${day}` })).join('')}</nav>
        ${menuHintMarkup()}`;
    }
    case 'new-game': return `<div class="intro-eyebrow">TAXI CHAOS / NEW GAME</div><h2 id="modal-title">Start a new game?</h2>
      <p class="intro-copy">Your current progress will be replaced. Your settings will be kept.</p>
      <p class="campaign-hint">Day 1’s morning will be replaced. Later saved mornings stay available until you reach them again.</p>
      <nav class="game-menu" aria-label="New game confirmation">
        ${menuItem('Cancel', { id: 'cancel-new-game', page: 'home' })}
        ${menuItem('New game', { id: 'confirm-new-game' })}
      </nav>${menuHintMarkup()}`;
    case 'publications': return publicationsMarkup(game, editionDay, publicationBack, articleId);
    case 'finale': return finaleMarkup(game);
    case 'newsroom': return newsroomMarkup(game, newsroomSection);
    case 'settings': body = settingsMarkup(settings); break;
    case 'shift': return `<div class="drawer-columns"><div class="drawer-menu-panel" data-menu-scope><div class="drawer-menu-content">
      <div class="intro-eyebrow">DISPATCH / SHIFT</div><h2 id="modal-title">Your shift.</h2>${campaignMarkup(game)}${shiftMarkup(game, `<nav class="game-menu" aria-label="Shift actions">${campaignActionsMarkup(game, notebookSelected)}${menuItem('Resume your shift', { id: 'start' })}</nav>`)}${menuHintMarkup()}</div></div>
      <section class="drawer-detail shift-detail" id="shift-detail" aria-labelledby="${notebookSelected ? 'open-notebook' : 'shift-detail-title'}" data-menu-scope tabindex="-1">
        ${notebookSelected ? `${menuItem('Back', { id: 'shift-menu' })}${notebookMarkup(game)}` : '<h3 id="shift-detail-title">Your dispatch records</h3><p>Choose Dispatch notebook to view your runs and collected records.</p>'}
      </section></div>`;
    case 'credits': body = creditsMarkup(); break;
  }
  const { title, parent } = pages[page];
  return drawerHeading(title, parent) + body;
}

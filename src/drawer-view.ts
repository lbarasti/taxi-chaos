import type { Game } from './game';
import type { SettingsControls } from './settings';
import { settingRow } from './setting-controls';
import { calendarLabel } from './campaign/clock';
import { notebookMarkup, notebookGuideMarkup } from './campaign/view';
import { newsroomMarkup } from './campaign/newsroom-view';
import { creditsMarkup } from './credits';
import { splashMarkup, streetRulesMarkup, shiftMarkup } from './splash';
import { drawerHeading, menuItem, type DrawerPage } from './drawer-markup';

const pages = {
  home: { title: '', parent: null },
  settings: { title: 'Settings.', parent: 'home' },
  rules: { title: 'The street rules.', parent: 'home' },
  shift: { title: 'This shift.', parent: 'home' },
  credits: { title: 'Credits.', parent: 'home' },
  newsroom: { title: '', parent: null },
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
    ${settingRow(settings.sirens)}
  </fieldset>`;
}
function campaignMarkup(game: Game) {
  if (game.mode !== 'paused' || !game.campaignEnabled) return '';
  const preview = game.sleepPreview;
  return `<div class="campaign-summary"><small>${game.save.campaign.finished ? game.campaignContent.finishedLabel : `${game.campaignContent.title.toUpperCase()} · DAY ${game.save.campaign.shift} OF 14 · ${calendarLabel(game.save.campaign.minute).split(' · ')[1]}`}</small><p>${game.campaignBulletin}</p>
    ${menuItem('Dispatch notebook', { id: 'open-notebook', page: 'notebook' })}
    ${menuItem(game.sleepReason ?? `Sleep at Pit Stop · wake ${preview.label}`, { id: 'sleep', disabled: !!game.sleepReason })}
    <p class="campaign-hint">The city clock advances while you drive. Sleep skips ${preview.hours.toFixed(1)} game hours; the world keeps changing. ${preview.expiring.length ? `Known bookings closing: ${preview.expiring.join(', ')}.` : 'No known bookings close during this sleep.'} Your parked car and cash stay as they are.</p>
    ${!game.garageNear && !game.save.campaign.finished ? menuItem('Route to Pit Stop', { id: 'sleep-route' }) : ''}
    ${game.job.stage === 'dropoff' ? menuItem('Abandon this ride', { id: 'abandon-ride' }) : menuItem('Ask dispatch for an ordinary fare', { id: 'ordinary-fare' })}</div>`;
}
export function drawerMarkup(page: DrawerPage, { game, settings, saved, entry = 'home' }: { game: Game; settings: SettingsControls; saved: boolean; entry?: 'home' | 'newsroom' }): string {
  let body: string;
  switch (page) {
    case 'home': return splashMarkup(game, saved);
    case 'newsroom': return newsroomMarkup(game);
    case 'notebook': return notebookMarkup(game, entry);
    case 'settings': body = settingsMarkup(settings); break;
    case 'rules': body = streetRulesMarkup(); break;
    case 'shift': body = shiftMarkup(game, campaignMarkup(game)); break;
    case 'credits': body = creditsMarkup(); break;
    case 'notebook-guide': body = notebookGuideMarkup(game); break;
  }
  const { title, parent } = pages[page];
  return drawerHeading(title, parent) + body;
}

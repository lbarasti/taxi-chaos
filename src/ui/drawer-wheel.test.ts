import { describe, expect, it } from 'vitest';
import { menuHintMarkup, menuHintText } from './menu-hint';
import { Game } from '../game/game';
import { drawerMarkup } from './drawer-view';
import { createSettings } from './settings';
import { newsroomMarkup } from '../campaign/newsroom-view';

function pausedGame(story = true) {
  const instance = new Game(undefined, false, story);
  instance.start(); instance.setMode('paused');
  const settings = createSettings(() => instance, {
    preferences: { muted: false, volume: 1, playerEngine: 1, ambient: 1, sirens: 1 },
    configure: () => {}, unlock: async () => true,
  });
  return { game: instance, settings };
}

describe('panel wheel', () => {
  it('shows the neighbouring campaign panel beside the current title', () => {
    const { game, settings } = pausedGame();
    const shift = drawerMarkup('shift', { game, settings, saved: false });
    expect(shift).toContain('class="drawer-wheel"');
    expect(shift).toContain('<h2 id="modal-title">Your shift.</h2>');
    expect(shift.indexOf('<h2 id="modal-title">')).toBeLessThan(shift.indexOf('data-wheel'));
    expect(shift).toContain('data-wheel data-page="newsroom"');
    expect(shift).toContain('aria-keyshortcuts="ArrowRight"');
    expect(shift).toContain('aria-label="Newsroom panel"');
    expect(shift).toContain('>Newsroom.</button>');
    expect(shift).toContain('id="menu-hint">← → Panels · ↑ ↓ Select · Enter Confirm');
    const newsroom = drawerMarkup('newsroom', { game, settings, saved: false });
    expect(newsroom).toContain('class="drawer-wheel"');
    expect(newsroom).toContain('<h2 id="modal-title">Newsroom.</h2>');
    expect(newsroom.indexOf('<h2 id="modal-title">')).toBeLessThan(newsroom.indexOf('data-wheel'));
    expect(newsroom).toContain('data-wheel data-page="shift"');
    expect(newsroom).toContain('aria-keyshortcuts="ArrowRight"');
    expect(newsroom).toContain('aria-label="Your shift panel"');
    expect(newsroom).toContain('>Your shift.</button>');
    expect(newsroom).toContain('id="menu-hint">← → Panels');
  });
  it('keeps the wheel off screens without a neighbouring panel', () => {
    const plain = pausedGame(false);
    for (const page of ['shift', 'newsroom'] as const) {
      const markup = drawerMarkup(page, { game: plain.game, settings: plain.settings, saved: false });
      expect(markup).not.toContain('data-wheel');
      expect(markup).toContain('↑ ↓ Select · Enter Confirm');
      expect(markup).not.toContain('← → Panels');
    }
    const { game, settings } = pausedGame();
    const notebook = drawerMarkup('shift', { game, settings, saved: false, notebookSelected: true });
    expect(notebook).toContain('data-page="newsroom"');
    expect(notebook).toContain('↑ ↓ Select · Enter Confirm');
    expect(notebook).not.toContain('← → Panels');
    expect(newsroomMarkup(game, 'sources')).not.toContain('← → Panels');
  });
  it('names the arrow keys for each device only where a wheel exists', () => {
    expect(menuHintText('keyboard', true)).toBe('← → Panels · ↑ ↓ Select · Enter Confirm');
    expect(menuHintText('xbox', true)).toContain('◄ ► Panels');
    expect(menuHintText('playstation', true)).toContain('◄ ► Panels');
    expect(menuHintText('touch', true)).toBe(menuHintText('touch'));
    expect(menuHintText('keyboard')).toBe('↑ ↓ Select · Enter Confirm');
    expect(menuHintMarkup('keyboard', true)).toContain('id="menu-hint"');
  });
});

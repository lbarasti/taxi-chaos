import { describe, expect, it, vi } from 'vitest';
import { savedCampaignAvailable, splashMarkup, splashPrompts, shiftMarkup } from './splash';
import { drawerHeading, menuItem } from './drawer-markup';
import { defaultSave, Game } from '../game/game';
describe('startup splash', () => {
  it('recognizes only a compatible campaign and handles inaccessible storage', () => {
    for (const [value, expected] of [[null, false], ['{', false], ['{}', false], [JSON.stringify(defaultSave()), true]] as const) {
      vi.stubGlobal('localStorage', { getItem: () => value }); expect(savedCampaignAvailable()).toBe(expected);
    }
    vi.stubGlobal('localStorage', { getItem: () => { throw Error('denied'); } }); expect(savedCampaignAvailable()).toBe(false); vi.unstubAllGlobals();
  });
  it('shows loaded progress, previews the actual next stop and escapes mission text', () => {
    const game = new Game(undefined, false); game.save.cash = 320; game.save.deliveries = 8;
    game.job.stage = 'dropoff'; game.job.destination = '<Market>';
    const html = splashMarkup(game, true); expect(html).toContain('Continue'); expect(html).toContain('$320'); expect(html).toContain('RIDE IN PROGRESS'); expect(html).toContain('&lt;Market&gt;');
    expect(splashMarkup(game, false)).toContain('New game');
    expect(splashMarkup(game, false)).not.toContain('id="start"');
    expect(splashMarkup(game, false)).not.toContain('Start your shift');
    expect([...html.matchAll(/class="menu-item" id="([^"]+)"/g)].map(match => match[1]))
      .toEqual(['start', 'new-game', 'menu-settings', 'menu-credits']);
  });
  it('reuses the start drawer with live progress and resume for a paused shift', () => {
    const game = new Game(undefined, false); game.start(); game.setMode('paused');
    game.save.shiftStats = { earnings: 175, jobs: 3, smashed: 9, kills: 2 };
    const html = splashMarkup(game, false);
    expect(html).toContain('A little cab.'); expect(html).toContain('Resume your shift');
    expect(html).toContain('YOUR CURRENT SHIFT · PAUSED'); expect(html).not.toContain('Start your shift');
    expect(html).not.toContain('new-game'); expect(html).not.toContain('menu-shift'); expect(html).toContain('Since you last woke up.'); expect(html).toContain('$175');
    const shift = shiftMarkup(game, '<button>Sleep</button>');
    expect(shift).toContain('$175'); expect(shift).toContain('PEDESTRIAN FATALITIES'); expect(shift).toContain('Sleep');
    game.mode = 'intro';
    expect(splashMarkup(game, true)).not.toContain('Dispatch notebook');
  });
  it('uses equally styled actions and separate pages without accordions', () => {
    const game = new Game(undefined, false);
    const html = splashMarkup(game, false);
    expect(html.match(/class="menu-item"/g)).toHaveLength(3);
    expect(html).not.toContain('class="primary"');
    expect(menuItem('<Start>', { id: '"start', disabled: true })).toContain('id="&quot;start" disabled><span>&lt;Start&gt;</span>');
    expect(html).not.toContain('<details'); expect(html).not.toContain('<summary');
    expect(drawerHeading('Settings.', 'home')).toContain('data-page="home"');
    expect(drawerHeading('Credits.', 'home')).toContain('data-page="home"');
  });
  it.each([
    ['intro', true, false, false],
    ['intro', true, true, false],
    ['paused', true, false, false],
    ['paused', true, true, true],
    ['paused', false, true, false],
  ] as const)('keeps the %s menu focused (campaign %s, complete %s)', (mode, campaign, finished, recap) => {
    const game = new Game(undefined, false, campaign);
    game.mode = mode; game.save.campaign.finished = finished;
    const html = splashMarkup(game, true);
    expect([...html.matchAll(/class="menu-item" id="([^"]+)"/g)].map(match => match[1]))
      .toEqual(['start', ...(mode === 'intro' ? ['new-game'] : []), 'menu-settings', 'menu-credits', ...(recap ? ['menu-finale'] : [])]);
  });
  it('maps prompts to the most recent device', () => {
    expect(splashPrompts('keyboard')).toContain('WASD'); expect(splashPrompts('touch')).toContain('DRAG'); expect(splashPrompts('xbox')).toContain('X'); expect(splashPrompts('playstation')).toContain('□');
  });
});

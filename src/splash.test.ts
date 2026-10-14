import { describe, expect, it, vi } from 'vitest';
import { savedCampaignAvailable, splashMarkup, splashPrompts } from './splash';
import { defaultSave, Game } from './game';
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
    const html = splashMarkup(game, true, ''); expect(html).toContain('Continue'); expect(html).toContain('$320'); expect(html).toContain('RIDE IN PROGRESS'); expect(html).toContain('&lt;Market&gt;');
    expect(splashMarkup(game, false, '')).toContain('Start your shift');
  });
  it('reuses the start drawer with live progress and resume for a paused shift', () => {
    const game = new Game(undefined, false); game.start(); game.setMode('paused');
    game.shiftEarnings = 175; game.jobsDone = 3; game.smashed = 9; game.kills = 2;
    const html = splashMarkup(game, false, '<div>Audio settings</div>', '<button>Dispatch notebook</button>');
    expect(html).toContain('A little cab.'); expect(html).toContain('Resume your shift');
    expect(html).toContain('YOUR CURRENT SHIFT · PAUSED'); expect(html).not.toContain('Start your shift');
    expect(html).toContain('$175'); expect(html).toContain('PEDESTRIAN FATALITIES');
    expect(html).toContain('Audio settings'); expect(html).toContain('Dispatch notebook');
    game.mode = 'intro';
    expect(splashMarkup(game, true, '', '<button>Dispatch notebook</button>')).not.toContain('Dispatch notebook');
  });
  it('maps prompts to the most recent device', () => {
    expect(splashPrompts('keyboard')).toContain('WASD'); expect(splashPrompts('touch')).toContain('DRAG'); expect(splashPrompts('xbox')).toContain('X'); expect(splashPrompts('playstation')).toContain('□');
  });
});

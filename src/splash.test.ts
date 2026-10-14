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
  it('maps prompts to the most recent device', () => {
    expect(splashPrompts('keyboard')).toContain('WASD'); expect(splashPrompts('touch')).toContain('DRAG'); expect(splashPrompts('xbox')).toContain('X'); expect(splashPrompts('playstation')).toContain('□');
  });
});

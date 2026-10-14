import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { pauseDashboardMarkup } from './pause-dashboard';
import { navigationHudState } from './navigation-hud';

describe('pause dashboard and paused message routing', () => {
  it('routes an offered booking while keeping simulation, money and acceptance frozen', () => {
    const g = new Game(undefined, false); g.start(); g.setMode('paused');
    const offer = [...g.missionOffers.keys()][0]; expect(offer).toBeDefined();
    const time = g.time, minute = g.save.campaign.minute, cash = g.save.cash;
    const choices = structuredClone(g.save.story.choices);
    expect(g.routeMissionOffer(offer)).toBe(true);
    g.update(1);
    expect(g.mode).toBe('paused'); expect(g.job.missionId).toBe(offer); expect(g.job.stage).toBe('pickup');
    expect(g.time).toBe(time); expect(g.save.campaign.minute).toBe(minute); expect(g.save.cash).toBe(cash);
    expect(g.save.story.choices).toEqual(choices); expect(g.save.story.completed).not.toContain(offer);
  });

  it('preserves input and lifecycle restrictions when routing from pause', () => {
    const g = new Game(undefined, false); g.start();
    const offer = [...g.missionOffers.keys()][0];
    for (const mode of ['intro', 'garage', 'wasted', 'arrested'] as const) { g.setMode(mode); expect(g.routeMissionOffer(offer)).toBe(false); }
    g.setMode('paused'); g.onFoot = true; expect(g.routeMissionOffer(offer)).toBe(false);
    g.onFoot = false; g.job.stage = 'dropoff'; const job = g.job;
    expect(g.routeMissionOffer(offer)).toBe(false); expect(g.job).toBe(job);
  });

  it('shows the actual tip target and guidance without inventing deadlines or bindings', () => {
    const g = new Game(undefined, false); g.start(); g.job.stage = 'dropoff'; g.job.elapsed = g.job.time + 1;
    const riding = pauseDashboardMarkup(g);
    expect(riding).toContain('FAST TIP WINDOW'); expect(riding).toContain('0:00');
    expect(riding).not.toMatch(/TIME LEFT|Horn|Restart|Quit/);
    g.job.stage = 'pickup';
    expect(pauseDashboardMarkup(g, navigationHudState(g, false))).toContain('DISPATCH AVAILABLE');
    g.onFoot = true;
    const walking = pauseDashboardMarkup(g);
    expect(walking).toContain('On foot.'); expect(walking).toContain('YOUR HEALTH');
    expect(walking).not.toContain('<kbd>SHIFT</kbd>'); expect(walking).not.toContain('<kbd>G</kbd>');
  });
});

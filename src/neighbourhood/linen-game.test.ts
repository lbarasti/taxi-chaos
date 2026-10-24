import { describe, expect, it } from 'vitest';
import { dayMinute } from '../campaign/clock';
import { campaignDefinition } from '../campaign/content';
import { defaultCampaign } from '../campaign/state';
import { advanceCampaignTo } from '../campaign/scheduler';
import { ScenarioRunner } from '../scenarios/runner';
import { vec } from '../physics/physics';
import { LINEN_COUNT } from './linen';

function run(r: ScenarioRunner, ...commands: unknown[]) {
  for (const command of commands) {
    const result = r.execute(command);
    if (result.status !== 'passed') throw new Error(result.error);
  }
}
function returnBooking() {
  const r = new ScenarioRunner();
  run(r, { op: 'advance', to: { day: 2 } }, { op: 'place', at: 'moonlight-hotel' }, { op: 'abandon' });
  expect(r.game.job.missionId).toBe('linen-sam-clockoff');
  expect(r.game.save.playerRecords.texts.some(t => t.missionId === 'linen-mags-loan')).toBe(false);
  run(r, { op: 'pickup' }, { op: 'deliver' });
  expect(r.game.save.playerRecords.texts.some(t => t.missionId === 'linen-mags-loan')).toBe(true);
  run(r, { op: 'route', mission: 'linen-mags-loan' }, { op: 'pickup' }, { op: 'deliver' },
    { op: 'advance', to: { day: 4, hour: 23 } }, { op: 'route', mission: 'linen-return' }, { op: 'pickup' });
  return r;
}

describe('borrowed linen through the driving loop', () => {
  it('allows a direct return even with the optional route selected, leaving Sam a wash load', () => {
    const r = returnBooking(), g = r.game;
    expect(g.stopoverStatus?.completed).toBe(false);
    expect(g.beginStopover()).toBe(false);
    const fare = g.job.fare, targetTime = g.job.time;
    expect(g.navigateStopover()).toBe(true);
    expect(g.target).toEqual(g.stopoverStatus!.position);
    expect(g.navigateStopover()).toBe(true);
    expect(g.target).toEqual(g.job.dropoff);
    expect(g.navigateStopover()).toBe(true);
    expect(g.job.fare).toBe(fare); expect(g.job.time).toBe(targetTime);
    run(r, { op: 'deliver' });
    expect(g.dialogue.active?.message.text).toContain('They need a wash');
    expect(g.navToStopover).toBe(false);
    run(r, { op: 'advance', event: 'linen-stock-count' });
    expect(g.save.campaign.world).toMatchObject({ 'linen-returned': true, 'linen-washed': false, 'linen-stock': 'wash-needed' });
  });

  it('requires a deliberate stationary wash, restores its progress and pays for it once', () => {
    const r = returnBooking();
    const baseFare = r.game.job.fare, baseTime = r.game.job.time;
    run(r, { op: 'place', at: 'east-village' }, { op: 'step', seconds: 1 });
    expect(r.game.save.campaign.world['linen-washed']).toBe(false);
    expect(r.game.job.stopover).toBeUndefined();
    expect(r.game.beginStopover()).toBe(true);
    expect(r.game.beginStopover()).toBe(false);
    run(r, { op: 'step', seconds: 9 }, { op: 'reload' });
    expect(r.game.job.stopover?.elapsed).toBeCloseTo(9, 3);
    expect(r.game.navToStopover).toBe(true);
    expect(r.game.job.fare).toBe(baseFare); expect(r.game.job.time).toBe(baseTime);
    run(r, { op: 'mode', mode: 'paused' }, { op: 'step', seconds: 2 });
    expect(r.game.job.stopover?.elapsed).toBeCloseTo(9, 3);
    run(r, { op: 'mode', mode: 'playing' }, { op: 'place', at: 'market-quarter' }, { op: 'step', seconds: 2 });
    expect(r.game.job.stopover?.elapsed).toBeCloseTo(9, 3);
    run(r, { op: 'place', at: 'east-village' }, { op: 'step', seconds: 9.1 });
    expect(r.game.save.campaign.world['linen-washed']).toBe(true);
    expect(r.game.job.stopover).toMatchObject({ completed: true, started: false, elapsed: 18 });
    expect(r.game.job.fare).toBeGreaterThan(baseFare); expect(r.game.job.time).toBeGreaterThan(baseTime);
    const fare = r.game.job.fare, time = r.game.job.time;
    expect(r.game.beginStopover()).toBe(false); expect(r.game.navigateStopover()).toBe(false);
    run(r, { op: 'reload' }, { op: 'step', seconds: 1 });
    expect(r.game.job.fare).toBe(fare); expect(r.game.job.time).toBe(time);
    run(r, { op: 'deliver' });
    expect(r.game.dialogue.active?.message.text).toContain('Six clean tablecloths');
    run(r, { op: 'advance', event: 'linen-stock-count' });
    expect(r.game.save.campaign.world['linen-stock']).toBe('clean');
  });

  it('physically approaches the wash room, gates moving activation and never starts by driving through', () => {
    const r = returnBooking(), g = r.game;
    // One setup placement for this driving segment, then only real 120 Hz controls.
    g.player.body.position = vec(204, 144); g.player.body.velocity = vec(); g.player.body.angle = Math.PI / 2;
    g.navigateStopover();
    const start = { ...g.player.body.position };
    let blockedWhileMoving = false;
    for (let i = 0; i < 2400; i++) {
      const distance = 164 - g.player.body.position.y;
      g.keys = new Set(distance > 2.5 && g.speed < 4 ? ['KeyW'] : ['Space']);
      g.update(1 / 120);
      if (g.stopoverStatus?.nearby && g.speed >= 0.8) { expect(g.beginStopover()).toBe(false); blockedWhileMoving = true; }
      if (g.stopoverStatus?.available && distance < 3) break;
    }
    g.keys.clear(); g.controls.throttle = 0;
    expect(g.player.body.position.y - start.y).toBeGreaterThan(15);
    expect(blockedWhileMoving).toBe(true);
    expect(g.save.campaign.world['linen-washed']).toBe(false);
    expect(g.stopoverStatus?.available).toBe(true);
    expect(g.beginStopover()).toBe(true);
  });

  it('keeps the reunion and its extra fare receipts outside the investigation at matched campaign time', () => {
    const r = returnBooking();
    run(r, { op: 'deliver' }, { op: 'advance', event: 'linen-stock-count' });
    const baseline = defaultCampaign(); advanceCampaignTo(baseline, LINEN_COUNT);
    const local = r.game.save.campaign;
    for (const key of Object.keys(campaignDefinition.initialWorld).filter(key => !key.startsWith('linen-'))) expect(local.world[key]).toEqual(baseline.world[key]);
    expect(local.newsroom).toEqual(baseline.newsroom);
    expect(local.publications).toEqual(baseline.publications);
    expect(local.editions).toEqual(baseline.editions);
    expect(r.game.save.playerRecords.notebook.filter(note => Object.hasOwn(campaignDefinition.materials, note.id))).toEqual([]);
  });

  it('restores an ordinary fare with its original route, voice and rough arrival', () => {
    const r = new ScenarioRunner();
    run(r, { op: 'ordinary' }, { op: 'pickup' });
    const { pickup, dropoff, everyday } = structuredClone(r.game.job);
    expect(everyday?.journeyId).toBeDefined();
    r.game.job.comfort = 40;
    run(r, { op: 'reload' });
    expect(r.game.job).toMatchObject({ pickup, dropoff, everyday, stage: 'dropoff', comfort: 40 });
    const g = r.game, persist = g.persist.bind(g), before = g.save.deliveries;
    const activeAfterPayment: unknown[] = [];
    g.persist = () => { const result = persist(); if (g.save.deliveries > before) activeAfterPayment.push(structuredClone(g.save.campaign.activeRide)); return result; };
    run(r, { op: 'deliver' });
    expect(activeAfterPayment.length).toBeGreaterThan(0);
    expect(activeAfterPayment.every(ride => ride === null)).toBe(true);
    expect(r.game.dialogue.active?.message).toMatchObject({ speaker: everyday!.character, text: everyday!.roughArrival, channel: 'passenger' });
    expect(r.game.save.campaign.minute).toBeLessThan(dayMinute(2));
  });

  it('defers an Oscar booking while he is already riding in the cab', () => {
    const r = new ScenarioRunner(), g = r.game;
    run(r, { op: 'advance', to: { day: 4, hour: 22, minute: 50 } });
    run(r, { op: 'place', at: 'flower-market' });
    g.save.campaign.world['linen-supplies'] = true;
    g.offer = campaignDefinition.everydayJobs.findIndex(j => j.character === 'oscar') - 1;
    run(r, { op: 'ordinary' }, { op: 'pickup' });
    expect(g.job.everyday?.character).toBe('oscar');
    run(r, { op: 'advance', to: { day: 4, hour: 23 } });
    expect(g.missionOffers.has('linen-return')).toBe(false);
    expect(g.save.playerRecords.texts.some(t => t.missionId === 'linen-return')).toBe(false);
    run(r, { op: 'deliver' });
    expect(g.missionOffers.has('linen-return')).toBe(true);
  });
});

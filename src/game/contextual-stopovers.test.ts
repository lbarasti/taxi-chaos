import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { vec } from '../physics/physics';
import { pathLength } from '../world/countryside';
import { campaignDefinition } from '../campaign/content';
import { defaultCampaign } from '../campaign/state';
import { selectProceduralStopover } from '../campaign/stopovers';

function juneBooking() {
  const game = new Game(undefined, false, true);
  game.start();
  const june = campaignDefinition.everydayJobs.find(job => job.character === 'june')!;
  const journey = june.journeys!.find(journey => journey.id === 'june-groceries')!;
  game.job = (game as any).makeEverydayJob(june, journey, 'fare');
  game.job.stage = 'dropoff';
  return game;
}

describe('optional stops outside authored campaign missions', () => {
  it.each(['fare', 'parcel'] as const)('uses reduced road-distance pricing for every authored ordinary %s', type => {
    const game = juneBooking();
    for (const regular of campaignDefinition.everydayJobs) {
      for (const journey of type === 'fare' ? regular.journeys ?? [] : regular.parcelJourneys ?? []) {
        const job = (game as any).makeEverydayJob(regular, journey, type);
        const distance = pathLength(game.world.navigation.roadPath(job.pickup, job.dropoff));
        expect(job.fare, journey.id).toBe(Math.round((55 + distance * 0.7) / 10));
      }
    }
  });

  it('makes a regular fare optional, location-specific, and reversible', () => {
    const game = juneBooking();
    expect(game.job.missionId).toBeUndefined();
    const status = game.stopoverStatus!;
    expect(status.title).toBe('Bread collection');
    expect(status.labels?.route).toBe('Collect bread');
    expect(game.beginStopover()).toBe(false);
    const original = { ...game.job.dropoff };
    expect(game.navigateStopover()).toBe(true);
    expect(game.target).toEqual(status.position);
    expect(game.navigateStopover()).toBe(true);
    expect(game.target).toEqual(original);
    expect(game.job.stopover?.completed).toBe(false);
  });

  it('restores a partly completed regular stop and never pays twice', () => {
    const game = juneBooking();
    const place = game.stopoverStatus!.position;
    game.player.body.position = { ...place };
    game.player.body.velocity = vec();
    game.update(1 / 120);
    expect(game.stopoverStatus?.available).toBe(true);
    const before = game.job.fare;
    expect(game.beginStopover()).toBe(true);
    for (let i = 0; i < 120; i++) game.update(1 / 120);
    const saved = game.saveSnapshot();
    const restored = new Game(undefined, false, true, saved);
    restored.start();
    expect(restored.job.everyday?.journeyId).toBe('june-groceries');
    expect(restored.job.stopover?.started).toBe(true);
    expect(restored.job.stopover?.elapsed).toBeGreaterThan(0.9);
    expect(restored.job.fare).toBe(before);
    restored.player.body.position = { ...restored.stopoverStatus!.position };
    restored.player.body.velocity = vec();
    for (let i = 0; i < 500; i++) restored.update(1 / 120);
    expect(restored.job.stopover?.completed).toBe(true);
    const seconds = restored.stopoverStatus!.seconds;
    const detour = Math.max(0, restored.job.stopover!.detourAllowance - seconds) * 3;
    expect(restored.job.fare).toBe(before + Math.round((detour * 0.7 + seconds) / 10));
    const credited = restored.job.fare;
    const twice = new Game(undefined, false, true, restored.saveSnapshot());
    expect(twice.job.fare).toBe(credited);
    expect(twice.job.stopover?.completed).toBe(true);
  });

  it('generated detour requests do not need a campaign mission or character', () => {
    const options = campaignDefinition.proceduralStopovers!;
    const stops = {
      'market-quarter': { position: vec(45, 2) },
      'dockside-deli': { position: vec(175, 150) },
      'east-village': { position: vec(190, 150) },
    };
    const selected = selectProceduralStopover(options, stops, vec(0, 0), vec(100, 0), 1);
    expect(selected?.id).toBe('quick-parcel');
    expect(selected?.effects).toEqual([]);
    const base = defaultCampaign();
    expect(base.newsroom.received).toEqual({});
    expect(base.publications).toEqual([]);
  });
});

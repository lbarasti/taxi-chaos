import { describe, expect, it } from 'vitest';
import { Body, vec } from '../physics/physics';
import { drivingSound, SoundEvents, spatialSound } from './sound';
import { Game } from '../game/game';
import { loadScenario } from '../debug/lab';

describe('sound event delivery', () => {
  it('deduplicates contact pairs without suppressing separate collisions', () => {
    const queue = new SoundEvents();
    queue.emit('crunch', 1, { key: 'a:b' }); queue.emit('crunch', 1.01, { key: 'a:b' });
    queue.emit('crunch', 1.02, { key: 'a:c' }); queue.emit('crunch', 1.22, { key: 'a:b' });
    expect(queue.drain(1.22)).toHaveLength(3);
    expect(queue.drain(1.22)).toEqual([]);
  });
  it('drops stale simulation history and resets cooldowns when IDs are reused', () => {
    const queue = new SoundEvents(); queue.emit('crash', 3, { key: 'car:0' });
    expect(queue.drain(4)).toEqual([]);
    queue.reset(); queue.emit('crash', 0, { key: 'car:0' });
    expect(queue.epoch).toBe(1); expect(queue.drain(0)).toHaveLength(1);
  });
  it('bounds dense batches and preserves explosions over low-priority clutter', () => {
    const queue = new SoundEvents(); queue.emit('explosion', 1);
    for (let i = 0; i < 200; i++) queue.emit('bump', 1);
    const events = queue.drain(1);
    expect(events).toHaveLength(64); expect(events.filter(e => e.cue === 'explosion')).toHaveLength(1);
  });
});

describe('audio mix signals', () => {
  it('attenuates outside the audible radius and pans by world X', () => {
    expect(spatialSound(vec(), vec(100, 0)).gain).toBe(0);
    expect(spatialSound(vec(), vec()).gain).toBe(1);
    const right = spatialSound(vec(), vec(20, 0)), left = spatialSound(vec(), vec(-20, 0));
    expect(right.gain).toBe(left.gain); expect(right.pan).toBe(-left.pan);
    expect(spatialSound(vec(), vec(0, 20)).pan).toBe(0);
  });
  it('uses genuine slip for squeal and keeps low-speed drifts quiet', () => {
    expect(drivingSound(20, 1, 0, false).skidGain).toBe(0);
    expect(drivingSound(2, 1, 12, false).skidGain).toBe(0);
    expect(drivingSound(20, 1, 8, false).skidGain).toBeGreaterThan(0);
    expect(drivingSound(20, 1, 0, true).engineRate).toBeGreaterThan(drivingSound(20, 0, 0, false).engineRate);
  });
});

describe('gameplay FX hooks', () => {
  it('reports one sound for the two-pass collision solver, including with God mode', () => {
    const game = new Game(); game.settings.invincible = true;
    const wall = game.world.add('building', 0, 0, 1, 20, '#fff');
    game.player.body = new Body(-2.1, 0); game.player.body.velocity = vec(20, 0);
    game.collision(game.player, wall, 1 / 120); game.collision(game.player, wall, 0);
    expect(game.sounds.drain(game.time).map(e => e.cue)).toEqual(['crash']); expect(game.health).toBe(100);
  });
  it('emits material destruction once and still preserves the normal smash count', () => {
    const game = new Game(), crate = game.world.props.find(p => p.kind === 'crate')!;
    game.destroy(crate, game.player, 15); game.destroy(crate, game.player, 15);
    expect(game.sounds.drain(0).map(e => e.cue)).toEqual(['wood']); expect(game.smashed).toBe(1);
  });
  it('reports each chain explosion once across fixed updates', () => {
    const game = new Game(); loadScenario(game, 'chain-reaction'); let blasts = 0;
    for (let i = 0; i < 720; i++) { game.update(1 / 120); blasts += game.sounds.drain(game.time).filter(e => e.cue === 'explosion').length; }
    expect(blasts).toBe(3); expect(game.explosions).toBe(3);
  });
  it('emits successful fare and purchase cues only after their actions complete', () => {
    const game = new Game(); game.start(); game.player.body.position = { ...game.job.pickup }; game.jobs(0.8);
    expect(game.sounds.drain(0).map(e => e.cue)).toEqual(['pickup']);
    game.player.body.position = { ...game.job.dropoff }; game.jobs(0.8);
    expect(game.sounds.drain(0).map(e => e.cue)).toEqual(['payment']);
    game.player.body.position = { x: 4, y: 32 }; game.garage(); game.save.cash = 0; expect(game.buy('engine')).toBe(false); expect(game.sounds.drain(0)).toEqual([]);
    game.save.cash = 1000; expect(game.buy('engine')).toBe(true); expect(game.sounds.drain(0).map(e => e.cue)).toEqual(['purchase']);
  });
});

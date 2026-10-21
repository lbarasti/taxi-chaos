import { describe, expect, it } from 'vitest';
import { Body, vec } from '../physics/physics';
import { drivingSound, soundPriority, SoundEvents, spatialSound, trafficEngineGain } from './sound';
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
  it('limits horns across cars and per car, and resets both cooldowns with a new run', () => {
    const queue = new SoundEvents();
    const a = { key: 'horn:1', cooldown: 8 }, b = { key: 'horn:2', cooldown: 8 };
    queue.emit('horn', 0, a); queue.emit('horn', 0.1, b);
    expect(queue.drain(0.1)).toHaveLength(1);
    queue.emit('horn', 3, a); queue.emit('horn', 3, b);
    expect(queue.drain(3)).toHaveLength(1);
    queue.emit('horn', 8, a); expect(queue.drain(8)).toHaveLength(1);
    expect(soundPriority('horn')).toBeLessThan(soundPriority('bump'));
    queue.reset(); queue.emit('horn', 0, a); expect(queue.drain(0)).toHaveLength(1);
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
  });
  it('blends from a low idle to a stronger loaded engine, then softens when lifting off', () => {
    const idle = drivingSound(0, 0, 0, false), coast = drivingSound(20, 0, 0, false), accelerating = drivingSound(20, 1, 0, false);
    expect(idle.engineLoadGain).toBe(0);
    expect(accelerating.engineLoadGain).toBeGreaterThan(coast.engineLoadGain);
    expect(accelerating.engineCutoff).toBeGreaterThan(coast.engineCutoff);
    expect(accelerating.engineGain + accelerating.engineLoadGain).toBeGreaterThan(idle.engineGain);
  });
  it('raises traffic noise above three nearby cars and caps the density boost', () => {
    expect(trafficEngineGain(0)).toBe(0);
    expect(trafficEngineGain(3)).toBe(trafficEngineGain(1));
    expect(trafficEngineGain(4)).toBeGreaterThan(trafficEngineGain(3));
    expect(trafficEngineGain(8)).toBeGreaterThan(trafficEngineGain(4));
    expect(trafficEngineGain(100)).toBe(trafficEngineGain(8));
  });
  it('gives each engine level a deeper and fuller sound at the same speed and throttle', () => {
    let previous = drivingSound(20, 1, 0, false);
    for (let level = 1; level <= 3; level++) {
      const next = drivingSound(20, 1, 0, false, { engine: level, boost: 0 });
      expect(next.enginePitch).toBeLessThan(previous.enginePitch);
      expect(next.engineLoadGain).toBeGreaterThan(previous.engineLoadGain);
      expect(next.engineCutoff).toBeGreaterThan(previous.engineCutoff);
      previous = next;
    }
  });
  it('gives each boost level a stronger, brighter rush only while boosting', () => {
    let previous = drivingSound(20, 1, 0, true);
    for (let level = 1; level <= 3; level++) {
      const next = drivingSound(20, 1, 0, true, { engine: 0, boost: level });
      expect(next.boostRate).toBeGreaterThan(previous.boostRate);
      expect(next.boostGain).toBeGreaterThan(previous.boostGain);
      expect(next.boostCutoff).toBeGreaterThan(previous.boostCutoff);
      expect(next.engineLoadGain).toBe(previous.engineLoadGain);
      previous = next;
    }
    expect(drivingSound(20, 1, 0, false, { engine: 3, boost: 3 }).boostGain).toBe(0);
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
  it('gets one horn reaction from an occupied car after a player bump, even with repeated contacts', () => {
    const game = new Game(); game.start(); game.time = 1;
    game.player.body = new Body(0, 0); game.player.body.velocity = vec(4, 0);
    const car = game.vehicle('traffic', 3.8, 0, 0, '#fff');
    game.collision(game.player, car, 1 / 120); game.collision(car, game.player, 1 / 120);
    const events = game.sounds.drain(game.time);
    expect(events.some(event => event.cue === 'bump')).toBe(true);
    expect(events.filter(event => event.cue === 'horn')).toHaveLength(1);
  });
  it('gets a soft horn on an existing close-call event, without repeating it on the next step', () => {
    const game = new Game(); game.start(); game.time = 1; game.vehicles = [game.player];
    game.player.body.position = vec(0, 0); game.player.body.velocity = vec(15, 0);
    const car = game.vehicle('traffic', 0, 4.2, 0, '#fff');
    game.jobs(0); game.jobs(0);
    const horns = game.sounds.drain(game.time).filter(event => event.cue === 'horn');
    expect(horns).toHaveLength(1); expect(horns[0].position).toEqual(car.body.position);
    expect(horns[0].strength).toBeLessThan(1);
  });
  it('only honks for congestion after cars have been blocked, including while the player walks', () => {
    const game = new Game(); game.start(); game.onFoot = true; game.vehicles = [game.player];
    game.driver.position = vec(0, 0); game.player.body.position = vec(200, 200);
    const waiting = game.vehicle('traffic', 6, 0, 0, '#fff'); waiting.ai.blocked = true; waiting.ai.stalled = 1;
    game.vehicle('traffic', 12, 0, 0, '#fff'); game.trafficHorns(); expect(game.sounds.drain(0)).toEqual([]);
    game.vehicle('traffic', 18, 0, 0, '#fff');
    waiting.ai.stalled = 0; game.trafficHorns(); expect(game.sounds.drain(0)).toEqual([]);
    waiting.ai.stalled = 1; game.trafficHorns(); game.trafficHorns();
    expect(game.sounds.drain(0).map(event => event.cue)).toEqual(['horn']);
    game.time = 9; game.setMode('paused'); game.trafficHorns(); expect(game.sounds.drain(9)).toEqual([]);
  });
  it('keeps parked and abandoned cars silent when bumped, and excludes wrecks from congestion', () => {
    const game = new Game(); game.start(); game.time = 1; game.vehicles = [game.player];
    for (const state of ['parked', 'abandoned']) {
      game.player.body = new Body(0, 0); game.player.body.velocity = vec(4, 0);
      const car = game.vehicle('traffic', 3.8, 0, 0, '#fff'); car.parked = state === 'parked'; car.driverExited = state === 'abandoned';
      game.collision(game.player, car, 1 / 120);
      expect(game.sounds.drain(1).filter(event => event.cue === 'horn')).toEqual([]);
    }
    for (let i = 0; i < 4; i++) {
      const car = game.vehicle('traffic', 6 + i * 4, 0, 0, '#fff'); car.damage.status = 'wreck'; car.ai.blocked = true; car.ai.stalled = 3;
    }
    game.trafficHorns(); expect(game.sounds.drain(1)).toEqual([]);
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

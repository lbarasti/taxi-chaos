import { describe, expect, it, vi } from 'vitest';
// Lifecycle tests use tiny fake buffers; real sample decoding/output is browser-tested.
vi.mock('./audio-assets', () => ({ audioAssets: Object.fromEntries(['engine', 'player-engine', 'engine-load', 'horn', 'skid', 'fire', 'siren', 'boost-loop', 'boost-start', 'boost-end', 'bump-0', 'crunch-0', 'crash-0', 'explosion-0', 'rumble', 'pulp'].map(name => [name, 'data:audio/wav;base64,AAAA'])) }));
import { AudioFX, audioPreferences } from './audio';
import { Game } from '../game/game';
import { vec } from '../physics/physics';

function fakeContext() {
  const buffer = { duration: 1, getChannelData: () => new Float32Array(20000) };
  const param = () => ({ value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const ctx = {
    currentTime: 1, state: 'suspended', sampleRate: 22050, destination: node(),
    resume: vi.fn(async () => { ctx.state = 'running'; }),
    decodeAudioData: vi.fn(async () => buffer), createBuffer: vi.fn(() => buffer),
    createGain: vi.fn(() => ({ ...node(), gain: param() })), createStereoPanner: () => ({ ...node(), pan: param() }),
    createBiquadFilter: vi.fn(() => ({ ...node(), frequency: param(), Q: param(), gain: param() })),
    createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createAnalyser: () => ({ ...node(), fftSize: 0, getFloatTimeDomainData: vi.fn() }),
    createBufferSource: vi.fn(() => ({ ...node(), loop: false, playbackRate: param(), start: vi.fn(), stop: vi.fn(), onended: null })),
  };
  return ctx;
}

describe('audio lifecycle and bounded mixer', () => {
  it('creates no context on construction/update or while saved mute is enabled', async () => {
    const create = vi.fn(() => fakeContext() as unknown as AudioContext), audio = new AudioFX(create), game = new Game();
    game.start(); audio.update(game, true, true); expect(create).not.toHaveBeenCalled();
    audio.configure({ muted: true }); expect(await audio.unlock()).toBe(false); expect(create).not.toHaveBeenCalled();
    audio.configure({ muted: false }); await Promise.all([audio.unlock(), audio.unlock()]);
    expect(create).toHaveBeenCalledTimes(1); expect(audio.state().status).toBe('ready');
  });
  it('keeps startup silent until unlock, then fades idle ambience without advancing the campaign', async () => {
    const ctx = fakeContext(), create = vi.fn(() => ctx as unknown as AudioContext);
    const audio = new AudioFX(create), game = new Game(undefined, false);
    const minute = game.save.campaign.minute;
    audio.update(game, true, true); expect(create).not.toHaveBeenCalled();
    await audio.unlock(); audio.update(game, true, true);
    expect(audio.state().loops).toEqual(['engine']); expect(game.save.campaign.minute).toBe(minute);
    audio.update(game, true, false); expect(audio.state().loops).toEqual([]);
  });
  it('silences world loops for pause, fixed clock, background and mute', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); game.start(); audio.update(game, true, true); expect(audio.state().loops).toContain('engine');
    game.setMode('paused'); audio.update(game, true, true); expect(audio.state().loops).toEqual([]);
    game.returnToTitle(); audio.update(game, true, true); expect(audio.state().loops).toEqual([]);
    expect(audio.state().audible).toBe(false);
    game.setMode('playing'); audio.update(game, false, true); expect(audio.state().loops).toEqual([]);
    audio.update(game, true, false); expect(audio.state().loops).toEqual([]);
    audio.update(game, true, true); audio.configure({ muted: true }); expect(audio.state().loops).toEqual([]);
  });
  it('discards fixed-step cues instead of replaying them when Live resumes', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); game.start(); audio.update(game, false, true);
    game.sounds.emit('payment', game.time); game.sounds.emit('explosion', game.time);
    audio.update(game, false, true); audio.update(game, true, true);
    expect(audio.state().played).toEqual({});
  });
  it('keeps ongoing wreck fires audible and allows garage confirmations without engines', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); game.setMode('wasted'); game.vehicles[1].damage.status = 'burning'; game.vehicles[1].body.position = { ...game.player.body.position };
    audio.update(game, true, true); expect(audio.state().loops).toEqual([`car-fire:${game.vehicles[1].id}`]);
    game.setMode('garage'); game.sounds.emit('purchase', game.time); audio.update(game, true, true);
    expect(audio.state().loops).toEqual([]); expect(audio.state().played.purchase).toBe(1);
  });
  it('stops the cab engine after bailing out while keeping its fire audible', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); game.start(); audio.update(game, true, true); expect(audio.state().loops).toContain('engine');
    game.player.damage.status = 'burning'; expect(game.interact()).toBe(true); audio.update(game, true, true);
    expect(audio.state().loops).not.toContain('engine'); expect(audio.state().loops).toContain(`car-fire:${game.player.id}`);
  });
  it('stops engine, skid and boost loops as soon as a ride enters the ocean', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); game.start(); game.vehicles = [game.player]; game.settings.noPolice = true;
    game.controls.boost = true; audio.update(game, true, true); expect(audio.state().loops).toContain('engine');
    game.player.body.position = vec(50, -30); game.player.body.velocity = vec(0, -30); game.update(1 / 120);
    expect(game.player.sinking).toBeDefined(); audio.update(game, true, true); expect(audio.state().loops).toEqual([]);
  });
  it('adds engine load when accelerating or reversing, softens on braking and stops both layers on pause', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); game.start(); game.vehicles = [game.player];
    audio.update(game, true, true); expect(audio.state().loops).toEqual(['engine']);
    game.controls.throttle = -1; audio.update(game, true, true);
    expect(audio.state().loops).toEqual(['engine', 'engine-load']);
    const load = ctx.createGain.mock.results.at(-1)!.value.gain;
    const reversing = load.setTargetAtTime.mock.lastCall![0];
    game.player.body.angle = 0; game.player.body.velocity = vec(10, 0); audio.update(game, true, true);
    expect(load.setTargetAtTime.mock.lastCall![0]).toBeLessThan(reversing);
    game.controls.throttle = 1; audio.update(game, true, true);
    game.time += 0.2; audio.update(game, true, true); // let the 1→2 throttle cut finish
    expect(load.setTargetAtTime.mock.lastCall![0]).toBeGreaterThan(reversing);
    game.setMode('paused'); audio.update(game, true, true); expect(audio.state().loops).toEqual([]);
  });
  it('retunes engine and boost loops from the current car upgrades without restarting them', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); game.start(); game.vehicles = [game.player]; game.controls.throttle = 1; game.controls.boost = true;
    audio.update(game, true, true);
    const loops = ctx.createBufferSource.mock.results.map(r => r.value).filter(source => source.loop);
    const engine = loops[0].playbackRate, boost = loops[2].playbackRate;
    const engineRate = engine.setTargetAtTime.mock.lastCall![0], boostRate = boost.setTargetAtTime.mock.lastCall![0];
    const boostGain = ctx.createGain.mock.results.at(-1)!.value.gain, gain = boostGain.setTargetAtTime.mock.lastCall![0];
    game.player.upgrades.engine = 3; game.player.upgrades.boost = 3; audio.update(game, true, true);
    expect(engine.setTargetAtTime.mock.lastCall![0]).toBeLessThan(engineRate);
    expect(boost.setTargetAtTime.mock.lastCall![0]).toBeGreaterThan(boostRate);
    expect(boostGain.setTargetAtTime.mock.lastCall![0]).toBeGreaterThan(gain);
    expect(ctx.createBufferSource.mock.results.filter(r => r.value.loop)).toHaveLength(3);
    // Taking a stock ride must not inherit the old vehicle's sound tuning.
    game.player = game.vehicle('taxi', 4, 32, 0, '#fff'); game.vehicles = [game.player]; audio.update(game, true, true);
    expect(engine.setTargetAtTime.mock.lastCall![0]).toBe(engineRate);
    expect(boost.setTargetAtTime.mock.lastCall![0]).toBe(boostRate);
  });
  it('plays horns quietly through the world mix, suppresses them while paused and supports audition', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); game.start(); game.onFoot = true; game.vehicles = [game.player];
    game.sounds.emit('horn', game.time, { position: game.actor.position }); audio.update(game, true, true);
    expect(audio.state().played.horn).toBe(1);
    expect(ctx.createGain.mock.results.at(-1)!.value.gain.setTargetAtTime.mock.lastCall![0]).toBe(0.2);
    expect(ctx.createBiquadFilter.mock.results.at(-1)!.value.frequency.value).toBe(2400);
    game.setMode('paused'); game.time = 3; game.sounds.emit('horn', game.time); audio.update(game, true, true);
    expect(audio.state().played.horn).toBe(1); expect(audio.state().voices).toBe(0);
    expect(await audio.preview('horn')).toBe(true); expect(audio.state().played.horn).toBe(2);
    audio.configure({ muted: true }); expect(audio.state().voices).toBe(0);
  });
  it('makes busy nearby traffic louder while keeping at most six engines, including stopped cars', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); game.start(); game.onFoot = true; game.vehicles = [game.player];
    const position = game.actor.position;
    const addCar = (i: number) => game.vehicle('traffic', position.x + 5 + i, position.y, 0, '#fff');
    const cars = [0, 1, 2].map(addCar);
    audio.update(game, true, true); expect(audio.state().loops).toEqual(cars.map(car => `traffic:${car.id}`));
    const nearest = ctx.createGain.mock.results[4].value.gain, quiet = nearest.setTargetAtTime.mock.lastCall![0];
    cars.push(...[3, 4, 5, 6, 7, 8].map(addCar)); audio.update(game, true, true);
    expect(nearest.setTargetAtTime.mock.lastCall![0]).toBeGreaterThan(quiet);
    expect(audio.state().loops).toEqual(cars.slice(0, 6).map(car => `traffic:${car.id}`));
    game.driver.position = vec(position.x + 200, position.y); audio.update(game, true, true);
    expect(audio.state().loops).toEqual([]);
  });
  it('keeps parked, abandoned, destroyed, sinking and distant vehicles out of the traffic mix', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); audio.configure({ sirens: 0 }); game.start(); game.onFoot = true; game.vehicles = [game.player];
    const p = game.actor.position, addCar = () => game.vehicle('traffic', p.x + 8, p.y, 0, '#fff');
    addCar().parked = true; addCar().driverExited = true; addCar().damage.status = 'wreck'; addCar().alive = false;
    addCar().sinking = { elapsed: 0, entrySpeed: 1 }; const burning = addCar(); burning.damage.status = 'burning';
    const distant = addCar(); distant.body.position = vec(p.x + 200, p.y);
    const traffic = addCar(), cop = game.vehicle('police', p.x + 10, p.y, 0, '#fff');
    audio.update(game, true, true);
    expect(audio.state().loops.filter(key => key.startsWith('traffic:'))).toEqual([`traffic:${traffic.id}`, `traffic:${cop.id}`]);
    expect(audio.state().loops).toContain(`car-fire:${burning.id}`);
  });
  it('limits dense explosions to twenty one-shots and culls inaudible events', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); game.start();
    for (let i = 0; i < 64; i++) game.sounds.emit('explosion', game.time);
    audio.update(game, true, true); expect(audio.state().voices).toBeLessThanOrEqual(20);
    expect(audio.state().dropped).toBeGreaterThan(0);
    game.sounds.emit('crash', game.time, { position: vec(1000, 1000) }); audio.update(game, true, true);
    expect(audio.state().played.crash).toBeUndefined();
  });
  it('isolates auditions and cancels previews on Stop or scenario reset', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); game.start(); audio.update(game, true, true);
    expect(await audio.preview('engine')).toBe(true); audio.update(game, true, true);
    expect(audio.state().preview).toBe(true); expect(audio.state().loops).toEqual([]);
    audio.stopPreview(); expect(audio.state().voices).toBe(0);
    const pending = audio.preview('skid'); audio.stopPreview(); expect(await pending).toBe(false);
    await audio.preview('fire'); game.resetRun(); audio.update(game, true, true); expect(audio.state().preview).toBe(false);
  });
  it('degrades gracefully when audio is unsupported or sample decoding fails', async () => {
    const unsupported = new AudioFX(() => { throw new Error('unsupported'); }); expect(await unsupported.unlock()).toBe(false);
    expect(unsupported.state().status).toBe('unavailable');
    const ctx = fakeContext(); ctx.decodeAudioData.mockRejectedValue(new Error('bad codec'));
    const audio = new AudioFX(() => ctx as unknown as AudioContext); expect(await audio.unlock()).toBe(false);
    expect(audio.state().failures).toHaveLength(audio.state().total);
  });
  it('validates persisted settings and lets zero siren volume disable siren loops', async () => {
    expect(audioPreferences({ volume: Infinity, playerEngine: NaN, sirens: -3 })).toEqual({ muted: false, volume: 0.65, playerEngine: 0.7, ambient: 1, sirens: 0 });
    expect(audioPreferences({ playerEngine: -1 }).playerEngine).toBe(0);
    expect(audioPreferences({ playerEngine: 3 }).playerEngine).toBe(1);
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game();
    await audio.unlock(); game.start(); const cop = game.vehicle('police', 5, 32, 0, '#fff');
    audio.update(game, true, true); expect(audio.state().loops).toContain(`siren:${cop.id}`);
    audio.configure({ sirens: 0 }); audio.update(game, true, true); expect(audio.state().loops).not.toContain(`siren:${cop.id}`);
  });
  it('scales only the player engine, excludes it from traffic and keeps other FX when its level is zero', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game(undefined, false);
    await audio.unlock(); game.start(); game.vehicles = [game.player]; game.player.kind = 'traffic';
    game.player.body.velocity = vec(10, 0); game.player.body.angle = 0;
    const traffic = game.vehicle('traffic', game.player.body.position.x + 3, game.player.body.position.y, 0, '#fff');
    traffic.body.velocity = vec(4, 0); game.controls.boost = true;
    audio.update(game, true, true);
    expect(audio.state().loops).not.toContain(`traffic:${game.player.id}`);
    const source = ctx.createBufferSource.mock.results.map(result => result.value).find(value => value.loop)!;
    const filter = source.connect.mock.calls[0][0];
    const bass = filter.connect.mock.calls[0][0];
    const gain = bass.connect.mock.calls[0][0].gain;
    const full = gain.setTargetAtTime.mock.calls.at(-1)![0];
    audio.configure({ playerEngine: 0.35 }); audio.update(game, true, true);
    expect(gain.setTargetAtTime.mock.calls.at(-1)![0]).toBeCloseTo(full / 2);
    audio.configure({ playerEngine: 0 }); game.sounds.emit('crash', game.time); audio.update(game, true, true);
    expect(audio.state().loops).not.toContain('engine');
    expect(audio.state().loops).not.toContain('engine-load');
    expect(audio.state().loops).toContain(`traffic:${traffic.id}`); expect(audio.state().loops).toContain('boost');
    expect(audio.state().played.crash).toBe(1);
    audio.configure({ playerEngine: 1 }); audio.update(game, true, true);
    expect(audio.state().loops).toContain('engine');
  });
  it('plays the road-car idle at its native recorded pitch and raises it with RPM', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game(undefined, false);
    await audio.unlock(); game.start(); game.vehicles = [game.player];
    audio.update(game, true, true);
    const source = ctx.createBufferSource.mock.results[0].value;
    expect(source.playbackRate.value).toBe(1);
    expect(source.playbackRate.setTargetAtTime.mock.lastCall![0]).toBe(1);
    game.controls.throttle = 1; game.player.body.angle = 0; game.player.body.velocity = vec(6.4, 0);
    audio.update(game, true, true);
    const beforeShift = source.playbackRate.setTargetAtTime.mock.lastCall![0];
    expect(beforeShift).toBeGreaterThan(2); expect(beforeShift).toBeLessThan(2.8);
    game.time += 1 / 60; game.player.body.velocity = vec(6.6, 0); audio.update(game, true, true);
    expect(source.playbackRate.setTargetAtTime.mock.lastCall![0]).toBeLessThan(beforeShift * 0.85);
  });
  it('warms both player layers at source creation and keeps traffic EQ unchanged', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game(undefined, false);
    await audio.unlock(); game.start(); game.vehicles = [game.player]; game.controls.throttle = 1;
    game.vehicle('traffic', game.player.body.position.x + 4, game.player.body.position.y, 0, '#fff');
    audio.update(game, true, true);
    const sources = ctx.createBufferSource.mock.results.map(r => r.value);
    for (const source of sources.slice(0, 2)) {
      const filter = source.connect.mock.calls[0][0], bass = filter.connect.mock.calls[0][0];
      expect(filter.frequency.value).toBeLessThan(1900);
      expect(bass.type).toBe('lowshelf'); expect(bass.frequency.value).toBe(240); expect(bass.gain.value).toBe(5);
    }
    const trafficFilter = sources[2].connect.mock.calls[0][0];
    expect(trafficFilter.connect.mock.calls[0][0].type).not.toBe('lowshelf');
    expect(trafficFilter.frequency.setTargetAtTime.mock.lastCall![0]).toBe(1600);
    await audio.preview('engine');
    for (const source of ctx.createBufferSource.mock.results.slice(-2).map(r => r.value)) {
      expect(source.connect.mock.calls[0][0].connect.mock.calls[0][0].type).toBe('lowshelf');
    }
  });
  it('changes active ambient loops and shots together, including previews, independently of player and sirens', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game(undefined, false);
    await audio.unlock(); game.start(); game.vehicles = [game.player];
    const p = game.player.body.position;
    game.vehicle('traffic', p.x + 4, p.y, 0, '#fff');
    const cop = game.vehicle('police', p.x + 8, p.y, 0, '#fff');
    game.sounds.emit('horn', game.time, { position: p }); audio.update(game, true, true);
    const master = ctx.createGain.mock.results[0].value, world = ctx.createGain.mock.results[1].value;
    const ambient = ctx.createGain.mock.results[2].value, previewAmbient = ctx.createGain.mock.results[3].value;
    const destination = (source: ReturnType<typeof ctx.createBufferSource>) => {
      let node = source.connect.mock.calls[0][0];
      while (node.connect.mock.calls.length) {
        const next = node.connect.mock.calls[0][0];
        if ([master, world, ambient, previewAmbient].includes(next)) return next;
        node = next;
      }
    };
    const sources = ctx.createBufferSource.mock.results.map(r => r.value);
    expect(destination(sources[0])).toBe(ambient); // horn already playing
    expect(destination(sources[1])).toBe(world); // player engine
    expect(destination(sources[2])).toBe(ambient); // surrounding traffic
    expect(destination(sources.at(-1)!)).toBe(world); // siren
    audio.configure({ ambient: 0 });
    expect(ambient.gain.setTargetAtTime.mock.lastCall![0]).toBe(0);
    expect(previewAmbient.gain.setTargetAtTime.mock.lastCall![0]).toBe(0);
    audio.update(game, true, true);
    expect(audio.state().loops).toContain('engine'); expect(audio.state().loops).toContain(`siren:${cop.id}`);
    expect(world.gain.setTargetAtTime.mock.lastCall![0]).toBe(1);
    await audio.preview('horn');
    expect(destination(ctx.createBufferSource.mock.results.at(-1)!.value)).toBe(previewAmbient);
    audio.configure({ ambient: 0.4 });
    expect(previewAmbient.gain.setTargetAtTime.mock.lastCall![0]).toBe(0.4);
    expect(audio.preferences.playerEngine).toBe(0.7); expect(audio.preferences.sirens).toBe(0.25);
    expect(audioPreferences({ ambient: -2 }).ambient).toBe(0);
    expect(audioPreferences({ ambient: 2 }).ambient).toBe(1);
    expect(audioPreferences({ ambient: NaN }).ambient).toBe(1);
  });
  it('connects gear drops to the live playback rate and resets them when the run restarts', async () => {
    const ctx = fakeContext(), audio = new AudioFX(() => ctx as unknown as AudioContext), game = new Game(undefined, false);
    await audio.unlock(); game.start(); game.vehicles = [game.player]; game.player.body.angle = 0;
    game.player.body.velocity = vec(6.4, 0); game.controls.throttle = 1; audio.update(game, true, true);
    const source = ctx.createBufferSource.mock.results[0].value;
    const before = source.playbackRate.setTargetAtTime.mock.calls.at(-1)![0];
    const loadedSource = ctx.createBufferSource.mock.results[1].value;
    game.time += 1 / 60; game.player.body.velocity = vec(6.6, 0); audio.update(game, true, true);
    expect(audio.state().engine?.gear).toBe(2); expect(audio.state().engine?.shifting).toBe(true);
    expect(source.playbackRate.setTargetAtTime.mock.calls.at(-1)![0]).toBeLessThan(before * 0.85);
    expect(loadedSource.playbackRate.setTargetAtTime.mock.calls.at(-1)).toEqual(source.playbackRate.setTargetAtTime.mock.calls.at(-1));
    game.resetRun(); game.start(); audio.update(game, true, true);
    expect(audio.state().engine?.gear).toBe(1); expect(audio.state().engine?.shifting).toBe(false);
  });
});

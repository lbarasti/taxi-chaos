import type { Game } from '../game/game';
import { clamp, dist, dot, length, rotate, vec, type Vec } from '../physics/physics';
import { audioAssets, type AudioAsset } from './audio-assets';
import { drivingSound, soundLabels, soundPriority, spatialSound, trafficEngineGain, type SoundCue, type SoundEvent } from './sound';
import { readStorage, storageKeys } from '../game/storage';

export type AudioPreferences = { muted: boolean; volume: number; sirens: number };
export function audioPreferences(value: Partial<AudioPreferences> = {}): AudioPreferences {
  return { muted: value.muted === true, volume: typeof value.volume === 'number' && Number.isFinite(value.volume) ? clamp(value.volume, 0, 1) : 0.65,
    sirens: typeof value.sirens === 'number' && Number.isFinite(value.sirens) ? clamp(value.sirens, 0, 1) : 0.25 };
}
function loadPreferences() { try { return audioPreferences(JSON.parse(readStorage(storageKeys.audio) ?? '{}') ?? {}); } catch { return audioPreferences(); } }

type Voice = { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; filter: BiquadFilterNode; priority: number; level: number; preview: boolean };
type LoopTarget = { asset: AudioAsset; gain: number; rate?: number; pan?: number; cutoff?: number };
const LOOP_CUES = new Set<SoundCue>(['engine', 'skid', 'boost-loop', 'fire', 'siren']);
const MAX_SHOTS = 20;
const TRAFFIC_RANGE = 45, MAX_TRAFFIC_ENGINES = 6;

/** Browser-only consumer. No graph exists until a user gesture calls unlock(). */
export class AudioFX {
  preferences = loadPreferences();
  private context?: AudioContext;
  private master?: GainNode;
  private world?: GainNode;
  private analyser?: AnalyserNode;
  private samples = new Map<AudioAsset, AudioBuffer>();
  private loading?: Promise<void>;
  private loops = new Map<string, Voice>();
  private shots = new Set<Voice>();
  private previewUntil = 0;
  private previewRevision = 0;
  private epoch = -1;
  private boosting = false;
  private listener: Vec = vec();
  private variants = new Map<SoundCue, number>();
  private status: 'locked' | 'loading' | 'ready' | 'unavailable' = 'locked';
  private failures: string[] = [];
  private played: Partial<Record<SoundCue, number>> = {};
  private dropped = 0;
  private lastCue = '';
  private audible = false;
  private framePeak = 0;
  private meter = new Float32Array(256);

  constructor(private createContext: () => AudioContext = () => new AudioContext({ latencyHint: 'interactive' })) {}

  async unlock(): Promise<boolean> {
    if (this.preferences.muted || this.status === 'unavailable') return false;
    try {
      if (!this.context) {
        const ctx = this.context = this.createContext();
        this.master = ctx.createGain(); this.master.gain.value = 0;
        this.world = ctx.createGain(); this.world.gain.value = 0; this.world.connect(this.master);
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -12; compressor.knee.value = 12; compressor.ratio.value = 6;
        compressor.attack.value = 0.004; compressor.release.value = 0.16;
        this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 256;
        this.master.connect(compressor); compressor.connect(this.analyser); this.analyser.connect(ctx.destination);
        this.status = 'loading';
        this.loading = Promise.all(Object.entries(audioAssets).map(async ([name, url]) => {
          try {
            const binary = atob(url.slice(url.indexOf(',') + 1));
            const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
            this.samples.set(name as AudioAsset, await ctx.decodeAudioData(bytes.buffer));
          } catch { this.failures.push(name); }
        })).then(() => { this.status = this.samples.size ? 'ready' : 'unavailable'; });
      }
      // Called before awaiting decode, while the browser's activation is still live.
      if (this.context.state !== 'running') await this.context.resume();
      await this.loading;
      return this.status === 'ready' && this.context.state === 'running';
    } catch { this.status = 'unavailable'; return false; }
  }

  configure(patch: Partial<AudioPreferences>) {
    this.preferences = audioPreferences({ ...this.preferences, ...patch });
    try { localStorage.setItem(storageKeys.audio, JSON.stringify(this.preferences)); } catch {}
    if (this.preferences.muted || this.preferences.volume === 0) { this.stopAll(); this.audible = false; }
    if (this.context && this.master) this.smooth(this.master.gain, this.preferences.muted ? 0 : this.preferences.volume, 0.025);
  }
  state() {
    return { status: this.status, context: this.context?.state ?? 'not-created', ...this.preferences,
      decoded: this.samples.size, total: Object.keys(audioAssets).length, failures: [...this.failures],
      loops: [...this.loops.keys()], voices: this.shots.size, preview: this.previewUntil > (this.context?.currentTime ?? 0),
      audible: this.audible, peak: this.framePeak, played: { ...this.played }, dropped: this.dropped, lastCue: this.lastCue };
  }

  /** One isolated 2-second audition; respects mute, FX volume and siren volume. */
  async preview(cue: SoundCue): Promise<boolean> {
    this.stopAll();
    const revision = this.previewRevision;
    this.previewUntil = Infinity;
    if (!await this.unlock() || this.previewRevision !== revision || this.preferences.volume === 0) { if (this.previewRevision === revision) this.previewUntil = 0; return false; }
    const ctx = this.context!;
    this.previewUntil = ctx.currentTime + 2.2;
    this.smooth(this.master!.gain, this.preferences.volume, 0.02);
    this.smooth(this.world!.gain, 0, 0.02);
    if (LOOP_CUES.has(cue)) {
      const gain = cue === 'siren' ? 0.25 * this.preferences.sirens : 0.4;
      const engine = drivingSound(16, 0.8, 0, false);
      const layers: LoopTarget[] = cue === 'engine'
        ? [{ asset: 'engine', gain: engine.engineGain, rate: engine.engineRate, cutoff: engine.engineCutoff },
          { asset: 'engine-load', gain: engine.engineLoadGain, rate: engine.engineRate, cutoff: engine.engineCutoff }]
        : [{ asset: cue as AudioAsset, gain }];
      let played = false;
      for (const layer of layers) {
        const voice = this.voice(layer.asset, layer.gain, 0, layer.rate ?? 1, 3, true, true);
        if (voice) { voice.filter.frequency.value = layer.cutoff ?? 5000; voice.gain.gain.setTargetAtTime(0, ctx.currentTime + 1.9, 0.015); voice.source.stop(ctx.currentTime + 2); played = true; }
      }
      if (played) this.record(cue);
    } else this.play({ cue, time: 0, strength: 1, priority: soundPriority(cue) }, true);
    return true;
  }
  stopPreview() { this.previewRevision++; this.previewUntil = 0; for (const voice of [...this.shots]) if (voice.preview) this.stopVoice(voice); }

  /** Flush fixed-step history so lab stepping never replays a burst of old sounds. */
  silence(game: Game) { game.sounds.clear(); this.stopAll(); this.boosting = false; this.audible = false; if (this.world) this.smooth(this.world.gain, 0, 0.015); }

  update(game: Game, live: boolean, visible: boolean) {
    const events = game.sounds.drain(game.time);
    this.listener = game.actor.position;
    if (this.epoch !== game.sounds.epoch) { this.stopAll(); this.boosting = false; this.epoch = game.sounds.epoch; }
    const ctx = this.context;
    if (!ctx || this.status !== 'ready' || ctx.state !== 'running') return;
    const enabled = visible && !this.preferences.muted && this.preferences.volume > 0;
    this.smooth(this.master!.gain, enabled ? this.preferences.volume : 0, 0.02);
    if (!enabled) { this.stopAll(); this.audible = false; this.framePeak = 0; return; }
    if (this.previewUntil > ctx.currentTime) { game.sounds.clear(); this.audible = true; this.measure(); return; }
    if (this.previewUntil) this.stopPreview();
    const ambient = live && game.mode === 'intro';
    const running = live && (game.mode === 'playing' || game.mode === 'wasted');
    this.smooth(this.world!.gain, running ? 1 : ambient ? 0.35 : 0, ambient ? 0.6 : 0.25);
    this.audible = running || ambient;
    const desired = new Map<string, LoopTarget>();
    if (ambient) desired.set('engine', { asset: 'engine', gain: 0.2, rate: 0.85, cutoff: 950 });
    if (running) {
      for (const event of events.sort((a, b) => b.priority - a.priority)) if (event.cue !== 'pulp' || game.settings.gore) this.play(event);
      const player = game.player, driving = game.mode === 'playing' && !game.onFoot && !player.sinking && player.damage.status !== 'wreck';
      const boost = driving && game.controls.boost === true;
      if (driving) {
        const slip = player.dynamics.skidding ? Math.max(...player.dynamics.tyres.filter(t => t.skidding).map(t => Math.abs(dot(player.body.velocityAt(player.body.toWorld(t.position)), rotate(vec(0, 1), player.body.angle + t.angle))))) : 0;
        const forwardSpeed = dot(player.body.velocity, rotate(vec(1, 0), player.body.angle));
        const throttle = game.controls.throttle < 0 && forwardSpeed > 0.5 ? 0 : Math.abs(game.controls.throttle);
        const signal = drivingSound(game.speed, throttle, slip, boost, player.upgrades);
        const pitch = player.definition.graphics.enginePitch;
        const level = pitch > 1 ? 0.85 : 1;
        desired.set('engine', { asset: 'engine', gain: signal.engineGain * level, rate: signal.engineRate * pitch, cutoff: signal.engineCutoff });
        desired.set('engine-load', { asset: 'engine-load', gain: signal.engineLoadGain * level, rate: signal.engineRate * pitch, cutoff: signal.engineCutoff });
        desired.set('skid', { asset: 'skid', gain: signal.skidGain, rate: 0.92 + clamp(game.speed / 120, 0, 0.3), cutoff: 3500 });
        if (boost) desired.set('boost', { asset: 'boost-loop', gain: signal.boostGain, rate: signal.boostRate, cutoff: signal.boostCutoff });
      }
      if (boost !== this.boosting) this.play({ cue: boost ? 'boost-start' : 'boost-end', time: game.time, strength: 1, priority: 2 });
      this.boosting = boost;
      // Include occupied cars waiting in traffic, but keep the voice count fixed.
      if (game.mode === 'playing') {
        const traffic = game.vehicles.filter(v => v !== player && v.alive && !v.parked && !v.driverExited && !v.sinking && v.damage.status !== 'burning' && v.damage.status !== 'wreck' && dist(v.body.position, this.listener) < TRAFFIC_RANGE)
          .sort((a, b) => dist(a.body.position, this.listener) - dist(b.body.position, this.listener));
        const gain = trafficEngineGain(traffic.length);
        for (const car of traffic.slice(0, MAX_TRAFFIC_ENGINES)) {
          const spatial = spatialSound(this.listener, car.body.position, TRAFFIC_RANGE);
          desired.set(`traffic:${car.id}`, { asset: 'engine', gain: spatial.gain * gain, pan: spatial.pan, rate: clamp(0.8 + length(car.body.velocity) / 40, 0.8, 1.8) * car.definition.graphics.enginePitch, cutoff: 1600 });
        }
      }
      const fires = [...game.vehicles.filter(v => v.alive && v.damage.status === 'burning').map(v => ({ key: `car-fire:${v.id}`, position: v.body.position })),
        ...game.world.props.filter(p => p.fire > 0 && !p.fuelSpent).map(p => ({ key: `prop-fire:${p.id}`, position: p.body.position }))];
      for (const fire of fires.sort((a, b) => dist(a.position, this.listener) - dist(b.position, this.listener)).slice(0, 3)) {
        const spatial = spatialSound(this.listener, fire.position, 55);
        desired.set(fire.key, { asset: 'fire', gain: spatial.gain * 0.32, pan: spatial.pan, cutoff: 4000 });
      }
      if (game.mode === 'playing' && this.preferences.sirens > 0) for (const cop of game.police.filter(v => v.damage.status !== 'burning')
        .sort((a, b) => dist(a.body.position, this.listener) - dist(b.body.position, this.listener)).slice(0, 2)) {
        const spatial = spatialSound(this.listener, cop.body.position, 90);
        desired.set(`siren:${cop.id}`, { asset: 'siren', gain: spatial.gain * 0.22 * this.preferences.sirens, pan: spatial.pan, cutoff: 2300 });
      }
    } else {
      this.boosting = false;
      // Purchases/repairs are audible in the garage, without running world loops.
      for (const event of events) if (live && !event.position && event.priority === 4) this.play(event);
      for (const voice of [...this.shots]) if (!voice.preview && (!live || voice.priority !== 4)) this.stopVoice(voice);
    }
    for (const [key, voice] of this.loops) if (!desired.has(key) || desired.get(key)!.gain < 0.004) { this.stopVoice(voice); this.loops.delete(key); }
    for (const [key, target] of desired) {
      if (target.gain < 0.004) continue;
      let voice = this.loops.get(key);
      if (!voice) { voice = this.voice(target.asset, 0, target.pan ?? 0, target.rate ?? 1, 1, false, true); if (voice) this.loops.set(key, voice); }
      if (!voice) continue;
      this.smooth(voice.gain.gain, target.gain, key === 'skid' || key === 'boost' ? 0.035 : 0.09);
      this.smooth(voice.source.playbackRate, target.rate ?? 1, 0.09);
      this.smooth(voice.pan.pan, target.pan ?? 0, 0.05);
      this.smooth(voice.filter.frequency, target.cutoff ?? 5000, 0.08);
    }
    this.measure();
  }

  private smooth(param: AudioParam, value: number, time: number) { param.setTargetAtTime(value, this.context!.currentTime, time); }
  private measure() { this.analyser!.getFloatTimeDomainData(this.meter); this.framePeak = this.meter.reduce((peak, v) => Math.max(peak, Math.abs(v)), 0); }
  private record(cue: SoundCue) { this.played[cue] = (this.played[cue] ?? 0) + 1; this.lastCue = soundLabels[cue]; }
  private choose(cue: SoundCue): AudioAsset {
    if (['bump', 'crunch', 'crash', 'wood', 'metal', 'glass', 'body', 'explosion'].includes(cue)) {
      // Alternate variants; jitter uses Math.random(), never the world's seeded RNG.
      const variant = ((this.variants.get(cue) ?? -1) + 1) % 2; this.variants.set(cue, variant);
      return `${cue}-${variant}` as AudioAsset;
    }
    return cue === 'collapse' ? 'crash-0' : cue as AudioAsset;
  }
  private play(event: SoundEvent, preview = false) {
    const { cue, priority, strength } = event;
    const spatial = preview ? { gain: 1, pan: 0 } : spatialSound(this.listener, event.position, cue === 'horn' ? 40 : cue === 'explosion' || cue === 'collapse' ? 115 : 70);
    if (spatial.gain < 0.005 || strength === 0) { this.dropped++; return; }
    if (!event.position && priority === 4) { this.tone(cue, preview); this.record(cue); return; }
    const level = spatial.gain * strength * (cue === 'horn' ? 0.2 : cue === 'explosion' ? 0.9 : cue === 'pulp' ? 0.32 : cue === 'boost-start' || cue === 'boost-end' ? 0.3 : 0.65);
    if (this.shots.size >= MAX_SHOTS) {
      const quietest = [...this.shots].sort((a, b) => a.priority - b.priority || a.level - b.level)[0];
      if (quietest.priority > priority || (quietest.priority === priority && quietest.level >= level)) { this.dropped++; return; }
      this.stopVoice(quietest);
    }
    const jitter = 0.94 + Math.random() * 0.12;
    const voice = this.voice(this.choose(cue), level, spatial.pan, cue === 'collapse' ? 0.7 : jitter, priority, preview);
    if (voice && cue === 'horn') voice.filter.frequency.value = 2400;
    if (voice) this.record(cue);
    if ((cue === 'explosion' || cue === 'collapse') && this.shots.size < MAX_SHOTS) this.voice('rumble', level * 0.7, spatial.pan, cue === 'collapse' ? 0.72 : 0.9, priority, preview);
  }
  private voice(asset: AudioAsset, level: number, pan: number, rate: number, priority: number, preview: boolean, loop = false, buffer?: AudioBuffer): Voice | undefined {
    const ctx = this.context!, sample = buffer ?? this.samples.get(asset); if (!sample) return;
    const source = ctx.createBufferSource(); source.buffer = sample; source.loop = loop; source.playbackRate.value = rate;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const panner = ctx.createStereoPanner(); panner.pan.value = pan;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 6000; filter.Q.value = 0.5;
    source.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(preview || priority === 4 ? this.master! : this.world!);
    const voice: Voice = { source, gain, pan: panner, filter, priority, level, preview };
    if (!loop || preview) this.shots.add(voice);
    source.onended = () => { source.disconnect(); gain.disconnect(); panner.disconnect(); filter.disconnect(); this.shots.delete(voice); };
    source.start(0, loop && !preview ? Math.random() * sample.duration : 0);
    this.smooth(gain.gain, level, 0.008);
    return voice;
  }
  private stopVoice(voice: Voice) {
    const ctx = this.context!;
    voice.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.smooth(voice.gain.gain, 0, 0.008);
    try { voice.source.stop(ctx.currentTime + 0.04); } catch {}
    this.shots.delete(voice);
  }
  private stopAll() {
    this.stopPreview();
    if (!this.context) return;
    for (const voice of this.loops.values()) this.stopVoice(voice);
    this.loops.clear();
    for (const voice of [...this.shots]) this.stopVoice(voice);
  }
  private tone(cue: SoundCue, preview: boolean) {
    const ctx = this.context!;
    const notes = cue === 'arrest' ? [220, 165] : cue === 'pickup' ? [440, 660] : cue === 'repair' ? [330, 440, 550] : [523, 659, 784];
    // Render a short cue into an AudioBuffer: it shares the same bounded voice pool.
    const duration = notes.length * 0.07 + 0.15, buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate), data = buffer.getChannelData(0);
    for (let note = 0; note < notes.length; note++) for (let i = 0; i < ctx.sampleRate * 0.16; i++) {
      const t = i / ctx.sampleRate, index = Math.round(note * 0.07 * ctx.sampleRate) + i;
      if (index < data.length) data[index] += Math.sin(2 * Math.PI * notes[note] * t) * Math.min(1, t / 0.006) * Math.exp(-t * 25) * 0.32;
    }
    if (this.shots.size >= MAX_SHOTS) this.stopVoice([...this.shots].sort((a, b) => a.priority - b.priority)[0]);
    this.voice('bump-0', 0.5, 0, 1, 4, preview, false, buffer);
  }
}

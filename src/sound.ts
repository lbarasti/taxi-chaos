// DOM-free audio messages. Gameplay never depends on an AudioContext or audio RNG.
import { clamp, dist, type Vec } from './physics';

export const soundLabels = {
  engine: 'Taxi engine', skid: 'Tyre skid', 'boost-start': 'Boost onset', 'boost-loop': 'Boost rush', 'boost-end': 'Boost release',
  bump: 'Light bump', crunch: 'Metal crunch', crash: 'Heavy crash', wood: 'Wood smash', metal: 'Metal clutter', glass: 'Glass break',
  collapse: 'Structure collapse', explosion: 'Explosion', fire: 'Burning fire', siren: 'Police siren', body: 'Body impact', pulp: 'Pulp layer',
  pickup: 'Passenger pickup', payment: 'Fare payment', purchase: 'Upgrade purchase', repair: 'Garage repair', escape: 'Police escaped', arrest: 'Arrest',
} as const;
export type SoundCue = keyof typeof soundLabels;
export type SoundEvent = { cue: SoundCue; time: number; position?: Vec; strength: number; priority: number };
export const isSoundCue = (value: string): value is SoundCue => Object.hasOwn(soundLabels, value);
export function soundPriority(cue: SoundCue) { return cue === 'explosion' || cue === 'collapse' ? 5 : ['pickup', 'payment', 'purchase', 'repair', 'escape', 'arrest'].includes(cue) ? 4 : cue === 'crash' ? 3 : 2; }

export class SoundEvents {
  private queue: SoundEvent[] = [];
  private cooldowns = new Map<string, number>();
  epoch = 0;
  emit(cue: SoundCue, time: number, options: { position?: Vec; strength?: number; key?: string; cooldown?: number } = {}) {
    if (options.key) {
      if ((this.cooldowns.get(options.key) ?? -Infinity) > time) return;
      this.cooldowns.delete(options.key);
      this.cooldowns.set(options.key, time + (options.cooldown ?? 0.18));
      if (this.cooldowns.size > 256) this.cooldowns.delete(this.cooldowns.keys().next().value!);
    }
    const event: SoundEvent = { cue, time, position: options.position && { ...options.position }, strength: clamp(options.strength ?? 1, 0, 2), priority: soundPriority(cue) };
    if (this.queue.length >= 64) {
      const lowest = this.queue.reduce((index, e, i, all) => e.priority < all[index].priority ? i : index, 0);
      if (this.queue[lowest].priority > event.priority) return;
      this.queue.splice(lowest, 1);
    }
    this.queue.push(event);
  }
  drain(time: number) { const events = this.queue.filter(e => time - e.time <= 0.35); this.queue = []; return events; }
  clear() { this.queue = []; }
  reset() { this.clear(); this.cooldowns.clear(); this.epoch++; }
}

/** Pan follows screen/world X, not cab heading (the top-down camera never rotates). */
export function spatialSound(listener: Vec, source?: Vec, range = 75) {
  if (!source) return { gain: 1, pan: 0 };
  const distance = dist(listener, source);
  return { gain: (1 - clamp(distance / range, 0, 1)) ** 2, pan: clamp((source.x - listener.x) / 35, -0.8, 0.8) };
}
export function drivingSound(speed: number, throttle: number, slip: number, boosting: boolean) {
  const load = Math.max(0, throttle);
  return {
    engineRate: clamp(0.72 + speed / 29 + load * 0.24 + (boosting ? 0.12 : 0), 0.72, 2.45),
    engineGain: 0.15 + clamp(speed / 36, 0, 1) * 0.12 + load * 0.12,
    skidGain: clamp((slip - 1.1) / 9, 0, 0.5) * clamp((speed - 3) / 7, 0, 1),
  };
}

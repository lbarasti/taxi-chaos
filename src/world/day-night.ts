// Deterministic accelerated 24-hour clock and continuously interpolated lighting model.
// DOM-free: Game owns an instance, steps it with the world clock and snapshots it for the
// renderer/HUD. Time is tracked in in-game minutes so fixed stepping is reproducible.

export type DayPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

export type DayNightOptions = { hour?: number; rate?: number; frozen?: boolean };

export type LightingState = {
  tint: [number, number, number];
  tintStrength: number;
  darkness: number;
  artificialLight: number;
  sunDirection: { x: number; y: number };
  shadowLength: number;
  shadowOpacity: number;
};

export type DayNightSnapshot = {
  hour: number;
  minutes: number;
  day: number;
  time: string;
  period: DayPeriod;
  rate: number;
  frozen: boolean;
};

export const DAY_MINUTES = 1440;
export const START_HOUR = 7;
/** In-game minutes per simulated second. 0 pauses the clock; the cap keeps a full day bounded. */
export const MIN_RATE = 0;
export const MAX_RATE = 240;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const wrapHour = (hour: number) => ((hour % 24) + 24) % 24;
const wrapUnit = (value: number) => clamp(value, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Keyframe = LightingState & { hour: number };

// Keyframes are anchored to the 24-hour clock. The first is 00:00 and the table wraps from the
// last entry back to the first, so midnight (and every transition) interpolates continuously.
const K = (hour: number, tint: [number, number, number], tintStrength: number, darkness: number, artificialLight: number, sunX: number, sunY: number, shadowLength: number, shadowOpacity: number): Keyframe => ({
  hour, tint, tintStrength, darkness, artificialLight, sunDirection: { x: sunX, y: sunY }, shadowLength, shadowOpacity,
});

// Night keyframes are tuned toward photographed blue-hour/neon cities rather than pitch black:
// a readable cool-blue ambient film keeps roads and facades legible while warm/neon local
// sources (see collectLights/ambientPass) do the dramatic lighting. `darkness` therefore tops
// out near 0.56 instead of ~0.68, and the tint is a touch more saturated blue.
const KEYFRAMES: readonly Keyframe[] = [
  K(0, [22, 34, 88], 0.52, 0.56, 1, -0.55, -0.83, 1.1, 0.12),
  K(4.5, [30, 44, 96], 0.5, 0.52, 1, -0.75, -0.66, 1.4, 0.14),
  K(5, [70, 58, 100], 0.44, 0.44, 0.9, -0.95, -0.3, 1.9, 0.2),
  K(5.5, [110, 66, 74], 0.4, 0.32, 0.65, -1, -0.1, 2.3, 0.3),
  K(6, [190, 120, 90], 0.3, 0.22, 0.4, -0.95, -0.05, 2.5, 0.4),
  K(7, [255, 205, 150], 0.18, 0.1, 0.12, -0.75, -0.2, 2, 0.5),
  K(9, [255, 240, 215], 0.06, 0.02, 0, -0.4, -0.5, 1.1, 0.55),
  K(12, [255, 250, 240], 0, 0, 0, 0, -1, 0.35, 0.6),
  K(15, [255, 238, 210], 0.05, 0.02, 0, 0.45, -0.55, 1, 0.55),
  K(17, [255, 205, 150], 0.16, 0.08, 0.06, 0.75, -0.3, 1.9, 0.5),
  K(18, [245, 150, 95], 0.3, 0.2, 0.3, 0.95, -0.1, 2.4, 0.55),
  K(19.5, [140, 90, 110], 0.44, 0.38, 0.7, 0.9, 0.2, 2, 0.3),
  K(21, [46, 58, 110], 0.5, 0.5, 1, 0.55, -0.83, 1.3, 0.14),
  K(22.5, [30, 44, 98], 0.51, 0.55, 1, 0.2, -0.98, 1.1, 0.12),
];

function lerpLighting(a: Keyframe, b: Keyframe, t: number): LightingState {
  const dx = lerp(a.sunDirection.x, b.sunDirection.x, t);
  const dy = lerp(a.sunDirection.y, b.sunDirection.y, t);
  const magnitude = Math.hypot(dx, dy);
  return {
    tint: [
      clamp(lerp(a.tint[0], b.tint[0], t), 0, 255),
      clamp(lerp(a.tint[1], b.tint[1], t), 0, 255),
      clamp(lerp(a.tint[2], b.tint[2], t), 0, 255),
    ],
    tintStrength: wrapUnit(lerp(a.tintStrength, b.tintStrength, t)),
    darkness: wrapUnit(lerp(a.darkness, b.darkness, t)),
    artificialLight: wrapUnit(lerp(a.artificialLight, b.artificialLight, t)),
    sunDirection: magnitude > 1e-6 ? { x: dx / magnitude, y: dy / magnitude } : { x: 0, y: -1 },
    shadowLength: Math.max(0, lerp(a.shadowLength, b.shadowLength, t)),
    shadowOpacity: wrapUnit(lerp(a.shadowOpacity, b.shadowOpacity, t)),
  };
}

function lightForHour(hour: number): LightingState {
  const wrapped = wrapHour(hour);
  let index = 0;
  while (index + 1 < KEYFRAMES.length && KEYFRAMES[index + 1].hour <= wrapped) index++;
  const from = KEYFRAMES[index];
  const to = KEYFRAMES[(index + 1) % KEYFRAMES.length];
  const span = index + 1 < KEYFRAMES.length ? to.hour - from.hour : DAY_MINUTES / 60 - from.hour + to.hour;
  const t = span > 0 ? (wrapped - from.hour) / span : 0;
  return lerpLighting(from, to, clamp(t, 0, 1));
}

export function periodForHour(hour: number): DayPeriod {
  const wrapped = wrapHour(hour);
  if (wrapped >= 5 && wrapped < 12) return 'morning';
  if (wrapped >= 12 && wrapped < 17) return 'afternoon';
  if (wrapped >= 17 && wrapped < 21) return 'evening';
  return 'night';
}

export function formatClock(minutes: number): string {
  // Truncate to the displayed minute, with a tiny epsilon so accumulated fixed-step
  // floating error at an exact boundary (e.g. 07:59.9999999) still reads 08:00.
  const whole = Math.max(0, Math.floor(minutes + 1e-6)) % DAY_MINUTES;
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export class DayNight {
  private clock = START_HOUR * 60;
  private elapsedDays = 0;
  private configuredRate = 1;
  private isFrozen = false;
  private visualOverride = false;

  /** Normal lighting follows the campaign; Lab presets are visual overrides only. */
  synchronize(minute: number): void {
    if (this.visualOverride || !Number.isFinite(minute)) return;
    this.clock = minute % DAY_MINUTES; this.elapsedDays = Math.floor(minute / DAY_MINUTES);
  }
  followCampaign(minute: number): void { this.visualOverride = false; this.configuredRate = 1; this.isFrozen = false; this.synchronize(minute); }
  get previewing() { return this.visualOverride; }

  /** Advance the world clock by `dt` simulated seconds. Non-finite/non-positive steps and a frozen clock are no-ops. */
  update(dt: number): void {
    if (this.isFrozen || !Number.isFinite(dt) || dt <= 0 || this.configuredRate === 0) return;
    this.advance(dt * this.configuredRate);
  }

  /** Restore a fresh run's clock (07:00, day 1) without touching rate/freeze configuration. */
  reset(): void {
    this.clock = START_HOUR * 60;
    this.elapsedDays = 0;
  }

  /** Validate and apply user/lab options. Invalid values are ignored; numeric values are bounded. */
  configure(options: DayNightOptions): void {
    if (options.hour !== undefined || options.rate !== undefined || options.frozen !== undefined) this.visualOverride = true;
    if (typeof options.hour === 'number' && Number.isFinite(options.hour)) this.clock = wrapHour(options.hour) * 60;
    if (typeof options.rate === 'number' && !Number.isNaN(options.rate)) this.configuredRate = clamp(options.rate, MIN_RATE, MAX_RATE);
    if (typeof options.frozen === 'boolean') this.isFrozen = options.frozen;
  }

  snapshot(): DayNightSnapshot {
    return {
      hour: this.clock / 60,
      minutes: this.clock,
      day: this.elapsedDays + 1,
      time: formatClock(this.clock),
      period: periodForHour(this.clock / 60),
      rate: this.configuredRate,
      frozen: this.isFrozen,
    };
  }

  get lighting(): LightingState {
    return lightForHour(this.clock / 60);
  }

  private advance(minutes: number): void {
    const total = this.clock + minutes;
    const days = Math.floor(total / DAY_MINUTES);
    if (days > 0) { this.elapsedDays += days; this.clock = total - days * DAY_MINUTES; }
    else this.clock = total;
  }
}

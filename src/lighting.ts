// Reduced-resolution ambient + local-light compositing for Fare City's Canvas 2D renderer.
//
// The world is drawn normally, then a half-resolution "darkness/tint mask" is composited over it
// and a matching "glow" pass is added on top:
//   1. an ambient lift brightens the night-oriented palette during the day (screen blend);
//   2. the mask tints + darkens the whole viewport, and intact local sources punch holes through
//      that darkness with destination-out so lit surfaces actually read as illuminated;
//   3. cached radial/cone gradient sprites add a restrained coloured glow on top.
//
// Only pure helpers and `collectLights` touch game data; the offscreen canvases and gradient cache
// live in `LightingLayer`, which keeps the renderer's hot path allocation-free. Per-light occlusion
// is intentionally out of scope for this first version.

export type RGB = [number, number, number];

/**
 * Structural mirror of the shared `LightingState` exported by `day-night.ts`. Kept local so this
 * module and its tests stay independent of DOM/game modules; the renderer passes the real state,
 * which is structurally identical.
 */
export type AmbientLighting = {
  tint: RGB;
  tintStrength: number;
  darkness: number;
  artificialLight: number;
  sunDirection: { x: number; y: number };
  shadowLength: number;
  shadowOpacity: number;
};

export type LightProfile = 'radial' | 'cone';

export type LightSource = {
  /** World position. */
  x: number;
  y: number;
  /** World-space radius of the pool/beam. */
  radius: number;
  color: RGB;
  /** 0–1, already folded with `artificialLight` and any deterministic flicker. */
  intensity: number;
  /** Artificial sources fades with dusk/dawn; fires, police and nitro do not. */
  artificial?: boolean;
  profile?: LightProfile;
  /** World radians; cones project along this direction. */
  angle?: number;
  /** Cone half-angle in radians. */
  spread?: number;
  /** Radial core fraction (0 = soft centre, 0.4 = flatter pool). */
  inner?: number;
};

export type Viewport = { minX: number; minY: number; maxX: number; maxY: number };

export const LIGHT_GLOW = 0.5;
const MAX_SPRITES = 120;
const RADIUS_STEP = 8;

export const clamp01 = (value: number): number => {
  const v = Number.isFinite(value) ? value : 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
};

export const roundChannel = (value: number): number => {
  const v = Number.isFinite(value) ? value : 0;
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
};

export const scaleRgb = (color: RGB, factor: number): RGB => [
  roundChannel(color[0] * factor),
  roundChannel(color[1] * factor),
  roundChannel(color[2] * factor),
];

export const mixRgb = (a: RGB, b: RGB, t: number): RGB => {
  const k = clamp01(t);
  return [
    roundChannel(a[0] + (b[0] - a[0]) * k),
    roundChannel(a[1] + (b[1] - a[1]) * k),
    roundChannel(a[2] + (b[2] - a[2]) * k),
  ];
};

export const rgba = (color: RGB, alpha: number): string =>
  `rgba(${roundChannel(color[0])},${roundChannel(color[1])},${roundChannel(color[2])},${clamp01(alpha)})`;

export type AmbientParams = {
  daylight: number;
  lift: number;
  liftColor: RGB;
  maskTint: number;
  maskDark: number;
  darkColor: RGB;
  tint: RGB;
  glow: number;
};

/**
 * Turn the shared lighting state into concrete pass amounts. A nonexistent/zero-daylight state
 * yields no ambient lift; darkness and tint stay bounded so the overlay never fully blackens.
 */
export function ambientPass(state: AmbientLighting): AmbientParams {
  const darkness = clamp01(state.darkness);
  const tintStrength = clamp01(state.tintStrength);
  const daylight = clamp01(1 - darkness);
  return {
    daylight,
    lift: Math.pow(daylight, 1.35) * 0.22,
    liftColor: mixRgb(state.tint, [255, 248, 235], 0.4),
    maskTint: clamp01(tintStrength) * 0.8,
    maskDark: clamp01(darkness) * 0.94,
    darkColor: mixRgb(scaleRgb(state.tint, 0.18), [4, 8, 18], 0.65),
    tint: state.tint,
    glow: LIGHT_GLOW,
  };
}

export const bucketRadius = (radius: number): number =>
  Math.max(8, Math.round((Number.isFinite(radius) ? radius : 8) / RADIUS_STEP) * RADIUS_STEP);

/** Cache key: colour/radius are coarsened so small zoom fluctuations reuse the same sprite. */
export function spriteKey(color: RGB, radius: number, profile: LightProfile, spread: number): string {
  const c = `${Math.round(roundChannel(color[0]) / 16) * 16},${Math.round(roundChannel(color[1]) / 16) * 16},${Math.round(roundChannel(color[2]) / 16) * 16}`;
  const r = bucketRadius(radius);
  const s = profile === 'cone' ? Math.round(clamp01(spread / 1.2) * 8) : 0;
  return `${profile}:${c}:${r}:${s}`;
}

const inView = (x: number, y: number, radius: number, view: Viewport): boolean =>
  x + radius >= view.minX && x - radius <= view.maxX && y + radius >= view.minY && y - radius <= view.maxY;

/** Drop dim, off-screen or malformed sources before they reach the sprite cache. */
export function cullLights(lights: LightSource[], view: Viewport): LightSource[] {
  return lights.filter(light =>
    Number.isFinite(light.x) && Number.isFinite(light.y) && Number.isFinite(light.radius) &&
    light.radius > 0.2 && light.intensity > 0.015 && inView(light.x, light.y, light.radius, view));
}

// ---- Scene-facing light collection -------------------------------------------------------------

export type SceneVehicle = {
  id: number;
  kind: 'taxi' | 'police' | 'traffic';
  alive: boolean;
  parked: boolean;
  driverExited: boolean;
  color: string;
  damage: { status: string; fireTime: number };
  ai?: { phase?: string };
  body: {
    position: { x: number; y: number };
    angle: number;
    velocity: { x: number; y: number };
    toWorld(point: { x: number; y: number }): { x: number; y: number };
  };
};

export type SceneProp = {
  id: number;
  kind: string;
  alive: boolean;
  fire: number;
  body: { position: { x: number; y: number }; angle: number; w: number; h: number };
};

export type SceneBlast = { position: { x: number; y: number }; maxRadius: number; life: number; ttl: number };

export type LightScene = {
  time: number;
  /** 0 at noon, 1 deep night; artificial sources scale with this. */
  artificial: number;
  playerId: number;
  playerOnFoot: boolean;
  playerBoosting: boolean;
  arrest: number;
  vehicles: SceneVehicle[];
  props: SceneProp[];
  blasts: SceneBlast[];
};

const LAMP: RGB = [255, 214, 150];
const WINDOW: RGB = [255, 198, 128];
const HEADLIGHT: RGB = [255, 240, 196];
const FIRE: RGB = [255, 138, 52];
const EXPLOSION: RGB = [255, 186, 96];
const POLICE_RED: RGB = [255, 74, 74];
const POLICE_BLUE: RGB = [86, 150, 255];
const NITRO: RGB = [96, 214, 241];

function localToWorld(position: { x: number; y: number }, angle: number, lx: number, ly: number): { x: number; y: number } {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return { x: position.x + lx * cos - ly * sin, y: position.y + lx * sin + ly * cos };
}

/**
 * Deterministically derive every local light from world state. Destroyed props are skipped so a
 * smashed lamp or structure stops emitting; parked/unoccupied/wrecked cars get no headlights.
 */
export function collectLights(scene: LightScene): LightSource[] {
  const out: LightSource[] = [];
  const artificial = clamp01(scene.artificial);
  const time = Number.isFinite(scene.time) ? scene.time : 0;

  for (const prop of scene.props) {
    const pos = prop.body.position;
    if (prop.alive) {
      if (prop.kind === 'lamp') {
        const intensity = artificial * 0.95;
        if (intensity > 0.02) out.push({ x: pos.x, y: pos.y, radius: 5.5, color: LAMP, intensity, artificial: true, inner: 0.16 });
      } else if (prop.kind === 'building' && prop.body.w <= 12) {
        // Storefront/awning wash with a narrow lit window band.
        const intensity = artificial * 0.7;
        if (intensity > 0.02) {
          const front = localToWorld(pos, prop.body.angle, 0, 4.2);
          out.push({ x: front.x, y: front.y, radius: 5, color: WINDOW, intensity, artificial: true, inner: 0.22 });
        }
      } else if (prop.kind === 'kiosk') {
        const intensity = artificial * 0.32;
        if (intensity > 0.02) out.push({ x: pos.x, y: pos.y, radius: 2.4, color: WINDOW, intensity, artificial: true, inner: 0.25 });
      }
    }
    if (prop.fire > 0) {
      const flicker = 0.72 + 0.28 * Math.sin(time * 11 + prop.id * 1.7);
      const size = prop.kind === 'station' ? 3 : 1.6;
      out.push({ x: pos.x, y: pos.y, radius: 6 + size * 1.5, color: FIRE, intensity: clamp01((0.5 + prop.fire / 6) * flicker) });
    }
  }

  for (const vehicle of scene.vehicles) {
    if (!vehicle.alive) continue;
    const wreck = vehicle.damage.status === 'wreck';
    const active = !vehicle.parked && !vehicle.driverExited && !wreck;
    const pos = vehicle.body.position;
    if (active) {
      const intensity = artificial * (vehicle.kind === 'police' ? 0.85 : 0.75);
      if (intensity > 0.02) {
        const nose = vehicle.body.toWorld({ x: 2.1, y: 0 });
        out.push({ x: nose.x, y: nose.y, radius: 15, color: HEADLIGHT, intensity, artificial: true, profile: 'cone', angle: vehicle.body.angle, spread: 0.5 });
      }
    }
    if (vehicle.kind === 'police' && !wreck) {
      const phase = Math.sin(time * 7 + vehicle.id * 2.1);
      const pulse = 0.55 + 0.45 * Math.abs(phase);
      const roof = vehicle.body.toWorld({ x: -0.1, y: 0 });
      out.push({ x: roof.x, y: roof.y, radius: 7.5, color: phase >= 0 ? POLICE_RED : POLICE_BLUE, intensity: clamp01(pulse * 0.9) });
    }
    if (vehicle.damage.status === 'burning') {
      const flicker = 0.7 + 0.3 * Math.sin(time * 13 + vehicle.id * 2.3);
      const fire = vehicle.body.toWorld({ x: 0.9, y: 0 });
      out.push({ x: fire.x, y: fire.y, radius: 7, color: FIRE, intensity: clamp01(0.85 * flicker) });
    }
    if (vehicle.id === scene.playerId && scene.playerBoosting && !scene.playerOnFoot) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 43);
      const back = vehicle.body.toWorld({ x: -2.4, y: 0 });
      out.push({ x: back.x, y: back.y, radius: 6, color: NITRO, intensity: clamp01(pulse) });
    }
  }

  for (const blast of scene.blasts) {
    const t = blast.ttl > 0 ? clamp01(1 - blast.life / blast.ttl) : 0;
    if (t <= 0) continue;
    out.push({ x: blast.position.x, y: blast.position.y, radius: Math.max(4, blast.maxRadius * 0.9), color: EXPLOSION, intensity: clamp01(t * 1.3) });
  }

  return out;
}

// ---- Compositor --------------------------------------------------------------------------------

export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

const browserCanvas: CanvasFactory = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export type LightingRenderOptions = {
  width: number;
  height: number;
  dpr: number;
  state: AmbientLighting;
  lights: LightSource[];
  zoom: number;
  /** World point -> CSS-pixel screen point (the renderer's `screen`). */
  project: (point: { x: number; y: number }) => { x: number; y: number };
};

/**
 * Owns the two half-resolution offscreen canvases and the gradient-sprite cache. `render` is a
 * no-throw no-op when no canvas implementation is available (headless tests), so it never breaks
 * the main loop.
 */
export class LightingLayer {
  readonly resolution: number;
  private mask: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;
  private glow: HTMLCanvasElement | null = null;
  private glowCtx: CanvasRenderingContext2D | null = null;
  private maskWidth = 0;
  private maskHeight = 0;
  private sprites = new Map<string, HTMLCanvasElement>();

  constructor(resolution = 0.5, private createCanvas: CanvasFactory = browserCanvas) {
    this.resolution = Math.max(0.2, Math.min(1, Number.isFinite(resolution) ? resolution : 0.5));
  }

  get spriteCount(): number { return this.sprites.size; }

  clearSprites(): void { this.sprites.clear(); }

  private ensure(width: number, height: number): boolean {
    const w = Math.max(1, Math.ceil(width * this.resolution));
    const h = Math.max(1, Math.ceil(height * this.resolution));
    if (this.mask && this.maskCtx && this.glow && this.glowCtx && this.maskWidth === w && this.maskHeight === h) return true;
    this.maskWidth = w;
    this.maskHeight = h;
    this.mask = this.createCanvas(w, h);
    this.maskCtx = this.mask.getContext('2d');
    this.glow = this.createCanvas(w, h);
    this.glowCtx = this.glow.getContext('2d');
    this.sprites.clear();
    return !!(this.maskCtx && this.glowCtx);
  }

  private sprite(key: string, build: () => HTMLCanvasElement): HTMLCanvasElement {
    const cached = this.sprites.get(key);
    if (cached) return cached;
    if (this.sprites.size >= MAX_SPRITES) this.sprites.clear();
    const created = build();
    this.sprites.set(key, created);
    return created;
  }

  private radialSprite(color: RGB, radius: number, inner: number): HTMLCanvasElement {
    const size = radius * 2;
    const canvas = this.createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const gradient = ctx.createRadialGradient(radius, radius, Math.max(0, radius * inner), radius, radius, radius);
    gradient.addColorStop(0, rgba(color, 1));
    gradient.addColorStop(0.45, rgba(color, 0.62));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return canvas;
  }

  private coneSprite(color: RGB, radius: number, spread: number): HTMLCanvasElement {
    const size = radius * 2;
    const canvas = this.createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.translate(radius, radius);
    const gradient = ctx.createRadialGradient(0, 0, radius * 0.06, 0, 0, radius);
    gradient.addColorStop(0, rgba(color, 1));
    gradient.addColorStop(0.5, rgba(color, 0.5));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, -spread, spread);
    ctx.closePath();
    ctx.fill();
    return canvas;
  }

  private drawLight(
    target: CanvasRenderingContext2D,
    light: LightSource,
    params: AmbientParams,
    mode: 'mask' | 'glow',
    opts: LightingRenderOptions,
  ): void {
    const screen = opts.project({ x: light.x, y: light.y });
    const scale = this.resolution;
    const cx = screen.x * scale;
    const cy = screen.y * scale;
    const rpx = light.radius * opts.zoom * scale;
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || rpx < 0.8) return;
    const intensity = clamp01(light.intensity);
    const alpha = mode === 'mask' ? intensity * 0.9 : intensity * params.glow;
    if (alpha <= 0.004) return;
    if (light.profile === 'cone') {
      const spread = Math.max(0.08, Math.min(1.2, Number.isFinite(light.spread) ? (light.spread as number) : 0.5));
      const key = spriteKey(light.color, rpx, 'cone', spread);
      const sprite = this.sprite(key, () => this.coneSprite(light.color, bucketRadius(rpx), spread));
      const r = bucketRadius(rpx);
      target.save();
      target.translate(cx, cy);
      target.rotate(Number.isFinite(light.angle) ? (light.angle as number) : 0);
      target.globalAlpha = alpha;
      target.drawImage(sprite, -r, -r, r * 2, r * 2);
      target.restore();
    } else {
      const inner = Math.max(0, Math.min(0.6, Number.isFinite(light.inner) ? (light.inner as number) : 0.16));
      const key = spriteKey(light.color, rpx, 'radial', inner);
      const sprite = this.sprite(key, () => this.radialSprite(light.color, bucketRadius(rpx), inner));
      const r = bucketRadius(rpx);
      target.globalAlpha = alpha;
      target.drawImage(sprite, cx - r, cy - r, r * 2, r * 2);
      target.globalAlpha = 1;
    }
  }

  render(ctx: CanvasRenderingContext2D, opts: LightingRenderOptions): void {
    if (!this.ensure(opts.width, opts.height)) return;
    const params = ambientPass(opts.state);
    const { width, height, dpr } = opts;
    const mask = this.maskCtx!;
    const glow = this.glowCtx!;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Ambient day lift: screen-blend a warm neutral so the night-oriented palette opens up.
    if (params.lift > 0.002) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = rgba(params.liftColor, params.lift);
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Ambient mask: tint first, darkness over it, then carve light holes out of both.
    mask.setTransform(1, 0, 0, 1, 0, 0);
    mask.globalCompositeOperation = 'source-over';
    mask.clearRect(0, 0, this.maskWidth, this.maskHeight);
    mask.globalAlpha = 1;
    if (params.maskTint > 0.002) {
      mask.fillStyle = rgba(params.tint, 1);
      mask.globalAlpha = params.maskTint;
      mask.fillRect(0, 0, this.maskWidth, this.maskHeight);
    }
    if (params.maskDark > 0.002) {
      mask.fillStyle = rgba(params.darkColor, 1);
      mask.globalAlpha = params.maskDark;
      mask.fillRect(0, 0, this.maskWidth, this.maskHeight);
    }
    mask.globalAlpha = 1;
    mask.globalCompositeOperation = 'destination-out';
    for (const light of opts.lights) this.drawLight(mask, light, params, 'mask', opts);
    mask.globalCompositeOperation = 'source-over';

    // 3. Glow: additive coloured spill for the same sources.
    glow.setTransform(1, 0, 0, 1, 0, 0);
    glow.globalCompositeOperation = 'source-over';
    glow.clearRect(0, 0, this.maskWidth, this.maskHeight);
    glow.globalAlpha = 1;
    for (const light of opts.lights) this.drawLight(glow, light, params, 'glow', opts);

    // 4. Composite mask (darken) then glow (lighten) back onto the scene at full resolution.
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.mask!, 0, 0, this.maskWidth, this.maskHeight, 0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.glow!, 0, 0, this.maskWidth, this.maskHeight, 0, 0, width, height);
    ctx.restore();
  }
}

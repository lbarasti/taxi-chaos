import { describe, expect, it } from 'vitest';
import {
  LightingLayer, ambientPass, bucketRadius, collectLights, cullLights, spriteKey,
  type AmbientLighting, type LightScene, type LightSource, type SceneBlast, type SceneProp, type SceneVehicle,
} from './lighting';

// Lightweight recording contexts so the compositor and sprite cache run under Node (no DOM).
function mockCtx() {
  const calls: Record<string, number> = {};
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, prop) {
      const key = String(prop);
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key in t) return t[key];
      return () => { calls[key] = (calls[key] ?? 0) + 1; };
    },
    set(t, prop, value) { t[String(prop)] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

function mockCanvas(width: number, height: number): HTMLCanvasElement {
  const { ctx } = mockCtx();
  return { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

const lighting = (over: Partial<AmbientLighting> = {}): AmbientLighting => ({
  tint: [255, 250, 240], tintStrength: 0, darkness: 0, artificialLight: 0,
  sunDirection: { x: 0, y: -1 }, shadowLength: 0.35, shadowOpacity: 0.6, ...over,
});

const vehicle = (over: Partial<SceneVehicle> = {}): SceneVehicle => ({
  id: 1, kind: 'traffic', alive: true, parked: false, driverExited: false, color: '#fff',
  damage: { status: 'intact', fireTime: 0 }, ai: { phase: 'cruise' },
  body: { position: { x: 0, y: 0 }, angle: 0, velocity: { x: 0, y: 0 }, toWorld: p => ({ ...p }) },
  ...over,
});

const prop = (over: Partial<SceneProp> = {}): SceneProp => ({
  id: 1, kind: 'lamp', alive: true, fire: 0,
  body: { position: { x: 2, y: 3 }, angle: 0, w: 1, h: 1 },
  ...over,
});

const blast = (over: Partial<SceneBlast> = {}): SceneBlast => ({ position: { x: 5, y: 5 }, maxRadius: 10, life: 0, ttl: 0.7, ...over });

const scene = (over: Partial<LightScene> = {}): LightScene => ({
  time: 0, artificial: 1, playerId: 0, playerOnFoot: false, playerBoosting: false, arrest: 0,
  vehicles: [], props: [], blasts: [], ...over,
});

describe('ambientPass', () => {
  it('leaves noon bright with no mask and a warm lift', () => {
    const p = ambientPass(lighting());
    expect(p.daylight).toBe(1);
    expect(p.maskDark).toBe(0);
    expect(p.maskTint).toBe(0);
    expect(p.lift).toBeGreaterThan(0.15);
    expect(p.liftColor[0]).toBeGreaterThanOrEqual(250);
  });

  it('darkens and tints at night while keeping a faint lift continuity', () => {
    const p = ambientPass(lighting({ tint: [16, 24, 58], tintStrength: 0.62, darkness: 0.68, artificialLight: 1 }));
    expect(p.daylight).toBeCloseTo(0.32, 5);
    expect(p.maskDark).toBeGreaterThan(0.5);
    expect(p.maskTint).toBeGreaterThan(0.4);
    expect(p.lift).toBeLessThan(0.12);
    expect(p.darkColor[2]).toBeGreaterThan(p.darkColor[0]); // cool night mask
  });

  it('clamps invalid values instead of producing NaN overlays', () => {
    const p = ambientPass(lighting({ darkness: Number.NaN, tintStrength: Number.NaN, tint: [Number.NaN, 0, 0] }));
    expect(Number.isFinite(p.lift)).toBe(true);
    expect(Number.isFinite(p.maskDark)).toBe(true);
    expect(p.maskDark).toBe(0);
  });
});

describe('cullLights', () => {
  const view = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const light = (over: Partial<LightSource> = {}): LightSource => ({ x: 5, y: 5, radius: 2, color: [255, 255, 255], intensity: 0.8, ...over });

  it('keeps in-view lights and removes off-screen or dim ones', () => {
    expect(cullLights([light()], view)).toHaveLength(1);
    expect(cullLights([light({ x: 100, y: 100 })], view)).toHaveLength(0);
    expect(cullLights([light({ intensity: 0.001 })], view)).toHaveLength(0);
    expect(cullLights([light({ x: 11.9, y: 5, radius: 2 })], view)).toHaveLength(1); // touching the edge
  });
});

describe('collectLights', () => {
  it('lights intact lamps and stops when a lamp is destroyed', () => {
    expect(collectLights(scene({ props: [prop({ kind: 'lamp' })] }))).toHaveLength(1);
    expect(collectLights(scene({ props: [prop({ kind: 'lamp', alive: false })] }))).toHaveLength(0);
  });

  it('lights intact storefronts but not destroyed buildings', () => {
    const building = prop({ kind: 'building', body: { position: { x: 40, y: 40 }, angle: 0, w: 10, h: 10 } });
    expect(collectLights(scene({ props: [building] }))).toHaveLength(1);
    expect(collectLights(scene({ props: [{ ...building, alive: false }] }))).toHaveLength(0);
  });

  it('gives headlight cones only to active, occupied driving cars', () => {
    const cone = (v: SceneVehicle) => collectLights(scene({ vehicles: [v] })).some(l => l.profile === 'cone');
    expect(cone(vehicle())).toBe(true);
    expect(cone(vehicle({ parked: true }))).toBe(false);
    expect(cone(vehicle({ driverExited: true }))).toBe(false);
    expect(cone(vehicle({ damage: { status: 'wreck', fireTime: 0 } }))).toBe(false);
  });

  it('fades artificial light to nothing at noon but keeps fires burning', () => {
    const lamp = prop({ kind: 'lamp' });
    expect(collectLights(scene({ artificial: 0, props: [lamp] }))).toHaveLength(0);
    const burning = vehicle({ damage: { status: 'burning', fireTime: 0 } });
    const lights = collectLights(scene({ artificial: 0, vehicles: [burning] }));
    expect(lights.some(l => l.color[0] === 255 && l.color[1] === 138 && l.color[2] === 52)).toBe(true);
  });

  it('flickers fires deterministically without frame randomness', () => {
    const fire = prop({ alive: false, fire: 3 });
    const a = collectLights(scene({ time: 0, props: [fire] }));
    const b = collectLights(scene({ time: 0, props: [fire] }));
    const c = collectLights(scene({ time: 0.15, props: [fire] }));
    expect(a[0].intensity).toBe(b[0].intensity);
    expect(a[0].intensity).not.toBe(c[0].intensity);
    expect(a[0].intensity).toBeGreaterThan(0);
    expect(a[0].intensity).toBeLessThanOrEqual(1);
  });

  it('alternates red and blue police flashes over time', () => {
    const police = vehicle({ id: 1, kind: 'police' });
    const flash = (time: number) => collectLights(scene({ time, vehicles: [police] })).find(l => l.color[1] === 74 || l.color[0] === 86)?.color;
    const red = flash(0), blue = flash(0.3);
    expect(red).toEqual([255, 74, 74]);
    expect(blue).toEqual([86, 150, 255]);
    expect(red).not.toEqual(blue);
  });

  it('adds an active nitro glow only for the boosting player', () => {
    const car = vehicle({ id: 7, kind: 'taxi' });
    const off = collectLights(scene({ playerId: 7, vehicles: [car] }));
    const on = collectLights(scene({ playerId: 7, playerBoosting: true, vehicles: [car] }));
    expect(off.some(l => l.color[2] === 241)).toBe(false);
    expect(on.some(l => l.color[2] === 241)).toBe(true);
  });

  it('bursts a local explosion glow that decays with the ring', () => {
    expect(collectLights(scene({ blasts: [blast()] }))).toHaveLength(1);
    expect(collectLights(scene({ blasts: [blast({ life: 0.7 })] }))).toHaveLength(0);
  });
});

describe('sprite cache keys', () => {
  it('reuses nearby radii and separates colours and cone spreads', () => {
    expect(bucketRadius(9)).toBe(bucketRadius(11));
    expect(spriteKey([255, 200, 100], 9, 'radial', 0)).toBe(spriteKey([255, 201, 102], 11, 'radial', 0));
    expect(spriteKey([255, 200, 100], 9, 'radial', 0)).not.toBe(spriteKey([16, 24, 58], 9, 'radial', 0));
    expect(spriteKey([255, 200, 100], 9, 'cone', 0.5)).not.toBe(spriteKey([255, 200, 100], 9, 'cone', 1.0));
  });
});

describe('LightingLayer', () => {
  const layer = () => new LightingLayer(0.5, mockCanvas);
  const opts = (lights: LightSource[]) => ({
    width: 800, height: 600, dpr: 1, state: lighting({ tint: [16, 24, 58], tintStrength: 0.62, darkness: 0.68, artificialLight: 1 }),
    lights, zoom: 9, project: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }),
  });

  it('builds the mask and glow sprites and composites both passes', () => {
    const subject = layer();
    const main = mockCtx();
    subject.render(main.ctx, opts([{ x: 100, y: 100, radius: 5, color: [255, 214, 150], intensity: 0.9 }]));
    expect(subject.spriteCount).toBeGreaterThan(0);
    expect(main.calls.drawImage).toBeGreaterThanOrEqual(2);
  });

  it('reuses cached sprites across frames and only grows for new colours', () => {
    const subject = layer();
    const main = mockCtx();
    const lights: LightSource[] = [{ x: 100, y: 100, radius: 5, color: [255, 214, 150], intensity: 0.9 }];
    subject.render(main.ctx, opts(lights));
    const afterFirst = subject.spriteCount;
    subject.render(main.ctx, opts(lights));
    expect(subject.spriteCount).toBe(afterFirst);
    subject.render(main.ctx, opts([...lights, { x: 200, y: 200, radius: 6, color: [255, 74, 74], intensity: 1, profile: 'cone', angle: 0.4, spread: 0.5 }]));
    expect(subject.spriteCount).toBeGreaterThan(afterFirst);
  });
});

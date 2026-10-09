import { describe, expect, it } from 'vitest';
import {
  LightingLayer, ambientPass, bucketRadius, collectLights, cullLights, spriteKey,
  type AmbientLighting, type LightScene, type LightSource, type SceneBlast, type SceneProp, type SceneVehicle,
} from './lighting';
import {
  collectOccluders, convexHull, nearbyOccluders, occluderFor, pointInConvex, shadowVolume, shouldOcclude,
  type OccluderProp,
} from './lighting-occlusion';

// Lightweight recording contexts so the compositor and sprite cache run under Node (no DOM).
function mockCtx() {
  const calls: Record<string, number> = {};
  const args: Record<string, unknown[][]> = {};
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, prop) {
      const key = String(prop);
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key in t) return t[key];
      return (...values: unknown[]) => { calls[key] = (calls[key] ?? 0) + 1; (args[key] ??= []).push(values); };
    },
    set(t, prop, value) { t[String(prop)] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, args };
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

  it('keeps the night mask translucent and the shadow colour lifted toward indigo', () => {
    const p = ambientPass(lighting({ tint: [22, 34, 88], tintStrength: 0.52, darkness: 0.56, artificialLight: 1 }));
    expect(p.maskDark).toBeLessThan(0.6);
    expect(p.maskDark).toBeGreaterThan(0.3);
    expect(p.darkColor[2]).toBeGreaterThan(30); // lifted off near-black
    expect(p.darkColor[2]).toBeGreaterThan(p.darkColor[0]);
    expect(p.lift).toBeGreaterThan(0.05); // cool screen fill keeps shadows readable
    expect(p.glow).toBeGreaterThan(0.5); // halation around warm/neon sources
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

  it('broadens streetlamp pools into flatter sodium washes', () => {
    const lights = collectLights(scene({ props: [prop({ kind: 'lamp' })] }));
    expect(lights).toHaveLength(1);
    expect(lights[0].radius).toBeGreaterThanOrEqual(8);
    expect(lights[0].inner).toBeGreaterThan(0.25);
  });

  it('adds a saturated neon accent to every third storefront, not all of them', () => {
    const body = { position: { x: 40, y: 40 }, angle: 0, w: 10, h: 10 };
    const plain = collectLights(scene({ props: [prop({ id: 1, kind: 'building', body })] }));
    const neon = collectLights(scene({ props: [prop({ id: 6, kind: 'building', body })] }));
    expect(plain).toHaveLength(1);
    expect(neon.length).toBeGreaterThan(plain.length);
    // Sparse signs should still use the full palette rather than aliasing to just two colours.
    const colors = Array.from({ length: 6 }, (_, i) => {
      const lights = collectLights(scene({ props: [prop({ id: i * 3, kind: 'building', body })] }));
      return lights[1].color.join(',');
    });
    expect(new Set(colors).size).toBe(6);
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
  it('reuses nearby template radii but separates colours and all falloff shapes', () => {
    expect(bucketRadius(9)).toBe(bucketRadius(11));
    expect(spriteKey([255, 200, 100], 9, 'radial', 0)).toBe(spriteKey([255, 200, 100], 11, 'radial', 0));
    expect(spriteKey([255, 200, 100], 9, 'radial', 0)).not.toBe(spriteKey([255, 201, 102], 9, 'radial', 0));
    expect(spriteKey([255, 208, 142], 64, 'radial', 0.16)).not.toBe(spriteKey([255, 208, 142], 64, 'radial', 0.32));
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

  it('keeps lamp pools and beams at exact world radii through zoom bucket boundaries', () => {
    const contexts: ReturnType<typeof mockCtx>[] = [];
    const subject = new LightingLayer(0.5, (width, height) => {
      const rec = mockCtx(); contexts.push(rec);
      return { width, height, getContext: () => rec.ctx } as unknown as HTMLCanvasElement;
    });
    const lights: LightSource[] = [
      { x: 100, y: 100, radius: 8.5, color: [255, 208, 142], intensity: 1, inner: 0.32 },
      { x: 120, y: 100, radius: 16, color: [255, 240, 196], intensity: 0.75, profile: 'cone', spread: 0.5 },
    ];
    const zooms = [8.45, 8.46, 8.47, 8.48, 8.49, 8.5, 9, 7];
    for (const zoom of zooms) subject.render(mockCtx().ctx, { ...opts(lights), zoom });
    for (const context of contexts.slice(0, 2)) { // both the darkness mask and glow
      const draws = context.args.drawImage;
      zooms.forEach((zoom, frame) => lights.forEach((light, index) => {
        const draw = draws[frame * lights.length + index];
        expect(draw[3]).toBeCloseTo(light.radius * zoom, 8);
        expect(draw[4]).toBeCloseTo(light.radius * zoom, 8);
      }));
    }
    expect(subject.spriteCount).toBe(2); // camera zoom reuses the same two gradients
  });
});

describe('lighting occlusion geometry', () => {
  const occProp = (over: Partial<OccluderProp> = {}): OccluderProp => ({
    kind: 'building', alive: true,
    body: { position: { x: 0, y: 0 }, angle: 0, w: 10, h: 10 }, ...over,
  });

  it('keeps alive raised structures and drops rubble, small props and off-screen ones', () => {
    const view = { minX: -30, minY: -30, maxX: 30, maxY: 30 };
    const building = occProp();
    const barracks = occProp({ kind: 'barracks', body: { position: { x: 20, y: 0 }, angle: 0, w: 23, h: 10 } });
    expect(collectOccluders([building, barracks], view)).toHaveLength(2);
    expect(collectOccluders([{ ...building, alive: false }], view)).toHaveLength(0);
    expect(collectOccluders([occProp({ kind: 'lamp' }), occProp({ kind: 'tree' }), occProp({ kind: 'pump' })], view)).toHaveLength(0);
    expect(collectOccluders([occProp({ body: { position: { x: 400, y: 0 }, angle: 0, w: 10, h: 10 } })], view)).toHaveLength(0);
  });

  it('extends the building occluder by the drawn facade offset', () => {
    const occluder = occluderFor(occProp())!;
    const xs = occluder.points.map(p => p.x), ys = occluder.points.map(p => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-5.25, 5);
    expect(Math.max(...xs)).toBeCloseTo(5, 5);
    expect(Math.min(...ys)).toBeCloseTo(-5.6, 5);
    expect(Math.max(...ys)).toBeCloseTo(5, 5);
  });

  it('rotates off-axis occluders with the prop angle', () => {
    const occluder = occluderFor(occProp({ body: { position: { x: 0, y: 0 }, angle: Math.PI / 2, w: 10, h: 10 } }))!;
    // 90 degrees swaps the local extents.
    const xs = occluder.points.map(p => p.x), ys = occluder.points.map(p => p.y);
    expect(Math.max(...xs)).toBeCloseTo(5.6, 5);
    expect(Math.min(...ys)).toBeCloseTo(-5.25, 4);
  });

  it('hulls arbitrary points and tolerates duplicates/degenerate input', () => {
    expect(convexHull([])).toHaveLength(0);
    expect(convexHull([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toHaveLength(2);
    const square = convexHull([
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 2, y: 2 }, { x: 2, y: 2 },
    ]);
    expect(square).toHaveLength(4);
    expect(pointInConvex({ x: 2, y: 2 }, square)).toBe(true);
    expect(pointInConvex({ x: 9, y: 2 }, square)).toBe(false);
  });

  it('extrudes a shadow away from the light and covers the occluder itself', () => {
    const occluder = occluderFor(occProp())!;
    const volume = shadowVolume({ x: -20, y: 0 }, occluder, 40);
    expect(volume.length).toBeGreaterThanOrEqual(4);
    expect(pointInConvex({ x: 0, y: 0 }, volume)).toBe(true);   // receiver mask: roof excluded
    expect(pointInConvex({ x: 15, y: 0 }, volume)).toBe(true);  // extruded shadow behind the roof
    expect(pointInConvex({ x: -15, y: 0 }, volume)).toBe(false); // in front of the occluder stays lit
  });

  it('falls back to the raw outline when the light is inside an occluder', () => {
    const occluder = occluderFor(occProp())!;
    const volume = shadowVolume({ x: 0, y: 0 }, occluder, 40);
    expect(volume).toHaveLength(occluder.points.length);
    expect(pointInConvex({ x: 0, y: 0 }, volume)).toBe(true);
  });

  it('range-rejects far occluders and never the ones a beam can reach', () => {
    const near = occluderFor(occProp({ body: { position: { x: 12, y: 0 }, angle: 0, w: 10, h: 10 } }))!;
    const far = occluderFor(occProp({ body: { position: { x: 80, y: 0 }, angle: 0, w: 10, h: 10 } }))!;
    const lights = nearbyOccluders({ x: 0, y: 0, radius: 12 }, [near, far]);
    expect(lights).toContain(near);
    expect(lights).not.toContain(far);
  });

  it('occludes beams and opt-in lights but keeps soft radial lamps unoccluded', () => {
    expect(shouldOcclude({ profile: 'cone' })).toBe(true);
    expect(shouldOcclude({ profile: 'radial', occlude: true })).toBe(true);
    expect(shouldOcclude({ profile: 'radial' })).toBe(false);
    expect(shouldOcclude({})).toBe(false);
  });
});

describe('LightingLayer occlusion', () => {
  const capturingLayer = () => {
    const contexts: Array<{ calls: Record<string, number> }> = [];
    const factory = (width: number, height: number): HTMLCanvasElement => {
      const rec = mockCtx();
      contexts.push(rec);
      return { width, height, getContext: () => rec.ctx } as unknown as HTMLCanvasElement;
    };
    return { layer: new LightingLayer(0.5, factory), clipCalls: () => contexts.reduce((n, r) => n + (r.calls.clip ?? 0), 0) };
  };
  const occluders = () => collectOccluders(
    [{ kind: 'building', alive: true, body: { position: { x: 40, y: 0 }, angle: 0, w: 10, h: 10 } }],
    { minX: -100, minY: -100, maxX: 100, maxY: 100 },
  );
  const renderOpts = (lights: LightSource[], occ: ReturnType<typeof occluders>) => ({
    width: 800, height: 600, dpr: 1, state: lighting({ darkness: 0.7, artificialLight: 1 }),
    lights, zoom: 9, project: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }), occluders: occ,
  });
  const beam: LightSource = { x: 30, y: 0, radius: 15, color: [255, 240, 196], intensity: 0.9, profile: 'cone', angle: 0, spread: 0.5 };

  it('clips a beam against nearby building shadow volumes without skipping the sprite', () => {
    const { layer, clipCalls } = capturingLayer();
    const main = mockCtx();
    layer.render(main.ctx, renderOpts([beam], occluders()));
    expect(clipCalls()).toBeGreaterThan(0);
    expect(main.calls.drawImage).toBeGreaterThanOrEqual(2);
  });

  it('leaves radial lamps and beacon-only scenes unclipped', () => {
    const { layer: lampLayer, clipCalls: lampClips } = capturingLayer();
    lampLayer.render(mockCtx().ctx, renderOpts([{ ...beam, profile: 'radial', spread: undefined }], occluders()));
    expect(lampClips()).toBe(0);

    const { layer: clearLayer, clipCalls: clearClips } = capturingLayer();
    clearLayer.render(mockCtx().ctx, renderOpts([beam], []));
    expect(clearClips()).toBe(0);
  });

  it('does not clip beams that are nowhere near an occluder', () => {
    const { layer, clipCalls } = capturingLayer();
    layer.render(mockCtx().ctx, renderOpts([{ ...beam, x: 500, y: 500 }], occluders()));
    expect(clipCalls()).toBe(0);
  });
});

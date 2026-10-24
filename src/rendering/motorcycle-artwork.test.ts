import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotorcycleArtwork, motorcycleArtwork } from './motorcycle-artwork';
import { Renderer } from './renderer';
import { Game } from '../game/game';
import { MotorcycleDynamics } from '../vehicles/motorcycle';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function context() {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  return { calls, ctx: new Proxy({}, {
    get: (_, name: string) => calls[name] ??= vi.fn(),
    set: () => true,
  }) as CanvasRenderingContext2D };
}
function browser(fail = false) {
  const sources: string[] = [];
  vi.stubGlobal('Image', class {
    onload = () => {}; onerror = () => {};
    set src(value: string) { sources.push(value); queueMicrotask(() => fail ? this.onerror() : this.onload()); }
  });
  return sources;
}

describe('illustrated motorcycle poses', () => {
  it('decodes once, walks the four source cells in both directions and keeps the rear anchor fixed', async () => {
    const sources = browser(), art = new MotorcycleArtwork(), { ctx, calls } = context();
    expect(art.draw(ctx, 0, 0, false, -0.88)).toBe(false);
    const loading = art.load(); expect(art.load()).toBe(loading); await loading;
    expect(sources).toHaveLength(1);
    for (const lift of [0, 1 / 3, 2 / 3, 1, 2 / 3, 1 / 3, 0]) art.draw(ctx, lift, 0, false, -0.88);
    expect(calls.drawImage.mock.calls.map(args => args.slice(1))).toEqual(
      [3, 2, 1, 0, 1, 2, 3].map(pose => [pose * 256, 0, 256, 320, -128, -72, 256, 320]));
    expect(calls.translate.mock.calls).toEqual(Array.from({ length: 7 }, () => [-0.88, 0]));
    expect(calls.rotate.mock.calls).toEqual(Array.from({ length: 7 }, () => [-Math.PI / 2]));
    expect(calls.fillRect).toBeUndefined(); // The empty rack never gains a phantom parcel.
    art.draw(ctx, 0, 0.3, true, -0.88);
    expect(calls.fillRect).toHaveBeenCalledTimes(2);
    expect(calls.translate).toHaveBeenLastCalledWith(-0.88, Math.sin(0.3) * 0.65);
  });

  it('retains procedural fallback after image decode failure', async () => {
    browser(true); const art = new MotorcycleArtwork(), { ctx, calls } = context();
    await art.load(); expect(art.draw(ctx, 1, 0, false, -0.88)).toBe(false);
    expect(Object.keys(calls)).toHaveLength(0);
  });

  it('uses the sheet in the real renderer, but excludes empty, fallen and wrecked bikes', () => {
    const game = new Game();
    const bike = game.vehicle('traffic', 0, 0, 0, '#ed9b63', 'motorcycle');
    const renderer = Object.assign(Object.create(Renderer.prototype), {
      game, ctx: context().ctx, sun: { x: 0, y: 0.5 }, shadowAlpha: 0.4, shadowT: 0,
    }) as { motorcycle: (v: typeof bike) => void };
    const draw = vi.spyOn(motorcycleArtwork, 'draw').mockReturnValue(true);
    const dynamics = bike.dynamics as MotorcycleDynamics;
    dynamics.wheelie = 0.7; renderer.motorcycle(bike);
    expect(draw).toHaveBeenCalledWith(expect.anything(), 0.7, 0, false, -0.88);
    draw.mockClear();
    bike.driverExited = true; renderer.motorcycle(bike);
    bike.driverExited = false; dynamics.crash(1, 10); renderer.motorcycle(bike);
    dynamics.resetLean(); bike.damage.status = 'wreck'; renderer.motorcycle(bike);
    expect(draw).not.toHaveBeenCalled();
  });
});

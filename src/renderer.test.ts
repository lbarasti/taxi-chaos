import { afterEach, describe, expect, it, vi } from 'vitest';
import { Body, vec } from './physics';
import { Game } from './game';
import { Renderer } from './renderer';
import { artworkImages } from './artwork/images';
import type { PropArtwork } from './artwork/catalogue';
import type { Prop } from './world';

/** Renderer dispatch regression: an alive prop with decoded catalogue artwork draws that
 * sprite ahead of the procedural district renderers, while a destroyed prop never does.
 * These are the real Renderer and the real beach/harbour/city drawing passes — only the
 * decoded-bitmap lookup is stubbed, because a Node test has no canvas image decode. */

const art = (image: string, castsShadow = true): PropArtwork => ({
  image, layer: 'structure', bounds: { x: -1, y: -1, width: 2, height: 2 },
  silhouette: [vec(-1, -1), vec(1, -1), vec(1, 1), vec(-1, 1)], castsShadow,
});
const prop = (kind: string, artwork: PropArtwork, alive = true, fire = 0): Prop => ({
  id: 7, kind: kind as Prop['kind'], artwork, body: new Body(10, 10, Infinity, 2, 2),
  alive, hp: 10, maxHp: 10, color: '#bc9465', label: 'PALM', brokenAt: -1, lastHit: -1, fire, fuelSpent: false, blamed: false,
});

function canvasContext() {
  const calls: Record<string, unknown[][]> = {};
  const ctx: Record<string, unknown> = { globalAlpha: 1 };
  for (const name of ['setTransform', 'fillRect', 'strokeRect', 'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'bezierCurveTo', 'quadraticCurveTo', 'fill', 'stroke', 'arc', 'clip', 'ellipse', 'setLineDash', 'fillText']) {
    ctx[name] = (...args: unknown[]) => { (calls[name] ??= []).push(args); };
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function renderer() {
  const { ctx, calls } = canvasContext();
  const canvas = { getContext: () => ctx, width: 0, height: 0 };
  vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, addEventListener() {}, matchMedia: () => ({ matches: false }) });
  const r = new Renderer(canvas as unknown as HTMLCanvasElement, canvas as unknown as HTMLCanvasElement, new Game(undefined, false));
  return { r, calls };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('prop render dispatch', () => {
  it('draws decoded catalogue artwork ahead of the procedural beach/port passes', () => {
    const { r, calls } = renderer();
    const draw = vi.spyOn(artworkImages, 'draw').mockReturnValue(true);
    vi.spyOn(artworkImages, 'has').mockReturnValue(true);

    // A typed palm and fence: the decoded PNG wins, so the procedural pass is skipped.
    r.prop(prop('palm', art('palm-png')));
    expect(draw).toHaveBeenCalledExactlyOnceWith(r.ctx, expect.objectContaining({ image: 'palm-png' }));
    expect(calls.arc ?? []).toHaveLength(0);

    calls.moveTo = [];
    r.prop(prop('fence', art('fence-png', false)));
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw).toHaveBeenLastCalledWith(r.ctx, expect.objectContaining({ image: 'fence-png' }));
    expect(calls.moveTo).toHaveLength(0);
  });

  it('keeps the procedural fallback when the image is not decoded', () => {
    const { r, calls } = renderer();
    const draw = vi.spyOn(artworkImages, 'draw').mockReturnValue(true);
    vi.spyOn(artworkImages, 'has').mockReturnValue(false);

    r.prop(prop('palm', art('palm-png')));
    expect(draw).not.toHaveBeenCalled();
    expect(calls.arc!.length).toBeGreaterThan(0);

    calls.moveTo = [];
    r.prop(prop('fence', art('fence-png', false)));
    expect(draw).not.toHaveBeenCalled();
    expect(calls.moveTo.length).toBeGreaterThan(0);
  });

  it('never draws a live sprite for a destroyed prop', () => {
    const { r, calls } = renderer();
    const draw = vi.spyOn(artworkImages, 'draw').mockReturnValue(true);
    vi.spyOn(artworkImages, 'has').mockReturnValue(true);

    r.prop(prop('palm', art('palm-png'), false));
    expect(draw).not.toHaveBeenCalled();
    expect(calls.fillRect!.length).toBeGreaterThan(0);

    calls.moveTo = [];
    r.prop(prop('fence', art('fence-png', false), false));
    expect(draw).not.toHaveBeenCalled();
    expect(calls.moveTo.length).toBeGreaterThan(0);
  });

  it('keeps live station/pump fire over a typed catalogue sprite and after destruction', () => {
    const { r, calls } = renderer();
    const draw = vi.spyOn(artworkImages, 'draw').mockReturnValue(true);
    vi.spyOn(artworkImages, 'has').mockReturnValue(true);

    // A burning station draws its decoded sprite first and then overlays the kind's
    // flames and smoke, exactly like the procedural pass: the sprite branch must not
    // swallow the live damage feedback.
    r.prop(prop('station', art('station-png'), true, 4));
    expect(draw).toHaveBeenCalledExactlyOnceWith(r.ctx, expect.objectContaining({ image: 'station-png' }));
    expect(calls.arc ?? []).toContainEqual([0, 0, 2.8 * 1.9, 0, Math.PI * 2]);
    expect(calls.ellipse!.length).toBeGreaterThan(0);

    // A destroyed station keeps the generic wreck fallback with no live sprite, and
    // still burns at the larger wreck size.
    calls.arc = []; calls.ellipse = [];
    r.prop(prop('station', art('station-png'), false, 4));
    expect(draw).toHaveBeenCalledTimes(1);
    expect(calls.fillRect!.length).toBeGreaterThan(0);
    expect(calls.arc ?? []).toContainEqual([0, 0, 3 * 1.9, 0, Math.PI * 2]);

    // The same overlay covers a burning pump sprite.
    calls.arc = [];
    r.prop(prop('pump', art('pump-png'), true, 4));
    expect(draw).toHaveBeenCalledTimes(2);
    expect(calls.arc ?? []).toContainEqual([0, 0, 1.4 * 1.9, 0, Math.PI * 2]);
  });
});

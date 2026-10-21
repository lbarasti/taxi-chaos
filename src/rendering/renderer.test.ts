import { afterEach, describe, expect, it, vi } from 'vitest';
import { Body, vec } from '../physics/physics';
import { Game } from '../game/game';
import { Renderer } from './renderer';
import { artworkImages } from '../artwork/images';
import { objectDefinitions, artworkFor, type PropArtwork } from '../artwork/catalogue';
import { deriveArtwork } from '../catalogue/compile';
import type { Prop } from '../world/world';
import { compileMap } from '../map/compile';
import { exportMap, importMap } from '../map/serialization';

/** Renderer dispatch regression: an alive prop with decoded catalogue artwork draws that
 * sprite ahead of the procedural district renderers, while a destroyed prop never does.
 * These are the real Renderer and the real beach/harbour/city drawing passes — only the
 * decoded-bitmap lookup is stubbed, because a Node test has no canvas image decode. */

const art = (image: string, castsShadow = true): PropArtwork => ({
  image, layer: 'structure', bounds: { x: -1, y: -1, width: 2, height: 2 },
  anchor: vec(0.5, 0.5), renderOrder: 'below-actors',
  silhouette: [vec(-1, -1), vec(1, -1), vec(1, 1), vec(-1, 1)], castsShadow,
});
const prop = (kind: string, artwork: PropArtwork, alive = true, fire = 0): Prop => ({
  id: 7, kind: kind as Prop['kind'], artwork, body: new Body(10, 10, Infinity, 2, 2),
  alive, hp: 10, maxHp: 10, color: '#bc9465', label: 'PALM', brokenAt: -1, lastHit: -1, fire, fuelSpent: false, blamed: false,
});

function canvasContext() {
  const calls: Record<string, unknown[][]> = {};
  const ctx: Record<string, unknown> = { globalAlpha: 1 };
  for (const name of ['setTransform', 'fillRect', 'strokeRect', 'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'bezierCurveTo', 'quadraticCurveTo', 'fill', 'stroke', 'arc', 'clip', 'rect', 'ellipse', 'setLineDash', 'fillText']) {
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
  it('draws a standing flag only through its prop and leaves a fallen pole after destruction', () => {
    const { r, calls } = renderer();
    const flag = r.game.world.props.find(p => p.sourceId === 'fairway-flag-3')!;
    r.golfFixtures();
    expect(calls.fillRect ?? []).toHaveLength(0);
    r.drawMapProp(flag);
    expect(calls.fillRect).toContainEqual([-0.04, -1.3, 0.08, 1.3]);
    expect(calls.translate).toContainEqual([flag.body.position.x, flag.body.position.y]);
    flag.alive = false; calls.fillRect = [];
    r.drawMapProp(flag); r.golfFixtures();
    expect(calls.fillRect).not.toContainEqual([-0.04, -1.3, 0.08, 1.3]);
    expect(calls.fillRect).toContainEqual([-0.18, 0.08, 1.35, 0.07]);
  });
  it('keeps the aerial ground plate after map round trips and draws course objects separately', () => {
    const { r, calls } = renderer();
    r.game = new Game(compileMap(importMap(exportMap(r.game.map.document))), false);
    const surface = vi.spyOn(artworkImages, 'surface').mockReturnValue(true);
    const draw = vi.spyOn(artworkImages, 'draw').mockReturnValue(true);
    vi.spyOn(artworkImages, 'has').mockReturnValue(true);
    r.countryEstates();
    expect(surface).toHaveBeenCalledExactlyOnceWith(r.ctx, 'golf-course', r.game.map.country.GOLF_COURSE.artwork);
    expect(draw).not.toHaveBeenCalled();
    expect(calls.fillText?.some(([text]) => ['1', '2', '3'].includes(String(text)))).toBe(false);

    const tree = r.game.world.props.find(p => p.sourceId?.startsWith('fairway-tree-'))!;
    const clubhouse = r.game.world.props.find(p => p.sourceId === 'fairway-clubhouse')!;
    r.drawMapProp(tree); r.drawMapProp(clubhouse); r.golfFixtures();
    expect(draw).toHaveBeenCalledWith(r.ctx, expect.objectContaining({ image: 'tree-worn' }));
    expect(draw).toHaveBeenCalledWith(r.ctx, expect.objectContaining({ image: 'golf-clubhouse' }));
    expect(calls.fillText?.filter(([text]) => ['1', '2', '3'].includes(String(text)))).toHaveLength(3);
    tree.alive = false; draw.mockClear(); r.drawMapProp(tree);
    expect(draw).not.toHaveBeenCalled();
  });
  it('isolates actual prop shadows from hidden artwork and preserves the light blockers', () => {
    const { r } = renderer();
    const stack: number[] = [];
    r.ctx.save = () => { stack.push(r.ctx.globalAlpha); };
    r.ctx.restore = () => { r.ctx.globalAlpha = stack.pop()!; };
    const shadows: number[] = [], sprites: number[] = [];
    r.ctx.fill = () => { shadows.push(r.ctx.globalAlpha); };
    vi.spyOn(artworkImages, 'has').mockReturnValue(true);
    vi.spyOn(artworkImages, 'draw').mockImplementation(c => { sprites.push(c.globalAlpha); return true; });
    const building = prop('building', art('building'));
    r.game.world.props = [building];
    const occluders = r.worldOccluders();
    r.inspection.active = true; r.inspection.solo('shadows');
    r.drawMapProp(building);
    expect(sprites).toEqual([0]); expect(shadows[0]).toBeGreaterThan(0);
    expect(r.worldOccluders()).toEqual(occluders);
    shadows.length = 0; sprites.length = 0;
    r.inspection.solo('props'); r.drawMapProp(building);
    expect(shadows).toEqual([]); expect(sprites).toEqual([1]);
    expect(r.ctx.globalAlpha).toBe(1);
  });

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

  it.each(['palm', 'tree'] as const)('keeps a missing %s image and its shadow on the same scaled canopy', kind => {
    const { r, calls } = renderer();
    vi.spyOn(artworkImages, 'has').mockReturnValue(false);
    const draw = vi.spyOn(artworkImages, 'draw').mockReturnValue(false);
    const template = objectDefinitions[kind].artwork![0];
    const paths: ReturnType<typeof vec>[][] = [];
    let current: ReturnType<typeof vec>[] = [];
    r.ctx.beginPath = () => { current = []; };
    r.ctx.moveTo = r.ctx.lineTo = (x, y) => { current.push(vec(x, y)); };
    r.ctx.fill = () => { if (current.length) paths.push([...current]); };
    for (const [width, height] of [[0.8, 0.8], [1.6, 0.4]]) for (const scale of [1, 2, 3]) {
      paths.length = 0;
      const artwork = deriveArtwork(template, width, height, scale);
      const p = { ...prop(kind, artwork), body: new Body(10, 10, Infinity, width, height) };
      p.body.angle = Math.PI / 3;
      r.prop(p);
      // The real shadow and fallback both trace the same metre-space outline, with
      // no second body scale. Only the shadow receives the sun's translation.
      const resolved = artworkFor(p)!;
      expect(paths).toEqual([resolved.silhouette, resolved.silhouette]);
      expect(calls.scale ?? []).toEqual([]);
      expect(calls.rotate).toContainEqual([resolved.rotation ?? 0]);
    }
    expect(draw).not.toHaveBeenCalled();
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

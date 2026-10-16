import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtworkImages } from './images';
import { propArtwork } from './catalogue';

const bounds = { x: -12, y: -12, width: 264, height: 264 };
function canvasContext() {
  const pattern = { setTransform: vi.fn() };
  const calls = { createPattern: vi.fn((): typeof pattern | null => pattern), save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), rotate: vi.fn() };
  return { pattern, calls, ctx: calls as unknown as CanvasRenderingContext2D };
}
function browser({ failImages = false, noContext = false } = {}) {
  const images: object[] = [];
  class Image {
    naturalWidth = 768;
    naturalHeight = 384;
    onload = () => {};
    onerror = () => {};
    constructor() { images.push(this); }
    set src(_value: string) { queueMicrotask(() => failImages ? this.onerror() : this.onload()); }
  }
  const raster = canvasContext();
  const tile = { width: 0, height: 0, getContext: vi.fn(() => noContext ? null : raster.ctx) };
  const createElement = vi.fn(() => tile);
  const scale = vi.fn((x: number, y: number) => ({ x, y }));
  vi.stubGlobal('Image', Image);
  vi.stubGlobal('document', { createElement });
  vi.stubGlobal('DOMMatrix', class { scale = scale; });
  return { images, tile, raster, createElement, scale };
}
afterEach(() => vi.unstubAllGlobals());

describe('artwork image caching', () => {
  it('loads once and rasterizes the SVG before any playable ground pattern is created', async () => {
    const { images, tile, raster, createElement, scale } = browser();
    const art = new ArtworkImages(), main = canvasContext();
    art.ground(main.ctx, bounds);
    expect(main.calls.createPattern).not.toHaveBeenCalled();
    const loading = art.load();
    expect(art.load()).toBe(loading);
    await loading;
    expect(images).toHaveLength(11);
    expect(createElement).toHaveBeenCalledExactlyOnceWith('canvas');
    expect(tile).toMatchObject({ width: 768, height: 384 });
    expect(raster.calls.drawImage).toHaveBeenCalledExactlyOnceWith(images[4], 0, 0);
    for (let frame = 0; frame < 30; frame++) art.ground(main.ctx, bounds);
    // Passing the live SVG image here regresses the entire GPU world/lighting compositor.
    expect(main.calls.createPattern).toHaveBeenCalledExactlyOnceWith(tile, 'repeat');
    expect(scale).toHaveBeenCalledExactlyOnceWith(48 / 768, 48 / 384);
    expect(main.pattern.setTransform).toHaveBeenCalledExactlyOnceWith({ x: 48 / 768, y: 48 / 384 });
    expect(main.calls.fillRect).toHaveBeenCalledTimes(30);
    expect(main.calls.fillRect).toHaveBeenLastCalledWith(-12, -12, 264, 264);
    expect(raster.calls.drawImage).toHaveBeenCalledTimes(1);
    await art.load();
    expect(createElement).toHaveBeenCalledTimes(1);
  });

  it('shares the raster tile, but not context-owned patterns, with editor/preview canvases', async () => {
    const { tile, createElement } = browser();
    const art = new ArtworkImages(), game = canvasContext(), preview = canvasContext();
    await art.load();
    for (const ctx of [game.ctx, preview.ctx, game.ctx, preview.ctx]) art.ground(ctx, bounds);
    expect(game.calls.createPattern).toHaveBeenCalledExactlyOnceWith(tile, 'repeat');
    expect(preview.calls.createPattern).toHaveBeenCalledExactlyOnceWith(tile, 'repeat');
    expect(createElement).toHaveBeenCalledTimes(1);
  });

  it.each([{ failImages: true }, { noContext: true }])('keeps procedural ground on load/raster failure: %j', async options => {
    browser(options);
    const art = new ArtworkImages(), main = canvasContext();
    await art.load();
    art.ground(main.ctx, bounds);
    expect(main.calls.createPattern).not.toHaveBeenCalled();
    expect(main.calls.fillRect).not.toHaveBeenCalled();
  });

  it('leaves PNG sprites, their bounds and rotation intact', async () => {
    const { images } = browser();
    const art = new ArtworkImages(), main = canvasContext();
    expect(art.draw(main.ctx, propArtwork.shopRust)).toBe(false);
    await art.load();
    expect(art.has('shop-rust')).toBe(true);
    expect(art.draw(main.ctx, propArtwork.shopRust)).toBe(true);
    expect(main.calls.drawImage).toHaveBeenCalledExactlyOnceWith(images[1], -5.3, -5.3, 10.6, 10.6);
    expect(main.calls.rotate).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('does not cache a failed pattern creation or fall back to the live SVG', async () => {
    const { tile } = browser();
    const art = new ArtworkImages(), main = canvasContext();
    await art.load();
    main.calls.createPattern.mockReturnValueOnce(null);
    art.ground(main.ctx, bounds);
    expect(main.calls.fillRect).not.toHaveBeenCalled();
    art.ground(main.ctx, bounds);
    art.ground(main.ctx, bounds);
    expect(main.calls.createPattern).toHaveBeenCalledTimes(2);
    expect(main.calls.createPattern.mock.calls).toEqual([[tile, 'repeat'], [tile, 'repeat']]);
    expect(main.calls.fillRect).toHaveBeenCalledTimes(2);
  });
});

import { artworkInline } from '../catalogue/generated';
import { asphaltArtwork, type ArtBounds, type PropArtwork } from './catalogue';

/** One decoded image per asset, shared by normal games and authoring previews. */
export class ArtworkImages {
  private images = new Map<string, HTMLImageElement>();
  private groundTile?: HTMLCanvasElement;
  private loading?: Promise<void>;
  private patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
  private roofTile?: HTMLCanvasElement;
  private roofPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
  load(): Promise<void> {
    return this.loading ??= Promise.all(Object.entries(artworkInline).map(([id, src]) => new Promise<void>(resolve => {
      const image = new Image();
      image.onload = () => { this.images.set(id, image); resolve(); };
      // Individual failures retain procedural fallback artwork, including in offline builds.
      image.onerror = () => resolve();
      image.src = src;
    }))).then(() => {
      const image = this.images.get(asphaltArtwork.image);
      if (!image) return;
      // A live SVG repeat pattern can demote Chrome's world canvas to software rendering,
      // making even the lighting canvas uploads stall. Rasterize once, never in a frame.
      const tile = document.createElement('canvas');
      tile.width = image.naturalWidth; tile.height = image.naturalHeight;
      const c = tile.getContext('2d');
      if (!c) return; // Keep the procedural ground if rasterization is unavailable.
      c.drawImage(image, 0, 0);
      this.groundTile = tile;
    });
  }
  has(id: string): boolean { return this.images.has(id); }
  /** Reuse the existing tar roof's bare membrane at metre scale. Crop out its
   * shop fixtures; enlarged buildings draw their own human-scale equipment. */
  roof(c: CanvasRenderingContext2D, bounds: ArtBounds): void {
    const image = this.images.get('shop-tar');
    if (!image) return;
    if (!this.roofTile) {
      const tile = document.createElement('canvas'); tile.width = 100; tile.height = 80;
      const ctx = tile.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(image, 40, 112, 100, 80, 0, 0, 100, 80); this.roofTile = tile;
    }
    let pattern = this.roofPatterns.get(c);
    if (!pattern) {
      pattern = c.createPattern(this.roofTile, 'repeat') ?? undefined;
      if (!pattern) return;
      pattern.setTransform(new DOMMatrix().scale(0.05, 0.05));
      this.roofPatterns.set(c, pattern);
    }
    c.save(); c.globalAlpha *= 0.38; c.fillStyle = pattern;
    c.fillRect(bounds.x, bounds.y, bounds.width, bounds.height); c.restore();
  }
  draw(c: CanvasRenderingContext2D, art: PropArtwork): boolean {
    const image = this.images.get(art.image);
    if (!image) return false;
    const b = art.bounds;
    c.save(); c.rotate(art.rotation ?? 0);
    const source = art.source;
    if (source) c.drawImage(image, source.x, source.y, source.width, source.height, b.x, b.y, b.width, b.height);
    else c.drawImage(image, b.x, b.y, b.width, b.height);
    c.restore();
    return true;
  }
  /** World-anchored variants: camera movement never changes the chosen tile.
   * SVG sources are rasterized once so world draws stay on the bitmap fast path. */
  private grassTiles?: HTMLCanvasElement[];
  grass(c: CanvasRenderingContext2D, bounds: ArtBounds): void {
    if (!this.grassTiles) {
      const sources = ['short', 'lush', 'clover', 'daisies', 'dry', 'tufts'].map(name => this.images.get(`grass-${name}`));
      if (sources.some(source => !source)) return;
      this.grassTiles = sources.map(source => {
        const tile = document.createElement('canvas'); tile.width = tile.height = 128;
        tile.getContext('2d')?.drawImage(source!, 0, 0, 128, 128); return tile;
      });
    }
    const size = 4, tiles = this.grassTiles;
    for (let y = Math.floor(bounds.y / size); y < Math.ceil((bounds.y + bounds.height) / size); y++)
      for (let x = Math.floor(bounds.x / size); x < Math.ceil((bounds.x + bounds.width) / size); x++) {
        const hash = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
        c.drawImage(tiles[hash % tiles.length], x * size, y * size, size, size);
      }
  }
  ground(c: CanvasRenderingContext2D, bounds: ArtBounds): void {
    const tile = this.groundTile;
    if (!tile) return;
    let pattern = this.patterns.get(c);
    if (!pattern) {
      pattern = c.createPattern(tile, 'repeat') ?? undefined;
      if (!pattern) return;
      const size = asphaltArtwork.tileMetres;
      pattern.setTransform(new DOMMatrix().scale(size / tile.width, size / tile.height));
      this.patterns.set(c, pattern);
    }
    c.save(); c.globalAlpha = 0.7; c.fillStyle = pattern;
    c.fillRect(bounds.x, bounds.y, bounds.width, bounds.height); c.restore();
  }
}
export const artworkImages = new ArtworkImages();

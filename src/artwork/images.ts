import workshop from '../assets/map/workshop.png?inline';
import tenement from '../assets/map/tenement.png?inline';
import courtyard from '../assets/map/courtyard.png?inline';
import copper from '../assets/map/copper.png?inline';
import limestone from '../assets/map/limestone.png?inline';
import pavilion from '../assets/map/pavilion.png?inline';
import shopTar from '../assets/map/shop-tar.png?inline';
import shopRust from '../assets/map/shop-rust.png?inline';
import shopConcrete from '../assets/map/shop-concrete.png?inline';
import tree from '../assets/map/tree-worn.png?inline';
import asphalt from '../assets/map/asphalt.svg?inline';
import { asphaltArtwork, type ArtBounds, type PropArtwork } from './catalogue';

/** One decoded image per asset, shared by normal games and editor previews. */
export class ArtworkImages {
  private images = new Map<string, HTMLImageElement>();
  private groundTile?: HTMLCanvasElement;
  private loading?: Promise<void>;
  private patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
  load(): Promise<void> {
    return this.loading ??= Promise.all(Object.entries({ 'shop-tar': shopTar, 'shop-rust': shopRust, 'shop-concrete': shopConcrete, 'tree-worn': tree, asphalt, workshop, tenement, courtyard, copper, limestone, pavilion }).map(([id, src]) => new Promise<void>(resolve => {
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
  draw(c: CanvasRenderingContext2D, art: PropArtwork): boolean {
    const image = this.images.get(art.image);
    if (!image) return false;
    const b = art.bounds;
    c.save(); c.rotate(art.rotation ?? 0);
    if (art.clip) {
      c.beginPath(); art.silhouette.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.clip();
      // A solid roof undercoat keeps image edge alpha inside the exact physical footprint.
      c.fillStyle = '#716e60'; c.fill();
    }
    c.drawImage(image, b.x, b.y, b.width, b.height); c.restore();
    return true;
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

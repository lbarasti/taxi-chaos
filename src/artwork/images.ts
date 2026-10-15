import shopTar from '../assets/map/shop-tar.png?inline';
import shopRust from '../assets/map/shop-rust.png?inline';
import shopConcrete from '../assets/map/shop-concrete.png?inline';
import tree from '../assets/map/tree-worn.png?inline';
import asphalt from '../assets/map/asphalt.svg?inline';
import { asphaltArtwork, type ArtBounds, type PropArtwork } from './catalogue';

/** One decoded image per asset, shared by normal games and editor previews. */
export class ArtworkImages {
  private images = new Map<string, HTMLImageElement>();
  private loading?: Promise<void>;
  private patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
  load(): Promise<void> {
    return this.loading ??= Promise.all(Object.entries({ 'shop-tar': shopTar, 'shop-rust': shopRust, 'shop-concrete': shopConcrete, 'tree-worn': tree, asphalt }).map(([id, src]) => new Promise<void>(resolve => {
      const image = new Image();
      image.onload = () => { this.images.set(id, image); resolve(); };
      // Individual failures retain procedural fallback artwork, including in offline builds.
      image.onerror = () => resolve();
      image.src = src;
    }))).then(() => {});
  }
  has(id: string): boolean { return this.images.has(id); }
  draw(c: CanvasRenderingContext2D, art: PropArtwork): boolean {
    const image = this.images.get(art.image);
    if (!image) return false;
    const b = art.bounds;
    c.save(); c.rotate(art.rotation ?? 0);
    c.drawImage(image, b.x, b.y, b.width, b.height); c.restore();
    return true;
  }
  ground(c: CanvasRenderingContext2D, bounds: ArtBounds): void {
    const image = this.images.get(asphaltArtwork.image);
    if (!image) return;
    let pattern = this.patterns.get(c);
    if (!pattern) {
      pattern = c.createPattern(image, 'repeat') ?? undefined;
      if (!pattern) return;
      const size = asphaltArtwork.tileMetres;
      pattern.setTransform(new DOMMatrix().scale(size / image.naturalWidth, size / image.naturalHeight));
      this.patterns.set(c, pattern);
    }
    c.save(); c.globalAlpha = 0.7; c.fillStyle = pattern;
    c.fillRect(bounds.x, bounds.y, bounds.width, bounds.height); c.restore();
  }
}
export const artworkImages = new ArtworkImages();

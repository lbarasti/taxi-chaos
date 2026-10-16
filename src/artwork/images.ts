import shopTar from '../assets/map/shop-tar.png?inline';
import shopRust from '../assets/map/shop-rust.png?inline';
import shopConcrete from '../assets/map/shop-concrete.png?inline';
import treeWorn from '../assets/map/tree-worn.png?inline';
import shopHavana from '../assets/map/shop-havana.svg?inline';
import shopMarket from '../assets/map/shop-market.svg?inline';
import shopWalkup from '../assets/map/shop-walkup.svg?inline';
import shopArtDeco from '../assets/map/shop-art-deco.svg?inline';
import shopCondo from '../assets/map/shop-condo.svg?inline';
import shopCourtyard from '../assets/map/shop-courtyard.svg?inline';
import shopLoft from '../assets/map/shop-loft.svg?inline';
import shopShipyard from '../assets/map/shop-shipyard.svg?inline';
import shopRenovation from '../assets/map/shop-renovation.svg?inline';
import civicBarracks from '../assets/map/civic-barracks.svg?inline';
import freightDepot from '../assets/map/freight-depot.svg?inline';
import fuelStation from '../assets/map/fuel-station.svg?inline';
import villaTile from '../assets/map/villa-tile.svg?inline';
import villaGlass from '../assets/map/villa-glass.svg?inline';
import villaAnnex from '../assets/map/villa-annex.svg?inline';
import fairwayClub from '../assets/map/fairway-club.svg?inline';
import portOffice from '../assets/map/port-office.svg?inline';
import bondedWarehouse from '../assets/map/bonded-warehouse.svg?inline';
import hotelSandpiper from '../assets/map/hotel-sandpiper.svg?inline';
import hotelPacific from '../assets/map/hotel-pacific.svg?inline';
import hotelSunset from '../assets/map/hotel-sunset.svg?inline';
import asphalt from '../assets/map/asphalt.svg?inline';
import { asphaltArtwork, type ArtBounds, type ArtImageId, type PropArtwork } from './catalogue';

const sources: Record<ArtImageId | typeof asphaltArtwork.image, string> = {
  'shop-tar': shopTar,
  'shop-rust': shopRust,
  'shop-concrete': shopConcrete,
  'tree-worn': treeWorn,
  'shop-havana': shopHavana,
  'shop-market': shopMarket,
  'shop-walkup': shopWalkup,
  'shop-art-deco': shopArtDeco,
  'shop-condo': shopCondo,
  'shop-courtyard': shopCourtyard,
  'shop-loft': shopLoft,
  'shop-shipyard': shopShipyard,
  'shop-renovation': shopRenovation,
  'civic-barracks': civicBarracks,
  'freight-depot': freightDepot,
  'fuel-station': fuelStation,
  'villa-tile': villaTile,
  'villa-glass': villaGlass,
  'villa-annex': villaAnnex,
  'fairway-club': fairwayClub,
  'port-office': portOffice,
  'bonded-warehouse': bondedWarehouse,
  'hotel-sandpiper': hotelSandpiper,
  'hotel-pacific': hotelPacific,
  'hotel-sunset': hotelSunset,
  asphalt,
};

/** Decodes assets before play and shares images with editor previews. */
export class ArtworkImages {
  private images = new Map<string, HTMLImageElement | HTMLCanvasElement>();
  private groundTile?: HTMLCanvasElement;
  private loading?: Promise<void>;
  private patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
  load(): Promise<void> {
    return this.loading ??= Promise.all(Object.entries(sources).map(([id, src]) => new Promise<void>(resolve => {
      const image = new Image();
      image.onload = () => {
        if (id !== asphaltArtwork.image && src.startsWith('data:image/svg+xml')) {
          // One raster per distinct vector roof, before any playable frame.
          // Avoid passing live, filtered SVG images to the accelerated world canvas.
          const raster = document.createElement('canvas');
          raster.width = image.naturalWidth; raster.height = image.naturalHeight;
          const c = raster.getContext('2d');
          if (c && raster.width > 0 && raster.height > 0) {
            try { c.drawImage(image, 0, 0); this.images.set(id, raster); }
            catch { /* Unsupported SVG filters retain the old procedural roof. */ }
          }
        } else this.images.set(id, image);
        resolve();
      };
      // Bad or unsupported sprites fail independently; the renderer retains its procedural art.
      image.onerror = () => resolve();
      image.src = src;
    }))).then(() => {
      const image = this.images.get(asphaltArtwork.image);
      if (!image) return;
      // A live SVG repeat pattern can demote Chrome's world canvas to software rendering.
      // Rasterize once before the first frame; no SVG image may reach createPattern.
      const tile = document.createElement('canvas');
      tile.width = image.naturalWidth; tile.height = image.naturalHeight;
      const c = tile.getContext('2d');
      if (!c) return;
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

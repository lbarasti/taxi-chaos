import { vec, type Vec } from '../physics';

/** All coordinates are metres, relative to the collision body's centre. */
export type ArtBounds = Readonly<{ x: number; y: number; width: number; height: number }>;
export type PropArtwork = Readonly<{
  image: 'shop-tar' | 'shop-rust' | 'shop-concrete' | 'tree-worn' | 'hospital-roof';
  layer: 'structure';
  bounds: ArtBounds;
  /** Optional pixel crop removes export padding without changing the source PNG. */
  source?: ArtBounds;
  rotation?: number;
  /** Convex silhouette for sun shadows; optional outline for blocking directed light. */
  silhouette: readonly Vec[];
  occluder?: readonly Vec[];
}>;
export type ArtProp = { id?: number; sourceId?: string; kind: string; body: { position: Vec; angle?: number; w: number; h: number }; building?: { artwork?: PropArtwork } };
const shopOutline = [vec(-5.3, -5.3), vec(5.3, -5.3), vec(5.3, 5.3), vec(-5.3, 5.3)];
const shop = { layer: 'structure', bounds: { x: -5.3, y: -5.3, width: 10.6, height: 10.6 }, silhouette: shopOutline, occluder: shopOutline } as const;
const hospitalOutline = [vec(-13.3, -33.3), vec(13.3, -33.3), vec(13.3, 33.3), vec(-13.3, 33.3)];
export const propArtwork = {
  shop: { ...shop, image: 'shop-tar' },
  shopRust: { ...shop, image: 'shop-rust' },
  shopConcrete: { ...shop, image: 'shop-concrete' },
  hospital: { image: 'hospital-roof', layer: 'structure', bounds: { x: -13.3, y: -33.3, width: 26.6, height: 66.6 }, source: { x: 33, y: 16, width: 726, height: 1951 }, silhouette: hospitalOutline, occluder: hospitalOutline },
  tree: { image: 'tree-worn', layer: 'structure', bounds: { x: -2.6, y: -2.6, width: 5.2, height: 5.2 }, silhouette: Array.from({ length: 12 }, (_, i) => vec(Math.cos(i * Math.PI / 6) * 2.4, Math.sin(i * Math.PI / 6) * 2.4)) },
} as const satisfies Record<string, PropArtwork>;
const shops = [propArtwork.shop, propArtwork.shopRust, propArtwork.shopConcrete];
const trees = Array.from({ length: 4 }, (_, i) => ({ ...propArtwork.tree, rotation: i * Math.PI / 2 }));
export const asphaltArtwork = { image: 'asphalt', layer: 'ground', tileMetres: 48 } as const;

/** Appearance uses stable identity, never the simulation's random stream or display labels. */
export function appearanceSeed(identity: string): number {
  let seed = 2166136261;
  for (let i = 0; i < identity.length; i++) seed = Math.imul(seed ^ identity.charCodeAt(i), 16777619);
  return seed >>> 0;
}
export function artworkFor(prop: ArtProp): PropArtwork | undefined {
  if (prop.kind === 'building' && prop.building) return prop.building.artwork;
  const { position: p, w, h } = prop.body;
  if (p.x < 0 || p.x > 240 || p.y < 0 || p.y > 240) return;
  const seed = appearanceSeed(prop.sourceId ?? String(prop.id ?? `${p.x},${p.y}`));
  if (prop.kind === 'building' && w === 10 && h === 10) return shops[seed % shops.length];
  if (prop.kind === 'tree') return trees[seed % trees.length];
}
export function artRadius(prop: ArtProp): number {
  const b = artworkFor(prop)?.bounds;
  // Include the maximum sun displacement, so off-screen canopies keep their shadows.
  const radius = b ? Math.hypot(Math.max(Math.abs(b.x), Math.abs(b.x + b.width)), Math.max(Math.abs(b.y), Math.abs(b.y + b.height))) + 3 : 0;
  return Math.max(prop.body.w, prop.body.h, radius);
}

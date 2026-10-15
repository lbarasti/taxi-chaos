import { vec, type Vec } from '../physics';

/** All coordinates are metres, relative to the collision body's centre. */
export type ArtBounds = Readonly<{ x: number; y: number; width: number; height: number }>;
export type PropArtwork = Readonly<{
  image: 'shop' | 'tree';
  layer: 'structure';
  bounds: ArtBounds;
  /** Convex silhouette for sun shadows; optional outline for blocking directed light. */
  silhouette: readonly Vec[];
  occluder?: readonly Vec[];
}>;
export type ArtProp = { kind: string; body: { position: Vec; angle?: number; w: number; h: number } };
const shopOutline = [vec(-5.3, -5.3), vec(5.3, -5.3), vec(5.3, 5.3), vec(-5.3, 5.3)];
export const propArtwork = {
  shop: { image: 'shop', layer: 'structure', bounds: { x: -5.3, y: -5.3, width: 10.6, height: 10.6 }, silhouette: shopOutline, occluder: shopOutline },
  tree: { image: 'tree', layer: 'structure', bounds: { x: -2.6, y: -2.6, width: 5.2, height: 5.2 }, silhouette: Array.from({ length: 12 }, (_, i) => vec(Math.cos(i * Math.PI / 6) * 2.4, Math.sin(i * Math.PI / 6) * 2.4)) },
} as const satisfies Record<string, PropArtwork>;
export const asphaltArtwork = { image: 'asphalt', layer: 'ground', tileMetres: 4 } as const;

/** Initial defaults only. No label-based appearance, map migration or physics changes. */
export function artworkFor(prop: ArtProp): PropArtwork | undefined {
  const { position: p, w, h } = prop.body;
  if (p.x < 0 || p.x > 240 || p.y < 0 || p.y > 240) return;
  if (prop.kind === 'building' && w === 10 && h === 10) return propArtwork.shop;
  if (prop.kind === 'tree') return propArtwork.tree;
}
export function artRadius(prop: ArtProp): number {
  const b = artworkFor(prop)?.bounds;
  // Include the maximum sun displacement, so off-screen canopies keep their shadows.
  const radius = b ? Math.hypot(Math.max(Math.abs(b.x), Math.abs(b.x + b.width)), Math.max(Math.abs(b.y), Math.abs(b.y + b.height))) + 3 : 0;
  return Math.max(prop.body.w, prop.body.h, radius);
}

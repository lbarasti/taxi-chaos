import { vec, type Vec } from '../physics';
import { artworkRecords, objectRecords } from '../catalogue/content';
import { artworkSources } from '../catalogue/generated';
import { appearanceSeed, compileArtworkCatalogue, compileObjectCatalogue, deriveArtwork, scaleArtwork } from '../catalogue/compile';
import type { ArtBounds, PropArtwork } from '../catalogue/schema';

export type { ArtBounds, PropArtwork } from '../catalogue/schema';
export { appearanceSeed, scaleArtwork };

/** Compiled once from the authored records in `src/catalogue/content.ts`; shared by
 * normal games and editor previews. Legacy records keep absolute prop geometry;
 * object records expose a default-footprint view of their normalized templates. */
const catalogue = compileArtworkCatalogue(artworkRecords, artworkSources);
const objects = compileObjectCatalogue(objectRecords, artworkSources, artworkRecords);
const objectArtwork: Record<string, PropArtwork> = Object.fromEntries(Object.entries(objects).flatMap(([id, definition]) => {
  const template = definition.artwork?.[0];
  // Only direct images add a new drawn image ID; variant-based types reuse legacy IDs.
  return template && template.image === id ? [[id, deriveArtwork(template, definition.width, definition.height, definition.artworkScale ?? 1)] as const] : [];
}));
export const propArtwork: Readonly<Record<string, PropArtwork>> = { ...catalogue.structures, ...objectArtwork };
export const asphaltArtwork = catalogue.ground.asphalt;

export type ArtProp = { id?: number; sourceId?: string; kind: string; body: { position: Vec; angle?: number; w: number; h: number }; artwork?: PropArtwork; building?: { artwork?: PropArtwork } };

const shops = [propArtwork['shop-tar'], propArtwork['shop-rust'], propArtwork['shop-concrete']];
const trees = Array.from({ length: 4 }, (_, i) => ({ ...propArtwork['tree-worn'], rotation: i * Math.PI / 2 }));

export function artworkFor(prop: ArtProp): PropArtwork | undefined {
  if (prop.artwork) return prop.artwork;
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

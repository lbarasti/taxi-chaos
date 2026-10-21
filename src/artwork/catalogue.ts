import { vec, type Vec } from '../physics/physics';
import { artworkRecords, objectRecords } from '../catalogue/content';
import { artworkSources } from '../catalogue/generated';
import { appearanceSeed, compileArtworkCatalogue, compileObjectCatalogue, deepFreeze, deriveArtwork, scaleArtwork } from '../catalogue/compile';
import type { ArtBounds, ArtworkRenderOrder, ObjectCatalogue, PropArtwork } from '../catalogue/schema';

export type { ArtBounds, PropArtwork } from '../catalogue/schema';
export { appearanceSeed, scaleArtwork };

/** Compiled once from the authored records in `src/catalogue/content.ts`; shared by
 * normal games and authoring previews. Legacy records keep absolute prop geometry;
 * object records expose a default-footprint view of their normalized templates. */
const catalogue = compileArtworkCatalogue(artworkRecords, artworkSources);
/** Every object type (buildings and props). Map placements and the world resolve
 * their footprint/artwork through this single generic catalogue. */
export const objectDefinitions: ObjectCatalogue = compileObjectCatalogue(objectRecords, artworkSources, artworkRecords);
const objectArtwork: Record<string, PropArtwork> = Object.fromEntries(Object.entries(objectDefinitions).flatMap(([id, definition]) => {
  const template = definition.artwork?.[0];
  // Only direct images add a new drawn image ID; variant-based types reuse legacy IDs.
  return template && template.image === id ? [[id, deriveArtwork(template, definition.width, definition.height, definition.artworkScale ?? 1)] as const] : [];
}));
export const propArtwork: Readonly<Record<string, PropArtwork>> = { ...catalogue.structures, ...objectArtwork };
export const asphaltArtwork = catalogue.ground.asphalt;

export type ArtProp = { id?: number; sourceId?: string; kind: string; body: { position: Vec; angle?: number; w: number; h: number }; artwork?: PropArtwork; building?: { artwork?: PropArtwork } };

/** Extent in metres of the procedural crate sprite, which the fallback draws at ±0.7 m. */
export const CRATE_SPRITE_METRES = 1.4;
/** The compiled `tree` artwork and the procedural canopy are authored at this extent
 * around the type's default body, so the two drawing paths stay in step. */
export const TREE_CANOPY_METRES = 5.2;

const shops = [propArtwork['shop-tar'], propArtwork['shop-rust'], propArtwork['shop-concrete']];

/** Existing-behaviour tree artwork comes from the generic object compiler at the
 * prop's actual footprint, so resizing the body scales the canopy, shadow silhouette
 * and culling radius. The four deterministic orientations remain a kind mechanic.
 *
 * Procedural city/countryside trees resolve this every frame. Cache the derived
 * template on the prop's own body (a WeakMap, so lifetime is bounded by the world)
 * and invalidate it only when that body's finite size changes. The cached geometry is
 * deep-frozen, so a caller can never mutate another frame's canopy; no string cache and
 * no shared mutable geometry: `deriveArtwork` still returns a detached outline. */
const treeArtworkCache = new WeakMap<object, { width: number; height: number; artwork?: PropArtwork }>();
function treeArtwork(body: object, w: number, h: number): PropArtwork | undefined {
  const cached = treeArtworkCache.get(body);
  if (cached && cached.width === w && cached.height === h) return cached.artwork;
  const template = objectDefinitions.tree?.artwork?.[0];
  const artwork = template ? deepFreeze(deriveArtwork(template, w, h, objectDefinitions.tree.artworkScale ?? 1)) : undefined;
  treeArtworkCache.set(body, { width: w, height: h, artwork });
  return artwork;
}

export function artworkFor(prop: ArtProp): PropArtwork | undefined {
  // The four deterministic tree orientations are a kind mechanic applied to both typed
  // and procedural trees. Appearance uses stable identity, never the simulation RNG.
  const rotation = (seed: number) => (seed % 4) * Math.PI / 2;
  if (prop.artwork) return prop.kind === 'tree' ? { ...prop.artwork, rotation: rotation(appearanceSeed(prop.sourceId ?? String(prop.id ?? ''))) } : prop.artwork;
  if (prop.kind === 'building' && prop.building) return prop.building.artwork;
  const { position: p, w, h } = prop.body;
  if (p.x < 0 || p.x > 240 || p.y < 0 || p.y > 240) return;
  const seed = appearanceSeed(prop.sourceId ?? String(prop.id ?? `${p.x},${p.y}`));
  if (prop.kind === 'building' && w === 10 && h === 10) return shops[seed % shops.length];
  if (prop.kind === 'tree') {
    const art = treeArtwork(prop.body, w, h);
    return art && { ...art, rotation: rotation(seed) };
  }
}

/** Resolved artwork owns its order, including its compiled below-actors default.
 * Only scenery without resolved artwork shares its kind's authored draw order.
 * Countryside trees retain their procedural needles while their canopy and shadow
 * use the same overhead pass as park trees and palms. */
export function renderOrderFor(prop: ArtProp): ArtworkRenderOrder {
  const art = artworkFor(prop);
  if (art) return art.renderOrder ?? 'below-actors';
  return objectDefinitions[prop.kind]?.artwork?.[0]?.renderOrder
    ?? 'below-actors';
}

export function artRadius(prop: ArtProp): number {
  const b = artworkFor(prop)?.bounds;
  // The thin flag collider anchors a much taller procedural pole and fallen pennant.
  const flag = objectDefinitions['golf-flag'];
  const flagRadius = prop.kind === 'golf-flag' ? 1.6 * Math.max(prop.body.w / flag.width, prop.body.h / flag.height) : 0;
  // Include the maximum sun displacement, so off-screen canopies keep their shadows.
  const radius = b ? Math.hypot(Math.max(Math.abs(b.x), Math.abs(b.x + b.width)), Math.max(Math.abs(b.y), Math.abs(b.y + b.height))) + 3 : 0;
  return Math.max(prop.body.w, prop.body.h, radius, flagRadius);
}

/** Scale for the procedural crate/tree fallback drawn when a prop carries no decoded PNG
 * (missing image, or a failed decode). The drawn geometry follows the resolved prop so it
 * never disagrees with the collider: a crate is drawn to its resolved body, and a tree
 * canopy follows the resolved typed artwork extent, or the same normalized ratio from the
 * body. Geometry only; it never touches the physics body or the RNG stream. */
export function fallbackScale(prop: ArtProp): Vec {
  const { w, h } = prop.body;
  if (prop.kind === 'crate') return vec(w / CRATE_SPRITE_METRES, h / CRATE_SPRITE_METRES);
  if (prop.kind !== 'tree') return vec(1, 1);
  const canopy = prop.artwork?.bounds.width ?? w * TREE_CANOPY_METRES / objectDefinitions.tree.width;
  return vec(canopy / TREE_CANOPY_METRES, canopy / TREE_CANOPY_METRES);
}

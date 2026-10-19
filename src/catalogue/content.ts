import type { ArtworkRecord, BuildingSign, KindRegistry, ObjectRecord } from './schema';

/** Shared images that still own absolute geometry (standalone props, ground tiles)
 * or are reused as stable variants by several types. An ordinary single-image type
 * needs no entry here: put its `image` path directly on the object record.
 *
 * Order is the inline-manifest order, so it must stay stable. */
export const artworkRecords: readonly ArtworkRecord[] = [
  { id: 'shop-tar', png: 'map/shop-tar.png', layer: 'structure', metres: 10.6, silhouette: 'bounds', occluder: true },
  { id: 'shop-rust', png: 'map/shop-rust.png', layer: 'structure', metres: 10.6, silhouette: 'bounds', occluder: true },
  { id: 'shop-concrete', png: 'map/shop-concrete.png', layer: 'structure', metres: 10.6, silhouette: 'bounds', occluder: true },
  { id: 'tree-worn', png: 'map/tree-worn.png', layer: 'structure', metres: 5.2, silhouette: { shape: 'circle', radius: 2.4 } },
  { id: 'asphalt', png: 'map/asphalt.svg', layer: 'ground', tileMetres: 48 },
];

const commercialSign: BuildingSign = { width: 14, inset: 1.72, size: 0.78, color: '#eadab8' };
const hotelSign: BuildingSign = { width: 12, inset: 1.2, size: 0.8, color: '#f0e6ce' };
// The condo predates the shared sign data and used the generic south-face label
// (`width 8.6`, `inset 0.95`, `size 0.72`). Keep that exact look as a per-type override
// instead of inheriting the hotel sign, so migrating the condo onto the catalogue does
// not silently restyle the two shipped residences.
const condoSign: BuildingSign = { width: 8.6, inset: 0.95, size: 0.72, color: '#f0dfae' };

/** Reusable object types. An ordinary new type is one record: its direct image path
 * and normalized art geometry live here, next to its footprint and fallback. The
 * generated inline manifest and measured crop follow from `image` automatically.
 * Geometry factors are relative to the resolved footprint, so changing a default
 * size or instance override moves collision and artwork together.
 *
 * `as const` keeps the authored IDs literal, so `BuildingType` remains a checked union
 * rather than collapsing to `string`. */
export const objectRecords = [
  { id: 'coastal-guardrail', kind: 'guardrail', width: 8, height: 0.8 },
  {
    id: 'shop', kind: 'building', width: 10, height: 10, storeys: 2,
    fallback: 'shop',
    sign: { width: 8.6, inset: 0.95, size: 0.72, color: '#f0dfae' },
    variants: ['shop-tar', 'shop-rust', 'shop-concrete'],
    artwork: { fit: 'stretch', width: 10.6 / 10, height: 10.6 / 10, outline: 'bounds', occluder: true },
  },
  { id: 'commercial', kind: 'building', width: 23, height: 10, storeys: 4, fallback: 'commercial', sign: commercialSign },
  { id: 'landmark', kind: 'building', width: 23, height: 23, storeys: 8, fallback: 'terraced', sign: commercialSign },
  {
    id: 'hospital', kind: 'building', width: 26, height: 66, storeys: 8,
    fallback: 'wards',
    sign: { width: 14, inset: 1.4, size: 0.9, color: '#f0dfae' },
    image: 'map/hospital-structure.png',
    artwork: { fit: 'stretch', width: 26.6 / 26, height: 66.6 / 66, outline: 'bounds', occluder: true },
  },
  // Beach hotels. `frontage`/`apron`/`sign` keep entrance signage and ground
  // treatments in data, so renderers carry no hotel- or condo-specific branches.
  {
    id: 'condo', kind: 'building', width: 14, height: 13, storeys: 12,
    fallback: 'commercial', sign: condoSign, frontage: 'RESIDENTS ONLY',
    image: 'map/luxury-condo.png',
    // The supplied sheet keeps its lawn edges, so the authored crop is wider than
    // the measured transparent padding.
    crop: { x: 100, y: 60, width: 1055, height: 1090 },
    artwork: { fit: 'stretch', width: 14.3 / 14, height: 13.3 / 13, outline: 'bounds', occluder: true, castsShadow: false },
  },
  {
    id: 'hotel', kind: 'building', width: 33, height: 11, storeys: 14,
    fallback: 'resort', sign: hotelSign, frontage: 'GUESTS ONLY', apron: 'PRIVATE FRONTAGE',
  },
  // Representative ordinary single-image building. `map/bakery-front.png` is the
  // genuine committed art; the type itself is all the catalogue needs. The authoring
  // fixture in tools/examples supplies placements without changing this default map.
  {
    id: 'bakery', kind: 'building', width: 12, height: 8, storeys: 3,
    fallback: 'shop',
    sign: { width: 9, inset: 1, size: 0.7, color: '#ffeedd' },
    image: 'map/bakery-front.png',
    artwork: { fit: 'stretch', width: 12.6 / 12, height: 8.4 / 8, outline: 'bounds', occluder: true },
  },
  // Representative existing-behaviour props. The tree reuses shared artwork with a
  // normalized outline; the crate has no imported art and keeps procedural drawing.
  {
    id: 'tree', kind: 'tree', width: 1.8, height: 1.8,
    variants: ['tree-worn'],
    artwork: { fit: 'stretch', width: 5.2 / 1.8, height: 5.2 / 1.8, outline: { shape: 'circle', radius: 2.4 / 2.6 } },
  },
  { id: 'crate', kind: 'crate', width: 1.4, height: 1.4 },
  // A representative prop kind that already has a procedural district renderer: a typed
  // placement draws this decoded PNG instead of the beach pass, so the generic artwork
  // dispatch is exercised by real committed art with no engine change. Original pixel art.
  {
    id: 'palm', kind: 'palm', width: 0.8, height: 0.8,
    image: 'map/palm-canopy.png',
    artwork: { fit: 'stretch', width: 6 / 0.8, height: 6 / 0.8, outline: { shape: 'circle', radius: 1 } },
  },
  // A representative single-image crate whose original pixel art is committed at
  // `map/crate-shipping.png` (not an alias of an existing sprite) and attributed in
  // `src/assets/ATTRIBUTION.md`.
  { id: 'shipping-crate', kind: 'crate', width: 1.8, height: 1.8, image: 'map/crate-shipping.png' },
  { id: 'lifeguard-tower', kind: 'lifeguard-tower', width: 4.6, height: 4.2 },
  { id: 'parasol', kind: 'parasol', width: 3.4, height: 3.4 },
  { id: 'beach-chair', kind: 'beach-chair', width: 1.1, height: 2.4 },
  { id: 'sandcastle', kind: 'sandcastle', width: 1.8, height: 1.6 },
  { id: 'bollard', kind: 'bollard', width: 0.6, height: 0.6 },
  { id: 'promenade-edge', kind: 'promenade-edge', width: 4, height: 0.6 },
  { id: 'pedestrian-gate', kind: 'pedestrian-gate', width: 4.8, height: 0.6 },
  { id: 'lamp', kind: 'lamp', width: 0.6, height: 0.6 },
  { id: 'bench', kind: 'bench', width: 2.4, height: 0.75 },
  { id: 'kiosk', kind: 'kiosk', width: 4, height: 2.8 },
] as const satisfies readonly ObjectRecord[];

/** Type identity → behaviour kind for strict, asset-free map import validation. */
export const objectKinds: KindRegistry = Object.fromEntries(objectRecords.map(record => [record.id, record.kind]));

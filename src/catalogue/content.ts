import { fountainRim, FOUNTAIN_RADIUS } from '../world/fountain';
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
  { id: 'tree-worn', png: 'map/tree-worn.png', layer: 'structure', renderOrder: 'above-actors', metres: 5.2, silhouette: { shape: 'circle', radius: 2.4 } },
  { id: 'grass-short', png: 'map/grass-short.svg', layer: 'ground', tileMetres: 4 },
  { id: 'grass-lush', png: 'map/grass-lush.svg', layer: 'ground', tileMetres: 4 },
  { id: 'grass-clover', png: 'map/grass-clover.svg', layer: 'ground', tileMetres: 4 },
  { id: 'grass-daisies', png: 'map/grass-daisies.svg', layer: 'ground', tileMetres: 4 },
  { id: 'grass-dry', png: 'map/grass-dry.svg', layer: 'ground', tileMetres: 4 },
  { id: 'grass-tufts', png: 'map/grass-tufts.svg', layer: 'ground', tileMetres: 4 },
  { id: 'asphalt', png: 'map/asphalt.svg', layer: 'ground', tileMetres: 48 },
  { id: 'golf-course', png: 'map/golf-course.png', layer: 'ground', tileMetres: 110 },
];

/** Compact rounded physical footprint, independent of canopy/roof artwork. */
const roundedFootprint = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos(i * Math.PI / 4) * 0.5, y: Math.sin(i * Math.PI / 4) * 0.5 }));

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
  {
    id: 'golf-clubhouse', kind: 'building', width: 5.7, height: 7.8, storeys: 1,
    fallback: 'shop', image: 'map/golf-clubhouse.png',
    sign: { width: 4, inset: 0.8, size: 0.5, color: '#f0e6ce' },
    // The packaged sprite contains only the opaque main roof, without the export halo.
    artwork: { fit: 'stretch', width: 1, height: 1, outline: 'bounds', occluder: true },
  },
  { id: 'fountain', kind: 'fountain', width: FOUNTAIN_RADIUS * 2, height: FOUNTAIN_RADIUS * 2, collision: fountainRim },
  { id: 'hydrant', kind: 'hydrant', width: 0.65, height: 0.65 },
  { id: 'bin', kind: 'bin', width: 0.85, height: 0.85 },
  { id: 'barrier', kind: 'barrier', width: 3.1, height: 0.6 },
  { id: 'shed', kind: 'shed', width: 8, height: 5 },
  { id: 'pump', kind: 'pump', width: 1.2, height: 2.4 },
  { id: 'rock', kind: 'rock', width: 4, height: 3.2, collisionPolygon: [
    { x: -0.5, y: -0.275 }, { x: -0.325, y: -0.5 }, { x: 0.225, y: -0.5 },
    { x: 0.5, y: -0.1 }, { x: 0.4, y: 0.5 }, { x: -0.25, y: 0.5 }, { x: -0.5, y: 0.2 },
  ] },
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
    // Main roof, north pavilion and west wing; the recessed sand corners are open.
    collision: [
      { x: -0.33, y: -0.42, width: 0.805, height: 0.92 },
      { x: -0.067, y: -0.5, width: 0.371, height: 0.08 },
      { x: -0.5, y: -0.372, width: 0.17, height: 0.712 },
    ],
    // Ignore faint export specks outside the directly overhead building silhouette.
    crop: { x: 89, y: 110, width: 1086, height: 1006 },
    artwork: { fit: 'stretch', width: 14.3 / 14, height: 13.3 / 13, outline: 'bounds', occluder: true, castsShadow: false },
  },
  {
    id: 'ocean-crest-condo', kind: 'building', width: 14, height: 13, storeys: 16,
    fallback: 'commercial', sign: condoSign, frontage: 'RESIDENTS ONLY',
    image: 'map/ocean-crest-condo.png',
    // Crop faint alpha specks outside the slate roof and its cream parapet.
    crop: { x: 94, y: 130, width: 1070, height: 986 },
    artwork: { fit: 'stretch', width: 14.3 / 14, height: 13.3 / 13, outline: 'bounds', occluder: true, castsShadow: false },
  },
  {
    id: 'hotel', kind: 'building', width: 33, height: 11, storeys: 14,
    fallback: 'resort', sign: hotelSign, frontage: 'GUESTS ONLY', apron: 'PRIVATE FRONTAGE',
    image: 'map/pacific-palm-hotel.png',
    artwork: { fit: 'stretch', width: 33.4 / 33, height: 11.4 / 11, outline: 'bounds', occluder: true, castsShadow: false },
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
    id: 'tree', kind: 'tree', width: 1.8, height: 1.8, collisionPolygon: roundedFootprint,
    variants: ['tree-worn'],
    artwork: { fit: 'stretch', width: 5.2 / 1.8, height: 5.2 / 1.8, outline: { shape: 'circle', radius: 2.4 / 2.6 } },
  },
  { id: 'crate', kind: 'crate', width: 1.4, height: 1.4 },
  // Overhead crown, centred directly above the upright trunk. Only the compact,
  // rounded trunk is solid; vehicles can pass underneath the overhanging fronds.
  {
    id: 'palm', kind: 'palm', width: 0.8, height: 0.8,
    collisionPolygon: roundedFootprint,
    image: 'map/palm-canopy.png',
    // Preserve the source frame: the crown is at (140, 133), so the image anchor
    // anchors that point to the trunk rather than centring the irregular leaf tips.
    crop: { x: 0, y: 0, width: 256, height: 256 },
    artwork: {
      renderOrder: 'above-actors',
      fit: 'stretch', width: 6 / 0.8, height: 6 / 0.8,
      anchor: { x: 140 / 256, y: 133 / 256 },
      // Bounded radial trace of the opaque fronds; preserve the gaps between leaves
      // instead of casting the previous solid six-metre disc onto the sand.
      outline: [
        { x: 0.4688, y: 0.0195 }, { x: 0.4535, y: 0.0731 }, { x: 0.4732, y: 0.1338 },
        { x: 0.4547, y: 0.1885 }, { x: 0.3513, y: 0.1953 }, { x: 0.3909, y: 0.2835 },
        { x: 0.3673, y: 0.3399 }, { x: 0.3013, y: 0.3511 }, { x: 0.1855, y: 0.2597 },
        { x: 0.2053, y: 0.4021 }, { x: 0.1662, y: 0.4648 }, { x: 0.1009, y: 0.4301 },
        { x: 0.0469, y: 0.4531 }, { x: -0.0041, y: 0.4068 }, { x: -0.034, y: 0.3214 },
        { x: -0.0981, y: 0.3696 }, { x: -0.1934, y: 0.4356 }, { x: -0.2385, y: 0.3914 },
        { x: -0.1796, y: 0.246 }, { x: -0.2351, y: 0.2359 }, { x: -0.3828, y: 0.2676 },
        { x: -0.3934, y: 0.2019 }, { x: -0.304, y: 0.1136 }, { x: -0.4527, y: 0.0853 },
        { x: -0.4219, y: 0.0195 }, { x: -0.2939, y: -0.0253 }, { x: -0.4285, y: -0.1079 },
        { x: -0.4187, y: -0.1733 }, { x: -0.3455, y: -0.207 }, { x: -0.2847, y: -0.2349 },
        { x: -0.2846, y: -0.3119 }, { x: -0.2504, y: -0.3678 }, { x: -0.1563, y: -0.3323 },
        { x: -0.0742, y: -0.2728 }, { x: -0.0744, y: -0.4332 }, { x: -0.0107, y: -0.4181 },
        { x: 0.0469, y: -0.4766 }, { x: 0.104, y: -0.4142 }, { x: 0.1449, y: -0.3465 },
        { x: 0.168, y: -0.2728 }, { x: 0.2598, y: -0.3492 }, { x: 0.3061, y: -0.3183 },
        { x: 0.3783, y: -0.3119 }, { x: 0.394, y: -0.2468 }, { x: 0.348, y: -0.1543 },
        { x: 0.3861, y: -0.121 }, { x: 0.4129, y: -0.0785 }, { x: 0.407, y: -0.0279 },
      ],
    },
  },
  // A representative single-image crate whose original pixel art is committed at
  // `map/crate-shipping.png` (not an alias of an existing sprite) and attributed in
  // `src/assets/ATTRIBUTION.md`.
  { id: 'shipping-crate', kind: 'crate', width: 1.8, height: 1.8, image: 'map/crate-shipping.png' },
  { id: 'lifeguard-tower', kind: 'lifeguard-tower', width: 4.6, height: 4.2 },
  { id: 'parasol', kind: 'parasol', width: 3.4, height: 3.4 },
  { id: 'beach-chair', kind: 'beach-chair', width: 1.1, height: 2.4 },
  { id: 'sandcastle', kind: 'sandcastle', width: 1.8, height: 1.6 },
  { id: 'bollard', kind: 'bollard', collisionPolygon: roundedFootprint, width: 0.6, height: 0.6 },
  { id: 'promenade-edge', kind: 'promenade-edge', width: 4, height: 0.6 },
  { id: 'pedestrian-gate', kind: 'pedestrian-gate', width: 4.8, height: 0.6 },
  { id: 'lamp', kind: 'lamp', width: 0.6, height: 0.6 },
  { id: 'bench', kind: 'bench', width: 2.4, height: 0.75 },
  { id: 'kiosk', kind: 'kiosk', width: 4, height: 2.8 },
  { id: 'golf-flag', kind: 'golf-flag', width: 0.24, height: 0.24, collisionPolygon: roundedFootprint },
] as const satisfies readonly ObjectRecord[];

/** Type identity → behaviour kind for strict, asset-free map import validation. */
export const objectKinds: KindRegistry = Object.fromEntries(objectRecords.map(record => [record.id, record.kind]));

import type { ArtworkRecord, BuildingSign, ObjectRecord } from './schema';

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
  // The supplied condo sheet keeps its lawn edges, so the authored crop is wider
  // than the measured transparent padding. Kept as a legacy adapter until beach
  // hotels migrate to object records.
  { id: 'luxury-condo', png: 'map/luxury-condo.png', layer: 'structure', metres: { width: 14.3, height: 13.3 },
    crop: { x: 100, y: 60, width: 1055, height: 1090 }, silhouette: 'bounds', occluder: true, castsShadow: false },
];

const commercialSign: BuildingSign = { width: 14, inset: 1.72, size: 0.78, color: '#eadab8' };

/** Reusable object types. An ordinary new type is one record: its direct image path
 * and normalized art geometry live here, next to its footprint and fallback. The
 * generated inline manifest and measured crop follow from `image` automatically.
 * Geometry factors are relative to the resolved footprint, so changing a default
 * size or instance override moves collision and artwork together. */
export const objectRecords: readonly ObjectRecord[] = [
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
];

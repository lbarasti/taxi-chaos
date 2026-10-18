import type { Vec } from '../physics';

/** Pixel rectangle inside a source image. */
export type PixelCrop = Readonly<{ x: number; y: number; width: number; height: number }>;
/** Metre rectangle relative to the object's collision centre. */
export type ArtBounds = Readonly<{ x: number; y: number; width: number; height: number }>;

/** Measured source pixels plus the crop that removes transparent export padding. */
export type ArtworkSource = Readonly<{ width: number; height: number; crop: PixelCrop }>;
export type CatalogueSources = Readonly<Record<string, ArtworkSource>>;

/** A silhouette is the art rectangle, a circle of `points` vertices, or explicit metres. */
export type ArtworkSilhouette = 'bounds' | Readonly<{ shape: 'circle'; radius: number; points?: number }> | readonly Vec[];

/** Legacy shared image record. Ordinary single-image objects no longer need one:
 * keep this registry for ground tiles, shared variants and standalone prop artwork
 * that owns absolute metre geometry (for example trees). */
export type ArtworkRecord = Readonly<{
  /** Stable runtime identity; also the inline-image manifest key and the drawn image ID. */
  id: string;
  /** Image path under `src/assets`, e.g. `map/shop-tar.png`. */
  png: string;
  layer: 'structure' | 'ground';
  /** Absolute art extent in metres for standalone props. A single number keeps the
   * source aspect; an explicit width/height box is used when artwork deliberately
   * stretches. Required for legacy structure artwork. */
  metres?: number | Readonly<{ width: number; height?: number }>;
  /** Explicit source crop; overrides the measured transparent-padding crop. */
  crop?: PixelCrop;
  silhouette?: ArtworkSilhouette;
  /** Reuse the silhouette as a directed-light occluder. */
  occluder?: boolean;
  /** Supplied sprites with their own depth shading need no sun shadow. */
  castsShadow?: boolean;
  /** Ground tiles repeat every `tileMetres`. */
  tileMetres?: number;
}>;

export type PropArtwork = Readonly<{
  image: string;
  layer: 'structure';
  bounds: ArtBounds;
  /** Optional pixel crop removes export padding without changing the source PNG. */
  source?: PixelCrop;
  rotation?: number;
  /** Convex silhouette for sun shadows; optional outline for blocking directed light. */
  silhouette: readonly Vec[];
  /** Some supplied sprites carry their own depth shading and need no ground shadow. */
  castsShadow?: boolean;
  occluder?: readonly Vec[];
}>;
export type GroundArtwork = Readonly<{ image: string; layer: 'ground'; tileMetres: number }>;
export type ArtworkCatalogue = Readonly<{
  structures: Readonly<Record<string, PropArtwork>>;
  ground: Readonly<Record<string, GroundArtwork>>;
}>;

/** Existing world prop behaviours. `building` is a prop kind too, so one catalogue
 * vocabulary and one compiler serve both buildings and later beach/countryside props. */
export type PropKind = 'building' | 'tree' | 'hydrant' | 'crate' | 'bench' | 'lamp' | 'kiosk' | 'bin' | 'barrier' | 'shed' | 'barracks' | 'station' | 'pump' | 'rock' | 'guardrail' | 'container' | 'fence' | 'port-gate' | 'lifeguard-tower' | 'parasol' | 'beach-chair' | 'sandcastle' | 'palm' | 'bollard' | 'promenade-edge' | 'pedestrian-gate';

export type BuildingFallback = 'shop' | 'commercial' | 'terraced' | 'wards';
export type BuildingSign = Readonly<{ width: number; inset: number; size: number; color: string }>;
export type BuildingPresentation = Readonly<{ fallback: BuildingFallback; sign: BuildingSign }>;

/** How the cropped source fills the resolved footprint.
 * `contain` (default) centres it and preserves its aspect; `stretch` fills the
 * footprint exactly. */
export type ArtworkFit = 'contain' | 'stretch';

/** Normalized artwork presentation. Geometry is expressed as fractions of the
 * resolved footprint, so resizing a type or placement moves collision and art
 * together and never changes physics. */
export type ArtworkPresentation = Readonly<{
  /** Default `contain`: centred, aspect-preserving fit. `stretch` fills exactly. */
  fit?: ArtworkFit;
  /** Drawn width as a fraction of the resolved footprint width. Overrides the fitted width. */
  width?: number;
  /** Drawn height as a fraction of the resolved footprint height. Overrides the fitted height. */
  height?: number;
  /** Art centre offset as a fraction of the resolved footprint width/height. */
  offset?: Readonly<{ x?: number; y?: number }>;
  /** Explicit outline in metres relative to the art centre. Defaults to the art rectangle. */
  outline?: ArtworkSilhouette;
  /** Reuse the outline as a directed-light occluder. */
  occluder?: boolean;
  /** Supplied sprites with their own depth shading need no sun shadow. */
  castsShadow?: boolean;
}>;

/** One authored object type. A new single-image type is exactly this record plus a
 * placement: the image path lives here, so the inline manifest and measured crop
 * follow automatically and there is no separate artwork record. */
export type ObjectRecord = Readonly<{
  /** Stable type identity. Placements reference this value and the inline-image
   * manifest keys any direct `image` by it. */
  id: string;
  /** `building` or an existing prop behaviour such as `tree`, `crate` or `palm`. */
  kind: PropKind;
  /** Default collision footprint in metres. */
  width: number;
  height: number;
  /** Required for buildings. */
  storeys?: number;
  /** Required for buildings. */
  fallback?: BuildingFallback;
  /** Required for buildings. */
  sign?: BuildingSign;
  /** Direct source image for an ordinary single-image type, under `src/assets`. */
  image?: string;
  /** Shared legacy artwork IDs, in authored order. A placement's stable ID picks one
   * deterministically. Use this only when a type needs several variants or reuses
   * artwork owned by the legacy registry. */
  variants?: readonly string[];
  /** Optional source crop for a direct image; overrides the measured padding. */
  crop?: PixelCrop;
  /** Normalized art geometry, resolved against every instance's footprint. */
  artwork?: ArtworkPresentation;
  /** Artwork-only size multiplier, independent of the collision footprint. */
  artworkScale?: number;
}>;

/** Immutable, normalized drawing geometry. Templates never store absolute bounds:
 * `deriveArtwork` resolves them from the instance footprint each time. */
export type ArtworkTemplate = Readonly<{
  image: string;
  /** Cropped source pixels; a detached copy of the authored or measured crop. */
  source?: PixelCrop;
  /** Cropped source aspect (width / height). */
  aspect: number;
  fit: ArtworkFit;
  /** Normalized overhang factors; undefined means the fitted extent. */
  width?: number;
  height?: number;
  offset: Readonly<{ x: number; y: number }>;
  outline: ArtworkSilhouette;
  occluder: boolean;
  castsShadow: boolean;
}>;

export type ObjectDefinition = Readonly<{
  id: string;
  kind: PropKind;
  width: number;
  height: number;
  storeys?: number;
  artwork?: readonly ArtworkTemplate[];
  presentation?: BuildingPresentation;
  /** Artwork-only size multiplier, independent of the collision footprint. */
  artworkScale?: number;
}>;

export type BuildingDefinition = ObjectDefinition & Readonly<{
  kind: 'building';
  storeys: number;
  presentation: BuildingPresentation;
}>;
export type BuildingCatalogue = Readonly<Record<string, BuildingDefinition>>;

export type PlacementRecord<Type extends string = string> = Readonly<{
  id: string; type: Type; owner: 'city'; blockId: string; position: Vec; label: string; color: string;
  width?: number; height?: number; storeys?: number; sign?: Partial<BuildingSign>;
  /** Overrides the type's art-only multiplier for this instance. */
  artworkScale?: number;
  /** Otherwise a matching ID replaces only that generated building; a new ID adds one. */
  replaceBlock?: boolean;
  /** Optional exterior service entrance, independent of the display label. */
  recoveryEntrance?: Vec;
}>;
export type CompiledBuilding = Readonly<{
  id: string; type: string; owner: 'city'; blockId: string; position: Vec; label: string; color: string;
  width: number; height: number; storeys: number; silhouette: readonly Vec[];
  artwork?: PropArtwork; presentation: BuildingPresentation; recoveryEntrance?: Vec;
}>;

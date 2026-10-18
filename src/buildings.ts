import { appearanceSeed, propArtwork, scaleArtwork, type PropArtwork } from './artwork/catalogue';
import { vec, type Vec } from './physics';

export type BuildingSign = Readonly<{ width: number; inset: number; size: number; color: string }>;
export type BuildingPresentation = Readonly<{
  fallback: 'shop' | 'commercial' | 'terraced' | 'wards';
  sign: BuildingSign;
}>;
export type BuildingDefinition = Readonly<{
  width: number; height: number; storeys: number;
  artwork?: readonly PropArtwork[];
  presentation: BuildingPresentation;
}>;
const commercialSign: BuildingSign = { width: 14, inset: 1.72, size: 0.78, color: '#eadab8' };

/** Reusable types. New content chooses one of these styles and optional artwork;
 * neither the renderer nor navigation needs to know the building's type/name. */
export const buildingDefinitions = {
  shop: { width: 10, height: 10, storeys: 2, artwork: [propArtwork.shop, propArtwork.shopRust, propArtwork.shopConcrete], presentation: { fallback: 'shop', sign: { width: 8.6, inset: 0.95, size: 0.72, color: '#f0dfae' } } },
  commercial: { width: 23, height: 10, storeys: 4, presentation: { fallback: 'commercial', sign: commercialSign } },
  landmark: { width: 23, height: 23, storeys: 8, presentation: { fallback: 'terraced', sign: commercialSign } },
  hospital: { width: 26, height: 66, storeys: 8, artwork: [propArtwork.hospital], presentation: { fallback: 'wards', sign: { width: 14, inset: 1.4, size: 0.9, color: '#f0dfae' } } },
} satisfies Record<string, BuildingDefinition>;
export type BuildingType = keyof typeof buildingDefinitions;
export type BuildingCatalogue = Readonly<Record<string, BuildingDefinition>>;
export type BuildingPlacement<Type extends string = BuildingType> = Readonly<{
  id: string; type: Type; owner: 'city'; blockId: string; position: Vec; label: string; color: string;
  width?: number; height?: number; storeys?: number; sign?: Partial<BuildingSign>;
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

export function compileBuilding(placement: BuildingPlacement<string>, catalogue: BuildingCatalogue = buildingDefinitions): CompiledBuilding {
  const definition = catalogue[placement.type];
  if (!definition) throw new Error(`Building ${placement.id}: unknown type ${placement.type}`);
  const width = placement.width ?? definition.width, height = placement.height ?? definition.height;
  if ([definition.width, definition.height, width, height].some(n => !Number.isFinite(n) || n <= 0)) throw new Error(`Building ${placement.id}: invalid footprint`);
  const selected = definition.artwork?.[appearanceSeed(placement.id) % definition.artwork.length];
  const artwork = selected ? scaleArtwork(selected, width / definition.width, height / definition.height) : undefined;
  const { sign, replaceBlock, ...instance } = structuredClone(placement);
  return { ...instance, width, height, storeys: placement.storeys ?? definition.storeys, artwork,
    presentation: { fallback: definition.presentation.fallback, sign: { ...definition.presentation.sign, ...placement.sign } },
    silhouette: [vec(-width / 2 - 0.25, -height / 2 - 0.6), vec(width / 2, -height / 2 - 0.6), vec(width / 2, height / 2), vec(-width / 2 - 0.25, height / 2)],
  };
}

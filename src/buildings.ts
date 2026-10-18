import { artworkSources } from './catalogue/generated';
import { artworkRecords, objectRecords } from './catalogue/content';
import { compileBuildingCatalogue, compilePlacement } from './catalogue/compile';
import type { BuildingCatalogue, BuildingDefinition, CompiledBuilding, PlacementRecord } from './catalogue/schema';

export type { BuildingCatalogue, BuildingDefinition, BuildingSign, BuildingPresentation, CompiledBuilding } from './catalogue/schema';

/** Reusable types compiled once from the authored object records in `src/catalogue/content.ts`.
 * Adding a type there needs no renderer, navigation or collision change. */
export const buildingDefinitions: Readonly<Record<string, BuildingDefinition>> = compileBuildingCatalogue(objectRecords, artworkSources, artworkRecords);
export type BuildingType = (typeof objectRecords)[number]['id'];
export type BuildingPlacement<Type extends string = BuildingType> = PlacementRecord<Type>;

export function compileBuilding(placement: BuildingPlacement<string>, catalogue: BuildingCatalogue = buildingDefinitions): CompiledBuilding {
  return compilePlacement(placement, catalogue);
}

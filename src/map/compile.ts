import { createCountryside } from '../world/countryside';
import { createTerrain } from '../world/terrain';
import { compileLand } from '../world/land';
import { resolveLandRegions } from './land-references';
import { compileBoundaryPlacements } from './boundary-placements';
import { createHarbourGeometry } from '../world/harbour';
import { createCity } from '../world/city';
import { objectDefinitions } from '../artwork/catalogue';
import { compileObjectPlacement } from '../catalogue/compile';
import { objectKindRegistry, type CompiledObject, type ObjectCatalogue } from '../catalogue/schema';
import { assertMap, type MapDocument } from './schema';
import { defaultMap, freezeGeometry } from './default';
import { revision } from './serialization';
export function compileMap(input: MapDocument, catalogue: ObjectCatalogue = objectDefinitions) {
  assertMap(input, objectKindRegistry(catalogue));
  const document = structuredClone(input);
  const land = compileLand(resolveLandRegions(document));
  const country = createCountryside(document,land), terrain = createTerrain(document), city = createCity(undefined, catalogue);
  const boundaryPlacements=compileBoundaryPlacements(document,land,country);
  const presentation={
    shorelines:document.surf.flatMap(effect=>land.landBoundaries.filter(s=>s.sources.some(source=>source.landId===effect.land&&effect.edges.includes(source.edge))).map(s=>({...s,landId:effect.land,presentationId:effect.id}))),
    ground:document.landPresentation.map(p=>({...p,region:land.landRegions.find(r=>r.id===p.land)!})),
  };
  const placements=[...document.objectPlacements,...boundaryPlacements];
  const objects: Record<string,CompiledObject> = Object.fromEntries(placements.map(p=>[p.id,{...compileObjectPlacement(p,catalogue),...('storeys' in p ? {storeys:p.storeys} : {})}]));
  return freezeGeometry({ document, catalogue: structuredClone(catalogue), revision: revision(document, objectKindRegistry(catalogue)), city, country, terrain, land, presentation, placements, boundaryPlacements, harbour: createHarbourGeometry(land.landRegions.find(r=>r.id===document.generation.harbourLand)!), objects });
}
export type CompiledMap = ReturnType<typeof compileMap>;
export const defaultCompiledMap = compileMap(defaultMap);

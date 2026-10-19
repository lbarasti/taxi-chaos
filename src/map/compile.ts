import { createCountryside } from '../countryside';
import { createTerrain } from '../terrain';
import { compileLand } from '../land';
import { resolveLandRegions } from './land-references';
import { compileCoastalContent } from './coastal-content';
import { createHarbourGeometry } from '../harbour';
import { createCity } from '../city';
import { objectDefinitions } from '../artwork/catalogue';
import { compileObjectPlacement } from '../catalogue/compile';
import { objectKindRegistry, type CompiledObject, type ObjectCatalogue } from '../catalogue/schema';
import { assertMap, type MapDocument } from './schema';
import { defaultMap, freezeGeometry } from './default';
import { revision } from './serialization';
/** Resolve every authored catalogue reference — legacy country props and generic placements — through
 * one shared catalogue into `compiled.objects`. Strict `assertMap` has already rejected
 * unknown types and kind mismatches, so a missing type here is a programming error. */
export function resolveObjectPlacements(document: MapDocument, catalogue: ObjectCatalogue): Record<string, CompiledObject> {
  const objects: Record<string, CompiledObject> = {};
  for (const p of document.countryProps) if (p.type) objects[p.id] = compileObjectPlacement({ id: p.id, type: p.type, position: p.position, angle: p.angle, width: p.width, height: p.height, artworkScale: p.artworkScale, features: p.features }, catalogue);
  for (const p of [...document.objectPlacements,...document.coastalPlacements]) objects[p.id] = { ...compileObjectPlacement(p, catalogue), ...(p.storeys === undefined ? {} : { storeys: p.storeys }) };
  return objects;
}

export function compileMap(input: MapDocument, catalogue: ObjectCatalogue = objectDefinitions) {
  assertMap(input, objectKindRegistry(catalogue));
  const document = structuredClone(input);
  const objects = resolveObjectPlacements(document, catalogue);
  const land = compileLand(resolveLandRegions(document));
  const country = createCountryside(document,land), terrain = createTerrain(document), city = createCity(undefined, catalogue);
  const presentation = compileCoastalContent(document, land, country);
  for (const p of presentation.placements) objects[p.id] ??= compileObjectPlacement(p,catalogue);
  return freezeGeometry({ document, revision: revision(document, objectKindRegistry(catalogue)), city, country, terrain, land, presentation, harbour: createHarbourGeometry(land.landRegions.find(r=>r.id===document.generation.harbourLand)!), objects });
}
export type CompiledMap = ReturnType<typeof compileMap>;
export const defaultCompiledMap = compileMap(defaultMap);

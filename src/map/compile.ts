import { createCountryside } from '../countryside';
import { createBeach } from '../beach';
import { createCoast } from '../coast';
import { createCity } from '../city';
import { objectDefinitions } from '../artwork/catalogue';
import { compileObjectPlacement } from '../catalogue/compile';
import { objectKindRegistry, type CompiledObject, type ObjectCatalogue } from '../catalogue/schema';
import { assertMap, type MapDocument } from './schema';
import { defaultMap, freezeGeometry } from './default';
import { revision } from './serialization';
/** Resolve every authored catalogue reference — country props and beach hotels — through
 * one shared catalogue into `compiled.objects`. Strict `assertMap` has already rejected
 * unknown types and kind mismatches, so a missing type here is a programming error. */
export function resolveObjectPlacements(document: MapDocument, catalogue: ObjectCatalogue): Record<string, CompiledObject> {
  const objects: Record<string, CompiledObject> = {};
  for (const p of document.countryProps) if (p.type) objects[p.id] = compileObjectPlacement({ id: p.id, type: p.type, position: p.position, angle: p.angle, width: p.width, height: p.height, artworkScale: p.artworkScale, features: p.features }, catalogue);
  for (const hotel of document.beach.hotels) objects[hotel.id] = compileObjectPlacement({ id: hotel.id, type: hotel.type ?? 'hotel', position: hotel.position, width: hotel.width, height: hotel.height, artworkScale: hotel.artworkScale, features: hotel.features }, catalogue);
  return objects;
}

export function compileMap(input: MapDocument, catalogue: ObjectCatalogue = objectDefinitions) {
  assertMap(input, objectKindRegistry(catalogue));
  const document = structuredClone(input);
  const objects = resolveObjectPlacements(document, catalogue);
  const country = createCountryside(document), beach = createBeach(document, catalogue, objects), city = createCity(undefined, catalogue);
  return freezeGeometry({ document, revision: revision(document, objectKindRegistry(catalogue)), city, country, beach, coast: createCoast(country, beach), objects });
}
export type CompiledMap = ReturnType<typeof compileMap>;
export const defaultCompiledMap = compileMap(defaultMap);

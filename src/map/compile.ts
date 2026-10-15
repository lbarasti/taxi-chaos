import { createPobleSec } from './poble-sec';
import { createCountryside } from '../countryside';
import { createBeach } from '../beach';
import { createCoast } from '../coast';
import { assertMap, type MapDocument } from './schema';
import { defaultMap, freezeGeometry } from './default';
import { revision } from './serialization';

export function compileMap(input: MapDocument) {
  assertMap(input);
  const document = structuredClone(input);
  const country = createCountryside(document), beach = createBeach(document);
  return freezeGeometry({ document, revision: revision(document), country, beach, pobleSec: createPobleSec(document), coast: createCoast(country, beach) });
}
export type CompiledMap = ReturnType<typeof compileMap>;
export const defaultCompiledMap = compileMap(defaultMap);

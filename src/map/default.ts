import data from './default-map.json';
import { assertMap, type MapDocument } from './schema';
assertMap(data);
export function freezeGeometry<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freezeGeometry(child); Object.freeze(value); }
  return value;
}
export const defaultMap: MapDocument = freezeGeometry(data);
export const copyDefaultMap = () => structuredClone(defaultMap);

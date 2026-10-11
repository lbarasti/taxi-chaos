import { assertMap, type MapDocument } from './schema';
import { defaultMap } from './default';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function exportMap(document: MapDocument): string {
  assertMap(document);
  return JSON.stringify(canonical(document), null, 2) + '\n';
}
export function importMap(json: string): MapDocument {
  if (json.length > 2_000_000) throw new Error('Map file exceeds 2 MB');
  let document: unknown = JSON.parse(json);
  // Version 1 had fixed city parking/traffic and four east-bridge lamps. Make
  // those implicit placements explicit when importing an old exported draft.
  if (document && typeof document === 'object' && 'schemaVersion' in document && document.schemaVersion === 1) {
    if (['countryProps', 'parking', 'trafficSpawns'].some(k => Object.hasOwn(document!, k))) throw new Error('Version 1 cannot contain version 2 collections');
    const legacy = document as Record<string, unknown>;
    if (!legacy.beach || typeof legacy.beach !== 'object' || Array.isArray(legacy.beach) || !Object.hasOwn(legacy.beach, 'pickup')) throw new Error('Version 1 beach.pickup is required');
    const { pickup, ...beach } = legacy.beach as Record<string, unknown>;
    const parking = structuredClone(defaultMap.parking); parking.find(p => p.id === 'parking-73')!.position = pickup as MapDocument['parking'][number]['position'];
    const migrated = { ...document, beach, schemaVersion: 2, countryProps: structuredClone(defaultMap.countryProps), parking, trafficSpawns: structuredClone(defaultMap.trafficSpawns) };
    assertMap(migrated);
    document = migrated;
  }
  assertMap(document); return structuredClone(document);
}
/** Content fingerprint, not a security hash. Optimistic concurrency uses this exact document. */
export function revision(document: MapDocument): string {
  const text = exportMap(document); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `v2-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

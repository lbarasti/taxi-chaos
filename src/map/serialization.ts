import { assertMap, type MapDocument } from './schema';

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
  const document: unknown = JSON.parse(json);
  assertMap(document);
  return structuredClone(document);
}
/** Content fingerprint, not a security hash. Optimistic concurrency uses this exact document. */
export function revision(document: MapDocument): string {
  const text = exportMap(document); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `v2-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

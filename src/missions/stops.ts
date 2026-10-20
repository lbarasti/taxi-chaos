import { vec, type Vec } from '../physics';
import type { CompiledMap } from '../map/compile';
import { createNavigation } from '../world/world';

export type StopKind = 'city' | 'beach' | 'highland';

export type CompiledStop = Readonly<{ id: string; name: string; kind: StopKind; position: Vec }>;

export type CompiledStops = Readonly<{
  byId: Readonly<Record<string, CompiledStop>>;
  order: readonly string[];
  /** City stops in authored order; drives procedural pickup indices. */
  city: readonly Vec[];
  /** Authored destination labels, highland then beach, matching legacy dispatch. */
  destinations: readonly Readonly<{ name: string; position: Vec }>[];
  /** Every route stop in legacy order: city, then highland, then beach. */
  routeStops: readonly Vec[];
}>;

export type RawStops = Readonly<{ schemaVersion: 1; stops: readonly Readonly<{ id: string; name: string; kind: 'city' | 'beach'; position: Vec }>[] }>;

const ID = /^[a-z][a-z0-9-]*$/;

function assertStops(value: unknown): asserts value is RawStops {
  const fail = (path: string, why: string): never => { throw new Error(`${path}: ${why}`); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('stops', 'expected object');
  const root = value as Record<string, unknown>;
  if (root.schemaVersion !== 1) fail('stops', 'unsupported schema version');
  const rawStops = root.stops;
  if (!Array.isArray(rawStops)) fail('stops', 'expected 1–200 stops');
  const entries = rawStops as unknown[];
  if (entries.length < 1 || entries.length > 200) fail('stops', 'expected 1–200 stops');
  for (const [i, raw] of entries.entries()) {
    const path = `stops[${i}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(path, 'expected object');
    const stop = raw as Record<string, unknown>;
    if (Object.keys(stop).some(k => !['id', 'name', 'kind', 'position'].includes(k))) fail(path, 'unexpected fields');
    if (typeof stop.id !== 'string' || !ID.test(stop.id)) fail(`${path}.id`, 'expected a stable lowercase id');
    if (typeof stop.name !== 'string' || !stop.name.trim() || stop.name.length > 80) fail(`${path}.name`, 'expected a nonempty name');
    if (stop.kind !== 'city' && stop.kind !== 'beach') fail(`${path}.kind`, 'expected city or beach');
    const p = stop.position;
    if (!p || typeof p !== 'object' || Array.isArray(p) || typeof (p as Vec).x !== 'number' || typeof (p as Vec).y !== 'number' || !Number.isFinite((p as Vec).x) || !Number.isFinite((p as Vec).y)) fail(`${path}.position`, 'expected a finite point');
  }
}

const inside = (p: Vec, center: Vec, width: number, height: number, margin: number) =>
  Math.abs(p.x - center.x) <= width / 2 + margin && Math.abs(p.y - center.y) <= height / 2 + margin;

/**
 * Compiles the authored stops against the map. With `strict` (the default),
 * authored points are checked for envelope bounds, open water, document-prop
 * clearance and a nearby drivable road; invalid identities are rejected rather
 * than relocated. `strict: false` is used for draft-safe preview catalogues,
 * which still need the authored stop geometry but must tolerate a draft map.
 */
export function compileStops(raw: unknown, map: CompiledMap, strict = true): CompiledStops {
  assertStops(raw);
  const navigation = createNavigation(map);
  const { inOcean } = map.land;
  const { min, max } = map.document.envelope;
  const fail = (id: string, why: string): never => { throw new Error(`stop ${id}: ${why}`); };

  const authored: CompiledStop[] = raw.stops.map(s => Object.freeze({ id: s.id, name: s.name, kind: s.kind, position: Object.freeze(vec(s.position.x, s.position.y)) }));
  const highland: CompiledStop[] = map.country.HIGHLAND_STOPS.map(s => Object.freeze({ id: s.id, name: s.name, kind: 'highland' as const, position: Object.freeze(vec(s.position.x, s.position.y)) }));
  const all = [...authored, ...highland];

  const byId: Record<string, CompiledStop> = {};
  for (const stop of all) {
    if (byId[stop.id]) fail(stop.id, 'duplicate stop id');
    byId[stop.id] = stop;
  }

  const props=Object.values(map.objects);
  const parking=map.document.parking.map(p=>({position:p.position,width:5,height:2.6}));

  for (const stop of all) {
    const p = stop.position;
    if (!strict) continue;
    if (p.x < min.x || p.x > max.x || p.y < min.y || p.y > max.y) fail(stop.id, 'outside the map envelope');
    if (inOcean(p)) fail(stop.id, 'is in open water');
    for (const prop of [...props, ...parking]) if (inside(p, prop.position, prop.width, prop.height, 0.8)) fail(stop.id, `overlaps a static prop at ${prop.position.x},${prop.position.y}`);
    if (navigation.roadDistance(p) > 6) fail(stop.id, 'is more than 6 m from a drivable road');
  }
  const city = authored.filter(s => s.kind === 'city').map(s => s.position);
  const beach = authored.filter(s => s.kind === 'beach');
  const highlandStops = highland;
  return Object.freeze({
    byId: Object.freeze(byId),
    order: Object.freeze(all.map(s => s.id)),
    city: Object.freeze(city),
    destinations: Object.freeze([...highlandStops, ...beach].map(s => Object.freeze({ name: s.name, position: s.position }))),
    routeStops: Object.freeze([...city, ...highlandStops.map(s => s.position), ...beach.map(s => s.position)]),
  });
}

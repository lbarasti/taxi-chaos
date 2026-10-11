import { add, scale, sub, vec, type Vec } from '../physics';
import { copyDefaultMap } from './default';
import { assertMap, type MapDocument } from './schema';
import { exportMap, importMap, revision } from './serialization';

export type MapOperation =
  | { type: 'translate'; targetId: string; delta: Vec }
  | { type: 'move'; targetId: string; position: Vec }
  | { type: 'resize'; targetId: string; width: number; height: number }
  | { type: 'envelope'; min: Vec; max: Vec };
export type MapBatch = { baseRevision: string; operations: MapOperation[] };

export function entities(d: MapDocument) {
  return [...d.points, ...d.villas, ...d.stops, d.golf, ...d.ridges, ...d.labels, d.beach.promenade, ...d.beach.hotels, ...d.beach.towers, ...d.beach.sets, ...d.beach.castles];
}
export function entityPosition(d: MapDocument, id: string): Vec | undefined {
  const e = entities(d).find(e => e.id === id);
  if (!e) return;
  if ('position' in e) return { ...e.position };
  if ('center' in e) return { ...e.center };
  if ('point' in e) return entityPosition(d, e.point);
  if ('points' in e) return e.points.reduce((sum, p) => add(sum, scale(p, 1 / e.points.length)), vec());
  if ('left' in e) return vec((e.left + e.right) / 2, (e.top + e.bottom) / 2);
}
export function describe(d: MapDocument, id: string) {
  const district = d.districts.find(e => e.id === id), entity = entities(d).find(e => e.id === id), road = d.roads.find(e => e.id === id);
  if (!district && !entity && !road) throw new Error(`Unknown ID: ${id}`);
  const members = district ? entities(d).filter(e => e.owner === id) : entity ? [entity] : [];
  const positions: Vec[] = [];
  const rectangle = (p: Vec, w: number, h: number) => positions.push(vec(p.x - w / 2, p.y - h / 2), vec(p.x + w / 2, p.y + h / 2));
  for (const e of members) {
    if ('points' in e) positions.push(...e.points);
    else if ('center' in e) { rectangle(e.center, e.width + 14, e.height + 8); rectangle(add(e.center, e.clubhouse), 20, 22); positions.push(...[...e.route, ...e.path].map(p => add(e.center, p))); }
    else if ('left' in e) positions.push(vec(e.left, e.top), vec(e.right, e.bottom));
    else {
      const p = entityPosition(d, e.id), hotel = d.beach.hotels.find(h => h.id === e.id);
      if (p) {
        if (d.villas.some(v => v.id === e.id)) rectangle(p, 42, 34);
        else if (hotel) rectangle(p, hotel.width, hotel.height);
        else if (d.beach.towers.some(v => v.id === e.id)) rectangle(p, 4.6, 4.2);
        else if (d.beach.sets.some(v => v.id === e.id)) rectangle(add(p, vec(0, 1.7)), 8, 7);
        else positions.push(p);
      }
    }
  }
  if (id === 'city') positions.push(vec(-14, -14), vec(254, 254));
  if (id === 'harbour') positions.push(vec(72, -136), vec(252, -16));
  if (road) positions.push(...[road.from, ...road.via, road.to].map(id => entityPosition(d, id)!));
  const connections = d.roads.filter(r => r.id === id || [r.from, ...r.via, r.to].some(p => members.some(m => m.id === p)));
  return structuredClone({ id, kind: district ? 'district' : road ? 'road' : 'point' in entity! ? 'destination' : 'position' in entity! && 'weight' in entity! ? 'point' : 'object',
    editable: district ? id === 'southern-estates' : road ? false : 'editable' in entity! ? entity.editable : d.districts.find(o => o.id === entity!.owner)!.editable,
    descriptor: district ?? entity ?? road,
    position: district || road ? undefined : entityPosition(d, id),
    bounds: positions.length ? { min: vec(Math.min(...positions.map(p => p.x)), Math.min(...positions.map(p => p.y))), max: vec(Math.max(...positions.map(p => p.x)), Math.max(...positions.map(p => p.y))) } : undefined,
    members: members.map(e => e.id), connections: connections.map(r => r.id),
    seams: d.points.filter(p => members.some(e => e.id === p.id) || district && connections.some(r => [r.from, ...r.via, r.to].includes(p.id))).map(p => ({ id: p.id, weight: p.weight, owner: p.owner, editable: p.editable })),
    constraints: d.constraints,
    policy: district ? id === 'southern-estates' ? 'Translate owned placements once; named points use explicit weights; north attachments stay fixed. Expand envelope separately.' : 'District translation is pinned; editable child geometry is selectable.' : 'points' in (entity ?? {}) ? 'Ridge vertices translate together.' : 'point' in (entity ?? {}) ? 'Destination shares its named road node.' : 'Composite children derive from this placement.',
  });
}

function finitePoint(p: unknown): asserts p is Vec {
  if (!p || typeof p !== 'object' || Object.keys(p).sort().join(',') !== 'x,y' || !Number.isFinite((p as Vec).x) || !Number.isFinite((p as Vec).y)) throw new Error('Expected finite x/y coordinates');
}
function moveEntity(d: MapDocument, id: string, delta: Vec, changed: Set<string>) {
  const e = entities(d).find(e => e.id === id);
  if (!e) throw new Error(`Unknown movable ID: ${id}`);
  if ('editable' in e && !e.editable || !d.districts.find(o => o.id === e.owner)!.editable) throw new Error(`${id} is read-only`);
  if ('point' in e) { moveEntity(d, e.point, delta, changed); changed.add(id); return; }
  if ('position' in e) e.position = add(e.position, delta);
  else if ('center' in e) e.center = add(e.center, delta);
  else if ('points' in e) e.points = e.points.map(p => add(p, delta));
  else { e.left += delta.x; e.right += delta.x; e.top += delta.y; e.bottom += delta.y; e.entries = e.entries.map(x => x + delta.x); e.southEntries = e.southEntries.map(x => x + delta.x); }
  if (id === d.beach.shore[0]) d.beach.left = (e as { position: Vec }).position.x;
  if (id === d.beach.shore.at(-1)) d.beach.right = (e as { position: Vec }).position.x;
  changed.add(id);
}

/** Pure atomic transaction. No mutation reaches the caller until every operation validates. */
export function applyOperations(input: MapDocument, batch: MapBatch) {
  if (!batch || Object.keys(batch).sort().join(',') !== 'baseRevision,operations' || batch.baseRevision !== revision(input)) throw new Error('Stale or malformed base revision; take a fresh snapshot');
  if (!Array.isArray(batch.operations) || !batch.operations.length || batch.operations.length > 100) throw new Error('Expected 1–100 operations');
  const d = structuredClone(input), changed = new Set<string>();
  for (const op of batch.operations) {
    if (!op || typeof op !== 'object') throw new Error('Malformed operation');
    const expected = op.type === 'envelope' ? ['type', 'min', 'max'] : op.type === 'resize' ? ['type', 'targetId', 'width', 'height'] : op.type === 'move' ? ['type', 'targetId', 'position'] : ['type', 'targetId', 'delta'];
    if (Object.keys(op).sort().join(',') !== expected.sort().join(',')) throw new Error('Unknown operation fields');
    if (op.type === 'envelope') { finitePoint(op.min); finitePoint(op.max); d.envelope = { min: { ...op.min }, max: { ...op.max } }; changed.add('envelope'); }
    else if (op.type === 'translate') {
      finitePoint(op.delta);
      const district = d.districts.find(e => e.id === op.targetId);
      if (district) {
        if (district.id !== 'southern-estates') throw new Error('Only southern-estates supports whole-district translation; edit individual geometry in other districts');
        for (const e of entities(d).filter(e => e.owner === district.id && !('point' in e))) {
          const weight = d.points.find(p => p.id === e.id)?.weight ?? 1;
          if (weight) moveEntity(d, e.id, scale(op.delta, weight), changed);
        }
        for (const stop of d.stops.filter(s => s.owner === district.id)) changed.add(stop.id);
      } else moveEntity(d, op.targetId, op.delta, changed);
    } else if (op.type === 'move') {
      finitePoint(op.position); const old = entityPosition(d, op.targetId);
      if (!old) throw new Error(`Unknown placement: ${op.targetId}`);
      moveEntity(d, op.targetId, sub(op.position, old), changed);
    } else if (op.type === 'resize') {
      if (!Number.isFinite(op.width) || !Number.isFinite(op.height) || op.width <= 0 || op.height <= 0) throw new Error('Dimensions must be positive finite metres');
      const e = entities(d).find(e => e.id === op.targetId);
      if (!e || !d.districts.find(o => o.id === e.owner)!.editable) throw new Error('Unknown/read-only object');
      if ('width' in e) { e.width = op.width; e.height = op.height; }
      else if ('left' in e) { const center = entityPosition(d, e.id)!; e.left = center.x - op.width / 2; e.right = center.x + op.width / 2; e.top = center.y - op.height / 2; e.bottom = center.y + op.height / 2; }
      else throw new Error('Dimensions are editable only for golf, hotels and promenade');
      changed.add(e.id);
    } else throw new Error('Unknown operation type');
  }
  assertMap(d);
  return { document: d, revision: revision(d), changedIds: [...changed].sort(), affectedConnections: d.roads.filter(r => [r.from, ...r.via, r.to].some(id => changed.has(id))).map(r => r.id) };
}

export class MapHistory {
  private document: MapDocument;
  private past: MapDocument[] = []; private future: MapDocument[] = [];
  constructor(document = copyDefaultMap()) { assertMap(document); this.document = structuredClone(document); }
  snapshot() { return { schemaVersion: 1, revision: revision(this.document), document: structuredClone(this.document), canUndo: this.past.length > 0, canRedo: this.future.length > 0 }; }
  describe(id: string) { return describe(this.document, id); }
  apply(batch: MapBatch) {
    const result = applyOperations(this.document, batch);
    if (result.revision !== revision(this.document)) { this.past.push(this.document); if (this.past.length > 100) this.past.shift(); this.document = result.document; this.future = []; }
    return structuredClone(result);
  }
  undo() { const previous = this.past.pop(); if (previous) { this.future.push(this.document); this.document = previous; } return this.snapshot(); }
  redo() { const next = this.future.pop(); if (next) { this.past.push(this.document); this.document = next; } return this.snapshot(); }
  export() { return exportMap(this.document); }
  import(json: string) { const next = importMap(json); if (revision(next) !== revision(this.document)) { this.past.push(this.document); if (this.past.length > 100) this.past.shift(); this.document = next; this.future = []; } return this.snapshot(); }
}

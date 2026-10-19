import { Body, add, scale, sub, vec, type Vec } from '../physics';
import { createVehicleBody, vehicleDefinition } from '../vehicles';
import { objectDefinitions } from '../artwork/catalogue';
import { objectKindRegistry, type KindRegistry, type ObjectCatalogue } from '../catalogue/schema';
import { referencedLand, resolveLandRegion } from './land-references';
import { copyDefaultMap } from './default';
import { authoredCollections, assertMap, type AuthoredCollection, type AuthoredDescriptor, type CountryProp, type MapDocument } from './schema';
import { exportMap, importMap, revision } from './serialization';

export type MapOperation =
  | { type: 'translate'; targetId: string; delta: Vec }
  | { type: 'move'; targetId: string; position: Vec }
  | { type: 'resize'; targetId: string; width: number; height: number }
  | { type: 'add'; collection: AuthoredCollection; descriptor: AuthoredDescriptor }
  | { type: 'replace'; targetId: string; descriptor: AuthoredDescriptor }
  | { type: 'delete'; targetId: string }
  | { type: 'duplicate'; targetId: string; newId: string; delta: Vec }
  | { type: 'envelope'; min: Vec; max: Vec };
export type MapBatch = { baseRevision: string; operations: MapOperation[] };

export function entities(d: MapDocument) {
  return [...d.points, ...d.villas, ...d.countryProps, ...d.parking, ...d.trafficSpawns, ...d.stops, d.golf, ...d.ridges, ...d.labels, ...d.objectPlacements, ...d.terrainRegions, ...d.landRegions, ...d.accessAreas, ...d.accessNodes, ...d.accessEdges, ...d.districtZones, ...d.residents, ...d.groundMarks, ...d.groundLabels, ...d.landPresentation, ...d.surf, ...d.boundaryPlacements, ...d.coastalPlacements];
}
export function authoredCollection(d: MapDocument, id: string): AuthoredCollection | undefined {
  return authoredCollections.find(key => d[key].some(e => e.id === id));
}
/** Physical body for an authored descriptor. Typed country props and type-only hotel
 * placements resolve their footprint from the passed catalogue; a descriptor with
 * neither explicit dimensions nor a known type is a caller error, never a 0.2 m fallback. */
export function descriptorBody(e: Extract<AuthoredDescriptor, { position: Vec; angle: number }>, catalogue: ObjectCatalogue = objectDefinitions): Body {
  if ('model' in e) return createVehicleBody(vehicleDefinition(e.model), e.position, e.angle);
  const { width, height } = sizeOf(catalogue, e.type, e.width, e.height);
  const b = new Body(e.position.x, e.position.y, 1, width, height); b.angle = e.angle; return b;
}
/** Resolved footprint for a placement that may rely on a catalogue type default. */
export function sizeOf(catalogue: ObjectCatalogue, type: string | undefined, width: number | undefined, height: number | undefined): { width: number; height: number } {
  const definition = type === undefined ? undefined : catalogue[type];
  const w = width ?? definition?.width, h = height ?? definition?.height;
  if (w === undefined || h === undefined) throw new Error('Descriptor needs explicit dimensions or a known catalogue type');
  return { width: w, height: h };
}
export function entityPosition(d: MapDocument, id: string): Vec | undefined {
  const e = entities(d).find(e => e.id === id);
  if (!e) return;
  if ('position' in e) return { ...e.position };
  if ('center' in e) return { ...e.center };
  if ('point' in e) return entityPosition(d, e.point);
  if ('points' in e) return e.points.reduce((sum, p) => add(sum, scale(p, 1 / e.points.length)), vec());
  if ('pointRefs' in e) return resolveLandRegion(d,e).outline.reduce((sum,p)=>add(sum,scale(p,1/e.pointRefs.length)),vec());
  if ('land' in e) return entityPosition(d,e.land);
  if ('outline' in e) return e.outline.reduce((sum,p)=>add(sum,scale(p,1/e.outline.length)),vec());
}
export function describe(d: MapDocument, id: string, catalogue: ObjectCatalogue = objectDefinitions) {
  const district = d.districts.find(e => e.id === id), entity = entities(d).find(e => e.id === id), road = d.roads.find(e => e.id === id);
  if (!district && !entity && !road) throw new Error(`Unknown ID: ${id}`);
  const members = district ? entities(d).filter(e => e.owner === id) : entity ? [entity] : [];
  const positions: Vec[] = [];
  const rectangle = (p: Vec, w: number, h: number) => positions.push(vec(p.x - w / 2, p.y - h / 2), vec(p.x + w / 2, p.y + h / 2));
  for (const e of members) {
    if ('angle' in e) {
      const authored = e as Extract<AuthoredDescriptor, { position: Vec; angle: number }>; positions.push(...descriptorBody(authored, catalogue).corners());
      if ('occupied' in authored) { const bay = new Body(authored.position.x, authored.position.y, 1, 5.4, 2.6); bay.angle = authored.angle; positions.push(...bay.corners()); }
      if ('path' in authored) positions.push(...authored.path);
    }
    else if ('points' in e) positions.push(...e.points);
    else if ('center' in e) { rectangle(e.center, e.width + 14, e.height + 8); rectangle(add(e.center, e.clubhouse), 20, 22); positions.push(...[...e.route, ...e.path].map(p => add(e.center, p))); }
    else if ('pointRefs' in e) positions.push(...resolveLandRegion(d,e).outline);
    else if ('land' in e) positions.push(...referencedLand(d,e.land).outline);
    else if ('outline' in e) positions.push(...e.outline);
    else {
      const p = entityPosition(d, e.id);
      if (p) {
        if (d.villas.some(v => v.id === e.id)) rectangle(p, 42, 34);
        else positions.push(p);
      }
    }
  }
  if (road) positions.push(...[road.from, ...road.via, road.to].map(id => entityPosition(d, id)!));
  const ringPoints = new Set(members.flatMap(e=>'pointRefs' in e ? e.pointRefs : 'land' in e ? (d.landRegions.find(r=>r.id===e.land) as {pointRefs?:string[]}).pointRefs ?? [] : []));
  const connections = d.roads.filter(r => r.id === id || [r.from, ...r.via, r.to].some(p => members.some(m => m.id === p) || ringPoints.has(p)));
  return structuredClone({ id, kind: district ? 'district' : road ? 'road' : authoredCollection(d,id)==='landRegions' ? 'land' : 'point' in entity! ? 'destination' : 'position' in entity! && 'weight' in entity! ? 'point' : 'object',
    editable: district ? id === 'southern-estates' : road ? false : d.landRegions.some(r=>r.id===id) ? d.districts.find(o=>o.id===entity!.owner)!.editable : authoredCollection(d, id) ? true : 'editable' in entity! ? entity.editable : d.districts.find(o => o.id === entity!.owner)!.editable,
    collection: authoredCollection(d, id),
    descriptor: district ?? entity ?? road,
    position: district || road ? undefined : entityPosition(d, id),
    bounds: positions.length ? { min: vec(Math.min(...positions.map(p => p.x)), Math.min(...positions.map(p => p.y))), max: vec(Math.max(...positions.map(p => p.x)), Math.max(...positions.map(p => p.y))) } : undefined,
    members: members.map(e => e.id), connections: connections.map(r => r.id),
    seams: d.points.filter(p => members.some(e => e.id === p.id) || ringPoints.has(p.id) || district && connections.some(r => [r.from, ...r.via, r.to].includes(p.id))).map(p => ({ id: p.id, weight: p.weight, owner: p.owner, editable: p.editable })),
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
  if (d.landRegions.some(r=>r.id===id) && !d.districts.find(o=>o.id===e.owner)!.editable) throw new Error(`${id} is read-only`);
  if (!authoredCollection(d, id) && ('editable' in e && !e.editable || !d.districts.find(o => o.id === e.owner)!.editable)) throw new Error(`${id} is read-only`);
  if ('pointRefs' in e) { for (const point of e.pointRefs) moveEntity(d,point,delta,changed); changed.add(id); return; }
  if ('land' in e) { if(delta.x || delta.y) throw new Error('Move the referenced land geometry to move dependent presentation'); changed.add(id); return; }
  if ('point' in e) { moveEntity(d, e.point, delta, changed); changed.add(id); return; }
  if ('position' in e) { e.position = add(e.position, delta); const spawn = d.trafficSpawns.find(s => s.id === id); if (spawn) spawn.path = spawn.path.map(p => add(p, delta)); }
  else if ('center' in e) e.center = add(e.center, delta);
  else if ('points' in e) e.points = e.points.map(p => add(p, delta));
  else if ('outline' in e) e.outline = e.outline.map(p => add(p,delta));
  else throw new Error('Move access nodes to edit a connection');
  changed.add(id);
}

/** Pure atomic transaction. No mutation reaches the caller until every operation validates. */
export function applyOperations(input: MapDocument, batch: MapBatch, catalogue: ObjectCatalogue = objectDefinitions) {
  const kinds = objectKindRegistry(catalogue);
  if (!batch || Object.keys(batch).sort().join(',') !== 'baseRevision,operations' || batch.baseRevision !== revision(input, kinds)) throw new Error('Stale or malformed base revision; take a fresh snapshot');
  if (!Array.isArray(batch.operations) || !batch.operations.length || batch.operations.length > 100) throw new Error('Expected 1–100 operations');
  const d = structuredClone(input), changed = new Set<string>();
  for (const op of batch.operations) {
    if (!op || typeof op !== 'object') throw new Error('Malformed operation');
    const expected = op.type === 'add' ? ['type', 'collection', 'descriptor'] : op.type === 'replace' ? ['type', 'targetId', 'descriptor'] : op.type === 'delete' ? ['type', 'targetId'] : op.type === 'duplicate' ? ['type', 'targetId', 'newId', 'delta'] : op.type === 'envelope' ? ['type', 'min', 'max'] : op.type === 'resize' ? ['type', 'targetId', 'width', 'height'] : op.type === 'move' ? ['type', 'targetId', 'position'] : ['type', 'targetId', 'delta'];
    if (Object.keys(op).sort().join(',') !== expected.sort().join(',')) throw new Error('Unknown operation fields');
    if (op.type === 'add') {
      if (!authoredCollections.includes(op.collection)) throw new Error('Unknown authored collection');
      if (!op.descriptor || typeof op.descriptor !== 'object') throw new Error('Malformed descriptor');
      (d[op.collection] as AuthoredDescriptor[]).push(structuredClone(op.descriptor));
      assertMap(d, kinds); changed.add(op.descriptor.id);
    } else if (op.type === 'delete' || op.type === 'duplicate' || op.type === 'replace') {
      const key = authoredCollection(d, op.targetId);
      if (!key) throw new Error('Add/delete/duplicate/replace supports authored collections only');
      const target = entities(d).find(e=>e.id===op.targetId)!;
      if (key === 'landRegions' && !d.districts.find(o=>o.id===target.owner)!.editable) throw new Error(`${op.targetId} is read-only`);
      const items: AuthoredDescriptor[] = d[key], index = items.findIndex(e => e.id === op.targetId);
      if (op.type === 'delete') items.splice(index, 1);
      else if (op.type === 'replace') {
        if (op.descriptor?.id !== op.targetId) throw new Error('Replacement must retain the stable ID');
        items[index] = structuredClone(op.descriptor);
      } else {
        finitePoint(op.delta);
        const e = structuredClone(items[index]); e.id = op.newId;
        if ('pointRefs' in e) e.pointRefs = e.pointRefs.map((id,i)=>{
          const point=structuredClone(d.points.find(p=>p.id===id)!);
          if(!point.editable) throw new Error('Cannot duplicate pinned shared points');
          point.id=`${op.newId}-point-${i}`; d.points.push(point); return point.id;
        });
        items.push(e);
        assertMap(d, kinds); moveEntity(d, e.id, op.delta, changed);
      }
      assertMap(d, kinds); changed.add(op.targetId);
    } else if (op.type === 'envelope') { finitePoint(op.min); finitePoint(op.max); d.envelope = { min: { ...op.min }, max: { ...op.max } }; changed.add('envelope'); }
    else if (op.type === 'translate') {
      finitePoint(op.delta);
      const district = d.districts.find(e => e.id === op.targetId);
      if (district) {
        if (district.id !== 'southern-estates') throw new Error('Only southern-estates supports whole-district translation; edit individual geometry in other districts');
        for (const e of entities(d).filter(e => e.owner === district.id && !('point' in e) && !('fromNode' in e) && !('land' in e) && !('pointRefs' in e))) {
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
      if (!e || !authoredCollection(d, e.id) && !d.districts.find(o => o.id === e.owner)!.editable) throw new Error('Unknown/read-only object');
      if (authoredCollection(d, e.id) === 'countryProps') { const country = e as CountryProp; country.width = op.width; country.height = op.height; }
      else if ('angle' in e && 'type' in e) { e.width = op.width; e.height = op.height; }
      else if ('width' in e) { e.width = op.width; e.height = op.height; }
      else throw new Error('Dimensions are editable only for object placements and golf');
      changed.add(e.id);
    } else throw new Error('Unknown operation type');
  }
  for (const region of d.landRegions) if ('pointRefs' in region && region.pointRefs.some(id=>changed.has(id))) changed.add(region.id);
  for (const e of [...d.landPresentation,...d.surf,...d.boundaryPlacements]) if (changed.has(e.land)) changed.add(e.id);
  assertMap(d, kinds);
  return { document: d, revision: revision(d, kinds), changedIds: [...changed].sort(), affectedConnections: d.roads.filter(r => [r.from, ...r.via, r.to].some(id => changed.has(id))).map(r => r.id) };
}

export class MapHistory {
  private document: MapDocument;
  private past: MapDocument[] = []; private future: MapDocument[] = [];
  private readonly kinds: KindRegistry;
  constructor(document = copyDefaultMap(), private readonly catalogue: ObjectCatalogue = objectDefinitions) { this.kinds = objectKindRegistry(catalogue); assertMap(document, this.kinds); this.document = structuredClone(document); }
  snapshot() { return { schemaVersion: 5, revision: revision(this.document, this.kinds), document: structuredClone(this.document), canUndo: this.past.length > 0, canRedo: this.future.length > 0 }; }
  describe(id: string) { return describe(this.document, id, this.catalogue); }
  apply(batch: MapBatch) {
    const result = applyOperations(this.document, batch, this.catalogue);
    if (result.revision !== revision(this.document, this.kinds)) { this.past.push(this.document); if (this.past.length > 100) this.past.shift(); this.document = result.document; this.future = []; }
    return structuredClone(result);
  }
  undo() { const previous = this.past.pop(); if (previous) { this.future.push(this.document); this.document = previous; } return this.snapshot(); }
  redo() { const next = this.future.pop(); if (next) { this.past.push(this.document); this.document = next; } return this.snapshot(); }
  export() { return exportMap(this.document, this.kinds); }
  import(json: string) { const next = importMap(json, this.kinds); if (revision(next, this.kinds) !== revision(this.document, this.kinds)) { this.past.push(this.document); if (this.past.length > 100) this.past.shift(); this.document = next; this.future = []; } return this.snapshot(); }
}

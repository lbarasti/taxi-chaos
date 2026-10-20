import type { Vec } from '../physics';
import { vehicleDefinitions, type VehicleModel } from '../vehicles/vehicles';
import type { AttachedFeature, KindRegistry } from '../catalogue/schema';
import { objectKinds } from '../catalogue/content';

export type Owned = { id: string; owner: string };
export type MapPoint = Owned & { position: Vec; weight: number; editable: boolean };
export type Placement = Owned & { position: Vec; name: string; color: string };
export type Parking = Owned & { position: Vec; angle: number; occupied: boolean; lot: boolean; model: VehicleModel; color: string };
export type TrafficSpawn = Owned & { position: Vec; angle: number; model: VehicleModel; color: string; path: Vec[] };
export type Region = Owned & { outline: Vec[] };
/** Exactly one boundary source. Shared named points retain ownership/translation weights. */
export type LandRegion = Region | (Owned & { pointRefs: string[] });
export type LandPresentation = Owned & { land: string; color: string; texture?: 'asphalt' };
export type Surf = Owned & { land: string; edges: number[] };
/** Bounded shore panels only, with explicit land/road openings and stable edge/slot children. */
export type BoundaryPlacement = Owned & { land: string; type: string; edges: number[]; maxLength: number; inset: number; panels: number; period: number; excludeLand: string[]; excludeRoads: string[]; clearance: number };
export type TerrainRegion = Region & { surface: 'road' | 'sand' | 'paving' | 'grass'; priority: number; texture?: 'gravel' };
export type AccessArea = Region & { priority: number; driving: 'direct' | 'approach' };
export type AccessNode = Owned & { position: Vec; road: boolean };
export type AccessEdge = Owned & { fromNode: string; toNode: string; modes: ('walk' | 'drive')[] };
export type ObjectPlacement = Owned & { type: string; position: Vec; angle: number; color: string; label: string; width?: number; height?: number; storeys?: number; artworkScale?: number; features?: readonly AttachedFeature[] };
export type DistrictZone = Region & { name: string; priority: number };
export type Resident = Owned & { position: Vec; color: string; wander: Vec };
export type GroundMark = Owned & { points: Vec[]; color: string; width: number; fill: boolean };
export type GroundLabel = Owned & { position: Vec; text: string; color: string; size: number };
export const authoredCollections = ['parking', 'trafficSpawns', 'objectPlacements', 'terrainRegions', 'landRegions', 'accessAreas', 'accessNodes', 'accessEdges', 'districtZones', 'residents', 'groundMarks', 'groundLabels', 'landPresentation', 'surf', 'boundaryPlacements'] as const;
export type AuthoredCollection = typeof authoredCollections[number];
export type AuthoredDescriptor = Parking | TrafficSpawn | ObjectPlacement | Region | TerrainRegion | AccessArea | AccessNode | AccessEdge | DistrictZone | Resident | GroundMark | GroundLabel | LandRegion | LandPresentation | Surf | BoundaryPlacement;
export type MapDocument = {
  schemaVersion: 5;
  coordinates: 'metres-screen-south-positive-radians';
  envelope: { min: Vec; max: Vec };
  districts: { id: string; name: string; editable: boolean }[];
  points: MapPoint[];
  roads: (Owned & { from: string; to: string; via: string[]; name: string; bridge: boolean })[];
  nodes: string[];
  villas: Placement[];
  parking: Parking[];
  trafficSpawns: TrafficSpawn[];
  stops: (Owned & { point: string; name: string })[];
  golf: Owned & { center: Vec; width: number; height: number; clubhouse: Vec; route: Vec[]; path: Vec[]; holes: { tee: Vec; green: Vec; bunker: Vec }[] };
  ridges: (Owned & { points: Vec[] })[];
  labels: (Owned & { position: Vec; text: string; size: number; color: string })[];
  terrainRegions: TerrainRegion[];
  landRegions: LandRegion[];
  landPresentation: LandPresentation[];
  surf: Surf[];
  boundaryPlacements: BoundaryPlacement[];
  objectPlacements: ObjectPlacement[];
  accessAreas: AccessArea[];
  accessNodes: AccessNode[];
  accessEdges: AccessEdge[];
  districtZones: DistrictZone[];
  residents: Resident[];
  groundMarks: GroundMark[];
  groundLabels: GroundLabel[];
  generation: { ruralSeed: number; candidates: number; countryLand: string; cityLand: string; harbourLand: string; bridgeLands: string[] };
  constraints: { id: string; type: 'water-gap'; fromLand: string; toLand: string; direction: Vec; minimum: number; resolution: number }[];
};

/** Strict shape checking also bounds imported workloads before any factory runs.
 * References are validated against the injected kind registry, so a custom catalogue
 * can be checked consistently across authored and generated content. */
export function assertMap(value: unknown, kinds: KindRegistry = objectKinds): asserts value is MapDocument {
  const fail = (path: string, why: string): never => { throw new Error(`${path}: ${why}`); };
  const object = (v: unknown, keys: string[], path: string, optional: string[] = []): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(path, 'expected object');
    const obj = v as Record<string, unknown>;
    if (Object.keys(obj).some(k => !keys.includes(k) && !optional.includes(k)) || keys.some(k => !Object.hasOwn(obj, k))) fail(path, `expected fields ${keys.join(', ')}`);
    return obj;
  };
  const num = (v: unknown, path: string, min = -10000, max = 10000): number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail(path, `expected finite number in [${min}, ${max}]`);
  const text = (v: unknown, path: string): string => typeof v === 'string' && v.length > 0 && v.length <= 160 ? v : fail(path, 'expected nonempty string (max 160)');
  const bool = (v: unknown, path: string) => typeof v === 'boolean' ? v : fail(path, 'expected boolean');
  const list = (v: unknown, path: string, min = 0, max = 500): unknown[] => Array.isArray(v) && v.length >= min && v.length <= max ? v : fail(path, `expected array (${min}–${max} items)`);
  const point = (v: unknown, path: string) => { const p = object(v, ['x', 'y'], path); num(p.x, `${path}.x`); num(p.y, `${path}.y`); };
  const ids = new Set<string>(), owners: string[] = [], refs: string[] = [];
  const id = (v: unknown, path: string) => { const s = text(v, path); if (!/^[a-z][a-z0-9-]*$/.test(s) || ids.has(s)) fail(path, 'invalid or duplicate ID'); ids.add(s); };
  const owned = (obj: Record<string, unknown>, path: string) => { id(obj.id, `${path}.id`); owners.push(text(obj.owner, `${path}.owner`)); };
  const ref = (v: unknown, path: string) => refs.push(text(v, path));
  /** Strict catalogue reference: the type must exist and match the declared behaviour.
   * Unknown types and kind mismatches are rejected structurally, never as draft errors. */
  const kindOf = (v: unknown, path: string, expected?: string): string => {
    const type = text(v, path);
    const kind = kinds[type];
    if (kind === undefined) fail(path, `unknown catalogue type ${type}`);
    if (expected !== undefined && kind !== expected) fail(path, `catalogue type ${type} is ${kind}, not ${expected}`);
    return kind;
  };
  const features = (v: unknown, path: string) => {
    const seen = new Set<string>();
    for (const f of list(v, path, 0, 8)) {
      const feature = object(f, ['id', 'role', 'offset'], path, ['label']);
      const featureId = text(feature.id, `${path}.id`);
      if (featureId.length > 60) fail(`${path}.id`, 'feature ID must be at most 60 characters');
      if (!/^[a-z][a-z0-9-]*$/.test(featureId) || seen.has(featureId)) fail(`${path}.id`, 'invalid or duplicate feature ID');
      seen.add(featureId);
      if (feature.role !== 'service' && feature.role !== 'sign') fail(`${path}.role`, 'expected service or sign');
      point(feature.offset, `${path}.offset`);
      if (feature.label !== undefined && (typeof feature.label !== 'string' || feature.label.length > 160)) fail(`${path}.label`, 'expected label (max 160)');
    }
  };
  const placement = (v: unknown, path: string, extras: string[] = [], optional: string[] = []) => { const p = object(v, ['id', 'owner', 'position', 'name', 'color', ...extras], path, optional); owned(p, path); point(p.position, `${path}.position`); text(p.name, path); if (!/^#[0-9a-f]{6}$/i.test(text(p.color, path))) fail(path, 'expected hex colour'); return p; };
  if (value && typeof value === 'object' && 'schemaVersion' in value && value.schemaVersion !== 5) fail('map','unsupported schema or coordinate convention');
  const root = object(value, ['schemaVersion', 'coordinates', 'envelope', 'districts', 'points', 'roads', 'nodes', 'villas', 'parking', 'trafficSpawns', 'stops', 'golf', 'ridges', 'labels', 'terrainRegions', 'landRegions', 'objectPlacements', 'accessAreas', 'accessNodes', 'accessEdges', 'districtZones', 'residents', 'groundMarks', 'groundLabels', 'generation', 'constraints', 'landPresentation', 'surf', 'boundaryPlacements'], 'map');
  if (root.schemaVersion !== 5 || root.coordinates !== 'metres-screen-south-positive-radians') fail('map', 'unsupported schema or coordinate convention');
  const env = object(root.envelope, ['min', 'max'], 'envelope'); point(env.min, 'envelope.min'); point(env.max, 'envelope.max');
  const bounds = env as unknown as MapDocument['envelope'];
  for (const axis of ['x', 'y'] as const) if (bounds.max[axis] <= bounds.min[axis] || bounds.max[axis] - bounds.min[axis] > 2000) fail('envelope', 'must have positive extent at most 2000 m');
  const districts = new Set<string>();
  for (const d of list(root.districts, 'districts', 1, 20)) { const p = object(d, ['id', 'name', 'editable'], 'district'); id(p.id, 'district.id'); districts.add(p.id as string); text(p.name, 'district.name'); bool(p.editable, 'district.editable'); }
  const pointIds = new Set<string>(), locked = new Set<string>();
  for (const v of list(root.points, 'points', 3)) { const p = object(v, ['id', 'owner', 'position', 'weight', 'editable'], 'point'); owned(p, 'point'); point(p.position, 'point.position'); num(p.weight, 'point.weight', 0, 1); bool(p.editable, 'point.editable'); pointIds.add(p.id as string); if (!p.editable) locked.add(p.id as string); }
  for (const key of ['nodes'] as const) for (const v of list(root[key], key, 3)) ref(v, key);
  if (new Set(root.nodes as string[]).size !== (root.nodes as string[]).length) fail('map', 'duplicate ring/node references');
  const nodes = new Set(root.nodes as string[]);
  for (const v of list(root.roads, 'roads', 1, 100)) { const p = object(v, ['id', 'owner', 'from', 'to', 'via', 'name', 'bridge'], 'road'); owned(p, 'road'); ref(p.from, 'road.from'); ref(p.to, 'road.to'); if (!nodes.has(p.from as string) || !nodes.has(p.to as string) || p.from === p.to) fail('road', 'endpoints must be distinct nodes'); text(p.name, 'road.name'); bool(p.bridge, 'road.bridge'); const via = list(p.via, 'road.via', 0, 20); via.forEach(v => ref(v, 'road.via')); if (p.bridge && [p.from, ...via, p.to].some(v => !locked.has(v as string))) fail('road', 'bridge anchors must be pinned'); }
  for (const v of list(root.villas, 'villas', 1, 100)) placement(v, 'villa');
  for (const key of ['parking', 'trafficSpawns'] as const) for (const v of list(root[key], key, 0, key === 'parking' ? 200 : 60)) {
    const extras = key === 'parking' ? ['occupied', 'lot', 'model'] : ['model', 'path'];
    const p = object(v, ['id', 'owner', 'position', 'angle', 'color', ...extras], key);
    owned(p, key); point(p.position, `${key}.position`); num(p.angle, `${key}.angle`, -Math.PI * 2, Math.PI * 2);
    if (!/^#[0-9a-f]{6}$/i.test(text(p.color, `${key}.color`))) fail(key, 'expected hex colour');
    if (typeof p.model !== 'string' || !Object.hasOwn(vehicleDefinitions, p.model) || key === 'trafficSpawns' && vehicleDefinitions[p.model as VehicleModel].ai.controller !== 'road') fail(key, 'unsupported vehicle model');
    if (key === 'parking') { bool(p.occupied, 'parking.occupied'); bool(p.lot, 'parking.lot'); }
    else list(p.path, 'traffic.path', 1, 40).forEach(q => point(q, 'traffic.path.point'));
  }
  for (const v of list(root.stops, 'stops', 1, 100)) { const p = object(v, ['id', 'owner', 'point', 'name'], 'stop'); owned(p, 'stop'); ref(p.point, 'stop.point'); text(p.name, 'stop.name'); }
  const golf = object(root.golf, ['id', 'owner', 'center', 'width', 'height', 'clubhouse', 'route', 'path', 'holes'], 'golf'); owned(golf, 'golf'); point(golf.center, 'golf.center'); point(golf.clubhouse, 'golf.clubhouse'); num(golf.width, 'golf.width', 1, 500); num(golf.height, 'golf.height', 1, 500);
  for (const key of ['route', 'path'] as const) list(golf[key], `golf.${key}`, 3, 40).forEach(p => point(p, `golf.${key}`));
  for (const v of list(golf.holes, 'golf.holes', 1, 30)) { const h = object(v, ['tee', 'green', 'bunker'], 'hole'); Object.values(h).forEach(p => point(p, 'hole')); }
  for (const v of list(root.ridges, 'ridges', 0, 30)) { const p = object(v, ['id', 'owner', 'points'], 'ridge'); owned(p, 'ridge'); list(p.points, 'ridge.points', 5, 100).forEach(p => point(p, 'ridge.point')); }
  for (const v of list(root.labels, 'labels', 0, 100)) { const p = object(v, ['id', 'owner', 'position', 'text', 'size', 'color'], 'label'); owned(p, 'label'); point(p.position, 'label.position'); text(p.text, 'label.text'); text(p.color, 'label.color'); num(p.size, 'label.size', 0.1, 10); }
  const polygon = (v: unknown, path: string) => {
    const vertices = list(v, path, 3, 100); vertices.forEach(p => point(p, path));
    const ring = vertices as Vec[];
    if (ring.reduce((sum, a, i) => { const b = ring[(i + 1) % ring.length]; return sum + Math.hypot(a.x - b.x, a.y - b.y); }, 0) > 10000) fail(path, 'perimeter exceeds 10 km workload budget');
  };
  for (const key of ['terrainRegions', 'accessAreas', 'districtZones'] as const) for (const v of list(root[key], key, 0, 100)) {
    const extras = key === 'terrainRegions' ? ['surface', 'priority'] : key === 'accessAreas' ? ['driving', 'priority'] : key === 'districtZones' ? ['name', 'priority'] : [];
    const p = object(v, ['id', 'owner', 'outline', ...extras], key, key === 'terrainRegions' ? ['texture'] : []); owned(p, key); polygon(p.outline, `${key}.outline`);
    if (p.priority !== undefined) num(p.priority, `${key}.priority`, -1000, 1000);
    if (key === 'terrainRegions' && p.texture !== undefined && (p.texture !== 'gravel' || p.surface !== 'paving')) fail(key, 'gravel texture requires paving');
    if (key === 'terrainRegions' && !['road', 'sand', 'paving', 'grass'].includes(p.surface as string)) fail(key, 'unknown surface');
    if (key === 'accessAreas' && !['direct', 'approach'].includes(p.driving as string)) fail(key, 'unknown driving policy');
    if (key === 'districtZones') text(p.name, `${key}.name`);
  }
  const landIds = new Set<string>();
  for (const v of list(root.landRegions, 'landRegions', 1, 100)) {
    const p = object(v, ['id', 'owner'], 'landRegion', ['outline', 'pointRefs']); owned(p, 'landRegion'); landIds.add(p.id as string);
    if ((p.outline === undefined) === (p.pointRefs === undefined)) fail('landRegion', 'expected exactly one of outline or pointRefs');
    if (p.outline !== undefined) polygon(p.outline, 'landRegion.outline');
    else {
      const ring = list(p.pointRefs, 'landRegion.pointRefs', 3, 100);
      if (new Set(ring).size !== ring.length) fail('landRegion.pointRefs', 'duplicate ring references');
      ring.forEach(r => ref(r, 'landRegion.pointRefs'));
    }
  }
  const landRef = (v: unknown, path: string) => { if (!landIds.has(text(v, path))) fail(path, 'unknown land region'); };
  for (const v of list(root.landPresentation, 'landPresentation', 0, 100)) {
    const p = object(v, ['id','owner','land','color'], 'landPresentation', ['texture']); owned(p,'landPresentation'); landRef(p.land,'landPresentation.land');
    if (!/^#[0-9a-f]{6}$/i.test(text(p.color,'landPresentation.color'))) fail('landPresentation','expected hex colour');
    if (p.texture !== undefined && p.texture !== 'asphalt') fail('landPresentation.texture','unknown texture');
  }
  const edgeRefs = (v: unknown, landId: string) => {
    const land=(root.landRegions as LandRegion[]).find(r=>r.id===landId)!;
    const count='outline' in land ? land.outline.length : land.pointRefs.length;
    const edges=list(v,'edges',0,100);
    if(new Set(edges).size!==edges.length)fail('edges','duplicate edge');
    for(const edge of edges) if(!Number.isInteger(edge)||num(edge,'edge',0,count-1)!==edge)fail('edge','expected edge index');
  };
  for (const v of list(root.surf, 'surf', 0, 100)) {
    const p=object(v,['id','owner','land','edges'],'surf'); owned(p,'surf'); landRef(p.land,'surf.land'); edgeRefs(p.edges,p.land as string);
  }
  let panelWork = 0;
  const panelChildIds: string[] = [];
  for (const v of list(root.boundaryPlacements, 'boundaryPlacements', 0, 20)) {
    const p = object(v, ['id','owner','land','type','edges','maxLength','inset','panels','period','excludeLand','excludeRoads','clearance'], 'boundaryPlacement'); owned(p,'boundaryPlacement'); landRef(p.land,'boundaryPlacement.land'); kindOf(p.type,'boundaryPlacement.type','guardrail'); edgeRefs(p.edges,p.land as string);
    if ((p.id as string).length > 110) fail('boundaryPlacement.id','max 110 characters for stable child IDs');
    num(p.maxLength,'boundaryPlacement.maxLength',2,20); num(p.inset,'boundaryPlacement.inset',0,5); num(p.clearance,'boundaryPlacement.clearance',0,20);
    num(p.period,'boundaryPlacement.period',1,20); num(p.panels,'boundaryPlacement.panels',0,p.period as number);
    if (!Number.isInteger(p.period) || !Number.isInteger(p.panels)) fail('boundaryPlacement','expected integer repeat');
    for (const r of list(p.excludeLand,'boundaryPlacement.excludeLand',0,100)) landRef(r,'boundaryPlacement.excludeLand');
    for (const r of list(p.excludeRoads,'boundaryPlacement.excludeRoads',0,100)) if (!(root.roads as MapDocument['roads']).some(road=>road.id===r)) fail('boundaryPlacement.excludeRoads','unknown road');
    const r = (root.landRegions as LandRegion[]).find(r=>r.id===p.land)!;
    const lookup = new Map((root.points as MapPoint[]).map(p=>[p.id,p.position]));
    const ring = 'outline' in r ? r.outline : r.pointRefs.map(id=>lookup.get(id));
    if (ring.every((v): v is Vec => v !== undefined)) {
      for (const edge of p.edges as number[]) {
        const a=ring[edge],b=ring[(edge+1)%ring.length],slots=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/(p.maxLength as number));
        panelWork += slots;
        if (panelWork > 2000) fail('boundaryPlacements','panel workload exceeds 2000 slots');
        for(let slot=0;slot<slots;slot++)panelChildIds.push(`${p.id}-edge-${edge}-slot-${slot}`);
      }
    }
  }
  if (panelWork > 2000) fail('boundaryPlacements','panel workload exceeds 2000 slots');
  for (const v of list(root.objectPlacements, 'objectPlacements', 0, 500)) {
    const p = object(v, ['id', 'owner', 'type', 'position', 'angle', 'color', 'label'], 'objectPlacement', ['width', 'height', 'storeys', 'artworkScale', 'features']);
    owned(p, 'objectPlacement'); kindOf(p.type, 'objectPlacement.type'); point(p.position, 'objectPlacement.position'); num(p.angle, 'objectPlacement.angle', -Math.PI * 2, Math.PI * 2);
    if (!/^#[0-9a-f]{6}$/i.test(text(p.color, 'objectPlacement.color'))) fail('objectPlacement', 'expected hex colour');
    if (typeof p.label !== 'string' || p.label.length > 160) fail('objectPlacement.label', 'expected label (max 160)');
    if ((p.width === undefined) !== (p.height === undefined)) fail('objectPlacement', 'declare width and height together');
    if (p.width !== undefined) { num(p.width, 'objectPlacement.width', 0.2, 100); num(p.height, 'objectPlacement.height', 0.2, 100); }
    if (p.storeys !== undefined) { if (kinds[p.type as string] !== 'building') fail('objectPlacement.storeys', 'only buildings have storeys'); num(p.storeys, 'objectPlacement.storeys', 1, 50); }
    if (p.artworkScale !== undefined) num(p.artworkScale, 'objectPlacement.artworkScale', 0.01, 100);
    if (p.features !== undefined) features(p.features, 'objectPlacement.features');
  }
  const nodeIds = new Set<string>();
  for (const v of list(root.accessNodes, 'accessNodes', 0, 200)) { const p = object(v, ['id', 'owner', 'position', 'road'], 'accessNode'); owned(p, 'accessNode'); point(p.position, 'accessNode.position'); bool(p.road, 'accessNode.road'); nodeIds.add(p.id as string); }
  let accessWork = 0;
  for (const v of list(root.accessEdges, 'accessEdges', 0, 500)) {
    const p = object(v, ['id', 'owner', 'fromNode', 'toNode', 'modes'], 'accessEdge'); owned(p, 'accessEdge');
    if (!nodeIds.has(p.fromNode as string) || !nodeIds.has(p.toNode as string) || p.fromNode === p.toNode) fail('accessEdge', 'expected distinct known access nodes');
    const modes = list(p.modes, 'accessEdge.modes', 1, 2); if (new Set(modes).size !== modes.length || modes.some(m => m !== 'walk' && m !== 'drive')) fail('accessEdge.modes', 'expected unique walk/drive modes');
    const nodes = root.accessNodes as AccessNode[], a = nodes.find(n => n.id === p.fromNode)!.position, b = nodes.find(n => n.id === p.toNode)!.position; accessWork += Math.hypot(a.x-b.x, a.y-b.y);
  }
  if (accessWork > 10000) fail('accessEdges', 'total access route length exceeds 10 km workload budget');
  for (const v of list(root.residents, 'residents', 0, 200)) { const p = object(v, ['id', 'owner', 'position', 'color', 'wander'], 'resident'); owned(p, 'resident'); point(p.position, 'resident.position'); text(p.color, 'resident.color'); point(p.wander, 'resident.wander'); num((p.wander as Vec).x, 'resident.wander.x', -10, 10); num((p.wander as Vec).y, 'resident.wander.y', -10, 10); }
  for (const v of list(root.groundMarks, 'groundMarks', 0, 500)) { const p = object(v, ['id', 'owner', 'points', 'color', 'width', 'fill'], 'groundMark'); owned(p, 'groundMark'); list(p.points, 'groundMark.points', 2, 100).forEach(q => point(q, 'groundMark.point')); text(p.color, 'groundMark.color'); num(p.width, 'groundMark.width', 0.01, 10); bool(p.fill, 'groundMark.fill'); }
  for (const v of list(root.groundLabels, 'groundLabels', 0, 100)) { const p = object(v, ['id', 'owner', 'position', 'text', 'size', 'color'], 'groundLabel'); owned(p, 'groundLabel'); point(p.position, 'groundLabel.position'); text(p.text, 'groundLabel.text'); text(p.color, 'groundLabel.color'); num(p.size, 'groundLabel.size', 0.1, 10); }
  const gen = object(root.generation, ['ruralSeed', 'candidates', 'countryLand', 'cityLand', 'harbourLand', 'bridgeLands'], 'generation'); num(gen.ruralSeed, 'ruralSeed', 0, 2147483647); num(gen.candidates, 'candidates', 0, 5000); if (!Number.isInteger(gen.candidates)) fail('candidates', 'must be integer');
  for (const key of ['countryLand','cityLand','harbourLand']) landRef(gen[key],`generation.${key}`);
  for (const r of list(gen.bridgeLands,'generation.bridgeLands',0,20)) landRef(r,'generation.bridgeLands');
  for (const v of list(root.constraints, 'constraints', 0, 20)) { const p = object(v, ['id', 'type', 'fromLand', 'toLand', 'direction', 'minimum', 'resolution'], 'constraint'); id(p.id, 'constraint.id'); if (p.type !== 'water-gap') fail('constraint', 'unknown type'); const lands = [...landIds]; if (!lands.includes(p.fromLand as string) || !lands.includes(p.toLand as string) || p.fromLand === p.toLand) fail('constraint', 'expected distinct known land regions'); point(p.direction, 'constraint.direction'); if (Math.abs(Math.hypot((p.direction as Vec).x,(p.direction as Vec).y)-1)>1e-6) fail('constraint.direction','expected a unit vector'); num(p.minimum, 'minimum', 1, 500); num(p.resolution, 'resolution', 0.5, 10); }
  if (panelChildIds.some(id=>ids.has(id))) fail('boundaryPlacements','reserved child ID collides with an authored entity');
  if (owners.some(o => !districts.has(o))) fail('owner', 'unknown district');
  if (refs.some(r => !pointIds.has(r))) fail('reference', 'unknown geometry point');
  const doc = value as MapDocument, lookup = new Map(doc.points.map(p => [p.id, p.position]));
  // These attachments are implemented by fixed city/bridge generators, so an
  // import cannot silently redefine their topology or turn them editable.
  for (const [id, x, y, index] of [['node-00', 240, 80, 0], ['node-01', 310, 80, 1], ['node-06', 310, 200, 6], ['node-07', 240, 200, 7]] as [string, number, number, number][]) {
    const p = doc.points.find(p => p.id === id);
    if (!p || p.editable || p.weight !== 0 || p.position.x !== x || p.position.y !== y || doc.nodes[index] !== id) fail(id, 'fixed bridge attachment cannot be changed');
  }
  for (const id of ['city', 'harbour']) if (!doc.districts.some(d => d.id === id && !d.editable)) fail(id, 'fixed context must be read-only');
  for (const id of ['southern-estates', 'highlands']) if (!doc.districts.some(d => d.id === id && d.editable)) fail(id, 'required editable district missing');
  let roadWork = 0;
  for (const road of doc.roads) {
    const anchors = [road.from, ...road.via, road.to].map(id => lookup.get(id)!);
    for (let i = 1; i < anchors.length; i++) roadWork += Math.hypot(anchors[i].x - anchors[i - 1].x, anchors[i].y - anchors[i - 1].y);
  }
  if (roadWork > 10000) fail('roads', 'total authored anchor length exceeds 10 km workload budget');
  const trafficWork = doc.trafficSpawns.reduce((sum, s) => sum + s.path.reduce((length, p, i) => { const from = i ? s.path[i - 1] : s.position; return length + Math.hypot(p.x - from.x, p.y - from.y); }, 0), 0);
  if (trafficWork > 10000) fail('trafficSpawns', 'total initial route length exceeds 10 km workload budget');
  for (const region of doc.landRegions) {
    const ring = 'outline' in region ? region.outline : region.pointRefs.map(id=>lookup.get(id)!);
    if (ring.reduce((sum,a,i)=>sum+Math.hypot(a.x-ring[(i+1)%ring.length].x,a.y-ring[(i+1)%ring.length].y),0)>10000) fail(region.id,'perimeter exceeds 10 km workload budget');
  }
}

import type { Vec } from '../physics';
import { vehicleDefinitions, type VehicleModel } from '../vehicles';

export type Owned = { id: string; owner: string };
export type MapPoint = Owned & { position: Vec; weight: number; editable: boolean };
export type Placement = Owned & { position: Vec; name: string; color: string };
export const countryPropKinds = ['building', 'tree', 'rock', 'hydrant', 'crate', 'bench', 'lamp', 'kiosk', 'bin', 'barrier', 'shed', 'pump', 'guardrail', 'palm'] as const;
export type CountryProp = Owned & { position: Vec; kind: typeof countryPropKinds[number]; width: number; height: number; angle: number; color: string; label: string };
export type Parking = Owned & { position: Vec; angle: number; occupied: boolean; lot: boolean; model: VehicleModel; color: string };
export type TrafficSpawn = Owned & { position: Vec; angle: number; model: VehicleModel; color: string; path: Vec[] };
export type AuthoredCollection = 'countryProps' | 'parking' | 'trafficSpawns';
export type AuthoredDescriptor = CountryProp | Parking | TrafficSpawn;
export type MapDocument = {
  schemaVersion: 2;
  coordinates: 'metres-screen-south-positive-radians';
  envelope: { min: Vec; max: Vec };
  districts: { id: string; name: string; editable: boolean }[];
  points: MapPoint[];
  highlandOutline: string[];
  roads: (Owned & { from: string; to: string; via: string[]; name: string; bridge: boolean })[];
  nodes: string[];
  villas: Placement[];
  countryProps: CountryProp[];
  parking: Parking[];
  trafficSpawns: TrafficSpawn[];
  stops: (Owned & { point: string; name: string })[];
  golf: Owned & { center: Vec; width: number; height: number; clubhouse: Vec; route: Vec[]; path: Vec[]; holes: { tee: Vec; green: Vec; bunker: Vec }[] };
  ridges: (Owned & { points: Vec[] })[];
  labels: (Owned & { position: Vec; text: string; size: number; color: string })[];
  beach: {
    shore: string[]; left: number; right: number; top: number;
    promenade: Owned & { left: number; right: number; top: number; bottom: number; entries: number[]; southEntries: number[] };
    hotels: (Placement & { width: number; height: number; floors: number; style?: 'luxury-condo' })[];
    towers: (Owned & { position: Vec })[];
    sets: (Owned & { position: Vec })[];
    castles: (Owned & { position: Vec })[];
  };
  generation: { ruralSeed: number; candidates: number };
  constraints: { id: string; type: 'beach-water-gap'; minimum: number; resolution: number }[];
};

/** Strict shape checking also bounds imported workloads before any factory runs. */
export function assertMap(value: unknown): asserts value is MapDocument {
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
  const placement = (v: unknown, path: string, extras: string[] = [], optional: string[] = []) => { const p = object(v, ['id', 'owner', 'position', 'name', 'color', ...extras], path, optional); owned(p, path); point(p.position, `${path}.position`); text(p.name, path); if (!/^#[0-9a-f]{6}$/i.test(text(p.color, path))) fail(path, 'expected hex colour'); return p; };
  const root = object(value, ['schemaVersion', 'coordinates', 'envelope', 'districts', 'points', 'highlandOutline', 'roads', 'nodes', 'villas', 'countryProps', 'parking', 'trafficSpawns', 'stops', 'golf', 'ridges', 'labels', 'beach', 'generation', 'constraints'], 'map');
  if (root.schemaVersion !== 2 || root.coordinates !== 'metres-screen-south-positive-radians') fail('map', 'unsupported schema or coordinate convention');
  const env = object(root.envelope, ['min', 'max'], 'envelope'); point(env.min, 'envelope.min'); point(env.max, 'envelope.max');
  const bounds = env as unknown as MapDocument['envelope'];
  for (const axis of ['x', 'y'] as const) if (bounds.max[axis] <= bounds.min[axis] || bounds.max[axis] - bounds.min[axis] > 2000) fail('envelope', 'must have positive extent at most 2000 m');
  const districts = new Set<string>();
  for (const d of list(root.districts, 'districts', 1, 20)) { const p = object(d, ['id', 'name', 'editable'], 'district'); id(p.id, 'district.id'); districts.add(p.id as string); text(p.name, 'district.name'); bool(p.editable, 'district.editable'); }
  const pointIds = new Set<string>(), locked = new Set<string>();
  for (const v of list(root.points, 'points', 3)) { const p = object(v, ['id', 'owner', 'position', 'weight', 'editable'], 'point'); owned(p, 'point'); point(p.position, 'point.position'); num(p.weight, 'point.weight', 0, 1); bool(p.editable, 'point.editable'); pointIds.add(p.id as string); if (!p.editable) locked.add(p.id as string); }
  for (const key of ['highlandOutline', 'nodes'] as const) for (const v of list(root[key], key, 3)) ref(v, key);
  if (new Set(root.nodes as string[]).size !== (root.nodes as string[]).length || new Set(root.highlandOutline as string[]).size !== (root.highlandOutline as string[]).length) fail('map', 'duplicate ring/node references');
  const nodes = new Set(root.nodes as string[]);
  for (const v of list(root.roads, 'roads', 1, 100)) { const p = object(v, ['id', 'owner', 'from', 'to', 'via', 'name', 'bridge'], 'road'); owned(p, 'road'); ref(p.from, 'road.from'); ref(p.to, 'road.to'); if (!nodes.has(p.from as string) || !nodes.has(p.to as string) || p.from === p.to) fail('road', 'endpoints must be distinct nodes'); text(p.name, 'road.name'); bool(p.bridge, 'road.bridge'); const via = list(p.via, 'road.via', 0, 20); via.forEach(v => ref(v, 'road.via')); if (p.bridge && [p.from, ...via, p.to].some(v => !locked.has(v as string))) fail('road', 'bridge anchors must be pinned'); }
  for (const v of list(root.villas, 'villas', 1, 100)) placement(v, 'villa');
  for (const key of ['countryProps', 'parking', 'trafficSpawns'] as const) for (const v of list(root[key], key, 0, key === 'countryProps' ? 500 : key === 'parking' ? 200 : 60)) {
    const extras = key === 'countryProps' ? ['kind', 'width', 'height', 'label'] : key === 'parking' ? ['occupied', 'lot', 'model'] : ['model', 'path'];
    const p = object(v, ['id', 'owner', 'position', 'angle', 'color', ...extras], key);
    owned(p, key); point(p.position, `${key}.position`); num(p.angle, `${key}.angle`, -Math.PI * 2, Math.PI * 2);
    if (!/^#[0-9a-f]{6}$/i.test(text(p.color, `${key}.color`))) fail(key, 'expected hex colour');
    if (key === 'countryProps') {
      if (!countryPropKinds.includes(p.kind as CountryProp['kind'])) fail(key, 'unknown prop kind');
      num(p.width, 'prop.width', 0.2, 100); num(p.height, 'prop.height', 0.2, 100);
      if (typeof p.label !== 'string' || p.label.length > 160) fail(key, 'expected label (max 160)');
    } else {
      if (typeof p.model !== 'string' || !Object.hasOwn(vehicleDefinitions, p.model) || key === 'trafficSpawns' && vehicleDefinitions[p.model as VehicleModel].ai.controller !== 'road') fail(key, 'unsupported vehicle model');
      if (key === 'parking') { bool(p.occupied, 'parking.occupied'); bool(p.lot, 'parking.lot'); }
      else list(p.path, 'traffic.path', 1, 40).forEach(q => point(q, 'traffic.path.point'));
    }
  }
  for (const v of list(root.stops, 'stops', 1, 100)) { const p = object(v, ['id', 'owner', 'point', 'name'], 'stop'); owned(p, 'stop'); ref(p.point, 'stop.point'); text(p.name, 'stop.name'); }
  const golf = object(root.golf, ['id', 'owner', 'center', 'width', 'height', 'clubhouse', 'route', 'path', 'holes'], 'golf'); owned(golf, 'golf'); point(golf.center, 'golf.center'); point(golf.clubhouse, 'golf.clubhouse'); num(golf.width, 'golf.width', 1, 500); num(golf.height, 'golf.height', 1, 500);
  for (const key of ['route', 'path'] as const) list(golf[key], `golf.${key}`, 3, 40).forEach(p => point(p, `golf.${key}`));
  for (const v of list(golf.holes, 'golf.holes', 1, 30)) { const h = object(v, ['tee', 'green', 'bunker'], 'hole'); Object.values(h).forEach(p => point(p, 'hole')); }
  for (const v of list(root.ridges, 'ridges', 0, 30)) { const p = object(v, ['id', 'owner', 'points'], 'ridge'); owned(p, 'ridge'); list(p.points, 'ridge.points', 5, 100).forEach(p => point(p, 'ridge.point')); }
  for (const v of list(root.labels, 'labels', 0, 100)) { const p = object(v, ['id', 'owner', 'position', 'text', 'size', 'color'], 'label'); owned(p, 'label'); point(p.position, 'label.position'); text(p.text, 'label.text'); text(p.color, 'label.color'); num(p.size, 'label.size', 0.1, 10); }
  const beach = object(root.beach, ['shore', 'left', 'right', 'top', 'promenade', 'hotels', 'towers', 'sets', 'castles'], 'beach');
  for (const key of ['left', 'right', 'top']) num(beach[key], `beach.${key}`);
  const shore = list(beach.shore, 'beach.shore', 2, 100); shore.forEach(p => ref(p, 'beach.shore'));
  const prom = object(beach.promenade, ['id', 'owner', 'left', 'right', 'top', 'bottom', 'entries', 'southEntries'], 'promenade'); owned(prom, 'promenade');
  for (const key of ['left', 'right', 'top', 'bottom']) num(prom[key], `promenade.${key}`);
  if ((prom.right as number) - (prom.left as number) < 10 || (prom.bottom as number) - (prom.top as number) < 2) fail('promenade', 'invalid dimensions');
  for (const key of ['entries', 'southEntries']) { const xs = list(prom[key], `promenade.${key}`, 1, 30); xs.forEach((x, i) => { num(x, key, (prom.left as number) + 2.4, (prom.right as number) - 2.4); if (i && (x as number) - (xs[i - 1] as number) < 4.8) fail(key, 'entries must be ordered with 4.8 m spacing'); }); }
  for (const v of list(beach.hotels, 'hotels', 1, 30)) { const p = placement(v, 'hotel', ['width', 'height', 'floors'], ['style']); num(p.width, 'hotel.width', 1, 100); num(p.height, 'hotel.height', 1, 100); num(p.floors, 'hotel.floors', 1, 50); if (p.style !== undefined && p.style !== 'luxury-condo') fail('hotel.style', 'unknown style'); }
  for (const key of ['towers', 'sets', 'castles']) for (const v of list(beach[key], key, 0, 100)) { const p = object(v, ['id', 'owner', 'position'], key); owned(p, key); point(p.position, key); }
  const gen = object(root.generation, ['ruralSeed', 'candidates'], 'generation'); num(gen.ruralSeed, 'ruralSeed', 0, 2147483647); num(gen.candidates, 'candidates', 0, 5000); if (!Number.isInteger(gen.candidates)) fail('candidates', 'must be integer');
  for (const v of list(root.constraints, 'constraints', 1, 20)) { const p = object(v, ['id', 'type', 'minimum', 'resolution'], 'constraint'); id(p.id, 'constraint.id'); if (p.type !== 'beach-water-gap') fail('constraint', 'unknown type'); num(p.minimum, 'minimum', 1, 500); num(p.resolution, 'resolution', 0.5, 10); }
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
  for (const id of ['southern-estates', 'highlands', 'beach']) if (!doc.districts.some(d => d.id === id && d.editable)) fail(id, 'required editable district missing');
  let roadWork = 0;
  for (const road of doc.roads) {
    const anchors = [road.from, ...road.via, road.to].map(id => lookup.get(id)!);
    for (let i = 1; i < anchors.length; i++) roadWork += Math.hypot(anchors[i].x - anchors[i - 1].x, anchors[i].y - anchors[i - 1].y);
  }
  if (roadWork > 10000) fail('roads', 'total authored anchor length exceeds 10 km workload budget');
  const trafficWork = doc.trafficSpawns.reduce((sum, s) => sum + s.path.reduce((length, p, i) => { const from = i ? s.path[i - 1] : s.position; return length + Math.hypot(p.x - from.x, p.y - from.y); }, 0), 0);
  if (trafficWork > 10000) fail('trafficSpawns', 'total initial route length exceeds 10 km workload budget');
  const ring = doc.highlandOutline.map(id => lookup.get(id)!);
  if (ring.reduce((sum, a, i) => { const b = ring[(i + 1) % ring.length]; return sum + Math.hypot(a.x - b.x, a.y - b.y); }, 0) > 10000) fail('highlandOutline', 'perimeter exceeds 10 km workload budget');
  if (doc.beach.right <= doc.beach.left || doc.beach.right - doc.beach.left > 1000 || doc.beach.shore.some(id => lookup.get(id)!.y - doc.beach.top > 500)) fail('beach', 'beach must span at most 1000 × 500 m');
  doc.beach.shore.forEach((id, i) => { const p = lookup.get(id)!; if (i && p.x <= lookup.get(doc.beach.shore[i - 1])!.x || p.y <= doc.beach.top) fail('beach.shore', 'must be x-ordered and below beach top'); });
  if (lookup.get(doc.beach.shore[0])!.x !== doc.beach.left || lookup.get(doc.beach.shore.at(-1)!)!.x !== doc.beach.right) fail('beach.shore', 'endpoints must match beach left/right');
}

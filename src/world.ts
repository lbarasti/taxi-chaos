import { Body, SpatialHash, contact, cross, dist, dot, sub, vec, type Vec } from './physics';
import type { BuildingPresentation, PropKind, ResolvedFeature } from './catalogue/schema';
import { contains, regionBounds, regionOrder } from './regions';
import { createAccess, type AccessGeometry } from './access';
import { pathLength } from './countryside';
import { defaultCompiledMap, type CompiledMap } from './map/compile';
import { createVehicleBody, vehicleDefinition } from './vehicles';
import type { Parking } from './map/schema';
import { CITY_GRID, CITY_SIZE, citySegmentOpen, type CityBlock, type CityBuilding } from './city';
import { createCityDetour, type StreetAccess } from './city-navigation';
import type { PropArtwork } from './artwork/catalogue';
import { PORT_CONTAINERS, PORT_CONNECTIONS, PORT_GATES, SWAP_CONTAINER, portAccess, portNeighbours, portNode, portPath } from './harbour';

export type { PropKind } from './catalogue/schema';
// Guardrail breakage uses normal approach speed; glancing hits slide.
export const RAIL_BREAK_SPEED = 12;
export const isStructural = (kind: PropKind) => kind === 'shed' || kind === 'barracks' || kind === 'station';
export const isRigidObstacle = (kind: PropKind) => ['fountain', 'building', 'rock', 'guardrail', 'container', 'fence', 'port-gate', 'lifeguard-tower', 'palm', 'bollard', 'promenade-edge', 'pedestrian-gate'].includes(kind) || isStructural(kind) || kind === 'pump' || kind === 'tree';
export const blocksWalking = (kind: PropKind) => kind !== 'pedestrian-gate';
export type Prop = { id: number; sourceId?: string; storeys?: number; artwork?: PropArtwork; building?: CityBuilding; body: Body; kind: PropKind; alive: boolean; hp: number; maxHp: number; color: string; label: string; brokenAt: number; lastHit: number; fire: number; fuelSpent: boolean; blamed: boolean; presentation?: BuildingPresentation; features?: readonly ResolvedFeature[] };
export type Person = { id: number; sourceId?: string; position: Vec; home: Vec; phase: number; color: string; panic: number; alive: boolean; aboard: boolean; health: number; velocity: Vec; angle: number; deathTime: number; role: 'civilian' | 'customer' | 'officer'; hitAt: number; wander?: Vec; fall?: { elapsed: number; duration: number; angularVelocity: number } };
export type Block = CityBlock;
export type ParkingSpot = Parking & { sourceId: string };
export const GRID = CITY_GRID, SIZE = CITY_SIZE, GARAGE = vec(4, 28);
export function district(p: Vec, map = defaultCompiledMap) {
  const { SOUTH_WOODS_Y } = map.country;
  const zone = [...map.document.districtZones].sort(regionOrder).reverse().find(z => contains(z.outline,p));
  if (zone) return zone.name;
  return map.harbour.inHarbour(p) ? 'NORTHSTAR HARBOUR' : p.y >= SOUTH_WOODS_Y ? (p.x < 110 ? 'CEDAR WOODS' : p.x < 225 ? 'FAIRWAY CLUB' : 'WOODLAND ESTATES') : p.x > 440 ? 'EAGLE HIGHLANDS' : p.x >= 296 ? 'PINE WOODS' : p.x > 254 ? 'EAST RIVER' : p.x < 80 ? (p.y < 100 ? 'OLD TOWN' : 'MARKET QUARTER') : p.x < 160 ? (p.y < 100 ? 'MIDTOWN' : 'GARDEN DISTRICT') : (p.y < 100 ? 'THE DOCKS' : 'EAST VILLAGE');
}
export function seeded(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export class World {
  pools: Body[];
  navigation: ReturnType<typeof createNavigation>;
  props: Prop[] = []; people: Person[] = []; blocks: readonly Block[] = []; hash = new SpatialHash<Prop>(); random = seeded(1976);
  private personSerial = 0;
  parking: ParkingSpot[] = [];
  add(kind: PropKind, x: number, y: number, w: number, h: number, color: string, label = '', angle = 0) {
    const body = new Body(x, y, Infinity, w, h); body.angle = angle;
    const hp = ['fountain', 'building', 'rock', 'container', 'fence', 'port-gate', 'bollard', 'promenade-edge', 'pedestrian-gate'].includes(kind) ? Infinity : kind === 'lifeguard-tower' ? 18 : kind === 'palm' ? 20 : kind === 'sandcastle' ? 1 : kind === 'guardrail' ? 24 : kind === 'barracks' ? 180 : kind === 'station' ? 220 : kind === 'shed' ? 90 : kind === 'pump' ? 18 : kind === 'kiosk' ? 13 : kind === 'tree' ? 20 : kind === 'barrier' ? 7 : 3;
    const prop: Prop = { id: this.props.length, body, kind, alive: true, hp, maxHp: hp, color, label, brokenAt: -1, lastHit: -100, fire: 0, fuelSpent: false, blamed: false };
    this.props.push(prop); this.hash.insert(prop); return prop;
  }
  addPerson(p: Vec, role: Person['role'] = 'civilian', color = '#d4b487', pose?: { phase: number; angle: number }) {
    const person: Person = { id: this.personSerial++, position: { ...p }, home: { ...p }, phase: pose?.phase ?? this.random() * Math.PI * 2, color, panic: 0, alive: true, aboard: false, health: 100, velocity: vec(), angle: pose?.angle ?? this.random() * 6, deathTime: -1, role, hitAt: -100 };
    this.people.push(person); return person;
  }
  constructor(public readonly map: CompiledMap = defaultCompiledMap) {
    const { BRIDGE_Y, GOLF_COURSE, GOLF_HOLES, HIGHLAND_STOPS, VILLAS, VILLA_DRIVES, VILLA_POOLS, countryAccess, inCountryClearing, inHighlands } = map.country;
    this.parking = map.document.parking.map(p => ({ ...structuredClone(p), sourceId: p.id }));
    this.pools = VILLA_POOLS.map(p => new Body(p.position.x, p.position.y, Infinity, p.width, p.height));
    this.blocks = map.city.blocks;
    for (const block of this.blocks) {
      const { x, y, park, special } = block;
      if (park) {
        for (let i = 0; i < 10; i++) {
          // Keep the RNG stream, but leave the gravel cross and fountain rim clear.
          const lawn = (offset: number) => Math.abs(offset - 20) < 4.8 ? 20 + (offset < 20 ? -4.8 : 4.8) : offset;
          this.add('tree', x + lawn(11 + this.random() * 18), y + lawn(11 + this.random() * 18), 1.8, 1.8, '#426e5c');
        }
        this.add('kiosk', x + 24, y + 8.5, 3.4, 2, '#d88d64', 'ICE CREAM');
      } else if (special === 'fuel') {
        this.add('station', x + 14, y + 27, 10, 10, '#765952', 'LAST CHANCE FUEL');
        for (let i = 0; i < 3; i++) this.add('pump', x + 13 + i * 8, y + 13, 1.2, 2.4, '#d39060', 'FUEL');
        this.add('bin', x + 26, y + 28, 0.85, 0.85, '#76a79b');
      } else if (special !== 'parking') {
        for (const building of block.buildings) {
          const p = this.add('building', building.position.x, building.position.y, building.width, building.height, building.color, building.label);
          p.body.collisionRects = building.collision; p.sourceId = building.id; p.building = building; p.features = building.features;
        }
        if (special === 'barracks') this.add('barracks', x + 20.5, y + 14, 23, 10, '#69705a', 'CIVIC BARRACKS');
        if (special === 'depot') this.add('shed', x + 20.5, y + 14, 23, 10, '#776255', 'FREIGHT DEPOT');
        // Alley clutter only occupies retained passages, never a merged footprint.
        if (block.alleys === 'cross' || block.alleys === 'vertical' || block.alleys === 'west') {
          this.add('crate', x + 20.5, y + 13, 1.4, 1.4, '#bc9465');
          this.add('crate', x + 20.5, y + 14.6, 1.4, 1.4, '#bc9465');
          this.add('barrier', x + 20.5, y + 8.8, block.alleys === 'cross' ? 3.1 : 2.6, 0.6, '#e9aa5c');
        }
        if (block.alleys === 'cross' || block.alleys === 'horizontal') this.add('kiosk', x + 31, y + 20.5, 2.5, 3, '#ad6d68', 'NEWS');
      }
      for (let i = 0; i < 2; i++) {
        if (!block.campusId) {
          this.add('hydrant', x + 7.5, y + 11 + i * 18, 0.65, 0.65, '#eb735f');
          this.add('lamp', x + 32.4, y + 9 + i * 20, 0.6, 0.6, '#a7bfbb');
          this.add('bin', x + 12 + i * 16, y + 32.5, 0.85, 0.85, '#76a79b');
          this.add('bench', x + 12 + i * 16, y + 7.8, 2.4, 0.75, '#bf9870');
        }
        const home = block.residentHomes?.[i * 2] ?? vec(x + 8, y + 12 + i * 14);
        this.addPerson(home, 'civilian', ['#e9a69b', '#a7bce0', '#e4ca79', '#b0cbaa'][Math.floor(this.random() * 4)]);
        const home2 = block.residentHomes?.[i * 2 + 1] ?? vec(x + 15 + i * 12, y + (block.buildings.some(b => b.width > 10 || b.height > 10) ? 33 : 32));
        this.addPerson(home2, 'civilian', '#c3b7d7');
      }
    }
    for (const site of map.city.campuses) for (const prop of site.props) {
      this.add(prop.kind, prop.position.x, prop.position.y, prop.width, prop.height, prop.color, '', prop.angle ?? 0);
    }
    for (const p of map.placements) {
      const o=map.objects[p.id];
      const prop=this.add(o.kind,p.position.x,p.position.y,o.width,o.height,p.color,p.label,p.angle);
      prop.body.collisionRects = o.collision;
      Object.assign(prop,{sourceId:p.id,storeys:o.storeys,artwork:o.artwork,presentation:o.presentation,features:o.features});
    }
    for (const y of BRIDGE_Y) {
      for (const side of [-1, 1]) {
        this.add('lamp', 249, y + side * 9, 0.6, 0.6, '#a7bfbb');
      }
    }
    const ruralRandom = seeded(map.document.generation.ruralSeed);
    const outline=map.country.HIGHLAND_OUTLINE, bounds=regionBounds(outline);
    const reserved=[...map.document.parking,...map.document.trafficSpawns].map(p=>createVehicleBody(vehicleDefinition(p.model),p.position,p.angle));
    for(const p of map.document.parking) {const bay=new Body(p.position.x,p.position.y,Infinity,5.4,2.6);bay.angle=p.angle;reserved.push(bay);}
    for (let i=0;i<map.document.generation.candidates;i++) {
      const p=vec(bounds.min.x+ruralRandom()*(bounds.max.x-bounds.min.x),bounds.min.y+ruralRandom()*(bounds.max.y-bounds.min.y));
      const rock=i%8===0, size=rock?3+ruralRandom()*4:1.6, angle=ruralRandom()*Math.PI;
      if(!inHighlands(p)||countryAccess(p).distance<12||inCountryClearing(p)||HIGHLAND_STOPS.some(s=>dist(s.position,p)<20))continue;
      const body=new Body(p.x,p.y,Infinity,size,rock?size*.8:size); body.angle=angle;
      if(body.corners().some(map.land.inOcean)||reserved.some(other=>contact(body,other))||[...this.hash.query(body)].some(other=>contact(body,other.body)))continue;
      this.add(rock?'rock':'tree',p.x,p.y,size,body.h,rock?'#788278':['#3d654f','#426e58','#315747'][i%3],'',angle);
    }
    const cityRandom = this.random; this.random = ruralRandom;
    for (const villa of VILLAS) {
      const p = villa.position;
      this.add('building', p.x, p.y, 16, 10, villa.color, `VILLA ${villa.name}`).sourceId = villa.id;
      this.add('building', p.x - 5, p.y - 6, 6, 3, villa.color, 'VILLA GUEST HOUSE').sourceId = villa.id;
      const entry = VILLA_DRIVES[VILLAS.indexOf(villa)][0];
      const lamp = vec(p.x + (entry.x > p.x ? -18 : 18), p.y + (entry.y > p.y ? -12 : 12));
      this.add('lamp', lamp.x, lamp.y, 0.6, 0.6, '#a7bfbb');
      this.addPerson(vec(p.x + 12, p.y - 8), 'civilian', '#e4ca79');
      this.addPerson(vec(p.x - 12, p.y + 6), 'civilian', '#d7c9e7');
    }
    const club = GOLF_COURSE.clubhouse;
    this.add('building', club.x, club.y, 10, 14, '#b89a74', 'FAIRWAY CLUB').sourceId = map.document.golf.id;
    this.add('lamp', club.x - 7, club.y + 7, 0.6, 0.6, '#a7bfbb');
    for (const hole of GOLF_HOLES) this.addPerson(vec(hole.tee.x + 2, hole.tee.y - 2), 'civilian', '#f0e6c8');
    for (const stop of HIGHLAND_STOPS) {
      const p = stop.position;
      const clearing = (radius: number, clearance: number) => Array.from({ length: 16 }, (_, i) => vec(p.x + Math.cos(i * Math.PI / 8) * radius, p.y + Math.sin(i * Math.PI / 8) * radius)).find(point => inHighlands(point) && countryAccess(point).distance > clearance);
      const kiosk = clearing(14, 10), bench = clearing(11, 7);
      if (kiosk) this.add('kiosk', kiosk.x, kiosk.y, 3.8, 3, '#987c59', stop.name.toUpperCase()).sourceId = stop.id;
      if (bench) { this.add('bench', bench.x, bench.y, 2.4, 0.75, '#bf9870').sourceId = stop.id; this.addPerson(vec(bench.x + 2, bench.y + 2), 'civilian', '#b0cbaa'); }
    }
    this.random = cityRandom;
    for (const box of PORT_CONTAINERS) this.add('container', box.position.x, box.position.y, 14, 5.6, box.color, box.label);
    // Three walls form an open, genuinely drivable container, opening east.
    this.add('container', SWAP_CONTAINER.x, SWAP_CONTAINER.y - 3.1, 14, 0.35, '#61a5a1', 'EXCHANGE WALL');
    this.add('container', SWAP_CONTAINER.x, SWAP_CONTAINER.y + 3.1, 14, 0.35, '#61a5a1', 'EXCHANGE WALL');
    this.add('container', SWAP_CONTAINER.x - 7, SWAP_CONTAINER.y, 0.35, 6.2, '#61a5a1', 'EXCHANGE WALL');
    // Gate islands leave two 10 m lanes. Per-vehicle access prevents tailgating
    // a permitted freight NPC through the player's security collider.
    for (const [a, b] of [[72, 194], [206, 214], [226, 252]]) this.add('fence', (a + b) / 2, -17, b - a, 0.5, '#839c9b');
    for (const x of [map.harbour.left, map.harbour.right]) this.add('fence', x, -76, 0.5, 118, '#839c9b');
    for (const p of PORT_GATES) this.add('port-gate', p.x, p.y, 12, 0.65, '#e3c883', 'SECURITY');
    this.add('building', 210, -24, 6, 6, '#788c89', 'PORT SECURITY');
    this.add('building', 163, -28, 28, 12, '#647977', 'BONDED WAREHOUSE');
    for (const x of [78, 92, 152, 188, 245]) for (const y of [-29, -124]) this.add('lamp', x, y, 0.6, 0.6, '#b9cec1');
    for (const x of [94, 106, 134, 146, 182, 194, 222, 234]) this.add('building', x, -130, 1.2, 1.2, '#568d90', 'CRANE FOOT');
    for (const x of [91, 129, 177, 243]) this.add('crate', x, -28, 1.5, 1.5, '#bc9465');
    const portRandom = this.random; this.random = seeded(9076);
    for (const p of [vec(210, -19.5), vec(96, -63), vec(150, -96), vec(180, -64)]) this.addPerson(p, 'civilian', '#e3bd67');
    this.random = portRandom;
    const residentRandom = this.random; this.random = seeded(1965);
    for (const resident of map.document.residents) {
      const person = this.addPerson(resident.position,'civilian',resident.color); person.wander = resident.wander; person.sourceId = resident.id;
    }
    this.random = residentRandom;
    this.navigation = createNavigation(map, this);
  }
}

// Prefer simple orthogonal routes; the compiled road graph supplies detours
// around authored sites that replace former grid streets.
export function createNavigation(map: CompiledMap, collisionGeometry?: AccessGeometry) {
const { onPortRoad } = map.harbour;
const { ROAD_NODES, countryAccess, countryNeighbours, countryNode, countryPath, isCountry } = map.country;
// Standalone map consumers build the same complete world lazily when they need
// access clearance. A live World supplies its own collision index after spawning.
let detachedGeometry: AccessGeometry | undefined;
const access = createAccess(map, () => collisionGeometry ?? (detachedGeometry ??= new World(map)));
const detour = createCityDetour(map.city);
const insideBuilding = (p: Vec) => map.city.buildings.some(b => Math.abs(p.x - b.position.x) < b.width / 2 && Math.abs(p.y - b.position.y) < b.height / 2);
function gridNode(p: Vec): Vec { return vec(Math.round(Math.max(0, Math.min(SIZE, p.x)) / GRID) * GRID, Math.round(Math.max(0, Math.min(SIZE, p.y)) / GRID) * GRID); }
function roadNode(p: Vec): Vec { return access.areaAt(p) ? gridNode(access.approach(p)) : onPortRoad(p) ? portNode(p) : isCountry(p) ? countryNode(p) : gridNode(p); }
const roadDistance = (p: Vec) => access.areaAt(p) ? dist(p, access.approach(p)) : onPortRoad(p) ? portAccess(p).distance : isCountry(p) ? countryAccess(p).distance : cityRoadDistance(p);
function roadNeighbours(p: Vec): Vec[] {
  const port = portNeighbours(p);
  if (onPortRoad(p)) return port;
  const country = countryNeighbours(p);
  if (isCountry(p)) return country;
  return [...[vec(p.x + GRID, p.y), vec(p.x - GRID, p.y), vec(p.x, p.y + GRID), vec(p.x, p.y - GRID)].filter(n => n.x >= 0 && n.y >= 0 && n.x <= SIZE && n.y <= SIZE && citySegmentOpen(map.city, p, n)), ...country, ...port];
}
function streetAccess(p: Vec): StreetAccess {
  const n = gridNode(p), dx = Math.abs(n.x - p.x), dy = Math.abs(n.y - p.y);
  const vx = vec(n.x, p.y), hy = vec(p.x, n.y);
  const vertical = citySegmentOpen(map.city, vx, vx), horizontal = citySegmentOpen(map.city, hy, hy);
  if (!vertical && !horizontal) return nearestOpenStreet(p);
  if (vertical && dx <= 6 || horizontal && dy <= 6) return { point: { ...p }, vertical: vertical && dx <= 6 ? n.x : undefined, horizontal: horizontal && dy <= 6 ? n.y : undefined };
  return vertical && (dx < dy || !horizontal) ? { point: vx, vertical: n.x } : { point: hy, horizontal: n.y };
}
function nearestOpenStreet(p: Vec): StreetAccess {
  let best: StreetAccess = { point: { ...p } }, distance = Infinity;
  for (const road of map.city.roads) {
    const vertical = road.from.x === road.to.x;
    const q = vertical ? vec(road.from.x, Math.max(road.from.y, Math.min(road.to.y, p.y))) : vec(Math.max(road.from.x, Math.min(road.to.x, p.x)), road.from.y);
    const d = dist(p, q);
    if (d < distance) { distance = d; best = { point: q, vertical: vertical ? road.from.x : undefined, horizontal: vertical ? undefined : road.from.y, distance: d }; }
  }
  return best;
}
function streetPoint(p: Vec): Vec {
  const access = streetAccess(p);
  const projections = [access.vertical === undefined ? undefined : vec(access.vertical, access.point.y), access.horizontal === undefined ? undefined : vec(access.point.x, access.horizontal)].filter((q): q is Vec => !!q);
  return projections.sort((a, b) => dist(p, a) - dist(p, b))[0] ?? access.point;
}
function cityRoadDistance(p: Vec): number {
  const access = streetAccess(p);
  return access.distance ?? Math.min(access.vertical === undefined ? Infinity : Math.abs(p.x - access.vertical), access.horizontal === undefined ? Infinity : Math.abs(p.y - access.horizontal));
}
const roadProjection = (p: Vec) => access.areaAt(p) ? access.approach(p) : onPortRoad(p) ? portAccess(p).point : isCountry(p) ? countryAccess(p).point : streetAccess(p).point;
function simplifyPath(points: Vec[]): Vec[] {
  const result: Vec[] = [];
  for (const point of points) {
    if (result.length && dist(result[result.length - 1], point) < 0.01) continue;
    while (result.length >= 2) {
      const a = sub(result[result.length - 1], result[result.length - 2]), b = sub(point, result[result.length - 1]);
      if (Math.abs(cross(a, b)) > 0.001 || dot(a, b) < 0) break;
      result.pop();
    }
    result.push({ ...point });
  }
  return result;
}
function gridPath(from: Vec, to: Vec): Vec[] {
  if (dist(from, to) < 0.01) return [{ ...to }];
  const start = streetAccess(from), end = streetAccess(to), a = start.point, b = end.point;
  const candidates: Vec[][] = [];
  if ((start.vertical !== undefined && start.vertical === end.vertical) || (start.horizontal !== undefined && start.horizontal === end.horizontal)) candidates.push([a, b]);
  if (start.vertical !== undefined && end.horizontal !== undefined) candidates.push([a, vec(a.x, b.y), b]);
  if (start.horizontal !== undefined && end.vertical !== undefined) candidates.push([a, vec(b.x, a.y), b]);
  if (start.vertical !== undefined && end.vertical !== undefined) for (let y = 0; y <= SIZE; y += GRID) candidates.push([a, vec(a.x, y), vec(b.x, y), b]);
  if (start.horizontal !== undefined && end.horizontal !== undefined) for (let x = 0; x <= SIZE; x += GRID) candidates.push([a, vec(x, a.y), vec(x, b.y), b]);
  const score = (points: Vec[]) => points.reduce((sum, p, i) => sum + (i ? dist(points[i - 1], p) : 0), 0) + Math.max(0, points.length - 2) * 0.2;
  const routes = candidates.map(points => simplifyPath([from, ...points, to])).filter(points => points.slice(1).every((p, i) => citySegmentOpen(map.city, points[i], p)));
  if (!routes.length) {
    const path = detour(start, end);
    return path ? simplifyPath([from, ...path, to]) : [from];
  }
  return routes.reduce((best, route) => score(route) < score(best) ? route : best, routes[0]);
}

function roadPath(from: Vec, to: Vec, travel: 'drive' | 'walk' = 'drive'): Vec[] {
  if (insideBuilding(from)) return [from];
  if (insideBuilding(to)) to = streetPoint(to);
  if (travel === 'drive') {
    to = access.vehicleTarget(to);
    if (access.areaAt(from)?.driving === 'approach') return [from];
  }
  const startArea=access.areaAt(from),endArea=access.areaAt(to);
  if (startArea || endArea) {
    const start=startArea?access.route(from,travel):[from],end=endArea?access.route(to,travel):[to];
    if (!start.length || !end.length) return [from];
    return simplifyPath([...start,...roadPath(start.at(-1)!,end.at(-1)!,travel),...end.reverse()]);
  }
  const portA = onPortRoad(from), portB = onPortRoad(to);
  if (portA && portB) return simplifyPath(portPath(from, to));
  if (portA || portB) {
    const routes = PORT_CONNECTIONS.map(gate => portA
      ? [...portPath(from, gate), ...roadPath(gate, to, travel)]
      : [...roadPath(from, gate, travel), ...portPath(gate, to)]);
    return simplifyPath(routes.reduce((a, b) => pathLength(a) < pathLength(b) ? a : b));
  }
  const a = isCountry(from), b = isCountry(to);
  if (!a && !b) return gridPath(from, to);
  if (a && b) return simplifyPath(countryPath(from, to));
  const routes = [ROAD_NODES[0], ROAD_NODES[7]].map(bridge => a
    ? [...countryPath(from, bridge), ...gridPath(bridge, to)]
    : [...gridPath(from, bridge), ...countryPath(bridge, to)]);
  return simplifyPath(routes.reduce((best, route) => pathLength(route) < pathLength(best) ? route : best));
}
return { access, roadNode, roadDistance, roadNeighbours, roadProjection, simplifyPath, roadPath };
}

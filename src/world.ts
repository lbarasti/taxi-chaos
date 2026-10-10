import { Body, SpatialHash, cross, dist, dot, sub, vec, type Vec } from './physics';
import { BRIDGE_Y, GOLF_COURSE, GOLF_HOLES, HIGHLAND_STOPS, MAP_HEIGHT, MAP_WIDTH, ROAD_NODES, VILLAS, VILLA_DRIVES, VILLA_POOLS, countryAccess, countryNeighbours, countryNode, countryPath, inCountryClearing, inHighlands, isCountry, pathLength } from './countryside';
import { COAST_RAILS } from './coast';

export type PropKind = 'building' | 'tree' | 'hydrant' | 'crate' | 'bench' | 'lamp' | 'kiosk' | 'bin' | 'barrier' | 'shed' | 'barracks' | 'station' | 'pump' | 'rock' | 'guardrail';
export const isStructural = (kind: PropKind) => kind === 'shed' || kind === 'barracks' || kind === 'station';
export const isRigidObstacle = (kind: PropKind) => kind === 'building' || kind === 'rock' || kind === 'guardrail' || isStructural(kind) || kind === 'pump' || kind === 'tree';
export type Prop = { id: number; body: Body; kind: PropKind; alive: boolean; hp: number; maxHp: number; color: string; label: string; brokenAt: number; lastHit: number; fire: number; fuelSpent: boolean; blamed: boolean };
export type Person = { id: number; position: Vec; home: Vec; phase: number; color: string; panic: number; alive: boolean; aboard: boolean; health: number; velocity: Vec; angle: number; deathTime: number; role: 'civilian' | 'customer' | 'officer'; hitAt: number };
export type Block = { x: number; y: number; park: boolean; color: string; special?: 'fuel' | 'barracks' | 'depot' | 'parking' };
export type ParkingSpot = { position: Vec; angle: number; occupied: boolean; lot: boolean; motorcycle?: boolean };
export const GRID = 40, SIZE = 240, GARAGE = vec(4, 28);
// Clear sidewalk outside Midtown Hospital; the adjacent curb bay is unoccupied.
export const HOSPITAL = vec(147, 74.6);
export const district = (p: Vec) => p.y > 270 ? (p.x < 110 ? 'CEDAR WOODS' : p.x < 225 ? 'FAIRWAY CLUB' : 'WOODLAND ESTATES') : p.x > 440 ? 'EAGLE HIGHLANDS' : p.x >= 296 ? 'PINE WOODS' : p.x > 254 ? 'EAST RIVER' : p.x < 80 ? (p.y < 100 ? 'OLD TOWN' : 'MARKET QUARTER') : p.x < 160 ? (p.y < 100 ? 'MIDTOWN' : 'GARDEN DISTRICT') : (p.y < 100 ? 'THE DOCKS' : 'EAST VILLAGE');
export function seeded(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export class World {
  pools = VILLA_POOLS.map(p => new Body(p.position.x, p.position.y, Infinity, p.width, p.height));
  props: Prop[] = []; people: Person[] = []; blocks: Block[] = []; hash = new SpatialHash<Prop>(); random = seeded(1976);
  private personSerial = 0;
  parking: ParkingSpot[] = [];
  add(kind: PropKind, x: number, y: number, w: number, h: number, color: string, label = '', angle = 0) {
    const body = new Body(x, y, Infinity, w, h); body.angle = angle;
    const hp = ['building', 'rock'].includes(kind) ? Infinity : kind === 'guardrail' ? 24 : kind === 'barracks' ? 180 : kind === 'station' ? 220 : kind === 'shed' ? 90 : kind === 'pump' ? 18 : kind === 'kiosk' ? 13 : kind === 'tree' ? 20 : kind === 'barrier' ? 7 : 3;
    const prop: Prop = { id: this.props.length, body, kind, alive: true, hp, maxHp: hp, color, label, brokenAt: -1, lastHit: -100, fire: 0, fuelSpent: false, blamed: false };
    this.props.push(prop); this.hash.insert(prop); return prop;
  }
  addPerson(p: Vec, role: Person['role'] = 'civilian', color = '#d4b487') {
    const person: Person = { id: this.personSerial++, position: { ...p }, home: { ...p }, phase: this.random() * Math.PI * 2, color, panic: 0, alive: true, aboard: false, health: 100, velocity: vec(), angle: this.random() * 6, deathTime: -1, role, hitAt: -100 };
    this.people.push(person); return person;
  }
  constructor() {
    const colors = ['#334850', '#3c485b', '#4d4b59', '#3d5554', '#535045', '#394a5a'];
    const shops = ['NOODLE CLUB', 'VINYL & CO.', '24/7 DELI', 'LAUNDROMAT', 'COFFEE', 'BODEGA', 'FLOWERS', 'HOTEL', 'ARCADE', 'PIZZA', 'BOOK SHOP', 'NIGHT OWL'];
    for (let bx = 0; bx < 6; bx++) for (let by = 0; by < 6; by++) {
      const x = bx * GRID, y = by * GRID, park = (bx === 2 && by === 2) || (bx === 4 && by === 4) || (bx === 0 && by === 3);
      const special = bx === 4 && by === 1 ? 'fuel' : bx === 1 && by === 1 ? 'barracks' : bx === 2 && by === 0 ? 'depot' : (bx === 1 && by === 3) || (bx === 3 && by === 2) ? 'parking' : undefined;
      this.blocks.push({ x, y, park, special, color: colors[(bx + by * 3) % colors.length] });
      if (park) {
        for (let i = 0; i < 10; i++) this.add('tree', x + 11 + this.random() * 18, y + 11 + this.random() * 18, 1.8, 1.8, '#426e5c');
        this.add('kiosk', x + 24, y + 8.5, 3.4, 2, '#d88d64', 'ICE CREAM');
      } else if (special === 'fuel') {
        this.add('station', x + 14, y + 27, 10, 10, '#765952', 'LAST CHANCE FUEL');
        for (let i = 0; i < 3; i++) this.add('pump', x + 13 + i * 8, y + 13, 1.2, 2.4, '#d39060', 'FUEL');
        this.add('bin', x + 26, y + 28, 0.85, 0.85, '#76a79b');
      } else if (special === 'parking') {
        for (let row = 0; row < 2; row++) for (let i = 0; i < 3; i++) this.parking.push({ position: vec(x + 13 + i * 7, y + 12 + row * 16), angle: Math.PI / 2, occupied: i !== row, lot: true });
      } else {
        // Four buildings, separated by two genuine drivable/destructible alleys.
        for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 2; iy++) {
          if (special && iy === 0) continue;
          this.add('building', x + 14 + ix * 13, y + 14 + iy * 13, 10, 10, colors[(bx * 2 + by + ix + iy) % colors.length], bx === 3 && by === 1 && ix === 1 && iy === 1 ? 'HOSPITAL' : bx === 0 && by === 0 && ix === 0 && iy === 1 ? 'PIT STOP' : shops[(bx * 5 + by * 3 + ix * 2 + iy) % shops.length]);
        }
        if (special === 'barracks') this.add('barracks', x + 20.5, y + 14, 23, 10, '#69705a', 'CIVIC BARRACKS');
        if (special === 'depot') this.add('shed', x + 20.5, y + 14, 23, 10, '#776255', 'FREIGHT DEPOT');
        this.add('crate', x + 20.5, y + 13, 1.4, 1.4, '#bc9465');
        this.add('crate', x + 20.5, y + 14.6, 1.4, 1.4, '#bc9465');
        this.add('barrier', x + 20.5, y + 8.8, 3.1, 0.6, '#e9aa5c');
        this.add('kiosk', x + 31, y + 20.5, 2.5, 3, '#ad6d68', 'NEWS');
      }
      for (let i = 0; i < 2; i++) {
        if (!park && special !== 'fuel' && special !== 'parking') this.parking.push({ position: vec(x + 14 + i * 12, y + 34.6), angle: 0, occupied: i === (bx + by) % 2, lot: false });
        this.add('hydrant', x + 7.5, y + 11 + i * 18, 0.65, 0.65, '#eb735f');
        this.add('lamp', x + 32.4, y + 9 + i * 20, 0.6, 0.6, '#a7bfbb');
        this.add('bin', x + 12 + i * 16, y + 32.5, 0.85, 0.85, '#76a79b');
        this.add('bench', x + 12 + i * 16, y + 7.8, 2.4, 0.75, '#bf9870');
        const home = vec(x + 8, y + 12 + i * 14);
        this.addPerson(home, 'civilian', ['#e9a69b', '#a7bce0', '#e4ca79', '#b0cbaa'][Math.floor(this.random() * 4)]);
        const home2 = vec(x + 15 + i * 12, y + 32);
        this.addPerson(home2, 'civilian', '#c3b7d7');
      }
    }
    // Dedicated courier bay beside Pit Stop; x=6.5 clears the hydrants on the first pickup run.
    this.parking.push({ position: vec(6.5, 34.6), angle: -Math.PI / 2, occupied: true, lot: false, motorcycle: true });
    for (const rail of COAST_RAILS) this.add('guardrail', rail.position.x, rail.position.y, rail.width, 0.8, '#a7b9b1', '', rail.angle);
    for (const y of BRIDGE_Y) {
      for (const side of [-1, 1]) {
        this.add('lamp', 249, y + side * 9, 0.6, 0.6, '#a7bfbb');
        this.add('lamp', 307, y + side * 9, 0.6, 0.6, '#a7bfbb');
      }
    }
    // Separate RNG preserves the existing city's layouts, traffic and deterministic fixtures.
    const ruralRandom = seeded(8642);
    for (let i = 0; i < 1050; i++) {
      const p = vec(ruralRandom() * MAP_WIDTH, ruralRandom() * MAP_HEIGHT);
      if (!inHighlands(p) || countryAccess(p).distance < 12 || inCountryClearing(p) || HIGHLAND_STOPS.some(s => dist(s.position, p) < 15)) continue;
      const rock = i % 8 === 0, size = rock ? 3 + ruralRandom() * 4 : 1.6;
      this.add(rock ? 'rock' : 'tree', p.x, p.y, size, rock ? size * 0.8 : size, rock ? '#788278' : ['#3d654f', '#426e58', '#315747'][i % 3], '', ruralRandom() * Math.PI);
    }
    const cityRandom = this.random; this.random = ruralRandom;
    for (const villa of VILLAS) {
      const p = villa.position;
      this.add('building', p.x, p.y, 16, 10, villa.color, `VILLA ${villa.name}`);
      this.add('building', p.x - 5, p.y - 6, 6, 3, villa.color, 'VILLA GUEST HOUSE'); // attached guest wing
      const entry = VILLA_DRIVES[VILLAS.indexOf(villa)][0];
      const lamp = vec(p.x + (entry.x > p.x ? -18 : 18), p.y + (entry.y > p.y ? -12 : 12));
      this.add('lamp', lamp.x, lamp.y, 0.6, 0.6, '#a7bfbb');
      this.addPerson(vec(p.x + 12, p.y - 8), 'civilian', '#e4ca79');
      this.addPerson(vec(p.x - 12, p.y + 6), 'civilian', '#d7c9e7');
    }
    const club = GOLF_COURSE.clubhouse;
    this.add('building', club.x, club.y, 10, 14, '#b89a74', 'FAIRWAY CLUB');
    this.add('lamp', club.x - 7, club.y + 7, 0.6, 0.6, '#a7bfbb');
    for (const hole of GOLF_HOLES) this.addPerson(vec(hole.tee.x + 2, hole.tee.y - 2), 'civilian', '#f0e6c8');
    for (const stop of HIGHLAND_STOPS) {
      const p = stop.position;
      const clearing = (radius: number, clearance: number) => Array.from({ length: 16 }, (_, i) => vec(p.x + Math.cos(i * Math.PI / 8) * radius, p.y + Math.sin(i * Math.PI / 8) * radius)).find(point => inHighlands(point) && countryAccess(point).distance > clearance)!;
      const kiosk = clearing(14, 10), bench = clearing(11, 7);
      this.add('kiosk', kiosk.x, kiosk.y, 3.8, 3, '#987c59', stop.name.toUpperCase());
      this.add('bench', bench.x, bench.y, 2.4, 0.75, '#bf9870');
      this.addPerson(vec(bench.x + 2, bench.y + 2), 'civilian', '#b0cbaa');
    }
    this.random = cityRandom;
  }
}

// Street access + a shortest orthogonal route. No compulsory intersection snaps
// or stair-step zigzags: a grid without closed roads needs at most two turns.
function gridNode(p: Vec): Vec { return vec(Math.round(Math.max(0, Math.min(SIZE, p.x)) / GRID) * GRID, Math.round(Math.max(0, Math.min(SIZE, p.y)) / GRID) * GRID); }
export function roadNode(p: Vec): Vec { return isCountry(p) ? countryNode(p) : gridNode(p); }
export const roadDistance = (p: Vec) => isCountry(p) ? countryAccess(p).distance : Math.min(Math.abs(p.x - gridNode(p).x), Math.abs(p.y - gridNode(p).y));
export function roadNeighbours(p: Vec): Vec[] {
  const country = countryNeighbours(p);
  if (isCountry(p)) return country;
  return [...[vec(p.x + GRID, p.y), vec(p.x - GRID, p.y), vec(p.x, p.y + GRID), vec(p.x, p.y - GRID)].filter(n => n.x >= 0 && n.y >= 0 && n.x <= SIZE && n.y <= SIZE), ...country];
}
type Access = { point: Vec; vertical?: number; horizontal?: number };
function streetAccess(p: Vec): Access {
  const n = gridNode(p), dx = Math.abs(n.x - p.x), dy = Math.abs(n.y - p.y);
  if (dx <= 6 || dy <= 6) return { point: { ...p }, vertical: dx <= 6 ? n.x : undefined, horizontal: dy <= 6 ? n.y : undefined };
  return dx < dy ? { point: vec(n.x, p.y), vertical: n.x } : { point: vec(p.x, n.y), horizontal: n.y };
}
export const roadProjection = (p: Vec) => isCountry(p) ? countryAccess(p).point : streetAccess(p).point;
export function simplifyPath(points: Vec[]): Vec[] {
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
  const routes = candidates.map(points => simplifyPath([from, ...points, to]));
  return routes.reduce((best, route) => score(route) < score(best) ? route : best, routes[0]);
}

export function roadPath(from: Vec, to: Vec): Vec[] {
  const a = isCountry(from), b = isCountry(to);
  if (!a && !b) return gridPath(from, to);
  if (a && b) return simplifyPath(countryPath(from, to));
  const routes = [ROAD_NODES[0], ROAD_NODES[7]].map(bridge => a
    ? [...countryPath(from, bridge), ...gridPath(bridge, to)]
    : [...gridPath(from, bridge), ...countryPath(bridge, to)]);
  return simplifyPath(routes.reduce((best, route) => pathLength(route) < pathLength(best) ? route : best));
}

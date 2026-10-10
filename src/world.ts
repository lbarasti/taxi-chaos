import { Body, SpatialHash, cross, dist, dot, sub, vec, type Vec } from './physics';

export type PropKind = 'building' | 'tree' | 'hydrant' | 'crate' | 'bench' | 'lamp' | 'kiosk' | 'bin' | 'barrier' | 'shed' | 'barracks' | 'station' | 'pump';
export const isStructural = (kind: PropKind) => kind === 'shed' || kind === 'barracks' || kind === 'station';
export const isRigidObstacle = (kind: PropKind) => kind === 'building' || isStructural(kind) || kind === 'pump' || kind === 'tree';
export type Prop = { id: number; body: Body; kind: PropKind; alive: boolean; hp: number; maxHp: number; color: string; label: string; brokenAt: number; lastHit: number; fire: number; fuelSpent: boolean; blamed: boolean };
export type Person = { id: number; position: Vec; home: Vec; phase: number; color: string; panic: number; alive: boolean; aboard: boolean; health: number; velocity: Vec; angle: number; deathTime: number; role: 'civilian' | 'customer' | 'officer'; hitAt: number };
export type Block = { x: number; y: number; park: boolean; color: string; special?: 'fuel' | 'barracks' | 'depot' | 'parking' };
export type ParkingSpot = { position: Vec; angle: number; occupied: boolean; lot: boolean; motorcycle?: boolean };
export const GRID = 40, SIZE = 240, GARAGE = vec(4, 28);
export const district = (p: Vec) => p.x < 80 ? (p.y < 100 ? 'OLD TOWN' : 'MARKET QUARTER') : p.x < 160 ? (p.y < 100 ? 'MIDTOWN' : 'GARDEN DISTRICT') : (p.y < 100 ? 'THE DOCKS' : 'EAST VILLAGE');
export function seeded(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export class World {
  props: Prop[] = []; people: Person[] = []; blocks: Block[] = []; hash = new SpatialHash<Prop>(); random = seeded(1976);
  private personSerial = 0;
  parking: ParkingSpot[] = [];
  add(kind: PropKind, x: number, y: number, w: number, h: number, color: string, label = '', angle = 0) {
    const body = new Body(x, y, Infinity, w, h); body.angle = angle;
    const hp = kind === 'building' ? Infinity : kind === 'barracks' ? 180 : kind === 'station' ? 220 : kind === 'shed' ? 90 : kind === 'pump' ? 18 : kind === 'kiosk' ? 13 : kind === 'tree' ? 20 : kind === 'barrier' ? 7 : 3;
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
          this.add('building', x + 14 + ix * 13, y + 14 + iy * 13, 10, 10, colors[(bx * 2 + by + ix + iy) % colors.length], bx === 0 && by === 0 && ix === 0 && iy === 1 ? 'PIT STOP' : shops[(bx * 5 + by * 3 + ix * 2 + iy) % shops.length]);
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
    // Waterfront barriers and an unmistakable city boundary.
    this.add('building', 120, -15, 280, 2, '#30484e', ''); this.add('building', 120, 255, 280, 2, '#30484e', '');
    this.add('building', -15, 120, 2, 280, '#30484e', ''); this.add('building', 255, 120, 2, 280, '#30484e', '');
  }
}

// Street access + a shortest orthogonal route. No compulsory intersection snaps
// or stair-step zigzags: a grid without closed roads needs at most two turns.
export function roadNode(p: Vec): Vec { return vec(Math.round(Math.max(0, Math.min(SIZE, p.x)) / GRID) * GRID, Math.round(Math.max(0, Math.min(SIZE, p.y)) / GRID) * GRID); }
export const roadDistance = (p: Vec) => Math.min(Math.abs(p.x - roadNode(p).x), Math.abs(p.y - roadNode(p).y));
type Access = { point: Vec; vertical?: number; horizontal?: number };
function streetAccess(p: Vec): Access {
  const n = roadNode(p), dx = Math.abs(n.x - p.x), dy = Math.abs(n.y - p.y);
  if (dx <= 6 || dy <= 6) return { point: { ...p }, vertical: dx <= 6 ? n.x : undefined, horizontal: dy <= 6 ? n.y : undefined };
  return dx < dy ? { point: vec(n.x, p.y), vertical: n.x } : { point: vec(p.x, n.y), horizontal: n.y };
}
export const roadProjection = (p: Vec) => streetAccess(p).point;
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
export function roadPath(from: Vec, to: Vec): Vec[] {
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

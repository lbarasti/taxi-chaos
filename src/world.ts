import { Body, SpatialHash, contact, cross, dist, dot, sub, vec, type Vec } from './physics';
import { residentialActivity } from './residential-activity';
import { pathLength } from './countryside';
import { defaultCompiledMap, type CompiledMap } from './map/compile';
import { defaultMap } from './map/default';
import type { Parking } from './map/schema';
import { HARBOUR, PORT_CONTAINERS, PORT_CONNECTIONS, PORT_GATES, SWAP_CONTAINER, inHarbour, onPortRoad, portAccess, portNeighbours, portNode, portPath } from './harbour';

export type PropKind = 'building' | 'tree' | 'hydrant' | 'crate' | 'bench' | 'lamp' | 'kiosk' | 'bin' | 'barrier' | 'shed' | 'barracks' | 'station' | 'pump' | 'rock' | 'guardrail' | 'container' | 'fence' | 'port-gate' | 'lifeguard-tower' | 'parasol' | 'beach-chair' | 'sandcastle' | 'palm' | 'bollard' | 'promenade-edge' | 'pedestrian-gate';
export const isStructural = (kind: PropKind) => kind === 'shed' || kind === 'barracks' || kind === 'station';
export const isRigidObstacle = (kind: PropKind) => ['building', 'rock', 'guardrail', 'container', 'fence', 'port-gate', 'lifeguard-tower', 'palm', 'bollard', 'promenade-edge', 'pedestrian-gate'].includes(kind) || isStructural(kind) || kind === 'pump' || kind === 'tree';
export const blocksWalking = (kind: PropKind) => kind !== 'pedestrian-gate';
export type Prop = { id: number; sourceId?: string; body: Body; kind: PropKind; alive: boolean; hp: number; maxHp: number; color: string; label: string; brokenAt: number; lastHit: number; fire: number; fuelSpent: boolean; blamed: boolean };
export type Person = { id: number; position: Vec; home: Vec; phase: number; color: string; panic: number; alive: boolean; aboard: boolean; health: number; velocity: Vec; angle: number; deathTime: number; role: 'civilian' | 'customer' | 'officer'; hitAt: number; residentialSlot?: number; walk?: { route: Vec[]; waypoint: number }; fall?: { elapsed: number; duration: number; angularVelocity: number } };
export type Block = { x: number; y: number; park: boolean; color: string; special?: 'fuel' | 'barracks' | 'depot' | 'parking' };
export type ParkingSpot = Parking & { sourceId: string };
export const GRID = 40, SIZE = 240, GARAGE = vec(4, 28);
// Clear sidewalk outside Midtown Hospital; the adjacent curb bay is unoccupied.
export const HOSPITAL = vec(147, 74.6);
export function district(p: Vec, map = defaultCompiledMap) {
  const { inBeach, onPromenade, PROMENADE } = map.beach, { SOUTH_WOODS_Y } = map.country;
  return inBeach(p) ? onPromenade(p) || p.x >= PROMENADE.left ? 'OCEAN WALK' : 'SUNSET BEACH' : inHarbour(p) ? 'NORTHSTAR HARBOUR' : p.y >= SOUTH_WOODS_Y ? (p.x < 110 ? 'CEDAR WOODS' : p.x < 225 ? 'FAIRWAY CLUB' : 'WOODLAND ESTATES') : map.pobleSec?.contains(p) ? (map.country.countryAccess(p).road.surface === 'residential' && p.y < map.pobleSec.promenade[0].y ? 'POBLE-SEC' : 'PARC DEL MIRADOR') : p.x >= 296 ? 'MIRADOR HIGHLANDS' : p.x > 254 ? 'EAST RIVER' : p.x < 80 ? (p.y < 100 ? 'OLD TOWN' : 'MARKET QUARTER') : p.x < 160 ? (p.y < 100 ? 'MIDTOWN' : 'GARDEN DISTRICT') : (p.y < 100 ? 'THE DOCKS' : 'EAST VILLAGE');
}
export function seeded(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export class World {
  pools: Body[];
  navigation: ReturnType<typeof createNavigation>;
  props: Prop[] = []; people: Person[] = []; blocks: Block[] = []; hash = new SpatialHash<Prop>(); random = seeded(1976);
  private personSerial = 0;
  readonly residentialWalks: Vec[][] = [];
  parking: ParkingSpot[] = [];
  add(kind: PropKind, x: number, y: number, w: number, h: number, color: string, label = '', angle = 0) {
    const body = new Body(x, y, Infinity, w, h); body.angle = angle;
    const hp = ['building', 'rock', 'container', 'fence', 'port-gate', 'bollard', 'promenade-edge', 'pedestrian-gate'].includes(kind) ? Infinity : kind === 'lifeguard-tower' ? 18 : kind === 'palm' ? 20 : kind === 'sandcastle' ? 1 : kind === 'guardrail' ? 24 : kind === 'barracks' ? 180 : kind === 'station' ? 220 : kind === 'shed' ? 90 : kind === 'pump' ? 18 : kind === 'kiosk' ? 13 : kind === 'tree' ? 20 : kind === 'barrier' ? 7 : 3;
    const prop: Prop = { id: this.props.length, body, kind, alive: true, hp, maxHp: hp, color, label, brokenAt: -1, lastHit: -100, fire: 0, fuelSpent: false, blamed: false };
    this.props.push(prop); this.hash.insert(prop); return prop;
  }
  addPerson(p: Vec, role: Person['role'] = 'civilian', color = '#d4b487', pose?: { phase: number; angle: number }) {
    const person: Person = { id: this.personSerial++, position: { ...p }, home: { ...p }, phase: pose?.phase ?? this.random() * Math.PI * 2, color, panic: 0, alive: true, aboard: false, health: 100, velocity: vec(), angle: pose?.angle ?? this.random() * 6, deathTime: -1, role, hitAt: -100 };
    this.people.push(person); return person;
  }
  constructor(public readonly map: CompiledMap = defaultCompiledMap) {
    const { BRIDGE_Y, GOLF_COURSE, GOLF_HOLES, HIGHLAND_STOPS, VILLAS, VILLA_DRIVES, VILLA_POOLS, countryAccess, inCountryClearing, inHighlands } = map.country;
    const { BEACH_HOTELS, BEACH_SETS, LIFEGUARD_TOWERS, PROMENADE_BOLLARDS, PROMENADE_EDGES, PROMENADE_GATES, SAND_CASTLES, PROMENADE } = map.beach;
    const { COAST_RAILS } = map.coast;
    this.navigation = createNavigation(map);
    this.parking = map.document.parking.map(p => ({ ...structuredClone(p), sourceId: p.id }));
    this.pools = VILLA_POOLS.map(p => new Body(p.position.x, p.position.y, Infinity, p.width, p.height));
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
      } else if (special !== 'parking') {
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
    for (const rail of COAST_RAILS) this.add('guardrail', rail.position.x, rail.position.y, rail.width, 0.8, '#a7b9b1', '', rail.angle);
    for (const y of BRIDGE_Y) {
      for (const side of [-1, 1]) {
        this.add('lamp', 249, y + side * 9, 0.6, 0.6, '#a7bfbb');
      }
    }
    for (const p of map.document.countryProps) {
      const prop = this.add(p.kind, p.position.x, p.position.y, p.width, p.height, p.color, p.label, p.angle);
      prop.sourceId = p.id; prop.body.vertices = p.architecture?.outline;
    }
    // Separate RNG preserves the existing city's layouts, traffic and deterministic fixtures.
    const ruralRandom = seeded(map.document.generation.ruralSeed);
    // Keep the original candidate lattice/RNG draws; carry the southern stream in
    // local coordinates. Envelope edits never reshuffle the fixed city/highlands.
    const southernIds = defaultMap.points.filter(p => p.owner === 'southern-estates' && defaultMap.highlandOutline.includes(p.id)).map(p => p.id);
    const shift = southernIds.reduce((sum, id) => {
      const old = defaultMap.points.find(p => p.id === id)!.position, now = map.document.points.find(p => p.id === id)?.position ?? old;
      return vec(sum.x + (now.x - old.x) / southernIds.length, sum.y + (now.y - old.y) / southernIds.length);
    }, vec());
    for (let i = 0; i < map.document.generation.candidates; i++) {
      const p = vec(ruralRandom() * 530, ruralRandom() * 550);
      const baseline = defaultCompiledMap.country;
      if (!baseline.inHighlands(p) || baseline.countryAccess(p).distance < 12 || baseline.inCountryClearing(p) || baseline.HIGHLAND_STOPS.some(s => dist(s.position, p) < 15)) continue;
      // Optional RNG draws depend on the baseline stream, never current edits.
      const rock = i % 8 === 0, size = rock ? 3 + ruralRandom() * 4 : 1.6, angle = ruralRandom() * Math.PI;
      if (p.y >= 392) { p.x += shift.x; p.y += shift.y; }
      if (!inHighlands(p) || countryAccess(p).distance < 12 || inCountryClearing(p) || HIGHLAND_STOPS.some(s => dist(s.position, p) < 15)) continue;
      if (map.pobleSec?.contains(p)) continue;
      this.add(rock ? 'rock' : 'tree', p.x, p.y, size, rock ? size * 0.8 : size, rock ? '#788278' : ['#3d654f', '#426e58', '#315747'][i % 3], '', angle);
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
      if (stop.amenity) continue;
      const p = stop.position;
      const clearing = (radius: number, clearance: number) => Array.from({ length: 16 }, (_, i) => vec(p.x + Math.cos(i * Math.PI / 8) * radius, p.y + Math.sin(i * Math.PI / 8) * radius)).find(point => inHighlands(point) && countryAccess(point).distance > clearance && !map.coast.inOcean(point) && ![...this.hash.query(new Body(point.x, point.y, 1, 5, 4))].some(prop => contact(new Body(point.x, point.y, 1, 5, 4), prop.body)));
      const kiosk = clearing(14, 10), bench = clearing(11, 7);
      if (kiosk) this.add('kiosk', kiosk.x, kiosk.y, 3.8, 3, '#987c59', stop.name.toUpperCase()).sourceId = stop.id;
      if (bench) { this.add('bench', bench.x, bench.y, 2.4, 0.75, '#bf9870').sourceId = stop.id; this.addPerson(vec(bench.x + 2, bench.y + 2), 'civilian', '#b0cbaa'); }
    }
    for (const cell of map.pobleSec?.cells ?? []) {
      const route = cell.pavement;
      // Each route follows the compiled inner curb, shared with the street art.
      for (const offset of [0, Math.floor(route.length / 2)]) {
        const walk = [...route.slice(offset), ...route.slice(0, offset)];
        if (walk.length && walk.every(p => this.walkable(p))) this.residentialWalks.push(walk);
      }
    }
    this.syncResidents(7);
    this.random = cityRandom;
    for (const box of PORT_CONTAINERS) this.add('container', box.position.x, box.position.y, 14, 5.6, box.color, box.label);
    // Three walls form an open, genuinely drivable container, opening east.
    this.add('container', SWAP_CONTAINER.x, SWAP_CONTAINER.y - 3.1, 14, 0.35, '#61a5a1', 'EXCHANGE WALL');
    this.add('container', SWAP_CONTAINER.x, SWAP_CONTAINER.y + 3.1, 14, 0.35, '#61a5a1', 'EXCHANGE WALL');
    this.add('container', SWAP_CONTAINER.x - 7, SWAP_CONTAINER.y, 0.35, 6.2, '#61a5a1', 'EXCHANGE WALL');
    // Gate islands leave two 10 m lanes. Per-vehicle access prevents tailgating
    // a permitted freight NPC through the player's security collider.
    for (const [a, b] of [[72, 194], [206, 214], [226, 252]]) this.add('fence', (a + b) / 2, -17, b - a, 0.5, '#839c9b');
    for (const x of [HARBOUR.left, HARBOUR.right]) this.add('fence', x, -76, 0.5, 118, '#839c9b');
    for (const p of PORT_GATES) this.add('port-gate', p.x, p.y, 12, 0.65, '#e3c883', 'SECURITY');
    this.add('building', 210, -24, 6, 6, '#788c89', 'PORT SECURITY');
    this.add('building', 163, -28, 28, 12, '#647977', 'BONDED WAREHOUSE');
    for (const x of [78, 92, 152, 188, 245]) for (const y of [-29, -124]) this.add('lamp', x, y, 0.6, 0.6, '#b9cec1');
    for (const x of [94, 106, 134, 146, 182, 194, 222, 234]) this.add('building', x, -130, 1.2, 1.2, '#568d90', 'CRANE FOOT');
    for (const x of [91, 129, 177, 243]) this.add('crate', x, -28, 1.5, 1.5, '#bc9465');
    const portRandom = this.random; this.random = seeded(9076);
    for (const p of [vec(210, -19.5), vec(96, -63), vec(150, -96), vec(180, -64)]) this.addPerson(p, 'civilian', '#e3bd67');
    this.random = portRandom;
    for (const hotel of BEACH_HOTELS) this.add('building', hotel.position.x, hotel.position.y, hotel.width, hotel.height, hotel.color, hotel.name).sourceId = hotel.id;
    for (const [i, p] of LIFEGUARD_TOWERS.entries()) this.add('lifeguard-tower', p.x, p.y, 4.6, 4.2, ['#9cced1', '#e0b0ba', '#bdd6b0'][i % 3], `LIFEGUARD ${String(i + 1).padStart(2, '0')}`).sourceId = map.document.beach.towers[i].id;
    for (const [i, p] of BEACH_SETS.entries()) {
      this.add('parasol', p.x, p.y, 3.4, 3.4, ['#df8976', '#78b9c0', '#efc468', '#a3a5cb', '#80b5a2'][i % 5]).sourceId = map.document.beach.sets[i].id;
      for (const dx of [-2.8, 2.8]) this.add('beach-chair', p.x + dx, p.y + 2.8, 1.1, 2.4, i % 2 ? '#b9d4d0' : '#e2a18b', '', dx < 0 ? -0.2 : 0.2).sourceId = map.document.beach.sets[i].id;
    }
    for (const [i, p] of SAND_CASTLES.entries()) this.add('sandcastle', p.x, p.y, 1.8, 1.6, '#c6a36e').sourceId = map.document.beach.castles[i].id;
    for (const edge of PROMENADE_EDGES) this.add('promenade-edge', edge.position.x, edge.position.y, edge.width, 0.6, '#e2d9c2');
    for (const gate of PROMENADE_GATES) this.add('pedestrian-gate', gate.position.x, gate.position.y, gate.width, 0.6, '#d8c4a1', '', gate.angle);
    for (const p of PROMENADE_BOLLARDS) this.add('bollard', p.x, p.y, 0.6, 0.6, '#758e8b');
    for (const x of [-6, 16, 44, 100]) this.add('palm', x, 247.8, 0.8, 0.8, '#547f66');
    const walkX = (x: number) => PROMENADE.left + (x - 146) * (PROMENADE.right - PROMENADE.left) / 106;
    for (const x of [154, 174, 194, 214, 244]) this.add('palm', walkX(x), PROMENADE.bottom - 1.8, 0.8, 0.8, '#547f66');
    for (const x of [150, 174, 194, 214, 248]) this.add('lamp', walkX(x), PROMENADE.top + 2, 0.6, 0.6, '#a7bfbb');
    for (const x of [168, 208, 228]) this.add('bench', walkX(x), PROMENADE.bottom - 1.8, 2.4, 0.75, '#c29b76');
    this.add('kiosk', walkX(158), PROMENADE.bottom - 2.3, 4, 2.8, '#76b9b6', 'SURF / RENTALS');
    this.add('kiosk', walkX(202), PROMENADE.bottom - 2.3, 4, 2.8, '#d9a578', 'JUICE / COFFEE');
    const beachRandom = this.random; this.random = seeded(1965);
    for (const x of [154, 162, 178, 186, 198, 218, 232, 244]) this.addPerson(vec(walkX(x), (PROMENADE.top + PROMENADE.bottom) / 2), 'civilian', ['#df8976', '#78b9c0', '#efc468'][Math.floor(this.random() * 3)]);
    for (const x of [-8, 20, 64, 88, 110]) this.addPerson(vec(x, 253), 'civilian', '#dcaa84');
    this.random = beachRandom;
  }
  private walkable(p: Vec) {
    const probe = new Body(p.x, p.y, 1, .7, .7);
    return !this.map.coast.inOcean(p) && ![...this.hash.query(probe)].some(prop => contact(probe, prop.body));
  }
  syncResidents(hour: number, actor?: Vec, protectedIds: readonly number[] = []) {
    const target = Math.ceil(this.residentialWalks.length * residentialActivity(hour).pedestrians);
    this.people = this.people.filter(p => p.residentialSlot === undefined || p.residentialSlot < target ||
      !p.alive || p.aboard || p.role !== 'civilian' || protectedIds.includes(p.id) || !!actor && dist(p.position, actor) < 85);
    for (let slot = 0; slot < target; slot++) {
      if (this.people.some(p => p.residentialSlot === slot)) continue;
      const route = this.residentialWalks[slot], home = route[0];
      if (actor && dist(home, actor) < 85 || !this.walkable(home)) continue;
      const person = this.addPerson(home, 'civilian', ['#d5a474', '#8ca99a', '#e4c780', '#c58d81'][slot % 4], { phase: slot * 2.4, angle: 0 });
      person.residentialSlot = slot; person.walk = { route, waypoint: 1 % route.length };
    }
  }

}

// Street access + a shortest orthogonal route. No compulsory intersection snaps
// or stair-step zigzags: a grid without closed roads needs at most two turns.
export function createNavigation(map: CompiledMap) {
const { ROAD_NODES, countryAccess, countryNeighbours, countryNode, countryPath, isCountry } = map.country;
const { beachAccess, beachAccessPath, beachVehicleTarget, inBeach } = map.beach;
function gridNode(p: Vec): Vec { return vec(Math.round(Math.max(0, Math.min(SIZE, p.x)) / GRID) * GRID, Math.round(Math.max(0, Math.min(SIZE, p.y)) / GRID) * GRID); }
function roadNode(p: Vec): Vec { return inBeach(p) ? gridNode(beachAccess(p)) : onPortRoad(p) ? portNode(p) : isCountry(p) ? countryNode(p) : gridNode(p); }
const roadDistance = (p: Vec) => inBeach(p) ? dist(p, beachAccess(p)) : onPortRoad(p) ? portAccess(p).distance : isCountry(p) ? countryAccess(p).distance : Math.min(Math.abs(p.x - gridNode(p).x), Math.abs(p.y - gridNode(p).y));
function roadNeighbours(p: Vec): Vec[] {
  const port = portNeighbours(p);
  if (onPortRoad(p)) return port;
  const country = countryNeighbours(p);
  if (isCountry(p)) return country;
  return [...[vec(p.x + GRID, p.y), vec(p.x - GRID, p.y), vec(p.x, p.y + GRID), vec(p.x, p.y - GRID)].filter(n => n.x >= 0 && n.y >= 0 && n.x <= SIZE && n.y <= SIZE), ...country, ...port];
}
type Access = { point: Vec; vertical?: number; horizontal?: number };
function streetAccess(p: Vec): Access {
  const n = gridNode(p), dx = Math.abs(n.x - p.x), dy = Math.abs(n.y - p.y);
  if (dx <= 6 || dy <= 6) return { point: { ...p }, vertical: dx <= 6 ? n.x : undefined, horizontal: dy <= 6 ? n.y : undefined };
  return dx < dy ? { point: vec(n.x, p.y), vertical: n.x } : { point: vec(p.x, n.y), horizontal: n.y };
}
const roadProjection = (p: Vec) => inBeach(p) ? beachAccess(p) : onPortRoad(p) ? portAccess(p).point : isCountry(p) ? countryAccess(p).point : streetAccess(p).point;
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
  const routes = candidates.map(points => simplifyPath([from, ...points, to]));
  return routes.reduce((best, route) => score(route) < score(best) ? route : best, routes[0]);
}

function roadPath(from: Vec, to: Vec, travel: 'drive' | 'walk' = 'drive'): Vec[] {
  if (travel === 'drive') {
    to = beachVehicleTarget(to);
    // No vehicle-sized route exists inside the protected hotel/promenade strip.
    // Hold position rather than inventing a leg through its permanent walls.
    if (beachVehicleTarget(from) !== from) return [from];
  }
  // Sand is accessible from the south street, never via a woodland shortcut over water.
  if (inBeach(from) || inBeach(to)) {
    const start = inBeach(from) ? beachAccessPath(from) : [from], end = inBeach(to) ? beachAccessPath(to) : [to];
    return simplifyPath([...start, ...roadPath(start.at(-1)!, end.at(-1)!, travel), ...end.reverse()]);
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
return { roadNode, roadDistance, roadNeighbours, roadProjection, simplifyPath, roadPath };
}
export const { roadNode, roadDistance, roadNeighbours, roadProjection, simplifyPath, roadPath } = createNavigation(defaultCompiledMap);

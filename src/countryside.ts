import { add, clamp, dist, dot, scale, sub, vec, type Vec } from './physics';

export const MAP_WIDTH = 530, MAP_HEIGHT = 430;
export const BRIDGE_Y = [80, 200] as const;
// Mirrored L: the eastern ridge continues south, then wraps west beneath the city.
// The inlet along the inside corner preserves the city's southern waterfront.
export const HIGHLAND_OUTLINE = [vec(298, -14), vec(390, -12), vec(472, 2), vec(516, 30), vec(532, 90), vec(520, 150), vec(526, 211), vec(528, 315), vec(504, 386), vec(458, 420), vec(336, 430), vec(220, 424), vec(94, 414), vec(18, 394), vec(-10, 365), vec(-12, 300), vec(24, 280), vec(142, 272), vec(232, 277), vec(280, 272), vec(296, 220), vec(292, 158), vec(300, 118), vec(298, 48)];
export const isCountry = (p: Vec) => p.x > 246 || p.y > 246;
export const HIGHLAND_STOPS = [
  { position: vec(358, 114), name: 'Pine Junction' },
  { position: vec(474, 58), name: 'Eagle Lookout' },
  { position: vec(482, 184), name: 'Highland Lodge' },
  { position: vec(378, 170), name: 'Fern Hollow' },
  { position: vec(242, 330), name: 'Woodland Estates' },
  { position: vec(132, 338), name: 'Fairway Club' },
  { position: vec(60, 316), name: 'Cedar Crescent' },
];
export const ROAD_NODES = [vec(240, 80), vec(310, 80), vec(358, 114), vec(474, 58), vec(482, 184), vec(378, 170), vec(310, 200), vec(240, 200), vec(360, 304), vec(242, 330), vec(132, 338), vec(60, 316), vec(164, 390), vec(306, 390), vec(410, 366)];

export const VILLAS = [
  { position: vec(334, 35), name: 'PINECREST', color: '#c07858' },
  { position: vec(392, 56), name: 'EAGLE HOUSE', color: '#9b7962' },
  { position: vec(324, 137), name: 'FERN VILLA', color: '#b88360' },
  { position: vec(429, 181), name: 'RIDGE ESTATE', color: '#ab7159' },
  { position: vec(477, 236), name: 'SKYLINE', color: '#c29b70' },
  { position: vec(54, 301), name: 'CEDAR HOUSE', color: '#be8661' },
  { position: vec(105, 294), name: 'THE LAURELS', color: '#957768' },
  { position: vec(209, 295), name: 'OAK MANOR', color: '#bf916a' },
  { position: vec(267, 365), name: 'BELVEDERE', color: '#a87259' },
  { position: vec(349, 351), name: 'WOODLAND VILLA', color: '#c49c74' },
  { position: vec(453, 324), name: 'LAKE HOUSE', color: '#b27b62' },
  { position: vec(97, 367), name: 'CEDAR LODGE', color: '#9d7360' },
];
export const GOLF_COURSE = { center: vec(174, 367), width: 96, height: 36, clubhouse: vec(127, 361) };
export const GOLF_HOLES = [
  { tee: vec(146, 360), green: vec(193, 359), bunker: vec(195, 354) },
  { tee: vec(210, 366), green: vec(167, 369), bunker: vec(165, 363) },
  { tee: vec(148, 378), green: vec(202, 378), bunker: vec(207, 381) },
];
// Shared exclusions keep trees/rocks out of gardens, fairways and access drives.
export function estateDrive(position: Vec): Vec[] {
  const entry = countryAccess(position).point;
  const delta = sub(entry, position), size = dist(entry, position);
  return [entry, add(position, scale(delta, Math.min(1, 11 / (size || 1))))];
}
export function inCountryClearing(p: Vec): boolean {
  if (Math.abs(p.x - GOLF_COURSE.center.x) < GOLF_COURSE.width / 2 + 8 && Math.abs(p.y - GOLF_COURSE.center.y) < GOLF_COURSE.height / 2 + 7) return true;
  return VILLAS.some(v => {
    if (Math.abs(p.x - v.position.x) < 22 && Math.abs(p.y - v.position.y) < 18) return true;
    const [a, b] = VILLA_DRIVES[VILLAS.indexOf(v)], delta = sub(b, a), t = clamp(dot(sub(p, a), delta) / (dot(delta, delta) || 1), 0, 1);
    return dist(p, add(a, scale(delta, t))) < 5;
  });
}
export type CountryRoad = { from: number; to: number; points: Vec[]; bridge: boolean; name: string; length: number; bounds: { min: Vec; max: Vec } };

// Sample smooth Catmull–Rom curves once. Rendering, navigation and road sensing all use
// these same points, rather than treating a painted bend as a straight shortcut.
function curve(anchors: Vec[]): Vec[] {
  const points: Vec[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[Math.max(0, i - 1)], b = anchors[i], c = anchors[i + 1], d = anchors[Math.min(anchors.length - 1, i + 2)];
    const steps = Math.ceil(dist(b, c) / 3);
    for (let j = 0; j < steps; j++) {
      const t = j / steps, t2 = t * t, t3 = t2 * t;
      const axis = (k: 'x' | 'y') => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
      points.push(vec(axis('x'), axis('y')));
    }
  }
  points.push({ ...anchors.at(-1)! }); return points;
}
function road(from: number, to: number, name: string, via: Vec[] = [], bridge = false): CountryRoad {
  const anchors = [ROAD_NODES[from], ...via, ROAD_NODES[to]];
  const points = curve(anchors);
  const bounds = { min: vec(Math.min(...points.map(p => p.x)), Math.min(...points.map(p => p.y))), max: vec(Math.max(...points.map(p => p.x)), Math.max(...points.map(p => p.y))) };
  return { from, to, points, bridge, name, length: pathLength(points), bounds };
}
export function pathLength(points: Vec[]) { return points.reduce((sum, p, i) => sum + (i ? dist(points[i - 1], p) : 0), 0); }
export const COUNTRY_ROADS: CountryRoad[] = [
  road(0, 1, 'Pine Bridge', [], true),
  road(7, 6, 'Fern Bridge', [], true),
  road(1, 2, 'Pine Road', [vec(330, 82), vec(342, 102)]),
  road(2, 3, 'Eagle Ridge', [vec(388, 100), vec(422, 65), vec(450, 47)]),
  road(3, 4, 'Summit Loop', [vec(499, 84), vec(488, 125), vec(504, 156)]),
  road(4, 5, 'Lodge Road', [vec(450, 210), vec(410, 194)]),
  road(5, 6, 'Fern Road', [vec(350, 178), vec(330, 196)]),
  road(2, 5, 'Woodland Pass', [vec(368, 138), vec(362, 153)]),
  road(5, 8, 'Southwoods Drive', [vec(368, 219), vec(337, 264)]),
  road(4, 8, 'Highland Descent', [vec(496, 232), vec(445, 277), vec(393, 279)]),
  road(8, 9, 'Millionaires Row', [vec(324, 314), vec(286, 306)]),
  road(9, 10, 'Fairway Drive', [vec(208, 325), vec(169, 340)]),
  road(10, 11, 'Cedar Crescent', [vec(96, 333), vec(76, 314)]),
  road(11, 12, 'Cedar Loop', [vec(36, 342), vec(99, 394)]),
  road(12, 13, 'Country Club Way', [vec(211, 399), vec(257, 393)]),
  road(13, 14, 'Lake Drive', [vec(358, 386), vec(386, 365)]),
  road(14, 8, 'Woodland Rise', [vec(411, 331), vec(386, 320)]),
];
export const VILLA_DRIVES = VILLAS.map(v => estateDrive(v.position));
export type RoadAccess = { road: CountryRoad; point: Vec; segment: number; along: number; distance: number };
export function countryAccess(p: Vec): RoadAccess {
  let best: RoadAccess | undefined;
  for (const road of COUNTRY_ROADS) {
    // Skip curves whose bounding box cannot improve the nearest projection. This
    // keeps scenery generation and per-frame road sensing cheap as the map grows.
    const dx = p.x - clamp(p.x, road.bounds.min.x, road.bounds.max.x), dy = p.y - clamp(p.y, road.bounds.min.y, road.bounds.max.y);
    if (best && dx * dx + dy * dy > best.distance * best.distance) continue;
    let along = 0;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], delta = sub(road.points[i], a), size = dist(a, road.points[i]);
      const t = clamp(dot(sub(p, a), delta) / (size * size || 1), 0, 1), point = add(a, scale(delta, t)), distance = dist(p, point);
      if (!best || distance < best.distance) best = { road, point, segment: i, along: along + size * t, distance };
      along += size;
    }
  }
  return best!;
}
export function countryNode(p: Vec): Vec {
  const a = countryAccess(p); return { ...ROAD_NODES[a.along < a.road.length / 2 ? a.road.from : a.road.to] };
}
export function countryNeighbours(p: Vec): Vec[] {
  const id = ROAD_NODES.findIndex(n => dist(n, p) < 0.01);
  return COUNTRY_ROADS.filter(r => r.from === id || r.to === id).map(r => ({ ...ROAD_NODES[r.from === id ? r.to : r.from] }));
}
function toEndpoint(a: RoadAccess, id: number): Vec[] {
  return id === a.road.to ? [a.point, ...a.road.points.slice(a.segment)] : [a.point, ...a.road.points.slice(0, a.segment).reverse()];
}
function nodePath(start: number, end: number): Vec[] {
  const scores = ROAD_NODES.map(() => Infinity), routes: Vec[][] = ROAD_NODES.map(() => []), visited = new Set<number>();
  scores[start] = 0; routes[start] = [ROAD_NODES[start]];
  while (visited.size < ROAD_NODES.length) {
    let id = -1;
    for (let i = 0; i < scores.length; i++) if (!visited.has(i) && (id < 0 || scores[i] < scores[id])) id = i;
    if (id === end) return routes[id];
    visited.add(id);
    const links = COUNTRY_ROADS.filter(r => r.from === id || r.to === id).map(r => ({ to: r.from === id ? r.to : r.from, length: r.length, points: r.from === id ? r.points : [...r.points].reverse() }));
    // The original east waterfront avenue connects the two bridge mouths too.
    if (id === 0 || id === 7) links.push({ to: id === 0 ? 7 : 0, length: 120, points: [ROAD_NODES[id], ROAD_NODES[id === 0 ? 7 : 0]] });
    for (const link of links) if (scores[id] + link.length < scores[link.to]) {
      scores[link.to] = scores[id] + link.length; routes[link.to] = [...routes[id], ...link.points.slice(1)];
    }
  }
  throw new Error('Disconnected highland road network');
}
export function countryPath(from: Vec, to: Vec): Vec[] {
  const a = countryAccess(from), b = countryAccess(to), routes: Vec[][] = [];
  if (a.road === b.road) {
    const points = a.along <= b.along ? a.road.points.slice(a.segment, b.segment) : a.road.points.slice(b.segment, a.segment).reverse();
    routes.push([from, a.point, ...points, b.point, to]);
  }
  for (const start of [a.road.from, a.road.to]) for (const end of [b.road.from, b.road.to]) {
    routes.push([from, ...toEndpoint(a, start), ...nodePath(start, end), ...toEndpoint(b, end).reverse(), to]);
  }
  return routes.reduce((best, route) => pathLength(route) < pathLength(best) ? route : best);
}
export function inHighlands(p: Vec): boolean {
  let inside = false;
  for (let i = 0, j = HIGHLAND_OUTLINE.length - 1; i < HIGHLAND_OUTLINE.length; j = i++) {
    const a = HIGHLAND_OUTLINE[i], b = HIGHLAND_OUTLINE[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

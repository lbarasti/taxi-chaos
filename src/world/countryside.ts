import { add, clamp, dist, dot, scale, sub, vec, type Vec } from '../physics/physics';
import type { LandGeometry } from './land';
import { regionBounds } from './regions';
import type { MapDocument } from '../map/schema';

export type CountryRoad = { id: string; from: number; to: number; points: Vec[]; bridge: boolean; name: string; length: number; bounds: { min: Vec; max: Vec } };
export type RoadAccess = { road: CountryRoad; point: Vec; segment: number; along: number; distance: number };
export function pathLength(points: Vec[]) { return points.reduce((sum, p, i) => sum + (i ? dist(points[i - 1], p) : 0), 0); }

/** Shared Catmull–Rom samples for artwork, routing and road sensing. */
function curve(anchors: Vec[]): Vec[] {
  const points: Vec[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[Math.max(0, i - 1)], b = anchors[i], c = anchors[i + 1], d = anchors[Math.min(anchors.length - 1, i + 2)];
    const steps = Math.max(1, Math.ceil(dist(b, c) / 3));
    for (let j = 0; j < steps; j++) {
      const t = j / steps, t2 = t * t, t3 = t2 * t;
      const axis = (k: 'x' | 'y') => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
      points.push(vec(axis('x'), axis('y')));
    }
  }
  points.push({ ...anchors.at(-1)! }); return points;
}

export function createCountryside(document: MapDocument, land: LandGeometry) {
  const lookup = new Map(document.points.map(p => [p.id, p.position]));
  const point = (id: string) => ({ ...lookup.get(id)! });
  const HIGHLAND_OUTLINE = land.landRegions.find(r=>r.id===document.generation.countryLand)!.outline;
  const isCountry = (p: Vec) => !land.regionContains(document.generation.cityLand,p);
  const BRIDGE_Y = document.generation.bridgeLands.map(id=>{ const b=regionBounds(land.landRegions.find(r=>r.id===id)!.outline); return (b.min.y+b.max.y)/2; });
  const source=document.landRegions.find(r=>r.id===document.generation.countryLand)!;
  const SOUTH_WOODS_Y = Math.min(...document.points.filter(p=>'pointRefs' in source && source.pointRefs.includes(p.id) && p.weight>0).map(p=>p.position.y));
  const MAP_WIDTH = document.envelope.max.x, MAP_HEIGHT = document.envelope.max.y;
  const HIGHLAND_STOPS = document.stops.map(s => ({ ...s, position: point(s.point) }));
  const ROAD_NODES = document.nodes.map(point), VILLAS = structuredClone(document.villas);
  const golf = document.golf, golfPoint = (p: Vec) => add(golf.center, p);
  const GOLF_COURSE = { id: golf.id, center: { ...golf.center }, width: golf.width, height: golf.height, clubhouse: golfPoint(golf.clubhouse) };
  const VILLA_POOLS = VILLAS.map(v => ({ position: vec(v.position.x + 14.25, v.position.y + 3), width: 6.5, height: 12 }));
  const GOLF_CART_ROUTE = golf.route.map(golfPoint), GOLF_PATH = golf.path.map(golfPoint);
  const GOLF_HOLES = golf.holes.map(h => ({ tee: golfPoint(h.tee), green: golfPoint(h.green), bunker: golfPoint(h.bunker) }));
  const RIDGES = document.ridges.map(r => structuredClone(r.points)), LABELS = structuredClone(document.labels);
  const COUNTRY_ROADS: CountryRoad[] = document.roads.map(r => {
    const points = curve([point(r.from), ...r.via.map(point), point(r.to)]);
    const bounds = { min: vec(Math.min(...points.map(p => p.x)), Math.min(...points.map(p => p.y))), max: vec(Math.max(...points.map(p => p.x)), Math.max(...points.map(p => p.y))) };
    return { id: r.id, from: document.nodes.indexOf(r.from), to: document.nodes.indexOf(r.to), name: r.name, bridge: r.bridge, points, bounds, length: pathLength(points) };
  });
  function countryAccess(p: Vec): RoadAccess {
    let best: RoadAccess | undefined;
    for (const road of COUNTRY_ROADS) {
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
  function estateDrive(position: Vec): Vec[] {
    const entry = countryAccess(position).point, delta = sub(entry, position), size = dist(entry, position);
    return [entry, add(position, scale(delta, Math.min(1, 11 / (size || 1))))];
  }
  const VILLA_DRIVES = VILLAS.map(v => estateDrive(v.position));
  function inCountryClearing(p: Vec): boolean {
    if (Math.abs(p.x - GOLF_COURSE.center.x) < GOLF_COURSE.width / 2 + 8 && Math.abs(p.y - GOLF_COURSE.center.y) < GOLF_COURSE.height / 2 + 7) return true;
    return VILLAS.some((v, i) => {
      if (Math.abs(p.x - v.position.x) < 22 && Math.abs(p.y - v.position.y) < 18) return true;
      const [a, b] = VILLA_DRIVES[i], delta = sub(b, a), t = clamp(dot(sub(p, a), delta) / (dot(delta, delta) || 1), 0, 1);
      return dist(p, add(a, scale(delta, t))) < 5;
    });
  }
  function countryNode(p: Vec): Vec {
    const a = countryAccess(p); return { ...ROAD_NODES[a.along < a.road.length / 2 ? a.road.from : a.road.to] };
  }
  function countryNeighbours(p: Vec): Vec[] {
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
      if (id < 0 || !Number.isFinite(scores[id])) return [];
      if (id === end) return routes[id];
      visited.add(id);
      const links = COUNTRY_ROADS.filter(r => r.from === id || r.to === id).map(r => ({ to: r.from === id ? r.to : r.from, length: r.length, points: r.from === id ? r.points : [...r.points].reverse() }));
      // Pinned city avenue joins the two bridge mouths.
      if (id === 0 || id === 7) links.push({ to: id === 0 ? 7 : 0, length: 120, points: [ROAD_NODES[id], ROAD_NODES[id === 0 ? 7 : 0]] });
      for (const link of links) if (scores[id] + link.length < scores[link.to]) { scores[link.to] = scores[id] + link.length; routes[link.to] = [...routes[id], ...link.points.slice(1)]; }
    }
    return [];
  }
  function countryPath(from: Vec, to: Vec): Vec[] {
    const a = countryAccess(from), b = countryAccess(to), routes: Vec[][] = [];
    if (a.road === b.road) {
      const points = a.along <= b.along ? a.road.points.slice(a.segment, b.segment) : a.road.points.slice(b.segment, a.segment).reverse();
      routes.push([from, a.point, ...points, b.point, to]);
    }
    for (const start of [a.road.from, a.road.to]) for (const end of [b.road.from, b.road.to]) {
      const middle = nodePath(start, end);
      if (middle.length) routes.push([from, ...toEndpoint(a, start), ...middle, ...toEndpoint(b, end).reverse(), to]);
    }
    return routes.length ? routes.reduce((best, route) => pathLength(route) < pathLength(best) ? route : best) : [from];
  }
  function inHighlands(p: Vec): boolean {
    return land.regionContains(document.generation.countryLand,p);
  }
  return { BRIDGE_Y, isCountry, HIGHLAND_OUTLINE, SOUTH_WOODS_Y, MAP_WIDTH, MAP_HEIGHT, HIGHLAND_STOPS, ROAD_NODES, VILLAS, GOLF_COURSE, VILLA_POOLS, GOLF_CART_ROUTE, GOLF_PATH, GOLF_HOLES, RIDGES, LABELS, COUNTRY_ROADS, VILLA_DRIVES, estateDrive, inCountryClearing, countryAccess, countryNode, countryNeighbours, countryPath, inHighlands };
}
export type Countryside = ReturnType<typeof createCountryside>;

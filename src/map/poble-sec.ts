import { add, rotate, scale, sub, vec, type Vec } from '../physics';
import type { MapDocument } from './schema';
import type { Countryside } from '../countryside';

const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const center = (polygon: Vec[]) => scale(polygon.reduce((sum, p) => add(sum, p), vec()), 1 / polygon.length);
/** Bounded quadratic corner cuts, sampled once with the rest of the map. */
function rounded(polygon: Vec[], setback: number): Vec[] {
  return polygon.flatMap((corner, i) => {
    const before = sub(polygon[(i + polygon.length - 1) % polygon.length], corner);
    const after = sub(polygon[(i + 1) % polygon.length], corner);
    const a = add(corner, scale(before, Math.min(.22, setback / Math.hypot(before.x, before.y))));
    const b = add(corner, scale(after, Math.min(.22, setback / Math.hypot(after.x, after.y))));
    return Array.from({ length: 7 }, (_, step) => {
      const t = step / 6;
      return add(add(scale(a, (1 - t) ** 2), scale(corner, 2 * t * (1 - t))), scale(b, t * t));
    });
  });
}
/** Intersect parallel, inward-offset edges to preserve trapezoids and wedge tips. */
function inset(polygon: Vec[], distance: number): Vec[] {
  if (polygon.some((a, i) => { const b = polygon[(i + 1) % polygon.length], c = polygon[(i + 2) % polygon.length]; return Math.hypot(b.x-a.x, b.y-a.y) < .001 || Math.abs(cross(sub(b,a), sub(c,b))) < .000001; })) return [];
  const lines = polygon.map((a, i) => {
    const direction = sub(polygon[(i + 1) % polygon.length], a), length = Math.hypot(direction.x, direction.y);
    return { origin: add(a, scale(vec(-direction.y, direction.x), distance / length)), direction };
  });
  const result = lines.map((b, i) => {
    const a = lines[(i + lines.length - 1) % lines.length];
    return add(a.origin, scale(a.direction, cross(sub(b.origin, a.origin), b.direction) / cross(a.direction, b.direction)));
  });
  // A small triangular parcel may have no courtyard after the houses are inset.
  return result.every(p => polygon.every((a, i) => {
    const edge = sub(polygon[(i + 1) % polygon.length], a);
    return cross(edge, sub(p, a)) >= distance * Math.hypot(edge.x, edge.y) - 0.01;
  })) ? result : [];
}

/** Ground artwork consumes the same authored junctions as road routing and buildings. */
export function createPobleSec(document: MapDocument, country: Countryside) {
  const points = new Map(document.points.map(p => [p.id, p.position]));
  const { neighbourhood } = document, origin = points.get(neighbourhood.origin)!;
  // Park coordinates use their authored frame; street corners remain independent anchors.
  const angle = neighbourhood.angle, east = vec(Math.cos(angle), Math.sin(angle)), south = vec(-east.y, east.x);
  const point = (u: number, v: number): Vec => add(origin, add(scale(east, u), scale(south, v)));
  const localPolygon = (coordinates: number[][], setback = 3) => rounded(coordinates.map(([u, v]) => point(u, v)), setback);
  const cells = neighbourhood.blocks.map(block => {
    const boundary = block.corners.map(id => points.get(id)!);
    const edge = sub(boundary[1], boundary[0]), length = Math.hypot(edge.x, edge.y), midpoint = center(boundary);
    return { id: block.id, center: midpoint, radius: Math.max(...boundary.map(p => Math.hypot(p.x - midpoint.x, p.y - midpoint.y))),
      boundary, pavement: rounded(inset(boundary, 4.8), 2.8), courtyard: inset(boundary, 5.6),
      home: add(add(boundary[0], scale(edge, .35)), scale(vec(-edge.y, edge.x), 4.8 / Math.max(length, .001))),
      angle: Math.atan2(edge.y, edge.x), plaza: block.plaza };
  });
  const paths = [
    [[36,159],[45,163],[50,171],[128,177],[130,189],[56,200],[64,215],[120,220]],
    [[139,159],[138,170],[78,182],[72,191],[124,202],[118,220],[90,233]],
  ].map(path => path.map(([u,v]) => point(u,v)));
  // A continuous foothill, with planted fingers reaching the urban promenade.
  // The wider, irregular outline avoids an isolated rectangular lawn on the hill.
  const park = localPolygon([[8,163],[28,157],[53,159],[78,161],[105,157],[139,158],
    [151,172],[146,193],[153,213],[137,237],[112,245],[81,241],[53,248],[32,234],[24,211],[12,194]], 7);
  const promenade = [point(0,159), point(35,159), point(72,159), point(110,159), point(139,159)];
  const gardens = [
    [[5,162],[18,161],[27,164],[30,174],[18,178],[9,173]],
    [[39,163],[49,164],[57,167],[55,175],[46,172]],
    [[80,162],[99,161],[112,164],[109,173],[91,175],[82,170]],
    [[118,162],[137,162],[144,173],[135,178],[122,171]],
  ].map(outline => localPolygon(outline, 2));
  const streets = country.COUNTRY_ROADS.filter(road => road.surface === 'residential');
  const streetNodes = new Set(streets.flatMap(road => [road.from, road.to]));
  // Taper the wider country approaches into the narrower neighbourhood streets.
  // These ribbons follow the same sampled road curves as routing and sensing.
  const approaches = country.COUNTRY_ROADS.filter(road => !road.bridge && !streets.includes(road)
    && (streetNodes.has(road.from) || streetNodes.has(road.to))).map(road => {
    let along = 0;
    const samples = road.points.map((p, i) => {
      if (i) along += Math.hypot(p.x - road.points[i - 1].x, p.y - road.points[i - 1].y);
      const delta = sub(road.points[Math.min(i + 1, road.points.length - 1)], road.points[Math.max(0, i - 1)]);
      const normal = scale(vec(-delta.y, delta.x), 1 / Math.hypot(delta.x, delta.y));
      const distance = Math.min(streetNodes.has(road.from) ? along : Infinity, streetNodes.has(road.to) ? road.length - along : Infinity);
      const t = Math.max(0, Math.min(1, (distance - 12) / 16)), blend = t * t * (3 - 2 * t);
      return { p, normal, blend };
    });
    const ribbon = (urban: number, rural: number) => {
      const side = (sign: number) => samples.map(({ p, normal, blend }) => add(p, scale(normal, sign * (urban + (rural - urban) * blend))));
      return [...side(1), ...side(-1).reverse()];
    };
    return { id: road.id, pavement: ribbon(5.25, 7.75), asphalt: ribbon(4, 6),
      centerline: samples.filter(sample => sample.blend === 1).map(sample => sample.p) };
  });
  const crossings = [...streetNodes].flatMap(nodeId => {
    const links = streets.filter(road => road.from === nodeId || road.to === nodeId);
    if (links.length < 3) return [];
    return links.map(road => {
      const outgoing = road.from === nodeId ? road.points : [...road.points].reverse();
      const direction = sub(outgoing[1], outgoing[0]);
      return { position: outgoing[0], angle: Math.atan2(direction.y, direction.x) };
    });
  });
  const junctions = [...streetNodes].filter(id => approaches.some(approach => {
    const road = country.COUNTRY_ROADS.find(road => road.id === approach.id)!;
    return road.from === id || road.to === id;
  })).flatMap(id => {
    const position = country.ROAD_NODES[id];
    const arms = country.COUNTRY_ROADS.filter(road => road.from === id || road.to === id).map(road => {
      const p = road.from === id ? road.points[1] : road.points.at(-2)!;
      const delta = sub(p, position), direction = scale(delta, 1 / Math.hypot(delta.x, delta.y));
      return { direction, angle: Math.atan2(direction.y, direction.x) };
    }).sort((a, b) => a.angle - b.angle);
    return arms.flatMap((arm, i) => {
      const next = arms[(i + 1) % arms.length], gap = (next.angle - arm.angle + Math.PI * 2) % (Math.PI * 2);
      if (gap < .35 || gap > Math.PI - .05) return [];
      const a = arm.direction, b = next.direction;
      const patch = (width: number) => {
        const pa = add(position, scale(vec(-a.y, a.x), width)), pb = add(position, scale(vec(b.y, -b.x), width));
        const corner = add(pa, scale(a, cross(sub(pb, pa), b) / cross(a, b)));
        const start = add(corner, scale(a, 6)), end = add(corner, scale(b, 6));
        return [corner, ...Array.from({ length: 13 }, (_, step) => {
          const t = step / 12;
          return add(add(scale(start, (1 - t) ** 2), scale(corner, 2 * t * (1 - t))), scale(end, t * t));
        })];
      };
      return [{ pavement: patch(5.25), asphalt: patch(4), curb: patch(4.625).slice(1) }];
    });
  });
  // Compile each cadastral parcel to one convex outline shared by its roof,
  // static collision body and light occlusion.
  const roofs = document.countryProps.filter(prop => prop.architecture).map(prop => ({
    id: prop.id, sourceId: prop.id, position: prop.position, angle: prop.angle,
    w: prop.width, h: prop.height, color: prop.color, ...prop.architecture!,
  }));
  return { point, cells, paths, roofs, park, promenade, gardens, streets, approaches, crossings, junctions, angle,
    contains: (p: Vec) => [...cells.map(cell => cell.boundary), park].some(polygon => {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside = !inside;
      }
      return inside;
    }),
  };
}

export type PobleRoof = NonNullable<ReturnType<typeof createPobleSec>>['roofs'][number];

import { vehicleDefinition } from '../vehicles/vehicles';
import { Body, contact, dist, type Vec } from '../physics/physics';
import type { CompiledMap } from '../map/compile';
import type { PropKind } from '../catalogue/schema';
import { freezeGeometry } from '../map/default';
import { closestOnSegment, contains, regionBounds, regionOrder } from './regions';

export type Travel = 'walk' | 'drive';
/** Small authored access graph. Neither surface materials nor district names enter
 * routing. Connections to the existing road network are explicit road nodes. */
export type AccessGeometry = {
  hash: { query(body: Body): Iterable<{ body: Body; kind: PropKind }> };
  pools: readonly Body[];
};
export function createAccess(map: CompiledMap, collisionGeometry: () => AccessGeometry) {
  const areas = map.document.accessAreas
      .map((a) => freezeGeometry({ ...a, bounds: regionBounds(a.outline) }))
      .sort(regionOrder),
    nodes = map.document.accessNodes;
  const areaAt = (p: Vec) => {
    for (let i = areas.length - 1; i >= 0; i--) {
      const a = areas[i],
        b = a.bounds;
      if (
        p.x >= b.min.x &&
        p.x <= b.max.x &&
        p.y >= b.min.y &&
        p.y <= b.max.y &&
        contains(a.outline, p)
      )
        return a;
    }
    return undefined;
  };
  const land = map.land.inOcean;
  function clear(
    a: Vec,
    b: Vec,
    travel: Travel,
    dimensions?: { width: number; height: number },
  ): boolean {
    const chassis = vehicleDefinition('pickup').chassis;
    const w = dimensions?.width ?? (travel === 'walk' ? 0.7 : chassis.length),
      h = dimensions?.height ?? (travel === 'walk' ? 0.7 : chassis.width),
      geometry = collisionGeometry();
    const steps = Math.ceil(dist(a, b) / 0.25),
      body = new Body(a.x, a.y, 1, w, h);
    body.angle = travel === 'walk' ? 0 : Math.atan2(b.y - a.y, b.x - a.x);
    for (let i = 0; i <= steps; i++) {
      const t = i / (steps || 1);
      body.position = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (
        [body.position, ...body.corners()].some(land) ||
        [...geometry.hash.query(body)].some(
          (o) =>
            !(travel === 'walk' && o.kind === 'pedestrian-gate') &&
            (contact(body, o.body)?.depth ?? 0) > 0.001,
        ) ||
        geometry.pools.some((pool) => contact(body, pool))
      )
        return false;
      if (travel === 'drive' && areaAt(body.position)?.driving === 'approach') return false;
    }
    return true;
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roadEdges = map.document.accessEdges.filter(
    (e) => byId.get(e.fromNode)!.road && byId.get(e.toNode)!.road,
  );
  const components = new Map<string, Set<string>>();
  function roadPoints(p: Vec): Vec[] {
    const area = areaAt(p);
    if (!area) return [];
    let component = components.get(area.id);
    if (!component) {
      component = new Set(nodes.filter((n) => contains(area.outline, n.position)).map((n) => n.id));
      for (let pass = 0; pass < nodes.length; pass++)
        for (const edge of map.document.accessEdges)
          if (component.has(edge.fromNode) || component.has(edge.toNode)) {
            component.add(edge.fromNode);
            component.add(edge.toNode);
          }
      components.set(area.id, component);
    }
    return [
      ...nodes.filter((n) => n.road && component!.has(n.id)).map((n) => n.position),
      ...roadEdges
        .filter((e) => component!.has(e.fromNode))
        .map((e) =>
          closestOnSegment(p, byId.get(e.fromNode)!.position, byId.get(e.toNode)!.position),
        ),
    ];
  }
  function approach(p: Vec): Vec {
    const points = roadPoints(p);
    return points.length ? points.reduce((a, b) => (dist(p, a) < dist(p, b) ? a : b)) : p;
  }
  function vehicleTarget(p: Vec): Vec {
    return areaAt(p)?.driving === 'approach' ? approach(p) : p;
  }
  // Cache topology only. Clearance uses the live collision index, so generated
  // props, newly added obstacles and destruction all affect the same route queries.
  const adjacency = {
    walk: new Map<string, { id: string; cost: number }[]>(),
    drive: new Map<string, { id: string; cost: number }[]>(),
  };
  for (const e of map.document.accessEdges)
    for (const mode of e.modes) {
      const a = byId.get(e.fromNode)!,
        b = byId.get(e.toNode)!;
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const list = adjacency[mode].get(from.id) ?? [];
        list.push({ id: to.id, cost: dist(from.position, to.position) });
        adjacency[mode].set(from.id, list);
      }
    }
  function route(p: Vec, travel: Travel): Vec[] {
    const candidates = [...nodes].sort((a, b) => dist(p, a.position) - dist(p, b.position));
    const costs = new Map<string, number>(),
      paths = new Map<string, Vec[]>(),
      pending = new Set<string>();
    let connected = 0;
    for (const n of candidates) {
      if (connected >= 8) break;
      if (!clear(p, n.position, travel)) continue;
      costs.set(n.id, dist(p, n.position));
      paths.set(n.id, [p, n.position]);
      pending.add(n.id);
      connected++;
    }
    while (pending.size) {
      const id = [...pending].reduce((a, b) => (costs.get(a)! <= costs.get(b)! ? a : b));
      pending.delete(id);
      const n = byId.get(id)!;
      if (n.road) return paths.get(id)!;
      for (const edge of adjacency[travel].get(id) ?? []) {
        if (!clear(n.position, byId.get(edge.id)!.position, travel)) continue;
        const cost = costs.get(id)! + edge.cost;
        if (cost >= (costs.get(edge.id) ?? Infinity)) continue;
        costs.set(edge.id, cost);
        paths.set(edge.id, [...paths.get(id)!, byId.get(edge.id)!.position]);
        pending.add(edge.id);
      }
    }
    return [];
  }
  return { areaAt, approach, vehicleTarget, route, clear };
}

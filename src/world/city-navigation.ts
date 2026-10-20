import { citySegmentOpen, type City } from './city';
import { dist, vec, type Vec } from '../physics/physics';

export type StreetAccess = { point: Vec; vertical?: number; horizontal?: number; distance?: number };

/** Small fixed road graph, used only when a closed street invalidates the usual
 * direct / one- or two-turn routes. Build once per independent compiled map. */
export function createCityDetour(city: City) {
  const key = (p: Vec) => `${p.x},${p.y}`;
  const nodes = new Map<string, Vec>(), neighbours = new Map<string, Vec[]>();
  for (const road of city.roads) for (const [a, b] of [[road.from, road.to], [road.to, road.from]]) {
    const id = key(a); nodes.set(id, a);
    neighbours.set(id, [...neighbours.get(id) ?? [], b]);
  }
  const pathLength = (points: Vec[]) => points.slice(1).reduce((sum, p, i) => sum + dist(points[i], p), 0);
  const connections = (access: StreetAccess) => {
    const result: { id: string; points: Vec[]; cost: number }[] = [];
    for (const [id, node] of nodes) {
      const bends: Vec[] = [];
      if (access.vertical !== undefined) bends.push(vec(access.point.x, node.y));
      if (access.horizontal !== undefined) bends.push(vec(node.x, access.point.y));
      for (const bend of bends) {
        const points = [access.point, bend, node];
        if (points.slice(1).every((p, i) => citySegmentOpen(city, points[i], p))) result.push({ id, points, cost: pathLength(points) });
      }
    }
    return result;
  };
  return (start: StreetAccess, end: StreetAccess): Vec[] | undefined => {
    const costs = new Map<string, number>(), paths = new Map<string, Vec[]>(), visited = new Set<string>();
    for (const c of connections(start)) if (c.cost < (costs.get(c.id) ?? Infinity)) { costs.set(c.id, c.cost); paths.set(c.id, c.points); }
    const finishes = connections(end);
    let best: Vec[] | undefined, bestCost = Infinity;
    while (visited.size < nodes.size) {
      let current: string | undefined, cost = Infinity;
      for (const [id, value] of costs) if (!visited.has(id) && value < cost) { current = id; cost = value; }
      if (!current || cost > bestCost) break;
      visited.add(current);
      for (const finish of finishes.filter(c => c.id === current)) if (cost + finish.cost < bestCost) {
        bestCost = cost + finish.cost; best = [...paths.get(current)!, ...finish.points.slice().reverse()];
      }
      for (const next of neighbours.get(current) ?? []) {
        const id = key(next), nextCost = cost + dist(nodes.get(current)!, next);
        if (nextCost >= (costs.get(id) ?? Infinity)) continue;
        costs.set(id, nextCost); paths.set(id, [...paths.get(current)!, next]);
      }
    }
    return best;
  };
}

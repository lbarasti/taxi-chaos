import { add, clamp, dist, dot, scale, sub, vec, type Vec } from './physics';

import type { ResolvedLand } from './land';
import { contains, regionBounds } from './regions';
/** Harbour queries use the compiled map's explicit source region. */
export function createHarbourGeometry(region: ResolvedLand) {
  const bounds=regionBounds(region.outline);
  const inHarbour=(p: Vec)=>contains(region.outline,p);
  const onPortRoad=(p: Vec)=>inHarbour(p) || p.y < -6 && p.y >= -14 && (Math.abs(p.x-200)<=6 || Math.abs(p.x-220)<=6);
  return { region, left:bounds.min.x, right:bounds.max.x, top:bounds.min.y, bottom:bounds.max.y, inHarbour, onPortRoad };
}
export const PORT_FEE = 75;
export const PORT_ENTRY = vec(200, -8);
export const PORT_EXIT = vec(220, -8);
export const SWAP_CONTAINER = vec(108, -40);
export const SWAP_EXIT = vec(121, -40);
export const SWAP_SECONDS = 2.5;
export const PORT_GATES = [vec(200, -17), vec(220, -17)];
export const CONTAINER_COLORS = ['#cf7755', '#61a5a1', '#d4ad5e', '#7d8dab', '#a26668'];
export const PORT_CONTAINERS = [-72, -88, -104].flatMap((y, row) => [100, 120, 140, 160, 180].map((x, col) => ({ position: vec(x, y), color: CONTAINER_COLORS[(row + col) % 5], label: `${['PACIFIC', 'NORTHSTAR', 'TIDELINE', 'CARGO 76', 'MARINER'][col]} ${row + 1} / ${col + 1}`, tiers: 2 + (row + col) % 2 })));
export const PORT_SHIPS = [{ position: vec(119, -151), name: 'MV NORTHSTAR', color: '#a65747' }, { position: vec(211, -151), name: 'MV TIDELINE', color: '#477e80' }];
export const PORT_CRANES = [100, 140, 188, 228].map((x, i) => ({ x, phase: i * 0.23 }));

// Truck loop passes through separate inbound/outbound lanes, then a short city
// circuit. It stays outside the storage stacks and the player's exchange bay.
export const FREIGHT_ROUTE = [vec(200, 0), vec(200, -54), vec(238, -54), vec(238, -118), vec(84, -118), vec(84, -54), vec(220, -54), vec(220, 0), vec(243, -3), vec(243, 43), vec(203, 43), vec(203, -3)];
export const PORT_NODES = [vec(200, 0), vec(200, -40), vec(200, -54), vec(220, -54), vec(238, -54), vec(238, -118), vec(84, -118), vec(84, -54), vec(220, 0), vec(116, -40), SWAP_CONTAINER];
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 2], [3, 8], [1, 9], [9, 10]];
export const PORT_CONNECTIONS = [PORT_NODES[0], PORT_NODES[8]];
export function portAccess(p: Vec) {
  return EDGES.map(([a, b], edge) => {
    const start = PORT_NODES[a], delta = sub(PORT_NODES[b], start);
    const point = add(start, scale(delta, clamp(dot(sub(p, start), delta) / dot(delta, delta), 0, 1)));
    return { point, distance: dist(p, point), edge, a, b };
  }).reduce((a, b) => a.distance < b.distance ? a : b);
}
export function portNode(p: Vec) { return PORT_NODES.reduce((a, b) => dist(a, p) < dist(b, p) ? a : b); }
export function portNeighbours(p: Vec) {
  const index = PORT_NODES.findIndex(n => dist(n, p) < 0.1);
  return EDGES.flatMap(([a, b]) => a === index ? [PORT_NODES[b]] : b === index ? [PORT_NODES[a]] : []);
}
export function portPath(from: Vec, to: Vec): Vec[] {
  const start = portAccess(from), end = portAccess(to);
  if (start.edge === end.edge) return [from, start.point, end.point, to];
  const costs = PORT_NODES.map(() => Infinity), previous = PORT_NODES.map(() => -1), visited = new Set<number>();
  for (const n of [start.a, start.b]) costs[n] = dist(start.point, PORT_NODES[n]);
  for (let i = 0; i < PORT_NODES.length; i++) {
    let n = -1;
    for (let j = 0; j < costs.length; j++) if (!visited.has(j) && (n < 0 || costs[j] < costs[n])) n = j;
    if (n < 0 || !Number.isFinite(costs[n])) break;
    visited.add(n);
    for (const [a, b] of EDGES) {
      const next = a === n ? b : b === n ? a : -1;
      if (next < 0) continue;
      const cost = costs[n] + dist(PORT_NODES[n], PORT_NODES[next]);
      if (cost < costs[next]) { costs[next] = cost; previous[next] = n; }
    }
  }
  let n = [end.a, end.b].reduce((a, b) => costs[a] + dist(PORT_NODES[a], end.point) < costs[b] + dist(PORT_NODES[b], end.point) ? a : b);
  const path: Vec[] = [];
  while (n >= 0) { path.unshift(PORT_NODES[n]); n = previous[n]; }
  return [from, start.point, ...path, end.point, to];
}

// A repeating lift -> trolley -> lower -> empty return cycle. All four cranes
// have staggered phases; cargo is attached only on the outward loading leg.
export function craneLoad(time: number, phase: number) {
  const t = ((time / 14 + phase) % 1 + 1) % 1;
  const travel = t < 0.15 ? 0 : t < 0.45 ? (t - 0.15) / 0.3 : t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
  const lift = t < 0.15 ? t / 0.15 : t < 0.45 ? 1 : t < 0.65 ? 1 - (t - 0.45) / 0.2 : 0;
  return { y: -122 - travel * 29, lift, loaded: t < 0.65, progress: t };
}

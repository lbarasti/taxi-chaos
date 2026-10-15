import { add, dot, scale, sub, vec, type Vec } from '../physics';
import type { MapDocument } from './schema';

/** Ground artwork follows the authored street anchors, including editor moves. */
export function createPobleSec(document: MapDocument) {
  const points = new Map(document.points.map(p => [p.id, p.position]));
  const origin = points.get('poble-node-0-0');
  if (!origin || !points.has('poble-node-0-1') || !points.has('poble-node-1-0')) return null;
  const east = scale(sub(points.get('poble-node-0-1')!, origin), 1 / 36);
  const south = scale(sub(points.get('poble-node-1-0')!, origin), 1 / 38);
  const point = (u: number, v: number): Vec => add(origin, add(scale(east, u), scale(south, v)));
  const polygon = (u: number, v: number, w: number, h: number) => [point(u, v), point(u + w, v), point(u + w, v + h), point(u, v + h)];
  const cells = Array.from({ length: 16 }, (_, i) => {
    const row = Math.floor(i / 4), col = i % 4, u = col * 36, v = row * 38;
    return { center: point(u + 18, v + 19), pavement: polygon(u + 4.8, v + 4.8, 26.4, 28.4), courtyard: polygon(u + 12, v + 12.5, 12, 13), plaza: row === 1 && col === 2 };
  });
  const paths = [
    [[38,158],[50,171],[128,177],[130,189],[56,200],[64,215],[120,220]],
    [[144,155],[138,170],[78,182],[72,191],[124,202],[118,220],[90,233]],
  ].map(path => path.map(([u,v]) => point(u,v)));
  return { point, cells, paths, park: polygon(40, 161, 100, 77), angle: Math.atan2(east.y, east.x),
    contains: (p: Vec) => { const delta = sub(p, origin), u = dot(delta, east), v = dot(delta, south); return u > -10 && u < 155 && v > -9 && v < 240; },
  };
}

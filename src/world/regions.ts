import { cross, dist, sub, type Vec } from '../physics';

export const regionBounds = (ring: readonly Vec[]) => ({
  min: { x: Math.min(...ring.map((p) => p.x)), y: Math.min(...ring.map((p) => p.y)) },
  max: { x: Math.max(...ring.map((p) => p.x)), y: Math.max(...ring.map((p) => p.y)) },
});
/** Inclusive polygon query, shared by terrain, land, access and district labels. */
export function contains(ring: readonly Vec[], p: Vec): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i];
    if (
      Math.abs(cross(sub(b, a), sub(p, a))) < 1e-8 &&
      p.x >= Math.min(a.x, b.x) &&
      p.x <= Math.max(a.x, b.x) &&
      p.y >= Math.min(a.y, b.y) &&
      p.y <= Math.max(a.y, b.y)
    )
      return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
/** Low priority first; stable IDs break ties independently of authored order. */
export const regionOrder = <T extends { priority: number; id: string }>(a: T, b: T) =>
  a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return { x: a.x + t * dx, y: a.y + t * dy };
}
export function ringDistance(a: readonly Vec[], b: readonly Vec[]): number {
  if (a.some((p) => contains(b, p)) || b.some((p) => contains(a, p))) return 0;
  let best = Infinity;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      const p = a[i],
        q = a[(i + 1) % a.length],
        r = b[j],
        s = b[(j + 1) % b.length];
      const ab = sub(q, p),
        cd = sub(s, r),
        delta = sub(r, p),
        denominator = cross(ab, cd);
      if (denominator) {
        const t = cross(delta, cd) / denominator,
          u = cross(delta, ab) / denominator;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
      }
      best = Math.min(
        best,
        dist(p, closestOnSegment(p, r, s)),
        dist(q, closestOnSegment(q, r, s)),
        dist(r, closestOnSegment(r, p, q)),
        dist(s, closestOnSegment(s, p, q)),
      );
    }
  return best;
}

// Cheap 2D light occlusion for Taxi Chaos's reduced-resolution lighting compositor.
//
// General raytracing / CPU visibility polygons are out of scope (they are CPU-heavy and pop as
// the camera moves). Instead each raised structure contributes a convex occluder outline, and for
// an occluded light we extrude that outline away from the light into a shadow volume:
//
//   shadow volume = convex hull( occluder outline + outline projected outwards from the light )
//
// Because the hull includes the occluder itself, one clip does both jobs:
//   1. receiver masking - a beam can never land on the roof/facade quad, so dark buildings stay
//      dark instead of glowing like the street;
//   2. shadow extrusion - a beam cannot spill onto the street behind a raised building.
//
// The compositor subtracts these volumes with successive Canvas 2D `clip('evenodd')` calls.
// Canvas clip regions intersect, so overlapping shadows merge cleanly (no double-darkening, no
// winding leaks) unlike a single nonzero path with multiple holes. Cost is O(active beams x
// nearby occluders); occluders are viewport-culled once per frame and range-rejected per light.
//
// Technique references:
// - Slembcke, "2D Lighting Techniques" (destination-alpha mask + occluder geometry, and why
//   visibility polygons are expensive): https://www.slembcke.net/blog/2DLightingTechniques/
// - GameDev.net, "Dynamic 2D Soft Shadows" (project shadow-caster boundary points away from the
//   light; overlapping shadows merge; receiver/shadow-depth offset keeps walls out of the mask):
//   https://gamedev.net/tutorials/programming/graphics/dynamic-2d-soft-shadows-r3065

export type OcclusionPoint = { x: number; y: number };

export type OcclusionViewport = { minX: number; minY: number; maxX: number; maxY: number };

/** A convex world-space outline (the roof/facade footprint of one raised structure). */
export type Occluder = {
  points: OcclusionPoint[];
  /** Bounding circle, used for cheap per-light range rejection. */
  cx: number;
  cy: number;
  radius: number;
};

/** Minimal prop view accepted by `collectOccluders`; `world.Prop` is structurally compatible. */
export type OccluderProp = {
  kind: string;
  alive: boolean;
  body: { position: OcclusionPoint; angle?: number; w: number; h: number; vertices?: readonly OcclusionPoint[]; corners?: () => OcclusionPoint[] };
};

/** Kinds whose roofs are raised above the street and must not receive street-level light. */
const OCCLUDING_KINDS = new Set(['building', 'shed', 'barracks', 'station', 'rock', 'container', 'lifeguard-tower']);

// The renderer draws a building's facade lifted by (-0.25,-0.6) in local space (the visual cue for
// height). Extend the receiver mask by the same offset so the clip follows the drawn silhouette.
const FACADE_OFFSET_X = -0.25;
const FACADE_OFFSET_Y = -0.6;

const finite = (value: number | undefined, fallback = 0): number => (Number.isFinite(value) ? (value as number) : fallback);

/** Rotate a local rectangle around `position` and return its four world-space corners. */
function rectCorners(position: OcclusionPoint, angle: number, x0: number, y0: number, x1: number, y1: number): OcclusionPoint[] {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const local = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as const;
  return local.map(([lx, ly]) => ({
    x: position.x + lx * cos - ly * sin,
    y: position.y + lx * sin + ly * cos,
  }));
}

/** Build one occluder outline, including the renderer's facade lift for tall 'building' props. */
export function occluderFor(prop: OccluderProp): Occluder | null {
  if (!prop.alive || !OCCLUDING_KINDS.has(prop.kind)) return null;
  const body = prop.body;
  const hw = Math.max(0.05, finite(body.w, 0.1) / 2);
  const hh = Math.max(0.05, finite(body.h, 0.1) / 2);
  const lifted = prop.kind === 'building';
  const x0 = -hw + (lifted ? FACADE_OFFSET_X : 0);
  const y0 = -hh + (lifted ? FACADE_OFFSET_Y : 0);
  const points = body.vertices && body.corners ? body.corners() : rectCorners(body.position, finite(body.angle, 0), x0, y0, hw, hh);
  let cx = 0, cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  cx /= points.length; cy /= points.length;
  let radius = 0;
  for (const p of points) radius = Math.max(radius, Math.hypot(p.x - cx, p.y - cy));
  return { points, cx, cy, radius };
}

/**
 * Collect alive raised structures that can affect the visible frame. Destroyed structures (rubble)
 * stop occluding. The margin keeps buildings just off-screen from popping shadows in at the edges.
 */
export function collectOccluders(props: readonly OccluderProp[], view: OcclusionViewport, margin = 20): Occluder[] {
  const minX = view.minX - margin, maxX = view.maxX + margin;
  const minY = view.minY - margin, maxY = view.maxY + margin;
  const out: Occluder[] = [];
  for (const prop of props) {
    const occluder = occluderFor(prop);
    if (!occluder) continue;
    if (occluder.cx + occluder.radius < minX || occluder.cx - occluder.radius > maxX) continue;
    if (occluder.cy + occluder.radius < minY || occluder.cy - occluder.radius > maxY) continue;
    out.push(occluder);
  }
  return out;
}

/** Monotone-chain convex hull. Collinear points are dropped; degenerate inputs are returned as-is. */
export function convexHull(points: readonly OcclusionPoint[]): OcclusionPoint[] {
  const pts = points
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map(p => ({ x: p.x, y: p.y }))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length < 3) return pts;
  const cross = (o: OcclusionPoint, a: OcclusionPoint, b: OcclusionPoint): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: OcclusionPoint[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: OcclusionPoint[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

export function pointInConvex(point: OcclusionPoint, polygon: readonly OcclusionPoint[]): boolean {
  if (polygon.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const edge = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (Math.abs(edge) < 1e-9) continue;
    const s = edge > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

/**
 * Shadow volume for one light and one occluder: the convex hull of the outline plus every outline
 * point pushed outwards along the light->point ray by `extend`. `extend` should exceed the light's
 * sprite radius so the volume always covers the part of the sprite that lies behind the occluder.
 * If the light sits inside the occluder, the outline itself is the hole (receiver mask only).
 */
export function shadowVolume(light: OcclusionPoint, occluder: Occluder, extend: number): OcclusionPoint[] {
  const base = occluder.points;
  if (!base || base.length < 3) return [];
  if (pointInConvex(light, base)) return base.map(p => ({ x: p.x, y: p.y }));
  const pts: OcclusionPoint[] = base.map(p => ({ x: p.x, y: p.y }));
  const reach = Math.max(0, finite(extend, 0));
  for (const p of base) {
    const dx = p.x - light.x, dy = p.y - light.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) { pts.push({ x: p.x, y: p.y }); continue; }
    pts.push({ x: p.x + (dx / len) * reach, y: p.y + (dy / len) * reach });
  }
  return convexHull(pts);
}

/** Occluders close enough to reach a light, with bounding circles padded by `padding`. */
export function nearbyOccluders(
  light: { x: number; y: number; radius: number },
  occluders: readonly Occluder[],
  padding = 0,
): Occluder[] {
  const reach = Math.max(0, finite(light.radius, 0)) + Math.max(0, finite(padding, 0));
  return occluders.filter(o => {
    const dx = o.cx - light.x, dy = o.cy - light.y;
    const limit = reach + o.radius;
    return dx * dx + dy * dy <= limit * limit;
  });
}

/**
 * Only lights that read as directed beams (headlight cones) are occluded by default. Any light can
 * opt in with `occlude: true`; ambient/point lamps keep their existing soft spill so storefront
 * awnings stay readable.
 */
export function shouldOcclude(light: { profile?: string; occlude?: boolean }): boolean {
  return light.profile === 'cone' || light.occlude === true;
}

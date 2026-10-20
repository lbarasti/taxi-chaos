import type { CollisionRect } from './physics';

export const FOUNTAIN_RADIUS = 3.7;
export const FOUNTAIN_WATER_RADIUS = 2.7;
/** Conservative horizontal bands follow the circular stone rim within 0.24 m.
 * The basin remains hollow for both contact and light; no square bounding collider.
 * Coordinates are normalized to the full fountain footprint for catalogue resizing. */
export const fountainRim: readonly CollisionRect[] = Array.from({ length: 32 }, (_, i) => {
  const y = -0.5 + i / 32, bottom = y + 1 / 32;
  const near = Math.max(0, y, -bottom), far = Math.max(Math.abs(y), Math.abs(bottom));
  const outer = Math.sqrt(0.25 - near * near);
  const innerRadius = FOUNTAIN_WATER_RADIUS / (FOUNTAIN_RADIUS * 2);
  const inner = Math.sqrt(Math.max(0, innerRadius * innerRadius - far * far));
  return inner === 0 ? [{ x: -outer, y, width: 2 * outer, height: 1 / 32 }]
    : [{ x: -outer, y, width: outer - inner, height: 1 / 32 },
       { x: inner, y, width: outer - inner, height: 1 / 32 }];
}).flat();

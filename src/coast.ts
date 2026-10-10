import { BRIDGE_Y, HIGHLAND_OUTLINE, countryAccess, inHighlands } from './countryside';
import { add, dist, normalize, scale, sub, vec, type Vec } from './physics';

// These bounds also define the painted city apron. Water is the complement of
// the two land masses and the bridge decks, so no invisible outer wall remains.
export const CITY_SHORE = { min: -14, max: 254 };
export const BRIDGE_HALF_WIDTH = 7.5;
export function onBridge(p: Vec) {
  return p.x >= 240 && p.x <= 310 && BRIDGE_Y.some(y => Math.abs(p.y - y) <= BRIDGE_HALF_WIDTH);
}
export function inOcean(p: Vec): boolean {
  return !(p.x >= CITY_SHORE.min && p.x <= CITY_SHORE.max && p.y >= CITY_SHORE.min && p.y <= CITY_SHORE.max)
    && !onBridge(p) && !inHighlands(p);
}

export type CoastRail = { position: Vec; width: number; angle: number };
const cityOutline = [vec(-14, -14), vec(254, -14), vec(254, 254), vec(-14, 254)];
export const COAST_RAILS: CoastRail[] = [];
for (const outline of [cityOutline, HIGHLAND_OUTLINE]) {
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], delta = sub(b, a);
    const n = Math.ceil(dist(a, b) / 8), width = dist(a, b) / n;
    // Both outlines run clockwise in screen coordinates. Offset onto dry land.
    const inward = scale(normalize(vec(-delta.y, delta.x)), 0.9);
    for (let j = 0; j < n; j++) {
      // Three short panels, then two open panels: generous, visible coastal gaps.
      if (j % 5 >= 3) continue;
      const position = add(add(a, scale(delta, (j + 0.5) / n)), inward);
      if (onBridge(position) || outline === HIGHLAND_OUTLINE && countryAccess(position).distance < 10) continue;
      COAST_RAILS.push({ position, width, angle: Math.atan2(delta.y, delta.x) });
    }
  }
}
// Bridge sides stay continuous, but each short panel can break independently.
for (const y of BRIDGE_Y) for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
  COAST_RAILS.push({ position: vec(246 + (i + 0.5) * 66 / 9, y + side * BRIDGE_HALF_WIDTH), width: 66 / 9, angle: 0 });
}

// Normal approach speed, rather than total speed, makes fast glancing hits slide
// along the rail. Bikes can breach it too; walking never damages a panel.
export const RAIL_BREAK_SPEED = 12;

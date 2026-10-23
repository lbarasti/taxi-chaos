import { dist, type Vec } from '../physics/physics';
import type { ProceduralStopover } from './model';

/** Add an occasional voluntary request only if its physical stop is near this route.
 * Stable arithmetic, not a random draw: loading/replaying dispatch remains predictable. */
export function selectProceduralStopover(
  candidates: readonly ProceduralStopover[] | undefined,
  stops: Readonly<Record<string, { position: Vec }>>,
  pickup: Vec, dropoff: Vec, offer: number,
): ProceduralStopover | undefined {
  if (!candidates?.length || offer % 3 !== 1) return undefined;
  const direct = dist(pickup, dropoff);
  if (direct < 24) return undefined;
  const nearby = candidates.flatMap(spec => {
    const site = stops[spec.stop]?.position;
    if (!site) return [];
    const first = dist(pickup, site), last = dist(site, dropoff);
    const detour = first + last - direct;
    return first > 10 && last > 10 && detour <= Math.min(50, direct * 0.7) ? [{ spec, detour }] : [];
  });
  nearby.sort((a, b) => a.detour - b.detour || a.spec.id.localeCompare(b.spec.id));
  return nearby[Math.floor(offer / 3) % nearby.length]?.spec;
}

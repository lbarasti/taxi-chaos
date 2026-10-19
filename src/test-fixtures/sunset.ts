/** Historical Sunset Beach assertions use authored data through generic queries.
 * This fixture is not imported by the game. */
import { defaultCompiledMap as map } from '../map/compile';
import { contains } from '../regions';
export const BEACH_PICKUP = map.document.parking.find((p) => p.id === 'parking-73')!.position;
export const BEACH_HOTELS = map.document.objectPlacements
  .filter((p) => map.objects[p.id].kind === 'building')
  .map((p) => ({ ...p, ...map.objects[p.id], name: p.label }));
const outline = map.document.landRegions.find((r) => r.id === 'sunset-land')!.outline;
const shore = outline.slice(2).reverse();
export function beachShoreY(x: number): number {
  for (let i = 1; i < shore.length; i++) {
    const a = shore[i - 1],
      b = shore[i];
    if (x <= b.x) return a.y + (b.y - a.y) * Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
  }
  return shore.at(-1)!.y;
}
export const inBeach = (p: { x: number; y: number }) => contains(outline, p);
export const inSand = map.terrain.leavesTracks;
export const onPromenade = (p: { x: number; y: number }) =>
  contains(map.document.terrainRegions.find((r) => r.id === 'ocean-walk')!.outline, p);
export const PROMENADE_ENTRIES = map.document.accessNodes
  .filter((n) => n.id.startsWith('walk-north-'))
  .map((n) => n.position.x - 0.675);
export const sandHandling = (
  body: Parameters<typeof map.terrain.handling>[0],
  tyres: Parameters<typeof map.terrain.handling>[1],
  aptitude: number,
) => map.terrain.handling(body, tyres, { sand: aptitude });

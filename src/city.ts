import { vec, type Vec } from './physics';

export const CITY_GRID = 40, CITY_SIZE = 240;
export type CityRoad = Readonly<{ id: string; from: Vec; to: Vec }>;
export type CityCampus = Readonly<{ id: string; position: Vec; width: number; height: number; blocks: readonly string[] }>;
export type CityBuilding = Readonly<{
  id: string; position: Vec; width: number; height: number; color: string; label: string;
  /** Small shops retain their artwork; larger buildings keep fixtures at metre scale. */
  storeys: number; silhouette: readonly Vec[];
}>;
export type CityBlock = Readonly<{
  id: string; x: number; y: number; park: boolean; color: string;
  special?: 'fuel' | 'barracks' | 'depot' | 'parking';
  campusId?: string;
  alleys: 'cross' | 'horizontal' | 'vertical' | 'west' | 'none';
  buildings: readonly CityBuilding[];
}>;

/** Fixed, read-only city content. Compiled and recursively frozen with each map;
 * no random draws and no runtime-only geometry for rendering or collisions. */
export function createCity() {
  const colors = ['#334850', '#3c485b', '#4d4b59', '#3d5554', '#535045', '#394a5a'];
  const shops = ['NOODLE CLUB', 'VINYL & CO.', '24/7 DELI', 'LAUNDROMAT', 'COFFEE', 'BODEGA', 'FLOWERS', 'HOTEL', 'ARCADE', 'PIZZA', 'BOOK SHOP', 'NIGHT OWL'];
  const blocks: CityBlock[] = [];
  const hospital: CityCampus = { id: 'midtown-hospital', position: vec(140, 40), width: 28, height: 68, blocks: ['city-block-3-0', 'city-block-3-1'] };
  for (let bx = 0; bx < 6; bx++) for (let by = 0; by < 6; by++) {
    const x = bx * CITY_GRID, y = by * CITY_GRID, id = `city-block-${bx}-${by}`;
    const park = bx === 2 && by === 2 || bx === 4 && by === 4 || bx === 0 && by === 3;
    const special = bx === 4 && by === 1 ? 'fuel' : bx === 1 && by === 1 ? 'barracks' : bx === 2 && by === 0 ? 'depot' : bx === 1 && by === 3 || bx === 3 && by === 2 ? 'parking' : undefined;
    // Retain the garage's two shortcuts and the small frontages used by story scenes.
    const westShops = bx === 0 && by === 2 || bx === 2 && by === 1 || bx === 4 && by === 2;
    const campusId = hospital.blocks.includes(id) ? hospital.id : undefined;
    const landmark = !!campusId || bx === 2 && by === 3;
    const alleys: CityBlock['alleys'] = park || special === 'fuel' || special === 'parking' || landmark ? 'none'
      : special || bx === 0 && by === 0 ? 'cross' : westShops ? 'west' : (bx + by) % 2 ? 'vertical' : 'horizontal';
    const buildings: CityBuilding[] = [];
    const add = (slot: string, cx: number, cy: number, width: number, height: number, ix = 0, iy = 0, label?: string) => {
      const large = width > 10 || height > 10;
      buildings.push({ id: `city-building-${bx}-${by}-${slot}`, position: vec(x + cx, y + cy), width, height,
        color: colors[(bx * 2 + by + ix + iy) % colors.length],
        label: label ?? (bx === 0 && by === 0 && ix === 0 && iy === 1 ? 'PIT STOP' : shops[(bx * 5 + by * 3 + ix * 2 + iy) % shops.length]),
        storeys: landmark ? 8 : large ? 4 + (bx + by) % 3 : 2,
        silhouette: [vec(-width / 2 - 0.25, -height / 2 - 0.6), vec(width / 2, -height / 2 - 0.6), vec(width / 2, height / 2), vec(-width / 2 - 0.25, height / 2)],
      });
    };
    if (!park && special !== 'fuel' && special !== 'parking') {
      if (campusId) {
        // One collision body crosses both blocks and the former street. Keep the
        // hospital's identity and its south-side recovery entrance stable.
        if (by === 1) add('landmark', 20, 0, 26, 66, 0, 0, 'HOSPITAL');
      } else if (landmark) add('landmark', 20.5, 20.5, 23, 23, 0, 0, 'GARDEN COURT');
      else if (alleys === 'horizontal') for (let iy = 0; iy < 2; iy++) add(`row-${iy}`, 20.5, 14 + iy * 13, 23, 10, 0, iy);
      else if (alleys === 'vertical') for (let ix = 0; ix < 2; ix++) add(`column-${ix}`, 14 + ix * 13, 20.5, 10, 23, ix);
      else if (alleys === 'west') {
        for (let iy = 0; iy < 2; iy++) add(`shop-0-${iy}`, 14, 14 + iy * 13, 10, 10, 0, iy);
        add('column-1', 27, 20.5, 10, 23, 1);
      } else for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 2; iy++) {
        if (special && iy === 0) continue;
        add(`shop-${ix}-${iy}`, 14 + ix * 13, 14 + iy * 13, 10, 10, ix, iy);
      }
    }
    blocks.push({ id, x, y, park, special, campusId, color: colors[(bx + by * 3) % colors.length], alleys, buildings });
  }
  const roads: CityRoad[] = [], closedRoads: CityRoad[] = [], campuses = [hospital];
  const addRoad = (road: CityRoad) => (citySegmentOpen({ campuses }, road.from, road.to) ? roads : closedRoads).push(road);
  for (let x = 0; x <= CITY_SIZE; x += CITY_GRID) for (let y = 0; y <= CITY_SIZE; y += CITY_GRID) {
    if (x < CITY_SIZE) addRoad({ id: `city-road-${x}-${y}-east`, from: vec(x, y), to: vec(x + CITY_GRID, y) });
    if (y < CITY_SIZE) addRoad({ id: `city-road-${x}-${y}-south`, from: vec(x, y), to: vec(x, y + CITY_GRID) });
  }
  return { blocks, buildings: blocks.flatMap(b => b.buildings), campuses, roads, closedRoads };
}

export type City = ReturnType<typeof createCity>;

/** Shared by routing, road paint and validation. The campus includes the former
 * street, while its outer intersections remain available for through traffic. */
export function citySegmentOpen(city: { readonly campuses: readonly CityCampus[] }, a: Vec, b: Vec): boolean {
  return !city.campuses.some(site => {
    const minX = site.position.x - site.width / 2, maxX = site.position.x + site.width / 2;
    const minY = site.position.y - site.height / 2, maxY = site.position.y + site.height / 2;
    // Slab intersection also handles the occasional diagonal street-access leg.
    let enter = 0, leave = 1;
    for (const [origin, delta, lo, hi] of [[a.x, b.x - a.x, minX, maxX], [a.y, b.y - a.y, minY, maxY]]) {
      if (Math.abs(delta) < 1e-9) { if (origin <= lo || origin >= hi) return false; }
      else { const t0 = (lo - origin) / delta, t1 = (hi - origin) / delta; enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1)); }
    }
    return enter < leave;
  });
}

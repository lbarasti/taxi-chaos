import { vec, type Vec } from './physics';

export const CITY_GRID = 40, CITY_SIZE = 240;
export type CityBuilding = Readonly<{
  id: string; position: Vec; width: number; height: number; color: string; label: string;
  /** Small shops retain their artwork; larger buildings keep fixtures at metre scale. */
  storeys: number; silhouette: readonly Vec[];
}>;
export type CityBlock = Readonly<{
  id: string; x: number; y: number; park: boolean; color: string;
  special?: 'fuel' | 'barracks' | 'depot' | 'parking';
  alleys: 'cross' | 'horizontal' | 'vertical' | 'west' | 'none';
  buildings: readonly CityBuilding[];
}>;

/** Fixed, read-only city content. Compiled and recursively frozen with each map;
 * no random draws and no runtime-only geometry for rendering or collisions. */
export function createCity() {
  const colors = ['#334850', '#3c485b', '#4d4b59', '#3d5554', '#535045', '#394a5a'];
  const shops = ['NOODLE CLUB', 'VINYL & CO.', '24/7 DELI', 'LAUNDROMAT', 'COFFEE', 'BODEGA', 'FLOWERS', 'HOTEL', 'ARCADE', 'PIZZA', 'BOOK SHOP', 'NIGHT OWL'];
  const blocks: CityBlock[] = [];
  for (let bx = 0; bx < 6; bx++) for (let by = 0; by < 6; by++) {
    const x = bx * CITY_GRID, y = by * CITY_GRID, id = `city-block-${bx}-${by}`;
    const park = bx === 2 && by === 2 || bx === 4 && by === 4 || bx === 0 && by === 3;
    const special = bx === 4 && by === 1 ? 'fuel' : bx === 1 && by === 1 ? 'barracks' : bx === 2 && by === 0 ? 'depot' : bx === 1 && by === 3 || bx === 3 && by === 2 ? 'parking' : undefined;
    // Retain the garage's two shortcuts and the small frontages used by story scenes.
    const westShops = bx === 0 && by === 2 || bx === 2 && by === 1 || bx === 4 && by === 2;
    const landmark = bx === 3 && by === 0 || bx === 3 && by === 1 || bx === 2 && by === 3;
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
      if (landmark) add('landmark', 20.5, 20.5, 23, 23, 0, 0, by === 1 ? 'HOSPITAL' : by === 0 ? 'MIDTOWN EXCHANGE' : 'GARDEN COURT');
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
    blocks.push({ id, x, y, park, special, color: colors[(bx + by * 3) % colors.length], alleys, buildings });
  }
  return { blocks, buildings: blocks.flatMap(b => b.buildings) };
}

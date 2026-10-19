import { vec, type Vec } from './physics';
import { compileBuilding, buildingDefinitions, type CompiledBuilding } from './buildings';
import type { ObjectCatalogue } from './catalogue/schema';
import { cityContent, type CityContent, type CityCampus, type ResidentHomes } from './city-content';
export type { CityCampus } from './city-content';

export const CITY_GRID = 40, CITY_SIZE = 240;
export type CityRoad = Readonly<{ id: string; from: Vec; to: Vec }>;
export type CityBuilding = CompiledBuilding;
export type CityBlock = Readonly<{
  id: string; x: number; y: number; park: boolean; color: string;
  special?: 'fuel' | 'barracks' | 'depot' | 'parking';
  campusId?: string; residentHomes?: ResidentHomes;
  alleys: 'cross' | 'horizontal' | 'vertical' | 'west' | 'none';
  buildings: readonly CityBuilding[];
}>;

/** Fixed, read-only city content. Compiled and recursively frozen with each map;
 * no random draws and no runtime-only geometry for rendering or collisions. */
export function createCity(content: CityContent = cityContent, catalogue: ObjectCatalogue = buildingDefinitions) {
  const colors = ['#334850', '#3c485b', '#4d4b59', '#3d5554', '#535045', '#394a5a'];
  const shops = ['NOODLE CLUB', 'VINYL & CO.', '24/7 DELI', 'LAUNDROMAT', 'COFFEE', 'BODEGA', 'FLOWERS', 'HOTEL', 'ARCADE', 'PIZZA', 'BOOK SHOP', 'NIGHT OWL'];
  const blocks: CityBlock[] = [];
  const campuses = structuredClone(content.campuses);
  const authored = content.buildings.map(p => compileBuilding(p, catalogue));
  const replacementBlocks = new Set(content.buildings.filter(b => b.replaceBlock).map(b => b.blockId));
  const occupiedBlocks = new Map<string, CityCampus>();
  if (new Set(campuses.map(s => s.id)).size !== campuses.length) throw new Error('Duplicate city campus IDs');
  for (const site of campuses) {
    if ([site.width, site.height].some(n => !Number.isFinite(n) || n <= 0)) throw new Error(`Campus ${site.id}: invalid bounds`);
    for (const id of site.blocks) {
      if (occupiedBlocks.has(id)) throw new Error(`City block ${id} belongs to more than one campus`);
      if (site.residents[id]?.length !== 4) throw new Error(`Campus ${site.id}: declare four resident homes for ${id}`);
      occupiedBlocks.set(id, site);
    }
  }
  for (let bx = 0; bx < 6; bx++) for (let by = 0; by < 6; by++) {
    const x = bx * CITY_GRID, y = by * CITY_GRID, id = `city-block-${bx}-${by}`;
    const originalPark = bx === 2 && by === 2 || bx === 4 && by === 4 || bx === 0 && by === 3;
    const originalSpecial = bx === 4 && by === 1 ? 'fuel' : bx === 1 && by === 1 ? 'barracks' : bx === 2 && by === 0 ? 'depot' : bx === 1 && by === 3 || bx === 3 && by === 2 ? 'parking' : undefined;
    // Retain the garage's two shortcuts and the small frontages used by story scenes.
    const westShops = bx === 0 && by === 2 || bx === 2 && by === 1 || bx === 4 && by === 2;
    const campus = occupiedBlocks.get(id), campusId = campus?.id;
    const replacements = authored.filter(b => b.blockId === id);
    const replacedBlock = !!campusId || replacementBlocks.has(id);
    const park = originalPark && !replacedBlock, special = replacedBlock ? undefined : originalSpecial;
    const alleys: CityBlock['alleys'] = park || special === 'fuel' || special === 'parking' || replacedBlock ? 'none'
      : special || bx === 0 && by === 0 ? 'cross' : westShops ? 'west' : (bx + by) % 2 ? 'vertical' : 'horizontal';
    const buildings: CityBuilding[] = [];
    const add = (slot: string, cx: number, cy: number, width: number, height: number, ix = 0, iy = 0, label?: string) => {
      const large = width > 10 || height > 10;
      buildings.push(compileBuilding({ id: `city-building-${bx}-${by}-${slot}`, type: large ? 'commercial' : 'shop', owner: 'city', blockId: id,
        position: vec(x + cx, y + cy), width, height,
        color: colors[(bx * 2 + by + ix + iy) % colors.length],
        label: label ?? (bx === 0 && by === 0 && ix === 0 && iy === 1 ? 'PIT STOP' : shops[(bx * 5 + by * 3 + ix * 2 + iy) % shops.length]),
        storeys: large ? 4 + (bx + by) % 3 : 2,
        ...(bx === 0 && by === 0 && ix === 0 && iy === 1 ? { sign: { color: '#a3ddc2' } } : {}),
      }, catalogue));
    };
    if (!park && special !== 'fuel' && special !== 'parking') {
      if (replacedBlock) buildings.push(...replacements);
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
    if (!replacedBlock) for (const placement of replacements) {
      const index = buildings.findIndex(b => b.id === placement.id);
      if (index < 0) buildings.push(placement); else buildings[index] = placement;
    }
    blocks.push({ id, x, y, park, special, campusId, residentHomes: campus?.residents[id], color: colors[(bx + by * 3) % colors.length], alleys, buildings });
  }
  const roads: CityRoad[] = [], closedRoads: CityRoad[] = [];
  const addRoad = (road: CityRoad) => (citySegmentOpen({ campuses }, road.from, road.to) ? roads : closedRoads).push(road);
  for (let x = 0; x <= CITY_SIZE; x += CITY_GRID) for (let y = 0; y <= CITY_SIZE; y += CITY_GRID) {
    if (x < CITY_SIZE) addRoad({ id: `city-road-${x}-${y}-east`, from: vec(x, y), to: vec(x + CITY_GRID, y) });
    if (y < CITY_SIZE) addRoad({ id: `city-road-${x}-${y}-south`, from: vec(x, y), to: vec(x, y + CITY_GRID) });
  }
  const buildings = blocks.flatMap(b => b.buildings);
  for (const id of occupiedBlocks.keys()) if (!blocks.some(b => b.id === id)) throw new Error(`Unknown campus block ${id}`);
  if (buildings.length !== new Set(buildings.map(b => b.id)).size) throw new Error('Duplicate city building IDs');
  for (const building of authored) if (!buildings.includes(building)) throw new Error(`Building ${building.id}: unusable block ${building.blockId}`);
  const services = buildings.filter(b => b.recoveryEntrance);
  if (services.length > 1) throw new Error('Only one primary city recovery entrance is supported');
  const recovery = services[0]?.recoveryEntrance;
  return { blocks, buildings, campuses, roads, closedRoads, recovery };
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

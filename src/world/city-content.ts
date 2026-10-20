import { vec, type Vec } from '../physics/physics';
import type { BuildingPlacement } from './buildings';

export type ResidentHomes = readonly [Vec, Vec, Vec, Vec];
export type SiteProp = Readonly<{ kind: 'hydrant' | 'lamp' | 'bench' | 'bin'; position: Vec; width: number; height: number; color: string; angle?: number }>;
export type CityCampus = Readonly<{
  id: string; position: Vec; width: number; height: number; blocks: readonly string[];
  /** Four homes per replaced block, in its existing resident/RNG order. */
  residents: Readonly<Record<string, ResidentHomes>>;
  props: readonly SiteProp[];
}>;
export type CityContent = Readonly<{ buildings: readonly BuildingPlacement<string>[]; campuses: readonly CityCampus[] }>;

/** Add unique buildings here; ordinary shop/commercial blocks remain generated. */
const buildings: readonly BuildingPlacement[] = [
  { id: 'city-building-3-1-landmark', type: 'hospital', owner: 'city', blockId: 'city-block-3-1', position: vec(140, 40), label: 'HOSPITAL', color: '#3c485b',
    // The exterior recovery entrance is a local normalized feature, so it follows the
    // hospital's position and any future resize instead of pinning a world coordinate.
    features: [{ id: 'hospital-service', role: 'service', offset: vec(7 / 26, 34.6 / 66) }] },
  { id: 'city-building-2-3-landmark', type: 'landmark', owner: 'city', blockId: 'city-block-2-3', position: vec(100.5, 140.5), label: 'GARDEN COURT', color: '#3c485b', replaceBlock: true },
];

/** Sites declare the blocks they replace, safe residents and perimeter furniture.
 * Street closures are derived from these bounds, rather than authored twice. */
const campuses: readonly CityCampus[] = [{
  id: 'midtown-hospital', position: vec(140, 40), width: 28, height: 68,
  blocks: ['city-block-3-0', 'city-block-3-1'],
  residents: {
    'city-block-3-0': [vec(126, 14), vec(154, 14), vec(126, 26), vec(154, 26)],
    'city-block-3-1': [vec(126, 54), vec(154, 54), vec(126, 66), vec(154, 66)],
  },
  props: [
    { kind: 'hydrant', position: vec(126, 12), width: 0.65, height: 0.65, color: '#eb735f' },
    { kind: 'lamp', position: vec(154, 12), width: 0.6, height: 0.6, color: '#a7bfbb' },
    { kind: 'hydrant', position: vec(126, 68), width: 0.65, height: 0.65, color: '#eb735f' },
    { kind: 'lamp', position: vec(154, 68), width: 0.6, height: 0.6, color: '#a7bfbb' },
    { kind: 'bench', position: vec(126, 20), width: 2.4, height: 0.75, color: '#bf9870', angle: Math.PI / 2 },
    { kind: 'bench', position: vec(126, 60), width: 2.4, height: 0.75, color: '#bf9870', angle: Math.PI / 2 },
    { kind: 'bin', position: vec(154, 30), width: 0.85, height: 0.85, color: '#76a79b' },
    { kind: 'bin', position: vec(154, 50), width: 0.85, height: 0.85, color: '#76a79b' },
  ],
}];

export const cityContent: CityContent = { buildings, campuses };

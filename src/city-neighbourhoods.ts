import { vec } from './physics';
import { freezeGeometry } from './map/default';

/** Rows run north to south. Whole blocks share a palette; boundaries step between streets. */
const wealthMap = [
  'wwwmma',
  'wwmmaa',
  'wwmmaa',
  'wmmmaa',
  'mmmaaa',
  'mmmmaa',
] as const;
export type CityWealth = 'working' | 'established' | 'affluent';
export const neighbourhoods = freezeGeometry({
  working: { name: 'Foundry Ward', paving: '#55574f', inset: '#454944', grout: '#77766a', park: '#4b624c', path: '#a69a7a' },
  established: { name: 'Market Quarter', paving: '#73716a', inset: '#555c56', grout: '#929084', park: '#426b50', path: '#b8ae8d' },
  affluent: { name: 'East Gardens', paving: '#9a9785', inset: '#6f7869', grout: '#bab5a0', park: '#426c51', path: '#c9bea1' },
});
export function cityWealth(bx: number, by: number): CityWealth {
  const code = wealthMap[by]?.[bx];
  return code === 'w' ? 'working' : code === 'a' ? 'affluent' : 'established';
}

export type CityRoof = 'workshop' | 'tenement' | 'courtyard' | 'copper' | 'limestone' | 'pavilion';
export type CityLot = Readonly<{ roof: CityRoof; part: number }>;
type Part = Readonly<{ x: number; y: number; w: number; h: number }>;
const lParts: Part[] = [{ x: 0, y: -3, w: 10, h: 4 }, { x: -3, y: 2, w: 4, h: 6 }];
const tParts: Part[] = [{ x: 0, y: -3, w: 10, h: 4 }, { x: 0, y: 2, w: 4, h: 6 }];
const uParts: Part[] = [{ x: 0, y: 3, w: 10, h: 4 }, { x: -3.5, y: -2, w: 3, h: 6 }, { x: 3.5, y: -2, w: 3, h: 6 }];
const lOutline = [[-5,-5],[5,-5],[5,-1],[-1,-1],[-1,5],[-5,5]].map(([x,y]) => vec(x,y));
const tOutline = [[-5,-5],[5,-5],[5,-1],[2,-1],[2,5],[-2,5],[-2,-1],[-5,-1]].map(([x,y]) => vec(x,y));
const uOutline = [[-5,-5],[-2,-5],[-2,1],[2,1],[2,-5],[5,-5],[5,5],[-5,5]].map(([x,y]) => vec(x,y));
/** Rendering, collision bodies and headlight masks all derive from these metre-scale shapes. */
export const cityRoofs = freezeGeometry({
  workshop: { parts: lParts, outline: lOutline },
  tenement: { parts: tParts, outline: tOutline },
  courtyard: { parts: uParts, outline: uOutline },
  copper: { parts: lParts, outline: lOutline },
  limestone: { parts: uParts, outline: uOutline },
  pavilion: { parts: tParts, outline: tOutline },
});
const palettes: Record<CityWealth, readonly (CityRoof | undefined)[]> = {
  working: ['workshop', 'tenement', undefined, 'workshop'],
  established: ['courtyard', undefined, 'tenement', 'courtyard'],
  affluent: ['copper', 'limestone', 'pavilion', 'limestone'],
};
export function cityRoof(bx: number, by: number, ix: number, iy: number): CityRoof | undefined {
  return palettes[cityWealth(bx, by)][(bx * 3 + by + ix * 2 + iy) % 4];
}

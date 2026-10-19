import { createCountryside, type Countryside } from './countryside';
import { add, dist, normalize, scale, sub, vec, type Vec } from './physics';

import { HARBOUR } from './harbour';
import type { MapDocument } from './map/schema';
import { contains, regionBounds } from './regions';
import { defaultMap } from './map/default';

// These bounds also define the painted city apron. Water is the complement of
// the two land masses and the bridge decks, so no invisible outer wall remains.
export const CITY_SHORE = { min: -14, max: 254 };
export const BRIDGE_HALF_WIDTH = 7.5;
export type CoastRail = { position: Vec; width: number; angle: number };
export function createCoast(country: Countryside, document: MapDocument) {
const { BRIDGE_Y, HIGHLAND_OUTLINE, countryAccess } = country;

function onBridge(p: Vec) {
  return p.x >= 240 && p.x <= 310 && BRIDGE_Y.some(y => Math.abs(p.y - y) <= BRIDGE_HALF_WIDTH);
}
const cityOutline = [vec(-14, -14), vec(254, -14), vec(254, 254), vec(-14, 254)];
const rectangle = (left: number, top: number, right: number, bottom: number) => [vec(left,top),vec(right,top),vec(right,bottom),vec(left,bottom)];
// Legacy generators contribute coverage to the same union as authored islands.
const landRegions = [
  { id: 'generated-city', outline: cityOutline },
  { id: 'generated-highlands', outline: HIGHLAND_OUTLINE },
  { id: 'generated-harbour', outline: rectangle(HARBOUR.left,HARBOUR.top,HARBOUR.right,HARBOUR.bottom) },
  ...BRIDGE_Y.map((y,i) => ({ id: `generated-bridge-${i}`, outline: rectangle(240,y-BRIDGE_HALF_WIDTH,310,y+BRIDGE_HALF_WIDTH) })),
  ...structuredClone(document.landRegions),
];
const coverage=landRegions.map(r=>({ ...r,bounds:regionBounds(r.outline),rectangle:r.outline.length===4 && r.outline.every((p,i)=>p.x===r.outline[(i+1)%4].x || p.y===r.outline[(i+1)%4].y) }));
const inOcean = (p: Vec): boolean => !coverage.some(r => p.x>=r.bounds.min.x && p.x<=r.bounds.max.x && p.y>=r.bounds.min.y && p.y<=r.bounds.max.y && (r.rectangle || contains(r.outline,p)));
// Split coverage edges at all crossings, then keep only exposed land/water edges.
// This also suppresses foam along overlaps with the city apron or another island.
const landBoundaries: { landId: string; a: Vec; b: Vec; normal: Vec }[] = [];
for (const region of landRegions) for (let i=0;i<region.outline.length;i++) {
  const a=region.outline[i],b=region.outline[(i+1)%region.outline.length], delta=sub(b,a), size=dist(a,b);
  if(size<1e-8)continue;
  const cuts=[0,1];
  for (const land of landRegions) for(let j=0;j<land.outline.length;j++) {
    const p=land.outline[j],q=land.outline[(j+1)%land.outline.length],d=sub(q,p),den=delta.x*d.y-delta.y*d.x;
    if(Math.abs(den)<1e-8)continue;
    const r=sub(p,a),t=(r.x*d.y-r.y*d.x)/den,u=(r.x*delta.y-r.y*delta.x)/den;
    if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
  }
  cuts.sort((a,b)=>a-b);
  for(let j=1;j<cuts.length;j++) {
    if((cuts[j]-cuts[j-1])*size<.001)continue;
    const start=add(a,scale(delta,cuts[j-1])),end=add(a,scale(delta,cuts[j])),mid=scale(add(start,end),.5),n=vec(-delta.y/size,delta.x/size);
    const plus=inOcean(add(mid,scale(n,.02))),minus=inOcean(add(mid,scale(n,-.02)));
    if(plus===minus)continue;
    landBoundaries.push({landId:region.id,a:start,b:end,normal:scale(n,plus?1:-1)});
  }
}

const COAST_RAILS: CoastRail[] = [];
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
      // A seam between dry regions has no coastal rail.
      const outward = scale(normalize(inward), -2);
      if (!inOcean(add(position, outward))) continue;
      if (onBridge(position) || outline === HIGHLAND_OUTLINE && countryAccess(position).distance < 10) continue;
      COAST_RAILS.push({ position, width, angle: Math.atan2(delta.y, delta.x) });
    }
  }
}
// Bridge sides stay continuous, but each short panel can break independently.
for (const y of BRIDGE_Y) for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
  COAST_RAILS.push({ position: vec(246 + (i + 0.5) * 66 / 9, y + side * BRIDGE_HALF_WIDTH), width: 66 / 9, angle: 0 });
}
// Foam remains authored presentation; clearance needs every exposed boundary,
// including land supplied by the city, harbour, countryside and bridge generators.
const authoredLand = new Set(document.landRegions.map(r => r.id));
const shorelines = landBoundaries.filter(s => authoredLand.has(s.landId));
return { onBridge, inOcean, landRegions, landBoundaries, shorelines, COAST_RAILS };
}
export const { onBridge, inOcean, COAST_RAILS } = createCoast(createCountryside(defaultMap), defaultMap);

// Normal approach speed, rather than total speed, makes fast glancing hits slide
// along the rail. Bikes can breach it too; walking never damages a panel.
export const RAIL_BREAK_SPEED = 12;

import { add, dist, scale, sub } from '../physics';
import { closestOnSegment, contains } from '../regions';
import { boundaryHasSource, type LandGeometry } from '../land';
import type { Countryside } from '../countryside';
import type { MapDocument, ObjectPlacement } from './schema';

/** A single bounded shore-panel rule, independent of the land compiler. Slot IDs
 * follow ring edge indices, so openings never renumber their neighbours. */
export function compileBoundaryPlacements(document: MapDocument, land: LandGeometry, country: Countryside) {
  const placements: (ObjectPlacement & { ruleId?: string; edge?: number; slot?: number })[] = [];
  for (const rule of document.boundaryPlacements) {
    const ring=land.landRegions.find(r=>r.id===rule.land)!.outline;
    const excluded=land.landRegions.filter(r=>rule.excludeLand.includes(r.id));
    const roads=country.COUNTRY_ROADS.filter(r=>rule.excludeRoads.includes(r.id));
    for(const edge of rule.edges) {
      const a=ring[edge], b=ring[(edge+1)%ring.length], delta=sub(b,a), size=dist(a,b);
      const count=Math.ceil(size/rule.maxLength); if(!count) continue;
      for(let slot=0;slot<count;slot++) {
        if(slot%rule.period>=rule.panels) continue;
        const shore=add(a,scale(delta,(slot+.5)/count));
        const exposed=land.landBoundaries.find(s=>boundaryHasSource(s,rule.land,edge)&&dist(shore,closestOnSegment(shore,s.a,s.b))<.001);
        if(!exposed) continue;
        const position=add(shore,scale(exposed.normal,-rule.inset));
        if(excluded.some(r=>contains(r.outline,position))) continue;
        if(roads.some(r=>r.points.some((p,i)=>i>0&&dist(position,closestOnSegment(position,r.points[i-1],p))<rule.clearance))) continue;
        placements.push({ruleId:rule.id,edge,slot,id:`${rule.id}-edge-${edge}-slot-${slot}`,owner:rule.owner,type:rule.type,position,width:size/count,angle:Math.atan2(delta.y,delta.x),color:'#a7b9b1',label:''});
      }
    }
  }
  return placements;
}

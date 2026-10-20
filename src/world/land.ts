import { add, cross, dist, dot, scale, sub, vec, type Vec } from '../physics';
import { contains, regionBounds, ringDistance } from './regions';

export type ResolvedLand = { id: string; owner: string; outline: Vec[] };
export type LandBoundary = { sources: { landId: string; edge: number }[]; a: Vec; b: Vec; normal: Vec };
export const boundaryHasSource = (edge: LandBoundary, landId: string, index?: number) => edge.sources.some(s=>s.landId===landId && (index===undefined || s.edge===index));
/** DOM-free union geometry. No generation, presentation or object policy belongs here. */
export function compileLand(regions: readonly ResolvedLand[]) {
  const landRegions = structuredClone(regions);
  const coverage = landRegions.map(r => ({ ...r, bounds: regionBounds(r.outline), rectangle: r.outline.length === 4 && r.outline.every((p,i) => p.x === r.outline[(i+1)%4].x || p.y === r.outline[(i+1)%4].y) }));
  const bounds = regionBounds(landRegions.flatMap(r=>r.outline));
  const inRegion = (r: typeof coverage[number], p: Vec) => p.x >= r.bounds.min.x && p.x <= r.bounds.max.x && p.y >= r.bounds.min.y && p.y <= r.bounds.max.y && (r.rectangle || contains(r.outline,p));
  const byId = new Map(coverage.map(r=>[r.id,r]));
  const regionContains = (id: string, p: Vec) => { const region=byId.get(id); return !!region && inRegion(region,p); };
  const onLand = (p: Vec) => coverage.some(r=>inRegion(r,p));
  const inOcean = (p: Vec) => !onLand(p);
  const landBoundaries: LandBoundary[] = [];
  for (const region of landRegions) for (let i=0;i<region.outline.length;i++) {
    const a=region.outline[i], b=region.outline[(i+1)%region.outline.length], delta=sub(b,a), size=dist(a,b);
    if (size<1e-8) continue;
    const cuts=[0,1];
    for (const land of landRegions) for (let j=0;j<land.outline.length;j++) {
      const p=land.outline[j], q=land.outline[(j+1)%land.outline.length], d=sub(q,p), den=cross(delta,d), r=sub(p,a);
      if (Math.abs(den)<1e-8) {
        // Collinear overlaps must split too, including a partially covered edge.
        if (Math.abs(cross(r,delta))<1e-8) for (const v of [p,q]) {
          const t=dot(sub(v,a),delta)/(size*size); if(t>0&&t<1) cuts.push(t);
        }
        continue;
      }
      const t=cross(r,d)/den, u=cross(r,delta)/den;
      if(t>0&&t<1&&u>=0&&u<=1) cuts.push(t);
    }
    cuts.sort((a,b)=>a-b);
    for(let j=1;j<cuts.length;j++) {
      if((cuts[j]-cuts[j-1])*size<.001) continue;
      const start=add(a,scale(delta,cuts[j-1])), end=add(a,scale(delta,cuts[j])), mid=scale(add(start,end),.5), n=vec(-delta.y/size,delta.x/size);
      const probe=Math.min(1e-5,size*1e-5);
      const plus=inOcean(add(mid,scale(n,probe))), minus=inOcean(add(mid,scale(n,-probe)));
      if(plus===minus) continue;
      landBoundaries.push({sources:[{landId:region.id,edge:i}],a:start,b:end,normal:scale(n,plus?1:-1)});
    }
  }
  const unique = new Map<string,LandBoundary>();
  const pointKey=(p: Vec)=>`${Math.round(p.x*1e8)},${Math.round(p.y*1e8)}`;
  for(const edge of landBoundaries) {
    const key=[pointKey(edge.a),pointKey(edge.b)].sort().join(':');
    const previous=unique.get(key);
    if(previous)previous.sources.push(...edge.sources);
    else unique.set(key,edge);
  }
  return { bounds, landRegions, landBoundaries:[...unique.values()], onLand, inOcean, regionContains };
}
export type LandGeometry = ReturnType<typeof compileLand>;

/** Measure only observable water: a ray must leave the union at the source and
 * enter it at the target. Land in between occludes that observation. */
export function directedWaterGap(land: LandGeometry, fromId: string, toId: string, direction: Vec, resolution: number): number | null {
  const from=land.landRegions.find(r=>r.id===fromId)!, to=land.landRegions.find(r=>r.id===toId)!;
  if (ringDistance(from.outline,to.outline)===0) return 0;
  let gap=Infinity;
  const entries=land.landBoundaries.filter(s=>dot(s.normal,direction)<-1e-6);
  for(const shore of land.landBoundaries.filter(s=>boundaryHasSource(s,fromId)&&dot(s.normal,direction)>1e-6)) {
    const steps=Math.ceil(dist(shore.a,shore.b)/resolution);
    for(let i=0;i<=steps;i++) {
      const origin=add(shore.a,scale(sub(shore.b,shore.a),i/(steps||1)));
      if(!land.inOcean(add(origin,scale(direction,1e-5)))) continue;
      let first=Infinity, target=false;
      for(const edge of entries) {
        const delta=sub(edge.b,edge.a), den=cross(direction,delta);
        if(Math.abs(den)<1e-8)continue;
        const difference=sub(edge.a,origin), t=cross(difference,delta)/den, u=cross(difference,direction)/den;
        if(t<1e-6||u<0||u>1)continue;
        if(t<first-1e-6) {first=t;target=boundaryHasSource(edge,toId);}
        else if(Math.abs(t-first)<1e-6&&boundaryHasSource(edge,toId))target=true;
      }
      if(target)gap=Math.min(gap,first);
    }
  }
  return Number.isFinite(gap)?gap:null;
}

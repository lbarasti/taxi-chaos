import type { MapDocument, LandRegion } from './schema';
import type { ResolvedLand } from '../land';
export function resolveLandRegion(document: MapDocument, region: LandRegion): ResolvedLand {
  const lookup = new Map(document.points.map(p=>[p.id,p.position]));
  return { id:region.id, owner:region.owner, outline:structuredClone('outline' in region ? region.outline : region.pointRefs.map(id=>lookup.get(id)!)) };
}
export const resolveLandRegions = (document: MapDocument) => document.landRegions.map(r=>resolveLandRegion(document,r));
export const referencedLand = (document: MapDocument, id: string) => resolveLandRegion(document,document.landRegions.find(r=>r.id===id)!);

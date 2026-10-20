import { clamp, type Body, type TyreLayout, type Vec } from '../physics';
import type { MapDocument } from '../map/schema';
import { contains, regionBounds, regionOrder } from './regions';

/** Reusable materials. Access and dry land are deliberately separate queries. */
export const surfaces = {
  road: {
    color: '#344147',
    tracks: false,
    driveLoss: 0,
    driveAptitude: 0,
    gripLoss: 0,
    gripAptitude: 0,
    drag: 0,
    dragAptitude: 0,
    lateral: Infinity,
    lateralAptitude: 0,
  },
  grass: {
    color: '#456b48',
    tracks: false,
    driveLoss: 0.12,
    driveAptitude: 0,
    gripLoss: 0.22,
    gripAptitude: 0,
    drag: 32,
    dragAptitude: 0,
    lateral: 7,
    lateralAptitude: 0,
  },
  sand: {
    color: '#e2c68e',
    tracks: true,
    driveLoss: 0.55,
    driveAptitude: 0.43,
    gripLoss: 0.78,
    gripAptitude: 0.6,
    drag: 270,
    dragAptitude: 215,
    lateral: 1.5,
    lateralAptitude: 4,
  },
  paving: {
    color: '#d8d5c3',
    tracks: false,
    driveLoss: 0,
    driveAptitude: 0,
    gripLoss: 0,
    gripAptitude: 0,
    drag: 0,
    dragAptitude: 0,
    lateral: Infinity,
    lateralAptitude: 0,
  },
} as const;
export type Surface = keyof typeof surfaces;
export function createTerrain(document: MapDocument) {
  const regions = document.terrainRegions
    .map((r) => ({ ...structuredClone(r), bounds: regionBounds(r.outline) }))
    .sort(regionOrder);
  function sample(p: Vec): Surface {
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i],
        b = r.bounds;
      if (
        p.x >= b.min.x &&
        p.x <= b.max.x &&
        p.y >= b.min.y &&
        p.y <= b.max.y &&
        contains(r.outline, p)
      )
        return r.surface;
    }
    return 'road';
  }
  const leavesTracks = (p: Vec) => surfaces[sample(p)].tracks;
  /** Tyre-weighted blending retains the shipped sand physics and model aptitude. */
  function handling(
    body: Body,
    tyres: readonly TyreLayout[],
    aptitude: Readonly<Partial<Record<Surface, number>>>,
  ) {
    let coverage = 0,
      driveLoss = 0,
      gripLoss = 0,
      rollingDrag = 0,
      lateralCompliance = 0;
    const weight = 1 / Math.max(1, tyres.length);
    for (const tyre of tyres) {
      const surface = sample(body.toWorld(tyre)),
        material = surfaces[surface],
        ability = clamp(aptitude[surface] ?? 0, 0, 1);
      if (material.tracks) coverage += weight;
      driveLoss += weight * (material.driveLoss - ability * material.driveAptitude);
      gripLoss += weight * (material.gripLoss - ability * material.gripAptitude);
      rollingDrag += weight * (material.drag - ability * material.dragAptitude);
      lateralCompliance += weight / (material.lateral + ability * material.lateralAptitude);
    }
    return {
      coverage,
      drive: 1 - driveLoss,
      grip: 1 - gripLoss,
      rollingDrag,
      lateralAcceleration: lateralCompliance ? 1 / lateralCompliance : Infinity,
    };
  }
  return { regions, sample, leavesTracks, handling };
}

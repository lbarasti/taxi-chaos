import type { Game } from '../game';
import { artworkFor } from '../artwork/catalogue';
import { contains } from '../world/regions';
import { rotate, sub, type Vec } from '../physics';

export const visualLayers = { ground: 'Ground artwork', props: 'Buildings / props', shadows: 'Map prop shadows', actors: 'People / vehicles', effects: 'Ground / air FX', lighting: 'Lighting compositor', markers: 'World markers' } as const;
export const overlayLayers = { land: 'Land / coastline', terrain: 'Terrain materials', artwork: 'Artwork bounds', collision: 'Physical bodies', blockers: 'Light blockers' } as const;
export type VisualLayer = keyof typeof visualLayers;
export type OverlayLayer = keyof typeof overlayLayers;
export type InspectionPreset = 'normal' | 'land' | 'terrain' | 'collision' | 'lighting';
export type InspectionOptions = {
  visible: Record<VisualLayer, boolean>;
  overlays: Record<OverlayLayer, boolean>;
  propOpacity: number;
  overlayOpacity: number;
  freeCamera: boolean;
  paused: boolean;
};
export type InspectionPatch = Partial<Omit<InspectionOptions, 'visible' | 'overlays'>> & {
  visible?: Partial<InspectionOptions['visible']>;
  overlays?: Partial<InspectionOptions['overlays']>;
};
export const inspectionDefaults = (): InspectionOptions => ({
  visible: { ground: true, props: true, shadows: true, actors: true, effects: true, lighting: true, markers: true },
  overlays: { land: false, terrain: false, artwork: false, collision: false, blockers: false },
  propOpacity: 1, overlayOpacity: 0.75, freeCamera: false, paused: false,
});

/** Transient renderer state: never part of a map document, Game or persisted settings. */
export class InspectionState {
  active = false;
  options = inspectionDefaults();
  selected: string | null = null;
  point: Vec | null = null;
  reset() { this.options = inspectionDefaults(); this.selected = null; this.point = null; }
  shown(layer: VisualLayer) { return !this.active || this.options.visible[layer]; }
  get freeCamera() { return this.active && this.options.freeCamera; }
  get paused() { return this.active && this.options.paused; }
  configure(patch: InspectionPatch) {
    // Validate the whole patch before changing anything (also protects JS automation callers).
    const next = structuredClone(this.options);
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'visible' || key === 'overlays') {
        if (!value || typeof value !== 'object') throw new Error(`Invalid ${key}`);
        const target = next[key] as Record<string, boolean>;
        for (const [layer, enabled] of Object.entries(value)) {
          if (!Object.hasOwn(target, layer) || typeof enabled !== 'boolean') throw new Error(`Invalid layer ${layer}`);
          target[layer] = enabled;
        }
      } else if (key === 'propOpacity' || key === 'overlayOpacity') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${key} must be 0–1`);
        next[key] = value;
      } else if (key === 'freeCamera' || key === 'paused') {
        if (typeof value !== 'boolean') throw new Error(`Invalid ${key}`);
        next[key] = value;
      } else throw new Error(`Unknown inspection option ${key}`);
    }
    this.options = next;
  }
  preset(name: InspectionPreset) {
    if (!['normal', 'land', 'terrain', 'collision', 'lighting'].includes(name)) throw new Error(`Unknown inspection preset ${name}`);
    const { freeCamera, paused } = this.options;
    this.options = inspectionDefaults();
    this.options.freeCamera = freeCamera; this.options.paused = paused;
    if (name === 'normal') return;
    this.configure({ visible: { effects: false, markers: false, lighting: name === 'lighting' }, propOpacity: name === 'lighting' ? 0.35 : 0.15 });
    if (name === 'land' || name === 'terrain') this.configure({ overlays: { [name]: true }, visible: { shadows: false } });
    if (name === 'collision') this.configure({ overlays: { collision: true, artwork: true }, visible: { shadows: false } });
    if (name === 'lighting') this.configure({ overlays: { blockers: true, artwork: true } });
  }
  solo(layer: VisualLayer | OverlayLayer) {
    if (!Object.hasOwn(visualLayers, layer) && !Object.hasOwn(overlayLayers, layer)) throw new Error(`Unknown layer ${layer}`);
    this.options.visible = Object.fromEntries(Object.keys(visualLayers).map(key => [key, key === layer])) as InspectionOptions['visible'];
    this.options.overlays = Object.fromEntries(Object.keys(overlayLayers).map(key => [key, key === layer])) as InspectionOptions['overlays'];
    this.options.propOpacity = 1;
  }
}

export type InspectionHit = { key: string; id: string; kind: string; owner: string; detail: string; outline: Vec[] };
export const propKey = (id: number) => `prop:${id}`;
export function inspectPoint(game: Game, point: Vec) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Expected finite world coordinates');
  const map = game.map;
  const terrain = [...map.terrain.regions].reverse().filter(region => contains(region.outline, point));
  const hits: InspectionHit[] = [];
  for (const prop of game.world.props) {
    const local = rotate(sub(point, prop.body.position), -prop.body.angle), art = artworkFor(prop);
    const bodyHit = Math.abs(local.x) <= prop.body.w / 2 && Math.abs(local.y) <= prop.body.h / 2;
    const artPoint = art ? rotate(local, -(art.rotation ?? 0)) : local;
    const artHit = art && artPoint.x >= art.bounds.x && artPoint.x <= art.bounds.x + art.bounds.width && artPoint.y >= art.bounds.y && artPoint.y <= art.bounds.y + art.bounds.height;
    if (!bodyHit && !artHit) continue;
    const placement = map.placements.find(p => p.id === prop.sourceId);
    hits.push({ key: propKey(prop.id), id: prop.sourceId ?? `runtime-prop-${prop.id}`, kind: prop.kind,
      owner: placement?.owner ?? prop.building?.owner ?? 'generated',
      detail: `${placement?.type ?? prop.building?.type ?? prop.kind} · ${prop.body.w.toFixed(2)} × ${prop.body.h.toFixed(2)} m · ${prop.alive ? 'intact' : 'destroyed'}${art ? ` · art: ${art.image}` : ' · procedural artwork'}${prop.sourceId ? '' : ' · runtime ID (generated scenery)'}`,
      outline: prop.body.corners(),
    });
  }
  for (const region of terrain) hits.push({ key: `terrain:${region.id}`, id: region.id, kind: 'terrain', owner: region.owner,
    detail: `${region.surface} · priority ${region.priority} · ${region === terrain[0] ? 'WINNER' : 'covered at this point'}`, outline: region.outline.map(p => ({ ...p })) });
  for (const region of map.land.landRegions) if (map.land.regionContains(region.id, point)) hits.push({ key: `land:${region.id}`, id: region.id, kind: 'land', owner: region.owner, detail: 'Contributes to dry-land union', outline: region.outline.map(p => ({ ...p })) });
  const pool = game.world.pools.some(body => contains(body.corners(), point));
  return { point: { ...point }, dryLand: map.land.onLand(point), pool, surface: map.terrain.sample(point), terrainSource: terrain[0]?.id ?? null, hits };
}
export type InspectionReport = ReturnType<typeof inspectPoint>;

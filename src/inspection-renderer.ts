import type { Renderer } from './renderer';
import { artworkFor, artRadius } from './artwork/catalogue';
import { clipLand } from './terrain-renderer';
import type { Vec } from './physics';

export const inspectionColours = { land: '#65e0ba', terrain: '#e8cb88', artwork: '#ffe16b', collision: '#ff887d', blockers: '#ca9aff' };
const materialColours = { road: '#597caa', sand: '#ebce80', paving: '#c69ddd', grass: '#78bd68' };
function path(c: CanvasRenderingContext2D, points: readonly Vec[], closed = true) {
  if (!points.length) return;
  c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); if (closed) c.closePath();
}

/** Paint above lighting, from exactly the map/body/occluder geometry used at runtime. */
export function drawInspection(r: Renderer) {
  const state = r.inspection;
  if (!state.active) return;
  const c = r.ctx, g = r.game, { overlays, overlayOpacity } = state.options;
  c.save(); c.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  c.translate(r.width * 0.53, r.height * 0.54); c.scale(r.zoom, r.zoom); c.translate(-r.camera.x, -r.camera.y);
  c.lineWidth = 1.6 / r.zoom; c.lineJoin = 'round'; c.globalAlpha = overlayOpacity;
  if (overlays.terrain) {
    // Highest-priority material wins, exactly as in sampling. Exclude already
    // painted regions so translucent overlaps never invent a blended material.
    c.save(); clipLand(c, g.map);
    const bounds = g.map.land.bounds;
    for (const region of [...g.map.terrain.regions].reverse()) {
      path(c, region.outline); c.fillStyle = materialColours[region.surface]; c.fill();
      path(c, region.outline);
      c.rect(bounds.min.x - 1, bounds.min.y - 1, bounds.max.x - bounds.min.x + 2, bounds.max.y - bounds.min.y + 2); c.clip('evenodd');
    }
    c.fillStyle = materialColours.road; c.fillRect(bounds.min.x, bounds.min.y, bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
    c.restore();
    c.strokeStyle = inspectionColours.terrain;
    for (const region of g.map.terrain.regions) { path(c, region.outline); c.stroke(); }
  }
  if (overlays.land) {
    c.strokeStyle = inspectionColours.land; c.setLineDash([5 / r.zoom, 4 / r.zoom]);
    for (const region of g.map.land.landRegions) { path(c, region.outline); c.stroke(); }
    c.setLineDash([]); c.lineWidth = 3 / r.zoom;
    for (const edge of g.map.land.landBoundaries) { path(c, [edge.a, edge.b], false); c.stroke(); }
    c.lineWidth = 1.6 / r.zoom;
  }
  if (overlays.artwork) for (const prop of g.world.props) {
    if (!prop.alive || !r.visible(prop.body.position, artRadius(prop))) continue;
    const art = artworkFor(prop); if (!art) continue;
    c.save(); c.translate(prop.body.position.x, prop.body.position.y); c.rotate(prop.body.angle);
    c.strokeStyle = inspectionColours.artwork;
    c.save(); c.rotate(art.rotation ?? 0);
    c.strokeRect(art.bounds.x, art.bounds.y, art.bounds.width, art.bounds.height);
    c.restore();
    path(c, art.silhouette); c.setLineDash([4 / r.zoom, 3 / r.zoom]); c.stroke(); c.restore();
  }
  if (overlays.collision) {
    c.strokeStyle = inspectionColours.collision;
    for (const item of [...g.world.props, ...g.vehicles]) if (item.alive && r.visible(item.body.position, Math.max(item.body.w, item.body.h))) { path(c, item.body.corners()); c.stroke(); }
    c.strokeStyle = '#7ad9f4'; c.setLineDash([4 / r.zoom, 3 / r.zoom]);
    for (const pool of g.world.pools) { path(c, pool.corners()); c.stroke(); }
    c.setLineDash([]);
  }
  if (overlays.blockers) {
    c.strokeStyle = inspectionColours.blockers;
    for (const occluder of r.worldOccluders()) { path(c, occluder.points); c.stroke(); }
  }
  if (state.point) {
    const key = state.selected;
    const outline = key?.startsWith('prop:') ? g.world.props.find(prop => `prop:${prop.id}` === key)?.body.corners()
      : key?.startsWith('terrain:') ? g.map.terrain.regions.find(region => `terrain:${region.id}` === key)?.outline
      : key?.startsWith('land:') ? g.map.land.landRegions.find(region => `land:${region.id}` === key)?.outline : undefined;
    c.globalAlpha = 1; c.strokeStyle = '#ffffff'; c.lineWidth = 3 / r.zoom;
    if (outline) { path(c, outline); c.stroke(); }
    c.beginPath(); c.arc(state.point.x, state.point.y, 5 / r.zoom, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
}

import { add, dist, rotate, scale, sub, vec, type Vec } from '../physics';
import { World } from '../world';
import { HARBOUR } from '../harbour';
import { describe, descriptorBody, entities, entityPosition } from './operations';
import type { CompiledMap } from './compile';
import type { Validation } from './validation';

export type Layers = { land: boolean; roads: boolean; objects: boolean; scenery: boolean; colliders: boolean; navigation: boolean; findings: boolean; points: boolean };
export class EditorRenderer {
  camera = vec(245, 190); zoom = 1; width = 1; height = 1;
  layers: Layers = { land: true, roads: true, objects: true, scenery: true, colliders: false, navigation: false, findings: true, points: false };
  constructor(public readonly canvas: HTMLCanvasElement) {}
  screen(p: Vec) { return add(scale(sub(p, this.camera), this.zoom), vec(this.width / 2, this.height / 2)); }
  world(p: Vec) { return add(this.camera, scale(sub(p, vec(this.width / 2, this.height / 2)), 1 / this.zoom)); }
  fit(bounds: { min: Vec; max: Vec }) { this.camera = scale(add(bounds.min, bounds.max), 0.5); this.zoom = Math.max(0.15, Math.min((this.width - 56) / Math.max(40, bounds.max.x - bounds.min.x), (this.height - 56) / Math.max(40, bounds.max.y - bounds.min.y))); }
  resize() { const r = this.canvas.getBoundingClientRect(); this.width = Math.max(1, r.width); this.height = Math.max(1, r.height); const dpr = Math.min(devicePixelRatio || 1, 2); this.canvas.width = this.width * dpr; this.canvas.height = this.height * dpr; }
  hit(map: CompiledMap, point: Vec, selection: string, world: World): string | undefined {
    const d = map.document;
    if (this.layers.points) {
      const nearest = d.points.filter(p => dist(p.position, point) * this.zoom < 11).sort((a, b) => dist(a.position, point) - dist(b.position, point))[0];
      if (nearest) return nearest.id;
    }
    // Authored placements stay selectable when collision overlays are hidden.
    const inside = (body: ReturnType<typeof descriptorBody>) => { const p = rotate(sub(point, body.position), -body.angle); return Math.abs(p.x) <= body.w / 2 + 4 / this.zoom && Math.abs(p.y) <= body.h / 2 + 4 / this.zoom; };
    const placement = [...d.parking, ...d.trafficSpawns].reverse().find(e => inside(descriptorBody(e)));
    if (placement) return placement.id;
    const prop = [...world.props].reverse().find(p => p.sourceId && inside(p.body));
    if (prop) return prop.sourceId;
    const nearby = entities(d).filter(e => !('weight' in e) && !('points' in e)).map(e => ({ id: e.id, position: entityPosition(d, e.id)! })).filter(e => dist(e.position, point) * this.zoom < 10).sort((a, b) => dist(a.position, point) - dist(b.position, point))[0];
    if (nearby) return nearby.id;
    const selectionBounds = describe(d, selection).bounds;
    if (d.districts.some(e => e.id === selection) && selectionBounds && point.x >= selectionBounds.min.x && point.x <= selectionBounds.max.x && point.y >= selectionBounds.min.y && point.y <= selectionBounds.max.y) return selection;
    if (map.beach.inBeach(point)) return 'beach';
    if (point.x >= HARBOUR.left && point.x <= HARBOUR.right && point.y >= HARBOUR.top && point.y <= HARBOUR.bottom) return 'harbour';
    if (point.x >= -14 && point.x <= 254 && point.y >= -14 && point.y <= 246) return 'city';
    if (map.country.inHighlands(point)) return point.y >= map.country.SOUTH_WOODS_Y ? 'southern-estates' : 'highlands';
    const access = map.country.countryAccess(point); if (access.distance * this.zoom < 9) return access.road.id;
  }
  draw(map: CompiledMap, world: World, validation: Validation, selection: string, measure?: [Vec, Vec], drag?: Vec) {
    const c = this.canvas.getContext('2d')!, dpr = Math.min(devicePixelRatio || 1, 2), { country, beach } = map;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#193b47'; c.fillRect(0, 0, this.width, this.height);
    c.save(); c.translate(this.width / 2, this.height / 2); c.scale(this.zoom, this.zoom); c.translate(-this.camera.x, -this.camera.y);
    const line = (points: Vec[], color: string, width = 1, fill = false) => { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.strokeStyle = color; c.lineWidth = width / this.zoom; if (fill) { c.closePath(); c.fillStyle = color; c.fill(); } else c.stroke(); };
    const text = (s: string, p: Vec, color = '#d7e8df', size = 11) => { c.font = `500 ${size / this.zoom}px "Space Grotesk", sans-serif`; c.fillStyle = color; c.textAlign = 'center'; c.fillText(s, p.x, p.y); };
    const env = map.document.envelope;
    c.strokeStyle = '#789aa566'; c.lineWidth = 1 / this.zoom; c.setLineDash([5 / this.zoom, 5 / this.zoom]); c.strokeRect(env.min.x, env.min.y, env.max.x - env.min.x, env.max.y - env.min.y); c.setLineDash([]);
    // Metre grid remains readable under arbitrary pan/zoom.
    const step = this.zoom > 3 ? 10 : 40;
    c.strokeStyle = '#7592a01c'; c.lineWidth = 1 / this.zoom; c.beginPath();
    for (let x = Math.ceil(env.min.x / step) * step; x < env.max.x; x += step) { c.moveTo(x, env.min.y); c.lineTo(x, env.max.y); }
    for (let y = Math.ceil(env.min.y / step) * step; y < env.max.y; y += step) { c.moveTo(env.min.x, y); c.lineTo(env.max.x, y); } c.stroke();
    if (this.layers.land) {
      c.fillStyle = '#627872'; c.fillRect(-14, -14, 268, 268); c.fillStyle = '#6b8581'; c.fillRect(HARBOUR.left, HARBOUR.top, HARBOUR.right - HARBOUR.left, HARBOUR.bottom - HARBOUR.top);
      line(country.HIGHLAND_OUTLINE, '#506f50', 0, true); line(beach.BEACH_OUTLINE, '#d9bd88', 0, true);
      for (const ridge of country.RIDGES) line(ridge, '#83907a', 0, true);
      c.fillStyle = '#93ac69'; const golf = country.GOLF_COURSE; c.fillRect(golf.center.x - golf.width / 2, golf.center.y - golf.height / 2, golf.width, golf.height);
      const prom = beach.PROMENADE; c.fillStyle = '#d8d5c3'; c.fillRect(prom.left, prom.top, prom.right - prom.left, prom.bottom - prom.top);
    }
    if (this.layers.roads) {
      for (let x = 0; x <= 240; x += 40) { line([vec(x, -14), vec(x, 246)], '#2c4245', 12 * this.zoom); line([vec(-14, x), vec(254, x)], '#2c4245', 12 * this.zoom); }
      for (const road of country.COUNTRY_ROADS) line(road.points, road.bridge ? '#a3b5ad' : '#bdd1b0', 3);
      for (const drive of country.VILLA_DRIVES) line(drive, '#cbb89b', 2);
    }
    for (const prop of world.props) {
      const authored = !!prop.sourceId, fixed = !authored && (prop.body.position.x < 254 && prop.body.position.y < 246);
      if (!(authored ? this.layers.objects : fixed ? this.layers.objects : this.layers.scenery) && !this.layers.colliders) continue;
      c.save(); c.translate(prop.body.position.x, prop.body.position.y); c.rotate(prop.body.angle);
      if (authored || fixed || this.layers.scenery) { c.fillStyle = prop.color; c.globalAlpha = authored ? 1 : 0.7; c.fillRect(-prop.body.w / 2, -prop.body.h / 2, prop.body.w, prop.body.h); c.globalAlpha = 1; }
      if (this.layers.colliders) { c.strokeStyle = '#ee958a'; c.lineWidth = 0.8 / this.zoom; c.strokeRect(-prop.body.w / 2, -prop.body.h / 2, prop.body.w, prop.body.h); } c.restore();
    }
    for (const pool of world.pools) { c.fillStyle = '#76c9d0'; c.fillRect(pool.position.x - pool.w / 2, pool.position.y - pool.h / 2, pool.w, pool.h); }
    if (this.layers.objects) for (const e of [...map.document.parking, ...map.document.trafficSpawns]) {
      const body = descriptorBody(e), parking = 'occupied' in e;
      c.save(); c.translate(e.position.x, e.position.y); c.rotate(e.angle);
      c.strokeStyle = parking ? '#bed8bd' : '#89d9e7'; c.lineWidth = 1 / this.zoom;
      if (parking) { c.strokeRect(-2.7, -1.3, 5.4, 2.6); if (this.zoom > 3) text('P', vec(), '#bed8bd', 10); }
      if (!parking || e.occupied) { c.fillStyle = e.color; c.fillRect(-body.w / 2, -body.h / 2, body.w, body.h); }
      if (!parking) { c.beginPath(); c.moveTo(body.w / 2 + 3 / this.zoom, 0); c.lineTo(body.w / 2 - 2 / this.zoom, -3 / this.zoom); c.lineTo(body.w / 2 - 2 / this.zoom, 3 / this.zoom); c.closePath(); c.fillStyle = '#89d9e7'; c.fill(); }
      c.restore();
      if ('path' in e && (this.layers.navigation || selection === e.id)) line([e.position, ...e.path], '#89d9e7', 1.5);
    }
    if (this.layers.navigation) {
      line([...country.GOLF_CART_ROUTE, country.GOLF_CART_ROUTE[0]], '#f4ce69', 2);
      for (const stop of country.HIGHLAND_STOPS) { const path = world.navigation.roadPath(country.ROAD_NODES[0], stop.position); line(path, '#80d8e799', 1); }
    }
    if (this.layers.points) for (const point of map.document.points) { c.fillStyle = point.editable ? '#94e1ee' : '#a6afb5'; c.beginPath(); c.arc(point.position.x, point.position.y, 3.5 / this.zoom, 0, Math.PI * 2); c.fill(); }
    text('CITY · READ ONLY', vec(110, 116), '#dce7da'); text('NORTHSTAR HARBOUR · READ ONLY', vec(164, -85));
    text('SOUTHERN ESTATES', add(country.GOLF_COURSE.center, vec(0, 40))); text('EASTERN HIGHLANDS', vec(419, 284));
    if (this.zoom > 1.4) for (const stop of country.HIGHLAND_STOPS) text(stop.name, add(stop.position, vec(0, 10 / this.zoom)), '#e5ead5', 10);
    if (this.layers.findings) for (const f of validation.findings) if (f.position) {
      c.fillStyle = f.severity === 'error' ? '#f28e7e' : f.severity === 'warning' ? '#f7ce55' : '#8edbe8'; c.beginPath(); c.arc(f.position.x, f.position.y, 5 / this.zoom, 0, Math.PI * 2); c.fill();
    }
    const selected = describe(map.document, selection);
    if (selected.bounds) { const b = selected.bounds, delta = drag ?? vec(); c.strokeStyle = '#f7ce55'; c.lineWidth = 2 / this.zoom; c.setLineDash([6 / this.zoom, 4 / this.zoom]); c.strokeRect(b.min.x + delta.x - 5 / this.zoom, b.min.y + delta.y - 5 / this.zoom, b.max.x - b.min.x + 10 / this.zoom, b.max.y - b.min.y + 10 / this.zoom); c.setLineDash([]); }
    if (selected.position) { const p = add(selected.position, drag ?? vec()); c.strokeStyle = '#f7ce55'; c.lineWidth = 2 / this.zoom; c.beginPath(); c.arc(p.x, p.y, 9 / this.zoom, 0, Math.PI * 2); c.stroke(); }
    if (measure) { line(measure, '#8edbe8', 2); text(`${dist(...measure).toFixed(2)} m`, add(scale(add(...measure), 0.5), vec(0, -10 / this.zoom)), '#bceff4'); }
    c.restore();
    c.fillStyle = '#c7dedf'; c.font = '11px "Space Grotesk", sans-serif'; c.textAlign = 'left'; c.fillText(`N ↑   ${Math.round(100 / this.zoom)} m`, 18, this.height - 16); c.strokeStyle = '#c7dedf'; c.lineWidth = 2; c.beginPath(); c.moveTo(18, this.height - 33); c.lineTo(118, this.height - 33); c.stroke();
  }
}

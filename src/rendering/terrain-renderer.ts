import type { Renderer } from './renderer';
import type { CompiledMap } from '../map/compile';
import { artworkImages } from '../artwork/images';
import { regionBounds } from '../world/regions';
import { surfaces } from '../world/terrain';
import { add, dist, scale, vec, type Vec } from '../physics';

function trace(c: CanvasRenderingContext2D, points: readonly Vec[]) {
  c.beginPath();
  points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
}
function label(r: Renderer, text: string, p: Vec, size: number, color: string) {
  const c = r.ctx;
  c.save();
  c.scale(0.05, 0.05);
  r.label(text, p.x * 20, p.y * 20, size * 20, color, '700');
  c.restore();
}
/** Normalize winding so overlapping land polygons form a union in Canvas too. */
export function clipLand(c: CanvasRenderingContext2D, map: CompiledMap) {
  c.beginPath();
  for (const land of map.land.landRegions) {
    const ring = land.outline;
    const area = ring.reduce((sum, a, i) => {
      const b = ring[(i + 1) % ring.length];
      return sum + a.x * b.y - a.y * b.x;
    }, 0);
    const points = area < 0 ? [...ring].reverse() : ring;
    points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
  }
  c.clip();
}
/** Coverage always draws from canonical rings, with optional authored appearance. */
export function drawLandGround(c: CanvasRenderingContext2D, map: CompiledMap, textured = false) {
  for (const land of map.land.landRegions) {
    trace(c,land.outline); c.closePath(); c.fillStyle='#71876d'; c.fill();
  }
  for (const p of map.presentation.ground) {
    c.save(); trace(c,p.region.outline); c.closePath(); c.clip();
    const b=regionBounds(p.region.outline), width=b.max.x-b.min.x, height=b.max.y-b.min.y;
    c.fillStyle=p.color; c.fillRect(b.min.x,b.min.y,width,height);
    if(textured && p.texture==='asphalt') artworkImages.ground(c,{x:b.min.x,y:b.min.y,width,height});
    c.restore();
  }
}
export function drawTerrainMiniMap(c: CanvasRenderingContext2D, map: CompiledMap) {
  c.save();
  clipLand(c, map);
  for (const region of map.terrain.regions) {
    trace(c, region.outline);
    c.closePath();
    c.fillStyle = region.texture === 'gravel' ? '#a9aa82' : surfaces[region.surface].color;
    c.fill();
  }
  c.restore();
}
export function drawTerrainGround(r: Renderer) {
  const c = r.ctx,
    map = r.game.map;
  c.save();
  clipLand(c, map);
  // Painter order is exactly the sampler's low-to-high priority order.
  for (const region of map.terrain.regions) {
    const b = region.bounds,
      w = b.max.x - b.min.x,
      h = b.max.y - b.min.y;
    c.save();
    trace(c, region.outline);
    c.closePath();
    c.clip();
    c.fillStyle = region.texture === 'gravel' ? '#a9aa82' : surfaces[region.surface].color;
    c.fillRect(b.min.x, b.min.y, w, h);
    if (region.surface === 'grass') {
      // Bound work by the viewport, even for a large imported grass polygon.
      const x = Math.max(b.min.x, r.camera.x - r.width / r.zoom / 2 - 4);
      const y = Math.max(b.min.y, r.camera.y - r.height / r.zoom / 2 - 4);
      const right = Math.min(b.max.x, r.camera.x + r.width / r.zoom / 2 + 4);
      const bottom = Math.min(b.max.y, r.camera.y + r.height / r.zoom / 2 + 4);
      if (right > x && bottom > y) artworkImages.grass(c, { x, y, width: right - x, height: bottom - y });
    } else if (region.texture === 'gravel') {
      c.fillStyle = '#a9aa82'; c.fillRect(b.min.x, b.min.y, w, h);
      // Stable stone flecks retain the original path colour and footprint.
      for (let i = 0; i < 300; i++) {
        const x = b.min.x + ((i * 37 % 307) / 307) * w;
        const y = b.min.y + ((i * 71 % 311) / 311) * h;
        c.fillStyle = i % 2 ? '#737c6744' : '#e2dbb755';
        c.fillRect(x, y, 0.04 + (i % 3) * 0.02, 0.05);
      }
    } else if (region.surface === 'sand') {
      const sand = c.createLinearGradient(0, b.min.y, 0, b.max.y);
      sand.addColorStop(0, '#eddaa8');
      sand.addColorStop(0.58, '#e1c28a');
      sand.addColorStop(1, '#bfa579');
      c.fillStyle = sand;
      c.fillRect(b.min.x, b.min.y, w, h);
      for (let i = 0; i < 420; i++) {
        const p = vec(
          b.min.x + (((i * 37) % 997) / 997) * w,
          b.min.y + (((i * 17) % 991) / 991) * h,
        );
        if (r.visible(p, 1))
          r.rect(p.x, p.y, 0.13 + (i % 3) * 0.08, 0.07, i % 3 ? '#9f855631' : '#fff1c744');
      }
    } else if (region.surface === 'paving') {
      c.strokeStyle = '#9caaa757';
      c.lineWidth = 0.035;
      c.beginPath();
      for (let x = b.min.x; x < b.max.x; x += 2) {
        c.moveTo(x, b.min.y);
        c.lineTo(x, b.max.y);
      }
      for (let y = b.min.y; y < b.max.y; y += 2) {
        c.moveTo(b.min.x, y);
        c.lineTo(b.max.x, y);
      }
      c.stroke();
    }
    c.restore();
  }
  c.restore();
  // Surf is derived from the union's exposed edges, never district names or an
  // assumed downward coast. The same geometry determines dry land and drowning.
  for (const edge of map.presentation.shorelines)
    for (const offset of [0.25, 1.25]) {
      const points: Vec[] = [],
        steps = Math.max(1, Math.ceil(dist(edge.a, edge.b) / 0.8));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps,
          p = vec(edge.a.x + (edge.b.x - edge.a.x) * t, edge.a.y + (edge.b.y - edge.a.y) * t);
        points.push(
          add(
            p,
            scale(edge.normal, offset + Math.sin((p.x + p.y) * 0.5 + r.game.time * 0.7) * 0.13),
          ),
        );
      }
      trace(c, points);
      c.strokeStyle = offset < 1 ? '#fff0ca9c' : '#b0d9d569';
      c.lineWidth = offset < 1 ? 0.24 : 0.12;
      c.stroke();
    }
  for (const mark of map.document.groundMarks) {
    trace(c, mark.points);
    if (mark.fill) {
      c.closePath();
      c.fillStyle = mark.color;
      c.fill();
    } else {
      c.lineWidth = mark.width;
      c.strokeStyle = mark.color;
      c.stroke();
    }
  }
  for (const text of map.document.groundLabels)
    if (r.visible(text.position, 30)) label(r, text.text, text.position, text.size, text.color);
  // Catalogue frontage travels with every placement, including inland resorts.
  for (const placement of map.document.objectPlacements) {
    const o = map.objects[placement.id],
      apron = o.presentation?.apron;
    if (!apron) continue;
    c.save();
    c.translate(o.position.x, o.position.y);
    c.rotate(o.angle);
    r.rect(-o.width / 2, -o.height / 2 - 1.3, o.width, 1.3, '#b4b4a4');
    label(r, apron, vec(0, -o.height / 2 - 0.7), 0.48, '#6d7772');
    c.restore();
  }
}

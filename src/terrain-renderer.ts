import type { Renderer } from './renderer';
import type { CompiledMap } from './map/compile';
import { surfaces } from './terrain';
import { add, dist, scale, vec, type Vec } from './physics';

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
function clipLand(c: CanvasRenderingContext2D, map: CompiledMap) {
  c.beginPath();
  for (const land of map.coast.landRegions) {
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
function authoredLand(c: CanvasRenderingContext2D, map: CompiledMap) {
  for (const land of map.document.landRegions) {
    trace(c, land.outline);
    c.closePath();
    c.fillStyle = '#71876d';
    c.fill();
  }
}
export function drawTerrainMiniMap(c: CanvasRenderingContext2D, map: CompiledMap) {
  authoredLand(c, map);
  c.save();
  clipLand(c, map);
  for (const region of map.terrain.regions) {
    trace(c, region.outline);
    c.closePath();
    c.fillStyle = surfaces[region.surface].color;
    c.fill();
  }
  c.restore();
}
export function drawTerrainGround(r: Renderer) {
  const c = r.ctx,
    map = r.game.map;
  authoredLand(c, map);
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
    c.fillStyle = surfaces[region.surface].color;
    c.fillRect(b.min.x, b.min.y, w, h);
    if (region.surface === 'sand') {
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
  for (const edge of map.coast.shorelines)
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

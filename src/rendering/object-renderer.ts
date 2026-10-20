import { FOUNTAIN_RADIUS, FOUNTAIN_WATER_RADIUS } from '../world/fountain';
import type { PropRenderContext, Renderer } from './renderer';
import type { Prop } from '../world/world';
import { vec, type Vec } from '../physics';
import { objectDefinitions, type PropArtwork } from '../artwork/catalogue';

function path(r: Renderer, points: readonly Vec[], color: string, width = 0.12, closed = false) {
  const c = r.ctx; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  if (closed) { c.closePath(); c.fillStyle = color; c.fill(); }
  else { c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
}

/** Missing foliage images retain the resolved outline, anchor and rotation instead
 * of approximating catalogue geometry from the trunk's physical footprint. The same
 * path owns the canopy and its catalogue shadow at every artwork scale and resize. */
export function drawCanopyFallback(r: Renderer, prop: Prop, art: PropArtwork) {
  const c = r.ctx, b = art.bounds, size = Math.min(b.width, b.height);
  const crown = vec(b.x + art.anchor.x * b.width, b.y + art.anchor.y * b.height);
  c.save(); c.rotate(art.rotation ?? 0);
  path(r, art.silhouette, prop.color, 0, true);
  c.clip();
  r.circle(vec(crown.x - size * 0.06, crown.y - size * 0.08), size * 0.3, '#a3b48022');
  for (let i = 0; i < art.silhouette.length; i += 4) {
    const tip = art.silhouette[i];
    path(r, [crown, vec(crown.x + (tip.x - crown.x) * 0.9, crown.y + (tip.y - crown.y) * 0.9)], '#acc18269', size * 0.01);
  }
  r.circle(crown, size * 0.045, prop.kind === 'palm' ? '#bdac74' : '#63816a');
  c.restore();
}

// Rasterize world labels at a normal font size before scaling down. Subpixel
// font sizes otherwise lose strokes/glyphs under the camera transform.
function label(r: Renderer, text: string, x: number, y: number, size: number, color: string, weight = '500') {
  r.ctx.save(); r.ctx.scale(0.05, 0.05); r.label(text, x * 20, y * 20, size * 20, color, weight); r.ctx.restore();
}

function drawResort(r: Renderer, prop: Prop, render: PropRenderContext) {
  const c = r.ctx, b = prop.body, floors = prop.storeys ?? prop.building?.storeys ?? 14;
  const w = b.w, h = b.h, left = -w / 2, top = -h / 2;
  c.save(); c.translate(b.position.x, b.position.y); c.rotate(b.angle);
  // Oversized concrete podiums consume almost the entire eastern sand frontage.
  // Stacked balcony bands and rising penthouse tiers give the blocks urban mass.
  render.shadow(() => r.rect(left + 1.1, top + 1.2, w + 1.2, h + 0.3, '#17333566'));
  r.rect(left, top, w, h, '#929688', '#e5dcc6');
  r.rect(left + 0.3, top + 0.3, w - 0.6, h - 0.6, '#c4c3af');
  const tiers = floors === 9 ? 2 : floors === 14 ? 3 : 4;
  const facade = 2.2 + tiers * 0.45, roofBottom = h / 2 - facade;
  r.rect(left + 0.6, top + 0.3, w - 1.2, roofBottom - top, prop.color, '#f0e6ce');
  for (let i = 0; i < floors; i++) {
    const y = roofBottom + i * facade / floors;
    r.rect(left + 0.7, y, w - 1.4, facade / floors * 0.7, i % 3 ? '#597b7f' : '#769295');
    for (let x = left + 1.7; x < w / 2 - 0.8; x += 2.2) r.rect(x, y, 0.1, facade / floors, '#cdd8cd');
    r.rect(left + 0.6, y + facade / floors * 0.74, w - 1.2, 0.07, '#ecdec0');
  }
  // Setback penthouse, mechanical plant, private pool and leased sun deck.
  for (let i = 0; i < tiers; i++) {
    r.rect(left + 1.4 + i * 0.55, top + 0.65 + i * 0.32, w * 0.47 - i * 1.1, 2.7 - i * 0.35, i % 2 ? '#bacac0' : '#ded9c4', '#f6e9cc');
    r.rect(left + 1.8 + i * 0.55, top + 2.9 - i * 0.08, w * 0.43 - i * 1.1, 0.18, '#496e76');
  }
  for (const x of [-3.6, -1.8, 0]) { r.rect(x, top + 0.6, 1.2, 1.1, '#87958c', '#e4dac4'); r.circle(vec(x + 0.6, top + 1.15), 0.31, '#5f7875'); }
  r.rect(w / 2 - 9, top + 0.7, 7.7, 3.2, '#e6dfc6');
  r.rect(w / 2 - 8.6, top + 1.1, 6.9, 2.4, '#75b4bd');
  r.rect(w / 2 - 8.2, top + 1.4, 0.18, 1.8, '#d1ece3');
  for (let x = w / 2 - 8.8; x < w / 2 - 1.6; x += 2.2) {
    r.rect(x, top + 4.3, 0.8, 1.5, '#f4e8cd'); r.rect(x, top + 4.55, 0.8, 0.18, '#c3a182');
  }
  r.rect(-9, roofBottom - 1.25, 18, 1.05, '#eee4c9');
  label(r, prop.label, 0, roofBottom - 0.7, 0.85, '#38565b', '700');
  label(r, `${floors} STOREYS`, 0, roofBottom - 1.5, 0.55, '#38565b', '700');
  r.rect(-4.2, h / 2 - 0.85, 8.4, 0.85, '#526e70');
  label(r, (prop.presentation ?? prop.building?.presentation)?.frontage ?? 'GUESTS ONLY', 0, h / 2 - 0.4, 0.65, '#f3e5c7', '700');
  c.restore();
}

export function drawObjectFallback(r: Renderer, prop: Prop, render: PropRenderContext): boolean {
  if (prop.kind === 'fountain') {
    const c = r.ctx, b = prop.body;
    c.save(); c.translate(b.position.x, b.position.y); c.rotate(b.angle);
    c.scale(b.w / (FOUNTAIN_RADIUS * 2), b.h / (FOUNTAIN_RADIUS * 2));
    r.circle(vec(), FOUNTAIN_RADIUS, prop.color);
    r.circle(vec(), FOUNTAIN_WATER_RADIUS, '#6ea6b2');
    r.circle(vec(), 1.5, '#9ac9cd');
    c.restore(); return true;
  }
  if (prop.alive && prop.kind === 'building' && (prop.presentation ?? prop.building?.presentation)?.fallback === 'resort') { drawResort(r, prop, render); return true; }
  if (!['lifeguard-tower', 'parasol', 'beach-chair', 'sandcastle', 'palm', 'bollard', 'promenade-edge', 'pedestrian-gate'].includes(prop.kind)) return false;
  const c = r.ctx, b = prop.body;
  c.save(); c.translate(b.position.x, b.position.y); c.rotate(b.angle);
  const template = objectDefinitions[prop.kind];
  const resolvedCanopy = prop.alive && prop.kind === 'palm' ? render.artwork : undefined;
  if (template && !resolvedCanopy && !['pedestrian-gate', 'promenade-edge'].includes(prop.kind)) c.scale(b.w / template.width, b.h / template.height);
  if (!prop.alive) {
    if (prop.kind === 'sandcastle') {
      c.beginPath(); c.ellipse(0, 0, 1.3, 0.8, 0, 0, Math.PI * 2); c.fillStyle = '#c3a37566'; c.fill();
      r.rect(0.9, 0.35, 0.3, 0.3, '#d78b78');
    } else {
      // Torn canvas, splintered ramps and a tilted hut roof remain after impact.
      if (prop.kind === 'lifeguard-tower') {
        c.save(); c.rotate(0.48); r.rect(-1.9, -0.8, 3.8, 2.2, prop.color, '#719494');
        r.rect(-1.3, -0.7, 2.6, 0.35, '#607f88'); c.restore();
      }
      for (let i = 0; i < 9; i++) {
        c.save(); c.translate((i * 7 % 11 - 5) * 0.28, (i * 5 % 9 - 4) * 0.24); c.rotate(i * 1.7);
        r.rect(-0.5, -0.1, prop.kind === 'parasol' ? 0.9 : 0.7, 0.18, i % 3 ? prop.color : '#ae8a61'); c.restore();
      }
    }
    c.restore(); return true;
  }
  if (prop.kind === 'pedestrian-gate') {
    // Crossing paint marks the entrance footprint of the visible bollard group.
    r.rect(-b.w / 2, -0.3, b.w, 0.6, '#f0e4c660');
    for (let x = -b.w / 2 + 0.3; x < b.w / 2; x += 0.675) r.rect(x, -0.25, 0.12, 0.5, '#c1a47b50');
  } else if (prop.kind === 'lifeguard-tower') {
    render.shadow(() => r.rect(-1.65, -1.3, 4.3, 4.2, '#607b6b38'));
    for (const x of [-1.8, 1.5]) for (const y of [-1.7, 0.5]) r.rect(x, y, 0.3, 0.6, '#a78a65');
    r.rect(-2.3, -2.1, 4.6, 3.3, '#a89778');
    for (let y = -1.8; y < 1.1; y += 0.45) r.rect(-2.1, y, 4.2, 0.07, '#dbc7a0');
    r.rect(-1.85, -2.2, 3.7, 2.5, prop.color, '#e6e5c6');
    r.rect(-1.65, -0.3, 3.3, 0.55, '#4f7985');
    r.rect(-0.55, 0.3, 1.1, 1.8, '#c1b18f');
    for (let y = 0.5; y < 2.1; y += 0.35) r.rect(-0.55, y, 1.1, 0.08, '#ede0bd');
    r.rect(-2, 0.8, 1.2, 0.12, '#f4e7c6'); r.rect(0.8, 0.8, 1.2, 0.12, '#f4e7c6');
    label(r, prop.label.slice(-2), 0, -1.1, 0.8, '#476775', '700');
    r.rect(1.35, 0.45, 0.65, 0.2, '#db7767'); // rescue float
    r.rect(-2.1, -2, 0.1, 1.1, '#7d9189');
    path(r, [vec(-2, -2), vec(-1.2, -1.7), vec(-2, -1.4)], '#e79079', 0, true);
  } else if (prop.kind === 'parasol') {
    render.shadow(() => r.circle(vec(0.6, 0.65), 1.65, '#8a7e5840'));
    for (let i = 0; i < 8; i++) {
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 1.7, i * Math.PI / 4, (i + 1) * Math.PI / 4); c.closePath();
      c.fillStyle = i % 2 ? '#fff0cc' : prop.color; c.fill();
      path(r, [vec(), vec(Math.cos(i * Math.PI / 4) * 1.7, Math.sin(i * Math.PI / 4) * 1.7)], '#856f5344', 0.06);
    }
    r.circle(vec(), 0.14, '#fff4d4');
  } else if (prop.kind === 'beach-chair') {
    render.shadow(() => r.rect(-0.49, -1.17, 1.08, 2.4, '#aa906333'));
    r.rect(-0.5, -1.2, 1, 2.4, '#eee3c5'); r.rect(-0.4, -1.08, 0.8, 2.14, prop.color);
    for (let y = -1; y < 1; y += 0.38) r.rect(-0.4, y, 0.8, 0.12, '#fff0c997');
    r.rect(-0.5, -0.5, 1, 0.1, '#aa8866');
  } else if (prop.kind === 'sandcastle') {
    r.rect(-0.65, -0.45, 1.3, 1, '#b28e5d'); r.rect(-0.6, -0.65, 1.2, 0.9, prop.color);
    for (const x of [-0.65, 0.65]) for (const y of [-0.45, 0.45]) { r.circle(vec(x + 0.1, y + 0.15), 0.31, '#b49160'); r.circle(vec(x, y), 0.27, '#ead19e'); }
    r.rect(-0.18, 0.24, 0.36, 0.3, '#99764e');
    r.rect(0, -0.75, 0.07, 0.75, '#7e6c50'); path(r, [vec(0.07, -0.75), vec(0.65, -0.55), vec(0.07, -0.35)], '#e1957f', 0, true);
    r.rect(1.05, 0.3, 0.35, 0.3, '#d58a70');
  } else if (prop.kind === 'palm') {
    if (resolvedCanopy) {
      r.circle(vec(), Math.min(b.w, b.h) * 0.525, '#9b805b');
      drawCanopyFallback(r, prop, resolvedCanopy);
      c.restore(); return true;
    }
    const frond = [vec(0, 0), vec(0.5, -0.5), vec(2.45, -0.35), vec(3, 0.15), vec(1.4, 0.25)];
    const drawFronds = (shadow = false) => {
      for (let i = 0; i < 7; i++) {
        c.save(); c.rotate(i * Math.PI * 2 / 7 + prop.id * 0.3);
        path(r, frond, shadow ? '#172c2d80' : i % 2 ? prop.color : '#76965e', 0, true);
        if (!shadow) path(r, [vec(), vec(2.8, 0)], '#acc18269', 0.07);
        c.restore();
      }
    };
    render.shadow(() => {
      c.translate(render.shadowOffset.x * objectDefinitions.palm.width / b.w, render.shadowOffset.y * objectDefinitions.palm.height / b.h);
      c.globalAlpha *= render.shadowAlpha; drawFronds(true);
    });
    r.circle(vec(), 0.42, '#9b805b');
    drawFronds();
    r.circle(vec(), 0.27, '#bdac74');
  } else if (prop.kind === 'bollard') {
    render.shadow(() => r.circle(vec(0.12, 0.16), 0.32, '#687e6d44')); r.circle(vec(), 0.3, prop.color); r.circle(vec(-0.05, -0.05), 0.2, '#e7dcc0');
  } else {
    r.rect(-b.w / 2, -0.3, b.w, 0.6, prop.color, '#b3b9a7');
    for (let x = -b.w / 2 + 1.2; x < b.w / 2 - 0.7; x += 2.4) { r.circle(vec(x, 0), 0.38, '#779072'); r.circle(vec(x - 0.1, -0.1), 0.22, '#a2b788'); }
  }
  c.restore(); return true;
}

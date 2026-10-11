import type { Renderer } from './renderer';
import type { Prop } from './world';
import { vec, type Vec } from './physics';
import { BEACH, BEACH_HOTELS, BEACH_OUTLINE, BEACH_SETS, BEACH_SHORE, PROMENADE, PROMENADE_ENTRIES } from './beach';

function path(r: Renderer, points: readonly Vec[], color: string, width = 0.12, closed = false) {
  const c = r.ctx; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  if (closed) { c.closePath(); c.fillStyle = color; c.fill(); }
  else { c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
}

export function drawBeachGround(r: Renderer) {
  const c = r.ctx;
  c.save(); path(r, BEACH_OUTLINE, '#e2c68e', 0, true); c.clip();
  const sand = c.createLinearGradient(0, BEACH.top, 0, 274);
  sand.addColorStop(0, '#eddaa8'); sand.addColorStop(0.58, '#e1c28a'); sand.addColorStop(1, '#bfa579');
  c.fillStyle = sand; c.fillRect(BEACH.left, BEACH.top, BEACH.right - BEACH.left, 30);
  // Stipple, wind ripples and darker wet sand, authored without gameplay RNG.
  for (let i = 0; i < 420; i++) {
    const p = vec(BEACH.left + (i * 37 % 296), BEACH.top + (i * 17 % 283) / 10);
    if (!r.visible(p, 1)) continue;
    r.rect(p.x, p.y, 0.13 + i % 3 * 0.08, 0.07, i % 3 ? '#9f855631' : '#fff1c744');
  }
  for (const offset of [-0.6, -1.6, -2.3]) path(r, BEACH_SHORE.map(p => vec(p.x, p.y + offset)), '#9f927346', Math.abs(offset) === 1.6 ? 1.6 : 0.2);
  for (let x = -32; x < 142; x += 12) path(r, [vec(x, 250), vec(x + 4, 249.8), vec(x + 7, 250.1)], '#c5ab782b');
  for (const [i, p] of BEACH_SETS.entries()) {
    r.rect(p.x - 1, p.y + 3, 1.8, 2.2, i % 2 ? '#cf877859' : '#88b8be69');
    for (let dy = 0; dy < 2; dy += 0.45) r.rect(p.x - 1, p.y + 3 + dy, 1.8, 0.12, '#fff0cb80');
  }
  // A beach volleyball court anchors the more informal western sand.
  c.strokeStyle = '#fff0c8'; c.lineWidth = 0.13; c.strokeRect(-36, 250, 15, 9);
  path(r, [vec(-28.5, 250), vec(-28.5, 259)], '#b28c61', 0.12);
  for (let y = 250; y <= 259; y += 0.5) r.rect(-28.7, y, 0.4, 0.06, '#fff0d0');
  r.label('BEACH VOLLEY', -28.5, 248.8, 0.6, '#866b47', '700');
  r.label('S U N S E T   B E A C H', 68, 248.2, 1.05, '#947c52', '700');
  r.label('SOFT SAND / PICKUP RECOMMENDED', 76, 251, 0.56, '#a08b63');
  c.restore();
  // Foam follows the real coast, rather than implying a hidden drivable sea shelf.
  for (const offset of [0.25, 1.25]) {
    const surf: Vec[] = [];
    for (let i = 1; i < BEACH_SHORE.length; i++) {
      const a = BEACH_SHORE[i - 1], b = BEACH_SHORE[i];
      for (let t = 0; t < 1; t += 0.08) {
        const x = a.x + (b.x - a.x) * t;
        surf.push(vec(x, a.y + (b.y - a.y) * t + offset + Math.sin(x * 0.5 + r.game.time * 0.7) * 0.13));
      }
    }
    path(r, surf, offset < 1 ? '#fff0ca9c' : '#b0d9d569', offset < 1 ? 0.24 : 0.12);
  }
  // Ocean Walk becomes a wider, tiled, protected pedestrian destination eastward.
  r.rect(PROMENADE.left, PROMENADE.top, PROMENADE.right - PROMENADE.left, PROMENADE.bottom - PROMENADE.top, '#d8d5c3');
  for (let x = PROMENADE.left; x < PROMENADE.right; x += 2) {
    r.rect(x, PROMENADE.top, 0.035, 9, '#9caaa777');
    for (const y of [249, 251, 253, 255]) r.rect(x, y, 2, 0.035, '#9caaa757');
  }
  r.rect(PROMENADE.left, 250.8, 106, 1.2, '#eee7d14a');
  r.label('O C E A N   W A L K', 184, 251.5, 1, '#647d7a', '700');
  r.label('PEDESTRIANS ONLY', 232, 251.5, 0.67, '#647d7a', '700');
  for (const x of PROMENADE_ENTRIES) {
    path(r, [vec(x, 244.7), vec(x, 246.3)], '#f4ebcf', 0.2);
    r.circle(vec(x, 245.1), 0.15, '#718984');
  }
  for (const hotel of BEACH_HOTELS) {
    r.rect(hotel.position.x - 14, 232.2, 28, 1.4, '#d6c5a7');
    r.label('HOTEL / BEACH ACCESS ↓', hotel.position.x, 235.3, 0.58, '#d0d3bc', '600');
  }
  if (r.visible(vec(28, 249.5), 12)) r.label('BEACH PATROL / OFF-ROAD PARKING', 28, 246.8, 0.6, '#84744e', '700');
}

function drawHotel(r: Renderer, prop: Prop) {
  const c = r.ctx, b = prop.body;
  c.save(); c.translate(b.position.x, b.position.y);
  r.rect(-12.7, -5.1, 27.5, 12.6, '#183a3c59');
  r.rect(-13.5, -6, 27, 12, '#917f6b');
  r.rect(-13.75, -6.6, 27, 11, prop.color, '#efe6ce');
  // Front balconies/windows, rooftop sun deck and a small inaccessible roof pool.
  for (let x = -12; x < 13; x += 3.1) {
    r.rect(x, 4.5, 2.1, 1.15, '#5f888d'); r.rect(x - 0.2, 5.5, 2.5, 0.18, '#f3e2c1');
    r.rect(x + 0.9, 4.5, 0.12, 1.1, '#c6dfd5');
  }
  r.rect(-11.9, -4.8, 23.2, 7.6, '#e9dfc44d', '#f0dfbd');
  r.rect(4.1, -3.5, 6.1, 3.5, '#d9ddc5'); r.rect(4.6, -3, 5.1, 2.5, '#79b6bd');
  r.rect(4.9, -2.8, 0.2, 2.1, '#cde9df');
  for (const x of [-10, -7, -4]) { r.rect(x, -3.6, 1.2, 2.3, '#f4e7ca'); r.rect(x, -3.1, 1.2, 0.2, '#c4a58b'); }
  r.rect(-3, 4.4, 6, 1.2, '#527b78');
  r.label(prop.label, -0.2, 1.5, 0.9, '#576c6c', '700');
  r.label('HOTEL', 0, -4.4, 0.6, '#637675', '700');
  c.restore();
}

export function drawBeachProp(r: Renderer, prop: Prop): boolean {
  if (prop.kind === 'building' && BEACH_HOTELS.some(h => h.name === prop.label)) { drawHotel(r, prop); return true; }
  if (!['lifeguard-tower', 'parasol', 'beach-chair', 'sandcastle', 'palm', 'bollard', 'promenade-edge', 'pedestrian-gate'].includes(prop.kind)) return false;
  const c = r.ctx, b = prop.body;
  c.save(); c.translate(b.position.x, b.position.y); c.rotate(b.angle);
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
    r.rect(-1.65, -1.3, 4.3, 4.2, '#607b6b38');
    for (const x of [-1.8, 1.5]) for (const y of [-1.7, 0.5]) r.rect(x, y, 0.3, 0.6, '#a78a65');
    r.rect(-2.3, -2.1, 4.6, 3.3, '#a89778');
    for (let y = -1.8; y < 1.1; y += 0.45) r.rect(-2.1, y, 4.2, 0.07, '#dbc7a0');
    r.rect(-1.85, -2.2, 3.7, 2.5, prop.color, '#e6e5c6');
    r.rect(-1.65, -0.3, 3.3, 0.55, '#4f7985');
    r.rect(-0.55, 0.3, 1.1, 1.8, '#c1b18f');
    for (let y = 0.5; y < 2.1; y += 0.35) r.rect(-0.55, y, 1.1, 0.08, '#ede0bd');
    r.rect(-2, 0.8, 1.2, 0.12, '#f4e7c6'); r.rect(0.8, 0.8, 1.2, 0.12, '#f4e7c6');
    r.label(prop.label.slice(-2), 0, -1.1, 0.8, '#476775', '700');
    r.rect(1.35, 0.45, 0.65, 0.2, '#db7767'); // rescue float
    r.rect(-2.1, -2, 0.1, 1.1, '#7d9189');
    path(r, [vec(-2, -2), vec(-1.2, -1.7), vec(-2, -1.4)], '#e79079', 0, true);
  } else if (prop.kind === 'parasol') {
    r.circle(vec(0.6, 0.65), 1.65, '#8a7e5840');
    for (let i = 0; i < 8; i++) {
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 1.7, i * Math.PI / 4, (i + 1) * Math.PI / 4); c.closePath();
      c.fillStyle = i % 2 ? '#fff0cc' : prop.color; c.fill();
      path(r, [vec(), vec(Math.cos(i * Math.PI / 4) * 1.7, Math.sin(i * Math.PI / 4) * 1.7)], '#856f5344', 0.06);
    }
    r.circle(vec(), 0.14, '#fff4d4');
  } else if (prop.kind === 'beach-chair') {
    r.rect(-0.49, -1.17, 1.08, 2.4, '#aa906333');
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
    const light = r.game.dayNight.lighting;
    path(r, [vec(), vec(-light.sunDirection.x * 2.5, -light.sunDirection.y * 2.5)], '#63745938', 0.65);
    r.circle(vec(), 0.42, '#9b805b');
    for (let i = 0; i < 7; i++) {
      c.save(); c.rotate(i * Math.PI * 2 / 7 + prop.id * 0.3);
      path(r, [vec(0, 0), vec(0.5, -0.5), vec(2.7, -0.35), vec(3.3, 0.45), vec(1.4, 0.25)], i % 2 ? prop.color : '#76965e', 0, true);
      path(r, [vec(), vec(2.8, 0)], '#acc18269', 0.07); c.restore();
    }
    r.circle(vec(), 0.27, '#bdac74');
  } else if (prop.kind === 'bollard') {
    r.circle(vec(0.12, 0.16), 0.32, '#687e6d44'); r.circle(vec(), 0.3, prop.color); r.circle(vec(-0.05, -0.05), 0.2, '#e7dcc0');
  } else {
    r.rect(-b.w / 2, -0.3, b.w, 0.6, prop.color, '#b3b9a7');
    for (let x = -b.w / 2 + 1.2; x < b.w / 2 - 0.7; x += 2.4) { r.circle(vec(x, 0), 0.38, '#779072'); r.circle(vec(x - 0.1, -0.1), 0.22, '#a2b788'); }
  }
  c.restore(); return true;
}

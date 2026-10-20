import type { PropRenderContext, Renderer } from './renderer';
import type { Prop } from '../world/world';
import { dist, vec } from '../physics/physics';
import { CONTAINER_COLORS, FREIGHT_ROUTE, PORT_CONTAINERS, PORT_CRANES, PORT_ENTRY, PORT_FEE, PORT_SHIPS, SWAP_CONTAINER, craneLoad } from '../world/harbour';

function line(r: Renderer, points: { x: number; y: number }[], color: string, width: number) {
  const c = r.ctx; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
type BoxOptions = Readonly<{ name?: string; tiers?: number; shadow?: PropRenderContext['shadow'] }>;
function box(r: Renderer, x: number, y: number, w: number, h: number, color: string, options: BoxOptions = {}) {
  const { name = '', tiers = 1, shadow = draw => r.mapShadow(draw) } = options;
  shadow(() => r.rect(x - w / 2 + 1.1, y - h / 2 + 1.3, w + 0.4, h + 0.4, '#152e3255'));
  r.rect(x - w / 2, y - h / 2, w, h, '#314a4d');
  const lift = tiers * 0.35;
  r.rect(x - w / 2 - 0.15, y - h / 2 - lift, w, h, color, '#d6e1bb70');
  for (let rib = x - w / 2 + 0.5; rib < x + w / 2; rib += 0.8) r.rect(rib, y - h / 2 + 0.2 - lift, 0.1, h - 0.4, '#233d3f55');
  for (const side of [-1, 1]) {
    r.rect(x + side * (w / 2 - 0.35) - 0.1, y - h / 2 + 0.15 - lift, 0.2, h - 0.3, '#d8d3b9');
    r.rect(x + side * (w / 2 - 0.45), y + h / 2 - 0.3 - lift, 0.3, 0.3, '#efdc9c');
  }
  if (name) r.label(name, x, y - lift, 0.6, '#fff0cc', '700');
}

export function drawHarbourGround(r: Renderer) {
  const c = r.ctx;

  // Concrete joints, patched asphalt and freight lanes break up the apron.
  for (let x = 76; x < 252; x += 12) for (let y = -132; y < -17; y += 12) {
    r.rect(x, y, 11.8, 11.8, (x + y) % 3 ? '#82958b18' : '#30464b18');
    line(r, [vec(x, y), vec(x + 11.8, y)], '#3b555130', 0.08);
  }
  line(r, FREIGHT_ROUTE.slice(0, 8), '#455a5b', 11);
  line(r, [vec(200, -40), vec(115, -40)], '#506766', 8);
  c.setLineDash([2.5, 2]); line(r, FREIGHT_ROUTE.slice(0, 8), '#d7c385', 0.13); c.setLineDash([]);
  for (const [i, p] of FREIGHT_ROUTE.slice(1, 7).entries()) {
    const next = FREIGHT_ROUTE[i + 2], dx = next.x - p.x, dy = next.y - p.y, angle = Math.atan2(dy, dx);
    c.save(); c.translate(p.x + dx * 0.45, p.y + dy * 0.45); c.rotate(angle);
    line(r, [vec(-1.8, 0), vec(1.8, 0), vec(0.2, -1.2)], '#dfd5a8', 0.3);
    line(r, [vec(1.8, 0), vec(0.2, 1.2)], '#dfd5a8', 0.3); c.restore();
  }
  for (const [i, item] of PORT_CONTAINERS.entries()) {
    r.rect(item.position.x - 8, item.position.y - 4.2, 16, 8.4, '#b6b89918', '#dfcb8b50');
    r.label(`Y${Math.floor(i / 5) + 1} / ${i % 5 + 1}`, item.position.x, item.position.y + 4.8, 0.65, '#dfd6b0');
  }
  // Quay edge: steel rail tracks, fenders, bollards and broken white surf.
  for (const y of [-133, -127.5, -125.8]) line(r, [vec(73, y), vec(251, y)], y === -133 ? '#d2c49a' : '#b5c1b3', y === -133 ? 0.65 : 0.18);
  for (let x = 77; x < 250; x += 10) {
    r.rect(x, -134.3, 2.2, 1.2, '#263d43'); r.circle(vec(x + 1, -132.6), 0.48, '#343e40'); r.circle(vec(x + 1, -132.75), 0.28, '#ddca89');
    line(r, [vec(x + 2, -135.2), vec(x + 6, -135.4)], '#b0d4cf65', 0.2);
  }
  r.label('NORTHSTAR HARBOUR', 161, -19.3, 2.1, '#efdfb4', '700');
  r.label('BONDED CARGO / BERTHS 01 — 02', 165, -115.5, 1, '#efdfb4', '700');
  r.label('TRUCKS IN', 200, -29, 0.8, '#e5d2a0', '700'); r.label('EXIT ↓', 220, -29, 0.8, '#e5d2a0', '700');
  r.label('STOP', 200, -10.5, 1.1, '#f6dfb1', '700'); line(r, [vec(195, -12), vec(205, -12)], '#f6dfb1', 0.4);
  r.label(`SECURITY / $${PORT_FEE}`, 210, -4.5, 0.9, '#f6dfb1', '700');
  r.rect(99, -44, 17, 8, '#233f43', '#74c6c3');
  r.label('C-76 / VEHICLE EXCHANGE', 111, -47, 0.8, '#a8e1d6', '700');
  r.label('ENTER ← / STOP INSIDE', 132, -37, 0.7, '#cae0cd', '700');
  r.rect(181, -32, 9, 4, '#b2b29918', '#e5ca8b70'); r.label('CUSTOMS', 185.5, -30, 0.65, '#e5ca8b');
  // Drain channels and hose coils; these are painted, not hidden obstacles.
  for (const x of [88, 230]) for (const y of [-46, -62, -97]) { r.rect(x, y, 1.6, 0.7, '#354c4d'); for (let i = 0; i < 6; i++) r.rect(x + i * 0.25, y, 0.08, 0.7, '#a9b7a1'); }
}

export function drawPortProp(r: Renderer, prop: Prop, render: PropRenderContext): boolean {
  const b = prop.body, c = r.ctx;
  if (prop.kind === 'building' && prop.label === 'CRANE FOOT') {
    r.rect(b.position.x - 0.6, b.position.y - 0.6, 1.2, 1.2, '#446567', '#bbd4ba'); return true;
  }
  if (prop.kind === 'container') {
    if (prop.label === 'EXCHANGE WALL') r.rect(b.position.x - b.w / 2, b.position.y - b.h / 2, b.w, b.h, prop.color, '#b4dfce');
    else {
      const info = PORT_CONTAINERS.find(p => p.label === prop.label);
      box(r, b.position.x, b.position.y, b.w, b.h, prop.color, { name: prop.label, tiers: info?.tiers, shadow: render.shadow });
    }
    return true;
  }
  if (prop.kind !== 'fence' && prop.kind !== 'port-gate') return false;
  c.save(); c.translate(b.position.x, b.position.y);
  if (b.h > b.w) c.rotate(Math.PI / 2);
  const w = Math.max(b.w, b.h);
  if (prop.kind === 'port-gate') {
    const permitted = r.game.harbour.vehicleId === r.game.player.id;
    const freight = r.game.vehicles.some(v => v.freight && v.alive && dist(v.body.position, b.position) < 10);
    r.rect(-w / 2, -0.5, 0.7, 1.2, '#364d50');
    // Red ground stripe still marks the stop line when a truck's arm is raised.
    line(r, [vec(-w / 2, 0.55), vec(w / 2, 0.55)], permitted ? '#a3ddc250' : '#e78a7950', 0.18);
    c.save(); c.translate(-w / 2, 0); if (permitted || freight) c.rotate(-1.48);
    r.rect(0, -0.22, w, 0.44, '#e4dbc1');
    for (let x = 0; x < w; x += 1.2) r.rect(x, -0.22, 0.55, 0.44, '#b55f51'); c.restore();
    r.circle(vec(-w / 2 + 0.35, -0.8), 0.24, permitted || freight ? '#a3ddc2' : '#ee8a75');
  } else {
    line(r, [vec(-w / 2, -0.2), vec(w / 2, -0.2)], '#c0cbb159', 0.45);
    line(r, [vec(-w / 2, 0.15), vec(w / 2, 0.15)], '#536e6b', 0.14);
    for (let x = -w / 2; x <= w / 2; x += 3) { r.rect(x - 0.12, -0.35, 0.24, 0.9, '#c0cbb1'); line(r, [vec(x, -0.2), vec(Math.min(w / 2, x + 3), 0.2)], '#b3c6ab80', 0.09); }
  }
  c.restore(); return true;
}

export function drawHarbourActivity(r: Renderer) {
  const c = r.ctx, g = r.game;
  for (const [index, ship] of PORT_SHIPS.entries()) {
    if (!r.visible(ship.position, 50)) continue;
    const p = ship.position;
    c.save(); c.translate(p.x, p.y);
    for (const y of [-13, 13]) line(r, [vec(-32, y), vec(30, y + 0.5), vec(40, 0)], '#afd4c44a', 0.35);
    const hull = [vec(-39, -8), vec(-35, -12), vec(27, -12), vec(41, -3), vec(43, 0), vec(38, 6), vec(27, 12), vec(-35, 12), vec(-39, 8)];
    c.beginPath(); hull.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.fillStyle = ship.color; c.fill(); c.strokeStyle = '#d4baa1'; c.lineWidth = 0.35; c.stroke();
    r.rect(-33, -10, 60, 20, '#3c5458', '#dac799');
    for (let x = -16; x <= 15; x += 16) for (const y of [-6.5, 0, 6.5]) box(r, x, y, 14, 4.7, CONTAINER_COLORS[(Math.round(x) + Math.round(y) + index + 50) % 5]);
    r.rect(-32, -8, 12, 16, '#ded8bd', '#fcf0d1'); r.rect(-30.5, -6.5, 9, 13, '#738e8b');
    r.rect(-31, -7.3, 10, 1.1, '#253e4c'); for (let x = -30.5; x < -21; x += 1.6) r.rect(x, -7.2, 0.8, 0.7, '#b0cbd0');
    r.rect(-28, -4, 3, 6, '#d4cdb2'); r.rect(-27.6, -2.8, 2.2, 3.6, '#a35743');
    line(r, [vec(-24, -4), vec(-24, 4)], '#f0ddb6', 0.18); line(r, [vec(-27, 0), vec(-21, 0)], '#f0ddb6', 0.18);
    r.circle(vec(31, 0), 0.8, '#cfbd8c'); r.circle(vec(31, 0), 0.4, '#394f50');
    r.label(ship.name, -4, 11, 0.9, '#fff0ca', '700'); c.restore();
    for (const x of [-32, 28]) line(r, [vec(p.x + x, p.y + 11), vec(p.x + x + 4, -132)], '#d7c59c', 0.14);
  }
  for (const crane of PORT_CRANES) {
    if (!r.visible(vec(crane.x, -139), 25)) continue;
    const load = craneLoad(g.time, crane.phase), x = crane.x;
    // Crane span is overhead. Only its feet are static physical obstacles.
    r.rect(x - 6, -156, 12, 28, '#182e3528');
    for (const side of [-1, 1]) {
      r.rect(x + side * 6 - 0.55, -133, 1.1, 6, '#385c60', '#acd4c5');
      line(r, [vec(x + side * 6, -130), vec(x + side * 3, -160)], '#427b80', 0.65);
      line(r, [vec(x + side * 6, -130), vec(x - side * 3, -160)], '#abd3c080', 0.18);
      for (const y of [-157, -153, -149, -145, -141, -137]) line(r, [vec(x - 3.5, y), vec(x + 3.5, y)], '#b9d6ba70', 0.12);
    }
    r.rect(x - 1.2, -164, 2.4, 44, '#62a3a2', '#b8d4b9');
    for (let y = -162; y < -120; y += 2) r.rect(x - 1, y, 0.35, 0.8, '#e6c781');
    r.rect(x - 2, load.y - 1, 4, 2, '#344e53', '#e5d3a4');
    r.circle(vec(x + 1.6, load.y), 0.35, '#e5d3a4');
    const hangingY = load.y - load.lift * 3;
    for (const side of [-1, 1]) line(r, [vec(x + side * 1.2, load.y), vec(x + side * 2.1, hangingY)], '#ddd7b8', 0.1);
    if (load.loaded) { r.rect(x - 3.5, load.y + 0.3, 7, 2.6, '#142a3650'); box(r, x, hangingY, 6.5, 2.6, '#d8a657'); }
    else r.rect(x - 2.3, hangingY, 4.6, 0.35, '#d8c085');
    r.label('LOADING', x, -165.5, 0.65, '#d8dfb5', '700');
  }
  // Closed roof screens a stopped car during the exchange; open doors remain
  // visible on approach and the freshly issued car appears outside them.
  if (r.visible(SWAP_CONTAINER, 18)) {
    const p = SWAP_CONTAINER;
    if (g.insideSwap) box(r, p.x, p.y, 14, 6.2, '#568f8d', { name: 'C-76 / NEW IDENTITY' });
    for (const side of [-1, 1]) {
      c.save(); c.translate(p.x + 7, p.y + side * 3.1); c.rotate(side * 0.55);
      r.rect(0, side < 0 ? -0.4 : 0, 3.2, 0.4, '#78b6aa', '#d1dcc0'); c.restore();
    }
    if (g.harbour.vehicleId === g.player.id && !g.harbour.exchanged) {
      const fraction = Math.min(1, g.harbour.progress / 2.5);
      r.rect(p.x - 6, p.y - 5.7, 12, 0.35, '#203b3c'); r.rect(p.x - 6, p.y - 5.7, 12 * fraction, 0.35, '#a3ddc2');
    }
  }
  if (r.visible(PORT_ENTRY, 15)) r.label(g.harbour.vehicleId === g.player.id ? 'ENTRY AUTHORISED' : `E / $${PORT_FEE} / NO POLICE IN SIGHT`, 200, -1.5, 0.65, '#f7e3b5', '700');
}

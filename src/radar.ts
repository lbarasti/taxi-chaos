import { vec, type Vec } from './physics';

// A fixed 160 m neighbourhood stays legible as the map is made smaller.
export function radarView(actor: Vec, width: number, height: number) {
  const scale = (width - 16) / 160;
  const center = vec(width / 2, height / 2);
  return { scale, center, offset: vec(center.x - actor.x * scale, center.y - actor.y * scale) };
}

// Project a distant destination onto the inset edge along its true bearing.
export function radarMarker(target: Vec, view: ReturnType<typeof radarView>, width: number, height: number) {
  const dx = target.x * view.scale + view.offset.x - view.center.x;
  const dy = target.y * view.scale + view.offset.y - view.center.y;
  const ratio = Math.max(1, Math.abs(dx) / (width / 2 - 9), Math.abs(dy) / (height / 2 - 9));
  return { position: vec(view.center.x + dx / ratio, view.center.y + dy / ratio), angle: Math.atan2(dy, dx), offscreen: ratio > 1 };
}

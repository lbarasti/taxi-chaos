import { vec, type Vec } from './physics';

// A fixed 320 m neighbourhood gives wider context at desktop and touch sizes.
export function radarView(actor: Vec, width: number, height: number) {
  const radius = Math.min(width, height) / 2;
  const scale = (radius * 2 - 16) / 320;
  const center = vec(width / 2, height / 2);
  return { scale, radius, center, offset: vec(center.x - actor.x * scale, center.y - actor.y * scale) };
}

// Project a distant destination onto the inset edge along its true bearing.
export function radarMarker(target: Vec, view: ReturnType<typeof radarView>) {
  const dx = target.x * view.scale + view.offset.x - view.center.x;
  const dy = target.y * view.scale + view.offset.y - view.center.y;
  const ratio = Math.max(1, Math.hypot(dx, dy) / (view.radius - 9));
  return { position: vec(view.center.x + dx / ratio, view.center.y + dy / ratio), angle: Math.atan2(dy, dx), offscreen: ratio > 1 };
}

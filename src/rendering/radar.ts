import { vec, type Vec } from '../physics/physics';

// A fixed 320 m neighbourhood gives wider context at desktop and touch sizes.
export function radarView(actor: Vec, width: number, height: number) {
  const radius = Math.min(width, height) / 2;
  const scale = (radius * 2 - 16) / 320;
  const center = vec(width / 2, height / 2);
  return { scale, radius, center, offset: vec(center.x - actor.x * scale, center.y - actor.y * scale) };
}

/** Project a world point into the circular radar's pixel space. */
export function radarPoint(point: Vec, view: ReturnType<typeof radarView>) {
  return vec(point.x * view.scale + view.offset.x, point.y * view.scale + view.offset.y);
}

// Project a distant destination onto the inset edge along its true bearing.
export function radarMarker(target: Vec, view: ReturnType<typeof radarView>) {
  const point = radarPoint(target, view), dx = point.x - view.center.x, dy = point.y - view.center.y;
  const ratio = Math.max(1, Math.hypot(dx, dy) / (view.radius - 9));
  return { position: vec(view.center.x + dx / ratio, view.center.y + dy / ratio), angle: Math.atan2(dy, dx), offscreen: ratio > 1 };
}

/** Which guidance the player is currently following, in the same priority order as `Game.target`. */
export type NavigationTargetKind = 'pickup' | 'delivery' | 'stopover' | 'garage' | 'newsroom' | 'harbour' | 'swap' | 'exit' | 'walk';

export function navigationTargetKind(route: {
  onFoot: boolean; stage: 'pickup' | 'dropoff'; navToGarage: boolean; navToHarbour: boolean; navToNewsroom: boolean; navToStopover?: boolean; admitted: boolean; exchanged: boolean;
}): NavigationTargetKind {
  if (route.onFoot) return 'walk';
  if (route.navToNewsroom) return 'newsroom';
  if (route.admitted) return route.exchanged ? 'exit' : 'swap';
  if (route.navToHarbour) return 'harbour';
  if (route.navToGarage) return 'garage';
  if (route.navToStopover) return 'stopover';
  return route.stage === 'pickup' ? 'pickup' : 'delivery';
}

/** Radar colours keep one meaning per destination across the minimap and the screen-edge pointer. */
export const navigationTargetColours: Record<NavigationTargetKind, string> = {
  pickup: '#f7ce55', delivery: '#a3ddc2', stopover: '#c4b5ed', garage: '#a7bcca', newsroom: '#8edbe8', harbour: '#8edbe8', swap: '#8edbe8', exit: '#8edbe8', walk: '#8edbe8',
};

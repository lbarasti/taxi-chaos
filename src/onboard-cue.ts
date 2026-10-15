import type { Game, Vehicle } from './game';
import type { LightSource } from './lighting';

/** Where the active vehicle shows that someone or something is aboard. */
export type OnBoardCue = 'roof' | 'body';

/**
 * The world cue that replaces the old minimap on-board badge: the player's active cab
 * glows on its roof, and the courier bike glows on its body, while a passenger or parcel
 * is actually aboard. Walking, an empty pickup run, a completed delivery and any other
 * (or abandoned) vehicle never carry it. Read-only: this changes no simulation state.
 */
export function onBoardCue(g: Game, v: Vehicle): OnBoardCue | null {
  if (v !== g.player || g.onFoot || g.job.stage !== 'dropoff') return null;
  if (v.sinking || v.damage.status === 'wreck' || v.damage.status === 'burning') return null;
  return v.model === 'motorcycle' ? 'body' : 'roof';
}

/** Police-style light spill, not a drawn ring: the shared compositor supplies the soft falloff. */
export function onBoardLight(g: Game, v: Vehicle, reducedMotion = false): (LightSource & { cue: OnBoardCue }) | null {
  const cue = onBoardCue(g, v);
  if (!cue || !v.alive) return null;
  const origin = v.body.toWorld({ x: cue === 'roof' ? -0.1 : 0, y: 0 });
  return {
    cue, x: origin.x, y: origin.y, radius: cue === 'roof' ? 7.5 : 6.5,
    color: [74, 255, 132], intensity: reducedMotion ? 0.9 : 0.9 + Math.sin(g.time * 2.6) * 0.07,
  };
}

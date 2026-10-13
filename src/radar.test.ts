import { describe, expect, it } from 'vitest';
import { vec } from './physics';
import { radarMarker, radarView } from './radar';

describe('local radar navigation', () => {
  it('centres the actor in city and highlands at desktop and mobile sizes', () => {
    for (const [width, height] of [[234, 234], [190, 190], [114, 114]]) {
      for (const actor of [vec(4, 25), vec(474, 58), vec(530, 240)]) {
        const view = radarView(actor, width, height);
        expect(actor.x * view.scale + view.offset.x).toBeCloseTo(width / 2);
        expect(actor.y * view.scale + view.offset.y).toBeCloseTo(height / 2);
        expect(view.scale * 320).toBeCloseTo(Math.min(width, height) - 16);
      }
    }
  });
  it('leaves nearby destinations in their actual positions', () => {
    const view = radarView(vec(4, 25), 176, 176);
    expect(radarMarker(vec(14, 38), view)).toEqual({ position: vec(93, 94.5), angle: Math.atan2(13, 10), offscreen: false });
    expect(radarMarker(vec(4, 25), view).offscreen).toBe(false);
  });
  it('shows destinations 100 m away inside the wider desktop and touch view', () => {
    for (const [width, height] of [[234, 234], [190, 190], [114, 114], [90, 90]]) {
      const actor = vec(4, 25), view = radarView(actor, width, height);
      expect(radarMarker(vec(actor.x + 100, actor.y), view).offscreen).toBe(false);
      expect(radarMarker(vec(actor.x - 100, actor.y), view).offscreen).toBe(false);
    }
  });
  it('projects destinations in square corners onto the circular rim', () => {
    const view = radarView(vec(0, 0), 176, 176);
    const marker = radarMarker(vec(130, 130), view);
    expect(marker.offscreen).toBe(true);
    expect(Math.hypot(marker.position.x - 88, marker.position.y - 88)).toBeCloseTo(79);
    expect(marker.angle).toBeCloseTo(Math.PI / 4);
  });
  it('keeps distant destinations visible and preserves bearing in every direction', () => {
    for (const [width, height] of [[234, 234], [190, 190], [114, 114]]) {
      const actor = vec(358, 114), view = radarView(actor, width, height);
      for (const delta of [vec(500, 0), vec(-500, 0), vec(0, 500), vec(0, -500), vec(500, -250)]) {
        const marker = radarMarker(vec(actor.x + delta.x, actor.y + delta.y), view);
        expect(marker.offscreen).toBe(true);
        expect(marker.position.x).toBeGreaterThanOrEqual(9);
        expect(marker.position.x).toBeLessThanOrEqual(width - 9);
        expect(marker.position.y).toBeGreaterThanOrEqual(9);
        expect(marker.position.y).toBeLessThanOrEqual(height - 9);
        expect(Math.hypot(marker.position.x - view.center.x, marker.position.y - view.center.y)).toBeCloseTo(view.radius - 9);
        expect(Math.atan2(marker.position.y - view.center.y, marker.position.x - view.center.x)).toBeCloseTo(Math.atan2(delta.y, delta.x));
      }
    }
  });
});

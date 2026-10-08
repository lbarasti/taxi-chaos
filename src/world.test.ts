import { describe, expect, it } from 'vitest';
import { dist, vec } from './physics';
import { roadDistance, roadPath } from './world';

describe('simple street routing', () => {
  it('goes directly to a customer on the same street, without visiting an intersection', () => {
    expect(roadPath(vec(4, 32), vec(4, 14))).toEqual([vec(4, 32), vec(4, 14)]);
    expect(roadPath(vec(32, 4), vec(14, 4))).toEqual([vec(32, 4), vec(14, 4)]);
  });
  it('uses one bend for a long journey between perpendicular streets', () => {
    expect(roadPath(vec(4, 14), vec(204, 164))).toEqual([vec(4, 14), vec(4, 164), vec(204, 164)]);
  });
  it('chooses the closest connecting avenue between parallel streets', () => {
    const route = roadPath(vec(4, 14), vec(44, 14));
    expect(route).toEqual([vec(4, 14), vec(4, 0), vec(44, 0), vec(44, 14)]);
    expect(route.slice(1).reduce((sum, p, i) => sum + dist(route[i], p), 0)).toBe(68);
  });
  it('joins and exits an alley via street access, instead of cutting through a building', () => {
    const route = roadPath(vec(20.5, 25), vec(44, 14));
    expect(route[1]).toEqual(vec(20.5, 40)); expect(route.at(-1)).toEqual(vec(44, 14));
  });
  it('keeps all segments of street-to-street routes on roads with at most two turns', () => {
    const stops = [vec(4, 14), vec(44, 14), vec(84, 58), vec(116, 84), vec(164, 108), vec(204, 164), vec(156, 204), vec(76, 164), vec(4, 128), vec(44, 204), vec(204, 44), vec(124, 14)];
    for (const a of stops) for (const b of stops) {
      const route = roadPath(a, b); expect(route.length).toBeLessThanOrEqual(4);
      for (let i = 1; i < route.length; i++) for (let t = 0; t <= 1; t += 0.05) expect(roadDistance(vec(route[i - 1].x * (1 - t) + route[i].x * t, route[i - 1].y * (1 - t) + route[i].y * t))).toBeLessThanOrEqual(6.001);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { Body, bodyParts, contact, resolveCollision, segmentIntersectsBody, vec } from './physics';

const triangle = [vec(-0.5, -0.5), vec(0.5, -0.5), vec(-0.5, 0.5)];

describe('convex collision footprints', () => {
  it.each([false, true])('agrees on physical contact and sight rays in either winding (reversed=%s)', reversed => {
    for (const angle of [0, Math.PI / 3, -Math.PI / 2]) {
      const solid = new Body(12, -4, Infinity, 8, 4); solid.angle = angle;
      solid.collisionPolygon = reversed ? [...triangle].reverse() : triangle;
      const empty = solid.toWorld(vec(3, 1.3)), inside = solid.toWorld(vec(-2, -1));
      const probe = new Body(empty.x, empty.y, 1, 0.1, 0.1); probe.angle = angle;
      expect(contact(probe, solid)).toBeNull(); expect(contact(solid, probe)).toBeNull();
      expect(segmentIntersectsBody(empty, solid.toWorld(vec(3.4, 1.5)), solid)).toBe(false);
      probe.position = inside;
      expect(contact(probe, solid)?.depth).toBeGreaterThan(0);
      expect(contact(solid, probe)?.depth).toBeGreaterThan(0);
      expect(segmentIntersectsBody(solid.toWorld(vec(-5, -1)), solid.toWorld(vec(5, -1)), solid)).toBe(true);
      expect(segmentIntersectsBody(inside, solid.toWorld(vec(-5, -1)), solid)).toBe(true);
      expect(segmentIntersectsBody(solid.toWorld(vec(-5, -3)), solid.toWorld(vec(5, -3)), solid)).toBe(false);
    }
  });

  it('resolves a moving body against a sloping face without creating energy', () => {
    const solid = new Body(0, 0, Infinity, 8, 8); solid.collisionPolygon = triangle;
    const car = new Body(0.25, 0.25, 1000, 2, 1); car.velocity = vec(-8, -8);
    const energy = () => car.mass * (car.velocity.x ** 2 + car.velocity.y ** 2) / 2 + car.inertia * car.angularVelocity ** 2 / 2;
    const before = energy(), hit = contact(car, solid)!;
    expect(hit).not.toBeNull(); expect(hit.normal.x).toBeCloseTo(Math.SQRT1_2);
    expect(resolveCollision(car, solid, hit)).toBeGreaterThan(0);
    expect(energy()).toBeLessThan(before);
  });

  it('pushes away from an offset polygon even when its envelope centre lies outside the solid', () => {
    const solid = new Body(0, 0, Infinity, 10, 10);
    solid.collisionPolygon = [vec(0.3, 0.3), vec(0.5, 0.3), vec(0.3, 0.5)];
    const probe = new Body(2.9, 3.5, 1, 0.4, 0.4);
    const hit = contact(probe, solid)!;
    expect(hit.normal.x).toBeCloseTo(-1); expect(hit.depth).toBeCloseTo(0.1);
    resolveCollision(probe, solid, hit);
    expect(probe.position.x).toBeLessThan(2.9);
    expect(contact(solid, probe)!.normal.x).toBeCloseTo(1);
  });

  it('keeps compound recesses empty against polygons and sight rays', () => {
    const compound = new Body(0, 0, Infinity, 10, 10); compound.angle = 0.4;
    compound.collisionRects = [{ x: -0.5, y: -0.5, width: 0.2, height: 1 }, { x: -0.3, y: -0.5, width: 0.8, height: 0.2 }];
    const probe = new Body(0, 0, 1, 1, 1); probe.angle = compound.angle; probe.collisionPolygon = triangle;
    expect(contact(probe, compound)).toBeNull();
    expect(segmentIntersectsBody(compound.toWorld(vec(0, 0)), compound.toWorld(vec(4, 0)), compound)).toBe(false);
    expect(segmentIntersectsBody(compound.toWorld(vec(-6, 0)), compound.toWorld(vec(0, 0)), compound)).toBe(true);
    const parts = bodyParts(compound);
    compound.position = vec(20, 30); compound.angle = -0.2; compound.w = 20;
    expect(bodyParts(compound)).not.toBe(parts);
    expect(bodyParts(compound)[0].position).toEqual(compound.toWorld(vec(-8, 0)));
  });
});

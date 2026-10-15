import { describe, expect, it } from 'vitest';
import { Body, contact, vec } from '../physics';
import { collectOccluders, occluderFor, pointInConvex, shadowVolume } from '../lighting-occlusion';
import { artRadius, artworkFor, propArtwork } from './catalogue';

describe('top-down artwork geometry', () => {
  it('keeps collision footprints independent of roof overhangs and foliage', () => {
    const tree = { kind: 'tree', body: new Body(90, 90, Infinity, 1.8, 1.8) };
    expect(artworkFor(tree)).toBe(propArtwork.tree);
    expect(artRadius(tree)).toBeGreaterThan(3.6);
    expect(contact(tree.body, new Body(92.2, 90, 1000, 0.7, 0.7))).toBeNull();
    const shop = { kind: 'building', body: new Body(14, 14, Infinity, 10, 10) };
    const before = shop.body.corners();
    const outline = occluderFor({ ...shop, alive: true }, artworkFor(shop)!.occluder)!;
    expect(pointInConvex(vec(19.2, 14), outline.points)).toBe(true);
    expect(contact(shop.body, new Body(19.2, 14, 1000, 0.1, 0.1))).toBeNull();
    expect(shop.body.corners()).toEqual(before);
  });
  it('rotates and translates artwork occluders, drops destroyed ones and blocks light behind roofs', () => {
    const prop = { kind: 'building', alive: true, body: new Body(14, 14, Infinity, 10, 10) };
    prop.body.angle = Math.PI / 4;
    const outlineFor = () => propArtwork.shop.occluder;
    const [outline] = collectOccluders([prop], { minX: 0, minY: 0, maxX: 40, maxY: 40 }, 20, outlineFor);
    expect(outline.radius).toBeCloseTo(Math.hypot(5.3, 5.3));
    expect(outline.points[0].x).toBeCloseTo(14);
    expect(outline.points[0].y).toBeCloseTo(14 - Math.SQRT2 * 5.3);
    expect(pointInConvex(vec(35, 14), shadowVolume(vec(-10, 14), outline, 50))).toBe(true);
    expect(collectOccluders([{ ...prop, alive: false }], { minX: 0, minY: 0, maxX: 40, maxY: 40 }, 20, outlineFor)).toEqual([]);
  });
  it('retains procedural visuals for other districts, sizes and prop kinds', () => {
    for (const prop of [
      { kind: 'building', body: new Body(14, 14, Infinity, 16, 10) },
      { kind: 'building', body: new Body(320, 420, Infinity, 10, 10) },
      { kind: 'tree', body: new Body(320, 200, Infinity, 1.8, 1.8) },
      { kind: 'crate', body: new Body(14, 14, Infinity, 1.4, 1.4) },
    ]) expect(artworkFor(prop)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { Body, contact, vec } from '../physics';
import { collectOccluders, occluderFor, pointInConvex, shadowVolume } from '../lighting-occlusion';
import { artRadius, artworkFor, propArtwork } from './catalogue';
import { World } from '../world';

describe('top-down artwork geometry', () => {
  it('keeps collision footprints independent of roof overhangs and foliage', () => {
    const tree = { kind: 'tree', body: new Body(90, 90, Infinity, 1.8, 1.8) };
    expect(artworkFor(tree)?.image).toBe('tree-worn');
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
  it('assigns varied, stable artwork without using simulation randomness', () => {
    const a = new World(), b = new World();
    const appearances = a.props.map(p => artworkFor(p));
    expect(new Set(appearances.filter(p => p?.image.startsWith('shop')).map(p => p!.image)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(a.props.filter(p => p.artDistrict).map(p => p.artDistrict))).toEqual(new Set(['OLD TOWN', 'MARKET QUARTER', 'MIDTOWN', 'GARDEN DISTRICT', 'THE DOCKS', 'EAST VILLAGE']));
    expect(new Set(appearances.filter(p => p?.image === 'tree-worn').map(p => p!.rotation)).size).toBe(4);
    expect(appearances).toEqual(b.props.map(p => artworkFor(p)));
    expect(a.random()).toEqual(b.random());
    const prop = a.props.find(p => artworkFor(p)?.image.startsWith('shop'))!;
    const chosen = artworkFor(prop);
    expect(artworkFor({ ...prop, label: 'A DIFFERENT NAME', body: new Body(200, 200, Infinity, 10, 10) } as typeof prop)).toBe(chosen);
    const owned = { ...prop, sourceId: 'stable-authored-shop' };
    expect(artworkFor({ ...owned, id: 9999 })).toBe(artworkFor(owned));
  });
  it('covers fixed building footprints across harbour, civic sites, mansions, golf and hotels', () => {
    const props = new World().props;
    const find = (kind: string, w: number, h: number) => props.find(p => p.kind === kind && p.body.w === w && p.body.h === h)!;
    expect(artworkFor(find('station', 10, 10))?.image).toBe('fuel-station');
    expect(artworkFor(find('barracks', 23, 10))?.image).toBe('civic-barracks');
    expect(artworkFor(find('shed', 23, 10))?.image).toBe('freight-depot');
    expect(['villa-tile', 'villa-glass']).toContain(artworkFor(find('building', 16, 10))?.image);
    expect(artworkFor(find('building', 6, 3))?.image).toBe('villa-annex');
    expect(artworkFor(find('building', 10, 14))?.image).toBe('fairway-club');
    expect(artworkFor(find('building', 6, 6))?.image).toBe('port-office');
    expect(artworkFor(find('building', 28, 12))?.image).toBe('bonded-warehouse');
    expect(artworkFor(find('building', 33, 10))?.image).toBe('hotel-sandpiper');
    expect(artworkFor(find('building', 33, 11))?.image).toBe('hotel-pacific');
    expect(artworkFor(find('building', 31, 12))?.image).toBe('hotel-sunset');
  });
  it('holds neighbourhood themes stable across relabels and relocation while respecting source IDs', () => {
    const a = new World();
    const market = a.props.find(p => p.artDistrict === 'MARKET QUARTER')!;
    const picked = artworkFor(market);
    expect(picked?.image).toMatch(/^shop-/);
    expect(artworkFor({ ...market, label: 'NEW NAME', body: new Body(200, 200, Infinity, 10, 10) })).toBe(picked);
    const different = { ...market, artDistrict: 'MIDTOWN', sourceId: 'fresh-authored-business' };
    const chosen = artworkFor(different);
    expect(['shop-art-deco', 'shop-condo', 'shop-renovation', 'shop-loft', 'shop-concrete']).toContain(chosen?.image);
    const aCount = new World().random(), bCount = new World().random();
    expect(aCount).toBe(bCount);
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

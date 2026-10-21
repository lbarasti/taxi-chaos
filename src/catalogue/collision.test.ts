import { describe, expect, it } from 'vitest';
import { Body, contact, segmentIntersectsBody, vec, type Vec } from '../physics/physics';
import { objectDefinitions } from '../artwork/catalogue';
import { compileMap } from '../map/compile';
import { copyDefaultMap } from '../map/default';
import { descriptorBody } from '../map/operations';
import { validateMap } from '../map/validation';
import { World } from '../world/world';
import { collectOccluders, occluderFor, pointInConvex } from '../rendering/lighting-occlusion';
import { compileObjectCatalogue, compileObjectPlacement, compilePlacement } from './compile';
import { inspectAuthoring } from './authoring';
import type { ObjectRecord } from './schema';

const triangle = [vec(-0.5, -0.5), vec(0.5, -0.5), vec(-0.5, 0.5)];
const record: ObjectRecord = { id: 'rock', kind: 'rock', width: 8, height: 8, collisionPolygon: triangle };

describe('authored collision polygons', () => {
  it.each([
    [], [vec(0, 0), vec(0.5, 0)], [vec(0, 0), vec(0.25, 0), vec(0.5, 0)],
    [vec(-0.5, -0.5), vec(0.5, -0.5), vec(0, 0), vec(0.5, 0.5), vec(-0.5, 0.5)],
    [vec(-0.5, -0.5), vec(0.5, 0.5), vec(-0.5, 0.5), vec(0.5, -0.5)],
    [...triangle, triangle[0]], [vec(NaN, 0), ...triangle], [vec(0.6, 0), ...triangle],
    Array.from({ length: 33 }, (_, i) => vec(Math.cos(i * Math.PI * 2 / 33) / 2, Math.sin(i * Math.PI * 2 / 33) / 2)),
  ].map(points => ({ points })))('rejects malformed, concave, crossing or over-budget geometry %#', ({ points }) => {
    expect(() => compileObjectCatalogue([{ ...record, collisionPolygon: points }])).toThrow(/rock: collision polygon/);
  });

  it('rejects ambiguous shapes and detaches/freeze-validates either winding', () => {
    expect(() => compileObjectCatalogue([{ ...record, collision: [{ x: -0.5, y: -0.5, width: 1, height: 1 }] }])).toThrow(/choose collision sections or a collision polygon/);
    const authored = structuredClone(record);
    const catalogue = compileObjectCatalogue([authored]);
    authored.collisionPolygon![0].x = 0;
    expect(catalogue.rock.collisionPolygon![0].x).toBe(-0.5);
    expect(Object.isFrozen(catalogue.rock.collisionPolygon![0])).toBe(true);
    expect(() => compileObjectCatalogue([{ ...record, collisionPolygon: [...triangle].reverse() }])).not.toThrow();
  });

  it('carries custom geometry through resize, map compilation, runtime, editing, validation and authoring', () => {
    const document = copyDefaultMap(), catalogue = { ...objectDefinitions, ...compileObjectCatalogue([record]) };
    const placement = { id: 'polygon-review-rock', owner: 'southern-estates' as const, type: 'rock', position: vec(240, 430), angle: Math.PI / 3, width: 10, height: 6, color: '#788278', label: '' };
    document.objectPlacements.push(placement);
    const compiled = compileObjectPlacement(placement, catalogue), edited = descriptorBody(placement, catalogue);
    const emptyCorner = edited.toWorld(vec(4, 2));
    document.objectPlacements.push({ id: 'empty-corner-marker', owner: 'southern-estates', type: 'crate', position: emptyCorner, angle: 0, width: 0.2, height: 0.2, color: '#aaaaaa', label: '' });
    const map = compileMap(document, catalogue), world = new World(map), prop = world.props.find(p => p.sourceId === placement.id)!;
    expect(prop.body.corners()).toEqual(edited.corners());
    expect(prop.body.collisionPolygon).toEqual(triangle);
    expect(compiled.collisionPolygon).not.toBe(catalogue.rock.collisionPolygon);
    expect(Object.isFrozen(map.objects[placement.id].collisionPolygon)).toBe(true);
    expect(Object.isFrozen(map.catalogue.rock.collisionPolygon)).toBe(true);
    for (const rock of world.props.filter(p => p.kind === 'rock')) expect(rock.body.collisionPolygon).toEqual(triangle);
    const empty = prop.body.toWorld(vec(4, 2)), probe = new Body(empty.x, empty.y, 1, 0.1, 0.1);
    expect(contact(prop.body, probe)).toBeNull();
    const validation = validateMap(document, map, world);
    expect(validation.findings.filter(f => f.entityIds.includes(placement.id) || f.entityIds.includes('empty-corner-marker'))).toEqual([]);
    const report = inspectAuthoring(document, placement.id, catalogue, { map, world, validation });
    expect(report.entity.bodies[0].collisionPolygon).toEqual(triangle);
    expect(report.entity.bodies[0].collisionRects).toBeUndefined();
    expect(report.lightBlockers).toHaveLength(1);
    report.lightBlockers[0].silhouette.forEach((p, i) => { expect(p.x).toBeCloseTo(prop.body.corners()[i].x); expect(p.y).toBeCloseTo(prop.body.corners()[i].y); });
    (report.entity.bodies[0].collisionPolygon![0] as Vec).x = 0;
    expect(prop.body.collisionPolygon![0].x).toBe(-0.5);
  });

  it('preserves polygon shapes for city building placements', () => {
    const catalogue = compileObjectCatalogue([{ ...record, id: 'triangular-building', kind: 'building', storeys: 2, fallback: 'shop', sign: { width: 2, inset: 0.5, size: 0.4, color: '#fff' } }]);
    const compiled = compilePlacement({ id: 'triangular-building-1', type: 'triangular-building', owner: 'city', blockId: 'city-block-0-0', position: vec(14, 14), label: 'TEST', color: '#fff' }, catalogue);
    expect(compiled.collisionPolygon).toEqual(triangle);
  });
});

describe('shipped polygon props and light blockers', () => {
  const world = new World();
  it.each(['palm', 'tree', 'rock', 'bollard', 'golf-flag'] as const)('uses compact physical polygons for every %s', kind => {
    const props = world.props.filter(p => p.kind === kind);
    if (kind === 'bollard' && !props.length) props.push(world.add('bollard', 0, 0, 0.6, 0.6, '#aaa'));
    expect(props.length).toBeGreaterThan(0);
    for (const prop of props) {
      expect(prop.body.collisionPolygon).toEqual(objectDefinitions[kind].collisionPolygon);
      expect(prop.body.collisionRects).toBeUndefined();
    }
  });

  it('makes rock contacts, police sight and headlight blockers agree after rotation and resize', () => {
    for (const angle of [0, 0.6, Math.PI / 2]) {
      const body = new Body(12, -4, Infinity, 10, 6); body.angle = angle; body.collisionPolygon = objectDefinitions.rock.collisionPolygon;
      const rock = { kind: 'rock', alive: true, body }, corner = body.toWorld(vec(4.9, -2.9));
      const probe = new Body(corner.x, corner.y, 1, 0.02, 0.02);
      expect(contact(body, probe)).toBeNull();
      expect(segmentIntersectsBody(corner, body.toWorld(vec(4.5, -2.9)), body)).toBe(false);
      const [occluder] = collectOccluders([rock], { minX: -50, minY: -50, maxX: 50, maxY: 50 });
      occluder.points.forEach((p, i) => { expect(p.x).toBeCloseTo(body.corners()[i].x); expect(p.y).toBeCloseTo(body.corners()[i].y); });
      expect(pointInConvex(corner, occluder.points)).toBe(false);
      expect(pointInConvex(body.position, occluder.points)).toBe(true);
      expect(segmentIntersectsBody(body.toWorld(vec(-6, 0)), body.toWorld(vec(6, 0)), body)).toBe(true);
      expect(collectOccluders([{ ...rock, alive: false }], { minX: -50, minY: -50, maxX: 50, maxY: 50 })).toEqual([]);
      const artworkOutline = [vec(-8, -4), vec(8, -4), vec(8, 4), vec(-8, 4)];
      occluderFor(rock, artworkOutline)!.points.forEach((p, i) => { expect(p.x).toBeCloseTo(body.toWorld(artworkOutline[i]).x); expect(p.y).toBeCloseTo(body.toWorld(artworkOutline[i]).y); });
    }
  });

  it('keeps canopy artwork separate and preserves compound buildings and fountain openings', () => {
    expect(objectDefinitions.palm.artwork![0].width).toBeGreaterThan(1);
    expect(objectDefinitions.tree.artwork![0].width).toBeGreaterThan(1);
    expect(objectDefinitions.condo.collision).toHaveLength(3);
    expect(objectDefinitions.fountain.collision!.length).toBeGreaterThan(8);
    for (const kind of ['palm', 'tree']) {
      const props = world.props.filter(p => p.kind === kind);
      expect(collectOccluders(props, { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 })).toEqual([]);
    }
  });
});

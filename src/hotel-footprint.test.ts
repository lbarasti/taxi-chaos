import { describe, expect, it } from 'vitest';
import { Body, bodyParts, contact, segmentIntersectsBody, vec } from './physics';
import { World } from './world';
import { defaultCompiledMap, compileMap } from './map/compile';
import { copyDefaultMap } from './map/default';
import { objectDefinitions } from './artwork/catalogue';
import { compileObjectCatalogue } from './catalogue/compile';
import { collectOccluders, pointInConvex } from './lighting-occlusion';
import { createVehicleBody, vehicleDefinition } from './vehicles';
import { descriptorBody } from './map/operations';

const world = new World();
const azure = world.props.find(p => p.sourceId === 'hotel-sandpiper')!;

describe('hotel sand recesses (static clearance)', () => {
  it.each([vec(150.4, 247.2), vec(150.4, 270)])('keeps a full taxi clear on visible recessed sand at %o', position => {
    const taxi = createVehicleBody(vehicleDefinition('car'), position);
    expect(defaultCompiledMap.terrain.sample(position)).toBe('sand');
    expect(taxi.corners().some(defaultCompiledMap.land.inOcean)).toBe(false);
    expect([...world.hash.query(taxi)]).toContain(azure); // Broad envelope still finds it.
    expect(contact(taxi, new Body(162, 259, Infinity, 28, 26))).not.toBeNull(); // The former envelope blocked this sand.
    expect(contact(taxi, azure.body)).toBeNull();
    expect([...world.hash.query(taxi)].some(p => contact(taxi, p.body))).toBe(false);
    expect(world.navigation.access.clear(position, position, 'drive', { width: taxi.w, height: taxi.h })).toBe(true);
  });
  it('keeps the actual roof sections solid for vehicles, walkers and sight lines', () => {
    for (const position of [vec(150, 255), vec(156, 255), vec(165, 247)]) {
      expect(contact(new Body(position.x, position.y, 1, 0.7, 0.7), azure.body)).not.toBeNull();
      expect(world.navigation.access.clear(position, position, 'walk')).toBe(false);
    }
    expect(segmentIntersectsBody(vec(147, 247.2), vec(152, 247.2), azure.body)).toBe(false);
    expect(segmentIntersectsBody(vec(147, 255), vec(155, 255), azure.body)).toBe(true);
  });
  it('uses the same sections for authored descriptors and detached scaled/rotated maps', () => {
    const document = copyDefaultMap();
    const placement = document.objectPlacements.find(p => p.id === azure.sourceId)!;
    expect(descriptorBody(placement).collisionRects).toEqual(azure.body.collisionRects);
    placement.width = 56; placement.height = 52; placement.angle = Math.PI / 2;
    const map = compileMap(document), resized = new World(map).props.find(p => p.sourceId === azure.sourceId)!;
    expect(Object.isFrozen(map.objects[placement.id].collision![0])).toBe(true);
    const clear = resized.body.toWorld(vec((150.4 - 162) * 2, (247.2 - 259) * 2));
    const probe = new Body(clear.x, clear.y, 1, 4.2, 2.1); probe.angle = Math.PI / 2;
    expect(contact(probe, resized.body)).toBeNull();
    expect(resized.body.collisionRects).not.toBe(azure.body.collisionRects);
    const parts = bodyParts(resized.body);
    expect(bodyParts(resized.body)).toBe(parts);
    resized.body.position.x += 10;
    expect(bodyParts(resized.body)[0].position.x).toBeCloseTo(parts[0].position.x + 10);
  });
  it('keeps headlight masks out of the same open sand recesses', () => {
    const occluders = collectOccluders([azure], { minX: 140, maxX: 180, minY: 240, maxY: 275 }, 0, () => azure.artwork?.occluder);
    expect(occluders).toHaveLength(3);
    expect(occluders.some(o => pointInConvex(vec(150.4, 247.2), o.points))).toBe(false);
    expect(occluders.some(o => pointInConvex(vec(165, 247), o.points))).toBe(true);
  });
  it('rejects unbounded or invalid catalogue collision geometry', () => {
    const record = { id: 'test-wall', kind: 'fence' as const, width: 10, height: 10 };
    const rect = { x: -0.5, y: -0.5, width: 1, height: 1 };
    for (const collision of [[], Array(9).fill(rect), [{ ...rect, width: 1.1 }], [{ ...rect, x: NaN }]]) {
      expect(() => compileObjectCatalogue([{ ...record, collision }])).toThrow(/collision/);
    }
    expect(objectDefinitions.condo.collision).toHaveLength(3);
  });
});

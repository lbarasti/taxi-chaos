import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { World, blocksWalking, isRigidObstacle } from './world';
import { Body, contact, dist, segmentIntersectsBody, vec } from './physics';
import { collectOccluders, pointInConvex } from './lighting-occlusion';
import { compileMap, defaultCompiledMap as map } from './map/compile';
import { copyDefaultMap } from './map/default';
import { importMap, exportMap } from './map/serialization';
import { createVehicleBody, vehicleDefinition } from './vehicles';

const parks = map.city.blocks.filter(b => b.park);

describe('city park terrain and fountain boundaries', () => {
  it('covers every lawn with grass and preserves both 2.4 m gravel paths', () => {
    expect(parks).toHaveLength(3);
    for (const b of parks) {
      for (const x of [7, 13, 18.7, 21.3, 27, 33]) for (const y of [7, 13, 18.7, 21.3, 27, 33])
        expect(map.terrain.sample(vec(b.x + x, b.y + y))).toBe('grass');
      for (let t = 6.5; t <= 33.5; t += 0.5) {
        expect(map.terrain.sample(vec(b.x + t, b.y + 20))).toBe('paving');
        expect(map.terrain.sample(vec(b.x + 20, b.y + t))).toBe('paving');
      }
      expect(map.terrain.sample(vec(b.x + 5, b.y + 20))).toBe('road');
    }
    const document = importMap(exportMap(copyDefaultMap()));
    expect(compileMap(document).terrain.regions).toEqual(map.terrain.regions);
  });

  it('blends grass handling per tyre, restores firm path grip, and avoids sand ruts', () => {
    const def = vehicleDefinition('car'), body = createVehicleBody(def, vec(90, 90));
    const grass = map.terrain.handling(body, def.physics.tyres, def.terrain);
    expect(grass.drive).toBeCloseTo(0.88); expect(grass.grip).toBeCloseTo(0.78);
    expect(grass.rollingDrag).toBe(32); expect(grass.coverage).toBe(0);
    expect(map.terrain.leavesTracks(body.position)).toBe(false);
    body.position = vec(100, 90); body.angle = Math.PI / 2;
    expect(map.terrain.handling(body, def.physics.tyres, def.terrain)).toMatchObject({ drive: 1, grip: 1, rollingDrag: 0 });
    body.position.x = 98.8;
    const mixed = map.terrain.handling(body, def.physics.tyres, def.terrain);
    expect(mixed.grip).toBeGreaterThan(grass.grip); expect(mixed.grip).toBeLessThan(1);
  });

  it('keeps the fountain rim solid all around, with an empty basin and clear outside corners', () => {
    const world = new World(map), fountains = world.props.filter(p => p.kind === 'fountain');
    expect(fountains).toHaveLength(3);
    for (const fountain of fountains) {
      const { x, y } = fountain.body.position;
      expect(parks.some(b => b.x + 20 === x && b.y + 20 === y)).toBe(true);
      expect(fountain.hp).toBe(Infinity); expect(isRigidObstacle(fountain.kind)).toBe(true);
      expect(blocksWalking(fountain.kind)).toBe(true);
      expect(contact(fountain.body, new Body(x, y, 75, 0.7, 0.7))).toBeNull();
      for (let i = 0; i < 72; i++) {
        const a = i * Math.PI / 36, c = Math.cos(a), s = Math.sin(a);
        expect(contact(fountain.body, new Body(x + c * 3.2, y + s * 3.2, 75, 0.2, 0.2))).not.toBeNull();
        expect(contact(fountain.body, new Body(x + c * 4.2, y + s * 4.2, 75, 0.2, 0.2))).toBeNull();
        expect(segmentIntersectsBody(vec(x, y), vec(x + c * 5, y + s * 5), fountain.body)).toBe(true);
      }
      expect(world.props.some(p => p.kind === 'tree' && contact(p.body, fountain.body))).toBe(false);
      const occluders = collectOccluders([fountain], { minX: x - 10, maxX: x + 10, minY: y - 10, maxY: y + 10 });
      expect(occluders.length).toBe(fountain.body.collisionRects!.length);
      expect(occluders.some(o => pointInConvex(vec(x, y), o.points))).toBe(false);
      for (let i = 0; i < 72; i++) {
        const a = i * Math.PI / 36, p = vec(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2);
        expect(occluders.some(o => pointInConvex(p, o.points))).toBe(true);
      }
    }
  });

  it('leaves every arm walkable up to the rim and space to walk around the fountain', () => {
    const world = new World(map);
    for (const b of parks) {
      const clear = (x: number, y: number) => {
        const body = new Body(b.x + x, b.y + y, 75, 0.7, 0.7);
        expect([...world.hash.query(body)].filter(p => blocksWalking(p.kind)).some(p => contact(body, p.body))).toBe(false);
      };
      for (let t = 6.9; t < 15.8; t += 0.3) for (const n of [t, 40 - t]) { clear(20, n); clear(n, 20); }
      for (let i = 0; i < 72; i++) { const a = i * Math.PI / 36; clear(20 + Math.cos(a) * 4.5, 20 + Math.sin(a) * 4.5); }
    }
  });

  it('stops real walking and driving at the stone rim', () => {
    for (const onFoot of [true, false]) {
      const game = new Game(undefined, false); game.start(); game.settings.noPolice = true;
      game.vehicles = [game.player]; game.onFoot = onFoot;
      game.actor.position = vec(100, 90); game.actor.angle = Math.PI / 2;
      const start = { ...game.actor.position };
      game.keys = new Set([onFoot ? 'KeyS' : 'KeyW']);
      for (let i = 0; i < 360; i++) game.update(1 / 120);
      expect(dist(start, game.actor.position)).toBeGreaterThan(1);
      expect(game.actor.position.y).toBeLessThan(onFoot ? 96.1 : 94.8);
      expect(game.world.props.find(p => p.sourceId === 'city-park-2-2-fountain')?.alive).toBe(true);
    }
  });
});

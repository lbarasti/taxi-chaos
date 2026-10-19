import { describe, expect, it } from 'vitest';
import fixture from './fixtures/second-coast.json';
import { copyDefaultMap } from './default';
import { compileMap } from './compile';
import { MapHistory, type MapOperation } from './operations';
import { validateMap } from './validation';
import { Game } from '../game';
import { World, district, blocksWalking } from '../world';
import { Body, contact, dist, vec } from '../physics';
import { createVehicleBody, vehicleDefinition } from '../vehicles';
import { importMap } from './serialization';

function secondCoast() {
  const document = copyDefaultMap();
  for (const key of Object.keys(fixture) as (keyof typeof fixture)[])
    (document[key] as unknown[]).push(...structuredClone(fixture[key]));
  return document;
}
describe('compositional map content', () => {
  it('authors a second coast entirely through independent data collections', () => {
    const document = secondCoast(),
      map = compileMap(document),
      world = new World(map);
    expect(validateMap(document, map, world).errors).toBe(0);
    expect(map.terrain.sample(vec(-15, -50))).toBe('sand');
    expect(map.terrain.sample(vec(-3, -50))).toBe('paving');
    expect(map.land.inOcean(vec(15, -45))).toBe(false);
    expect(map.land.inOcean(vec(25, -45))).toBe(true);
    expect(map.presentation.shorelines.some((s) => s.landId === 'cove-land')).toBe(true);
    expect(world.props.find((p) => p.sourceId === 'cove-hotel')).toMatchObject({
      kind: 'building',
      presentation: { fallback: 'resort' },
    });
    expect(world.props.find((p) => p.sourceId === 'cove-tower')?.kind).toBe('lifeguard-tower');
    expect(world.people.some((p) => p.home.x === -3 && p.home.y === -55)).toBe(true);
    expect(district(vec(-15, -50), map)).toBe('NORTH COVE');
    const path = world.navigation.roadPath(vec(-3, -55), vec(4, 32), 'walk');
    expect(path.at(-1)).toEqual(vec(4, 32));
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        steps = Math.ceil(dist(a, b) / 0.2);
      for (let j = 0; j <= steps; j++) {
        const probe = new Body(
          a.x + ((b.x - a.x) * j) / steps,
          a.y + ((b.y - a.y) * j) / steps,
          1,
          0.7,
          0.7,
        );
        expect(probe.corners().some(map.land.inOcean)).toBe(false);
        expect(
          [...world.hash.query(probe)].some((p) => blocksWalking(p.kind) && contact(probe, p.body)),
        ).toBe(false);
      }
    }
    expect(world.navigation.roadPath(vec(40, 0), vec(-3, -55)).at(-1)).toEqual(vec(-3, 0));
  });
  it('samples a second sand patch without creating land, objects or access', () => {
    const document = copyDefaultMap(),
      outline = [vec(38, 34), vec(48, 34), vec(48, 46), vec(38, 46)];
    document.terrainRegions.push({
      id: 'extra-sand',
      owner: 'city',
      outline,
      surface: 'sand',
      priority: 100,
    });
    const map = compileMap(document),
      game = new Game(map, false, false),
      def = vehicleDefinition('car');
    const body = createVehicleBody(def, vec(42, 40));
    expect(map.terrain.handling(body, def.physics.tyres, def.terrain).coverage).toBe(1);
    expect(game.world.props.length).toBe(new World().props.length);
    expect(game.world.navigation.access.areaAt(body.position)).toBeUndefined();
    game.player.body.position = vec(42, 40);
    game.start();
    game.settings.noPolice = true;
    game.update(1 / 120);
    expect(game.player.dynamics.surface.grip).toBeCloseTo(0.22);
    expect(game.snapshot().surface).toBe('sand');
    // Material alone never creates dry land.
    document.terrainRegions[document.terrainRegions.length - 1].outline = [
      vec(0, -100),
      vec(10, -100),
      vec(10, -90),
      vec(0, -90),
    ];
    const water = compileMap(document);
    expect(water.terrain.sample(vec(5, -95))).toBe('sand');
    expect(water.land.inOcean(vec(5, -95))).toBe(true);
  });
  it('resolves overlaps identically after document reordering and detaches/freeze inputs', () => {
    const document = secondCoast(),
      map = compileMap(document);
    document.terrainRegions.reverse();
    document.terrainRegions[0].outline[0].x += 1;
    expect(map.terrain.sample(vec(-3, -50))).toBe('paving');
    expect(Object.isFrozen(map.terrain.regions[0].outline[0])).toBe(true);
    const reordered = secondCoast();
    reordered.terrainRegions.reverse();
    expect(compileMap(reordered).terrain.sample(vec(-3, -50))).toBe('paving');
  });
  it('supports all compositional records in atomic editing, serialization and undo/redo', () => {
    const history = new MapHistory(),
      before = history.export();
    const operations = Object.entries(fixture).flatMap(([collection, records]) =>
      records.map((descriptor) => ({ type: 'add', collection, descriptor })),
    ) as MapOperation[];
    history.apply({ baseRevision: history.snapshot().revision, operations });
    const after = history.export();
    expect(importMap(after).accessEdges.some((e) => e.id === 'cove-path')).toBe(true);
    history.undo();
    expect(history.export()).toBe(before);
    history.redo();
    expect(history.export()).toBe(after);
    const snapshot = history.snapshot();
    expect(() =>
      history.apply({
        baseRevision: snapshot.revision,
        operations: [{ type: 'delete', targetId: 'cove-inner' }],
      }),
    ).toThrow(/known access nodes/);
    expect(history.snapshot()).toEqual(snapshot);
    expect(() => importMap(JSON.stringify({ ...snapshot.document, schemaVersion: 3 }))).toThrow(
      /unsupported schema/,
    );
  });
  it('reports blocked access using stable edge identities', () => {
    const document = secondCoast();
    document.objectPlacements.find((p) => p.id === 'cove-tower')!.position = vec(-3, -30);
    const findings = validateMap(document).findings;
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: 'walking-entrance-blocked',
        entityIds: ['cove-path', 'cove-inner', 'cove-exit'],
      }),
    );
  });
});

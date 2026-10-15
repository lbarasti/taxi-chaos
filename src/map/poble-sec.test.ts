import { describe, expect, it } from 'vitest';
import { compileMap } from './compile';
import { copyDefaultMap } from './default';
import { Body, add, contact, dist, scale, sub, vec } from '../physics';
import { World } from '../world';
import { createVehicleBody, vehicleDefinition } from '../vehicles';

describe('Poble-sec hillside and junctions', () => {
  it('keeps the Fern landing clear for full car and truck footprints on both lanes', () => {
    const map = compileMap(copyDefaultMap()), world = new World(map);
    const road = map.country.COUNTRY_ROADS.find(road => road.id === 'fern-road')!;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], size = dist(a, b);
      const angle = Math.atan2(b.y - a.y, b.x - a.x), steps = Math.ceil(size / .5);
      for (let j = 0; j <= steps; j++) for (const lane of [-3, 0, 3]) for (const model of ['car', 'truck-loaded'] as const) {
        const position = add(add(a, scale(sub(b, a), j / steps)), vec(-Math.sin(angle) * lane, Math.cos(angle) * lane));
        const body = createVehicleBody(vehicleDefinition(model), position, angle);
        expect(body.corners().some(map.coast.inOcean), `${model}, lane ${lane} enters water`).toBe(false);
        expect([...world.hash.query(body)].filter(prop => contact(body, prop.body)), `${model}, lane ${lane} hits a prop`).toEqual([]);
      }
    }
  });

  it('keeps promenade trees clear of through roads and existing physical props', () => {
    const map = compileMap(copyDefaultMap()), world = new World(map);
    const treeIds = new Set(Array.from({ length: 6 }, (_, i) => `poble-promenade-tree-${i + 1}`));
    const trees = world.props.filter(prop => treeIds.has(prop.sourceId ?? ''));
    expect(trees.length).toBeGreaterThan(0);
    for (const tree of trees) {
      expect(map.country.countryAccess(tree.body.position).distance).toBeGreaterThan(9);
      expect([...world.hash.query(tree.body)].filter(prop => prop !== tree && contact(tree.body, prop.body))).toEqual([]);
      const trunk = new Body(tree.body.position.x, tree.body.position.y, Infinity, tree.body.w, tree.body.h);
      expect(trunk.corners().some(map.coast.inOcean)).toBe(false);
    }
  });

  it('recompiles junction artwork from edited street anchors without moving the hillside', () => {
    const document = copyDefaultMap(), before = compileMap(document);
    const node = document.points.find(point => point.id === 'poble-node-1-1')!;
    node.position.x += 1;
    const after = compileMap(document);
    expect(after.pobleSec!.cells.map(cell => cell.pavement)).not.toEqual(before.pobleSec!.cells.map(cell => cell.pavement));
    expect(after.pobleSec!.park).toEqual(before.pobleSec!.park);
    expect(after.pobleSec!.gardens).toEqual(before.pobleSec!.gardens);
    const road = after.pobleSec!.streets.find(road => road.id === 'poble-east-1-0')!;
    expect(road.points.at(-1)).toEqual(node.position);
    expect(Object.isFrozen(after.pobleSec!.cells[0].pavement[0])).toBe(true);
    for (const approach of after.pobleSec!.approaches) {
      expect(approach.asphalt.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      expect(approach.asphalt.some(after.coast.inOcean), approach.id).toBe(false);
    }
    for (const junction of after.pobleSec!.junctions) {
      expect(junction.asphalt.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      expect(junction.asphalt.some(after.coast.inOcean)).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { copyDefaultMap } from './default';
import { compileMap } from './compile';
import { MapHistory } from './operations';
import { validateMap } from './validation';
import { World, createNavigation } from '../world';
import { Body, dist, vec, type Vec } from '../physics';

function assertDrySweep(world: World, a: Vec, b: Vec) {
  const steps = Math.ceil(dist(a, b) / 0.25);
  for (let i = 0; i <= steps; i++) {
    const probe = new Body(
      a.x + ((b.x - a.x) * i) / steps,
      a.y + ((b.y - a.y) * i) / steps,
      1,
      0.7,
      0.7,
    );
    expect(probe.corners().some(world.map.coast.inOcean)).toBe(false);
  }
}

describe('PR 51 review regressions', () => {
  it('validates generated villas, scenery, harbour objects and guardrails against the runtime colliders', () => {
    const document = copyDefaultMap(),
      baseline = new World(compileMap(document));
    const targets = [
      baseline.props.find(
        (p) => p.sourceId === 'villa-pinecrest' && p.label !== 'VILLA GUEST HOUSE',
      )!,
      baseline.props.find((p) => !p.sourceId && p.kind === 'tree' && p.body.position.x > 310)!,
      baseline.props.find((p) => p.kind === 'container')!,
      baseline.props.find(
        (p) =>
          p.kind === 'guardrail' &&
          p.body.position.x < 0 &&
          p.body.position.y > 20 &&
          p.body.position.y < 200,
      )!,
    ];
    const paths = targets.map((prop, i) => {
      expect(prop).toBeDefined();
      const a = prop.body.toWorld(vec(-prop.body.w / 2 - 0.5, 0));
      const b = prop.body.toWorld(vec(prop.body.w / 2 + 0.5, 0));
      // The obstruction must be the generated collider, not incidental ocean.
      assertDrySweep(baseline, a, b);
      const from = `generated-access-from-${i}`,
        to = `generated-access-to-${i}`;
      document.accessNodes.push(
        { id: from, owner: 'highlands', position: a, road: false },
        { id: to, owner: 'highlands', position: b, road: false },
      );
      document.accessEdges.push({
        id: `generated-access-edge-${i}`,
        owner: 'highlands',
        fromNode: from,
        toNode: to,
        modes: ['walk'],
      });
      return { a, b, from, to, id: `generated-access-edge-${i}` };
    });
    const map = compileMap(document),
      world = new World(map),
      standalone = createNavigation(map);
    const findings = validateMap(document, map, world).findings;
    for (const { a, b, from, to, id } of paths) {
      expect(world.navigation.access.clear(a, b, 'walk')).toBe(false);
      expect(standalone.access.clear(a, b, 'walk')).toBe(false);
      expect(findings).toContainEqual(
        expect.objectContaining({ code: 'walking-entrance-blocked', entityIds: [id, from, to] }),
      );
    }
  });

  it('updates clearance and graph routing after obstacles are added or destroyed without sharing live worlds', () => {
    const map = compileMap(copyDefaultMap()),
      world = new World(map),
      other = new World(map);
    const start = vec(40, 246.5),
      a = vec(40, 243),
      b = vec(40, 246.5);
    expect(world.navigation.access.clear(a, b, 'walk')).toBe(true);
    expect(world.navigation.access.route(start, 'walk').length).toBeGreaterThan(0);
    const wall = world.add('building', 100, 244.5, 400, 0.8, '#777777');
    expect(world.navigation.access.clear(a, b, 'walk')).toBe(false);
    expect(world.navigation.access.route(start, 'walk')).toEqual([]);
    expect(other.navigation.access.clear(a, b, 'walk')).toBe(true);
    wall.alive = false;
    expect(world.navigation.access.clear(a, b, 'walk')).toBe(true);
    expect(world.navigation.access.route(start, 'walk').length).toBeGreaterThan(0);
  });

  it('translates district-owned access endpoints once and preserves their edges through undo and redo', () => {
    const document = copyDefaultMap();
    document.accessNodes.push(
      { id: 'estate-access-a', owner: 'southern-estates', position: vec(140, 430), road: false },
      { id: 'estate-access-b', owner: 'southern-estates', position: vec(145, 430), road: false },
    );
    const edge = {
      id: 'estate-access-link',
      owner: 'southern-estates',
      fromNode: 'estate-access-a',
      toNode: 'estate-access-b',
      modes: ['walk' as const],
    };
    document.accessEdges.push(edge);
    const history = new MapHistory(document),
      before = history.export();
    history.apply({
      baseRevision: history.snapshot().revision,
      operations: [
        { type: 'translate', targetId: 'southern-estates', delta: vec(0, 20) },
        { type: 'envelope', min: vec(-50, -180), max: vec(540, 600) },
      ],
    });
    const after = history.export(),
      moved = history.snapshot().document;
    expect(moved.accessNodes.find((n) => n.id === edge.fromNode)!.position).toEqual(vec(140, 450));
    expect(moved.accessNodes.find((n) => n.id === edge.toNode)!.position).toEqual(vec(145, 450));
    expect(moved.accessEdges.find((e) => e.id === edge.id)).toEqual(edge);
    history.undo();
    expect(history.export()).toBe(before);
    history.redo();
    expect(history.export()).toBe(after);
  });

  it('measures generated source land and rejects an impossible city-to-highlands water gap', () => {
    const document = copyDefaultMap();
    document.constraints = [
      {
        id: 'city-inlet-clearance',
        type: 'water-gap',
        fromLand: 'generated-city',
        toLand: 'generated-highlands',
        direction: vec(1, 0),
        minimum: 500,
        resolution: 1,
      },
    ];
    const map = compileMap(document);
    for (const id of ['generated-city', 'generated-highlands', 'generated-harbour'])
      expect(map.coast.landBoundaries.some((s) => s.landId === id)).toBe(true);
    const result = validateMap(document, map),
      finding = result.findings.find((f) => f.entityIds.includes('city-inlet-clearance'))!;
    expect(finding).toMatchObject({ code: 'water-gap', severity: 'error' });
    expect(Number.isFinite(finding.measured!.gap)).toBe(true);
    expect(finding.measured!.gap).toBeGreaterThan(0);
    expect(finding.measured!.gap).toBeLessThan(500);
    expect(result.waterGap).toBe(finding.measured!.gap);
  });

  it('rejects a directed constraint that cannot observe any facing target boundary', () => {
    const document = copyDefaultMap();
    document.constraints = [
      {
        id: 'unmeasurable-inlet',
        type: 'water-gap',
        fromLand: 'generated-city',
        toLand: 'generated-highlands',
        direction: vec(-1, 0),
        minimum: 500,
        resolution: 1,
      },
    ];
    const result = validateMap(document);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'water-gap',
        severity: 'error',
        measured: { gap: -1, minimum: 500 },
      }),
    );
  });
});

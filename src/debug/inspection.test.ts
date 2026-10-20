import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { InspectionState, inspectPoint } from './inspection';
import { compileMap } from '../map/compile';
import { copyDefaultMap } from '../map/default';
import { vec } from '../physics';

describe('map inspection authority and isolation', () => {
  it('explains terrain precedence including equal-priority stable IDs, inclusive edges and ocean defaults', () => {
    const document = copyDefaultMap();
    const outline = [vec(38, 34), vec(48, 34), vec(48, 46), vec(38, 46)];
    document.terrainRegions.push(
      { id: 'inspect-z', owner: 'city', outline, surface: 'paving', priority: 100 },
      { id: 'inspect-a', owner: 'city', outline, surface: 'sand', priority: 100 },
    );
    const game = new Game(compileMap(document), false);
    for (const point of [vec(40, 40), vec(38, 34), vec(48, 40)]) {
      const report = inspectPoint(game, point);
      expect(report.surface).toBe(game.map.terrain.sample(point));
      expect(report.terrainSource).toBe('inspect-z');
      expect(report.hits.filter(hit => hit.kind === 'terrain').map(hit => hit.id)).toEqual(['inspect-z', 'inspect-a']);
      expect(report.hits.find(hit => hit.id === 'inspect-z')?.detail).toContain('WINNER');
    }
    expect(inspectPoint(game, vec(-500, -500))).toMatchObject({ dryLand: false, surface: 'road', terrainSource: null, hits: [] });
    const pool = game.world.pools[0];
    expect(inspectPoint(game, pool.position).pool).toBe(true);
  });

  it('inspects actual rotated and destroyed bodies, returning detached data and stable authored identities', () => {
    const game = new Game(undefined, false);
    const prop = game.world.props.find(p => p.sourceId && game.map.placements.some(placement => placement.id === p.sourceId))!;
    prop.body.angle = 0.72;
    const hit = inspectPoint(game, prop.body.position).hits.find(hit => hit.id === prop.sourceId)!;
    expect(hit.outline).toEqual(prop.body.corners());
    expect(hit.owner).toBe(game.map.placements.find(p => p.id === prop.sourceId)!.owner);
    hit.outline[0].x = -999;
    expect(inspectPoint(game, prop.body.position).hits.find(hit => hit.id === prop.sourceId)!.outline[0].x).not.toBe(-999);
    prop.alive = false;
    expect(inspectPoint(game, prop.body.position).hits.find(hit => hit.id === prop.sourceId)!.detail).toContain('destroyed');
  });

  it('keeps inspection, solo and invalid automation patches out of map, simulation, preferences and RNG', () => {
    const game = new Game(undefined, false), reference = new Game(undefined, false);
    const before = game.snapshot(), preferences = structuredClone(game.settings), revision = game.map.revision;
    const state = new InspectionState(); state.active = true;
    for (const preset of ['land', 'terrain', 'collision', 'lighting', 'normal'] as const) { state.preset(preset); inspectPoint(game, vec(20, 20)); }
    state.solo('shadows'); state.configure({ propOpacity: 0.25, freeCamera: true, paused: true });
    const prior = structuredClone(state.options);
    expect(() => state.configure({ visible: { props: false }, overlayOpacity: NaN })).toThrow();
    expect(state.options).toEqual(prior);
    expect(() => state.solo('not-a-layer' as 'props')).toThrow();
    expect(game.snapshot()).toEqual(before); expect(game.settings).toEqual(preferences); expect(game.map.revision).toBe(revision);
    expect(game.world.random()).toBe(reference.world.random());
    state.reset();
    expect(state.freeCamera).toBe(false); expect(state.paused).toBe(false);
    expect(Object.values(state.options.visible).every(Boolean)).toBe(true);
  });
});

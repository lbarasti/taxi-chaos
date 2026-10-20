import { describe, expect, it, vi } from 'vitest';
import { copyDefaultMap } from './default';
import { assertMap } from './schema';
import { exportMap, importMap, revision } from './serialization';
import { MapHistory, applyOperations } from './operations';
import { compileMap } from './compile';
import { validateMap } from './validation';
import { createPreview } from './preview';
import { World } from '../world/world';
import { Game } from '../game';
import { Body, contact, dist, vec } from '../physics';

const translate = (history: MapHistory, y = 20) => history.apply({ baseRevision: history.snapshot().revision, operations: [{ type: 'translate', targetId: 'southern-estates', delta: vec(0, y) }, { type: 'envelope', min: vec(-50, -180), max: vec(540, 600) }] });
describe('map document and transactional editing', () => {
  it('has a canonical lossless round trip and resolved historical south positions', () => {
    const d = copyDefaultMap(), json = exportMap(d);
    expect(exportMap(importMap(json))).toBe(json); expect(revision(importMap(json))).toBe(revision(d));
    expect(d.villas.find(v => v.id === 'villa-the-laurels')!.position).toEqual(vec(105, 414));
    expect(d.golf.center).toEqual(vec(174, 487));
    expect(compileMap(d).country.GOLF_CART_ROUTE[0]).toEqual(vec(144, 470));
  });
  it.each(['version', 'duplicate', 'reference', 'finite', 'dimension', 'extra', 'pinned', 'ordering', 'workload'])('rejects malformed imports: %s', kind => {
    const d = copyDefaultMap();
    if (kind === 'version') (d as { schemaVersion: number }).schemaVersion = 99;
    if (kind === 'duplicate') d.villas[0].id = d.points[0].id;
    if (kind === 'reference') d.roads[0].from = 'missing-node';
    if (kind === 'finite') d.points[0].position.x = NaN;
    if (kind === 'dimension') d.golf.width = 0;
    if (kind === 'extra') Object.assign(d, { surprise: true });
    if (kind === 'pinned') d.points.find(p => p.id === 'node-00')!.position.y++;
    if (kind === 'ordering') d.landRegions[0] = { id:'test-land', owner:'beach', outline:Array.from({length:101},()=>vec()) };
    if (kind === 'workload') d.roads.forEach(r => r.via = Array.from({ length: 20 }, (_, i) => i % 2 ? 'shore-00' : 'shore-10'));
    expect(() => assertMap(d)).toThrow();
  });
  it('rejects unknown, nonfinite and stale batches atomically without clearing redo', () => {
    const h = new MapHistory(); translate(h); h.undo(); const before = h.snapshot();
    for (const operations of [
      [{ type: 'translate', targetId: 'southern-estates', delta: vec(0, 10) }, { type: 'move', targetId: 'missing', position: vec() }],
      [{ type: 'move', targetId: 'node-09', position: vec(Infinity, 0) }],
      [{ type: 'move', targetId: 'node-00', position: vec(0, 0) }],
      [{ type: 'resize', targetId: 'golf-course', width: -1, height: 20 }],
    ]) expect(() => h.apply({ baseRevision: before.revision, operations: operations as Parameters<MapHistory['apply']>[0]['operations'] })).toThrow();
    expect(() => h.apply({ baseRevision: 'stale', operations: [{ type: 'translate', targetId: 'southern-estates', delta: vec(0, 10) }] })).toThrow(/Stale/);
    expect(h.snapshot()).toEqual(before);
  });
  it('detaches snapshots, descriptions and operation results', () => {
    const h = new MapHistory(), snapshot = h.snapshot(); snapshot.document.golf.center.x = 0;
    const description = h.describe('southern-estates'); description.members.length = 0;
    const result = translate(h); result.document.villas[0].position.x = 0;
    expect(h.snapshot().document.golf.center).toEqual(vec(174, 507));
    expect(h.snapshot().document.villas[0].position.x).toBe(334);
    expect(h.describe('southern-estates').members.length).toBeGreaterThan(20);
  });
  it('carries composites once, pins north attachments, weights seams and restores exactly', () => {
    const h = new MapHistory(), before = h.export(); const result = translate(h);
    const map = compileMap(result.document);
    expect(map.country.VILLAS.find(v => v.id === 'villa-the-laurels')!.position).toEqual(vec(105, 434));
    expect(map.country.VILLA_POOLS[6].position).toEqual(vec(119.25, 437));
    expect(map.country.GOLF_COURSE.clubhouse).toEqual(vec(127, 501));
    expect(map.country.GOLF_HOLES[0].tee).toEqual(vec(146, 500));
    expect(map.country.GOLF_CART_ROUTE[0]).toEqual(vec(144, 490));
    expect(result.document.points.find(p => p.id === 'southwoods-seam')!.position).toEqual(vec(337, 334));
    expect(result.document.points.find(p => p.id === 'southwoods-fixed')!.position).toEqual(vec(368, 219));
    expect(result.document.points.find(p => p.id === 'node-01')!.position).toEqual(vec(310, 80));
    expect(result.affectedConnections).toContain('southwoods-drive');
    expect(result.document.ridges[3].points[0]).toEqual(vec(16, 431));
    const after = h.export(); h.undo(); expect(h.export()).toBe(before); h.redo(); expect(h.export()).toBe(after);
  });
  it('moves shared destination nodes once and derives hotel/promenade geometry', () => {
    const h = new MapHistory(); h.apply({ baseRevision: h.snapshot().revision, operations: [
      { type: 'move', targetId: 'fairway-club', position: vec(134, 460) },
      { type: 'translate', targetId: 'hotel-sandpiper', delta: vec(1, 0) },
      { type: 'translate', targetId: 'ocean-walk', delta: vec(0, 1) },
    ] });
    const map = compileMap(h.snapshot().document);
    expect(map.country.HIGHLAND_STOPS[5].position).toEqual(vec(134, 460));
    expect(map.country.COUNTRY_ROADS.find(r => r.id === 'fairway-drive')!.points.at(-1)).toEqual(vec(134, 460));
    expect(map.objects['hotel-sandpiper'].position.x).toBe(163);
    expect(map.terrain.regions.find(r=>r.id==='ocean-walk')!.bounds.min.y).toBe(248);
  });
  it('imports as one undoable transaction and failed imports preserve history', () => {
    const h = new MapHistory(), original = h.export(), other = new MapHistory(); translate(other);
    h.import(other.export()); expect(h.export()).toBe(other.export());
    expect(() => h.import('{"schemaVersion":99}')).toThrow();
    h.undo(); expect(h.export()).toBe(original);
    h.redo(); expect(h.export()).toBe(other.export());
  });
});
describe('map compilation, gameplay and validation', () => {
  it('two worlds coexist with relocated hashes, pools, residents, carts and routes', () => {
    const h = new MapHistory(); translate(h);
    const original = new Game(undefined, false), preview = new Game(compileMap(h.snapshot().document), false);
    expect(original.world.pools[6].position).toEqual(vec(119.25, 417)); expect(preview.world.pools[6].position).toEqual(vec(119.25, 437));
    expect(preview.vehicles.find(v => v.cart)!.body.position).toEqual(vec(144, 490));
    expect(preview.world.people.some(p => p.home.x === 117 && p.home.y === 426)).toBe(true);
    const probe = new Body(105, 434, 1, 16, 10);
    expect([...preview.world.hash.query(probe)].some(p => p.sourceId === 'villa-the-laurels' && contact(probe, p.body))).toBe(true);
    expect([...original.world.hash.query(probe)].some(p => p.sourceId === 'villa-the-laurels' && contact(probe, p.body))).toBe(false);
    expect(preview.map.land.inOcean(vec(132, 478))).toBe(false);
    const route = preview.world.navigation.roadPath(vec(242, 470), vec(132, 478));
    expect(route.at(-1)).toEqual(vec(132, 478)); expect(route.every(p => !preview.map.land.inOcean(p))).toBe(true);
  });
  it('deterministically compiles scenery against the edited geometry', () => {
    const original = new World(), h = new MapHistory(); translate(h);
    const map = compileMap(h.snapshot().document), a = new World(map), b = new World(compileMap(h.snapshot().document));
    expect(a.props).toEqual(b.props);
    expect(a.people).toEqual(b.people);
  });
  it('validates the shipped map and reversible south move with measured gap', () => {
    const d = copyDefaultMap(), baseline = validateMap(d); expect(baseline.errors).toBe(0); expect(baseline.waterGap).toBeGreaterThanOrEqual(110);
    const h = new MapHistory(d); translate(h); const result = validateMap(h.snapshot().document);
    expect(result.errors).toBe(0); expect(result.waterGap! - baseline.waterGap!).toBeCloseTo(20);
  });
  it('keeps insufficient clearance editable and blocks invalid gameplay previews', () => {
    const h = new MapHistory(); h.apply({ baseRevision: h.snapshot().revision, operations: [{ type: 'translate', targetId: 'southern-estates', delta: vec(0, -35) }] });
    expect(validateMap(h.snapshot().document).findings.some(f => f.code === 'water-gap' && f.severity === 'error')).toBe(true);
    expect(() => createPreview(h.snapshot().document)).toThrow(/blocked/);
  });
  it('reports self-intersections in a shared land ring', () => {
    const h = new MapHistory(); h.apply({ baseRevision: h.snapshot().revision, operations: [{ type: 'move', targetId: 'shore-17', position: vec(500, 530) }] });
    expect(validateMap(h.snapshot().document).findings.some(f => f.code === 'self-intersecting-land')).toBe(true);
  });
  it('reports translated content outside the map envelope', () => {
    const h = new MapHistory(); h.apply({ baseRevision: h.snapshot().revision, operations: [{ type: 'translate', targetId: 'southern-estates', delta: vec(0, 30) }] });
    expect(validateMap(h.snapshot().document).findings.some(f => f.code === 'outside-envelope')).toBe(true);
  });
  it('detects road anchor water, disconnected access, object overlaps and blocked walking entrance', () => {
    const d = copyDefaultMap(), h = new MapHistory(d);
    h.apply({ baseRevision: h.snapshot().revision, operations: [{ type: 'move', targetId: 'fairway-a', position: vec(208, 310) }] });
    expect(validateMap(h.snapshot().document).findings.some(f => f.code === 'road-enters-water' && f.measured?.length === 7.8)).toBe(true);
    const detached = copyDefaultMap(); detached.roads = detached.roads.filter(r => r.id !== 'southwoods-drive' && r.id !== 'highland-descent'); detached.boundaryPlacements.forEach(rule=>rule.excludeRoads=rule.excludeRoads.filter(id=>detached.roads.some(r=>r.id===id)));
    expect(validateMap(detached).findings.some(f => f.code === 'disconnected-road')).toBe(true);
    h.undo(); h.apply({ baseRevision: h.snapshot().revision, operations: [{ type: 'move', targetId: 'hotel-sandpiper', position: vec(181, 263) }] });
    const result = validateMap(h.snapshot().document);
    expect(result.findings.some(f => f.code === 'walking-entrance-blocked')).toBe(true); expect(result.findings.some(f => f.code === 'object-overlap')).toBe(true);
  });
  it('builds persistence-disabled previews without reading normal storage', () => {
    const storage = { getItem: vi.fn(() => '{"cash":999}'), setItem: vi.fn(), removeItem: vi.fn() }; vi.stubGlobal('localStorage', storage);
    try {
      const h = new MapHistory(); translate(h); const game = createPreview(h.snapshot().document);
      expect(game.save.cash).toBe(80); expect(storage.getItem).not.toHaveBeenCalled();
      game.configure({ gore: true, difficulty: 'chaos' }); game.save.cash += 1000; game.persist(); game.buy('engine');
      expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
      expect(game.job.pickup).toEqual(vec(132, 478)); expect(game.job.dropoff).toEqual(vec(242, 470));
      for (let i = 0; i < 120; i++) game.update(1 / 120);
      expect(game.job.stage).toBe('dropoff');
      expect(game.health).toBe(100); expect(game.player.sinking).toBeUndefined();
      expect(dist(game.actor.position, vec(132, 478))).toBeLessThan(2);
      game.resetRun(); expect(game.world.pools[6].position).toEqual(vec(119.25, 437));
    } finally { vi.unstubAllGlobals(); }
  });
  it('uses relocated pool water and the authored beach surf in actual gameplay', () => {
    const h = new MapHistory(); translate(h); const game = new Game(compileMap(h.snapshot().document), false);
    game.start(); game.settings.noPolice = true;
    const pool = game.world.pools[6]; game.player.body.position = { ...pool.position };
    game.update(1 / 120); expect(game.player.sinking?.pool).toBe(pool);
    game.resetRun(); game.settings.noPolice = true;
    game.player.body.position = vec(64, 280);
    game.update(1 / 120); expect(game.player.sinking).toBeDefined(); expect(game.player.sinking?.pool).toBeUndefined();
  });
});

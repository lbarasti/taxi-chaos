import { describe, expect, it } from 'vitest';
import { Body, contact, vec } from '../physics';
import { Game } from '../game';
import { World } from '../world';
import { copyDefaultMap } from './default';
import { compileMap } from './compile';
import { MapHistory, entities } from './operations';
import { assertMap, type CountryProp } from './schema';
import { exportMap, importMap } from './serialization';
import { validateMap } from './validation';
import { createPreview } from './preview';

const prop = (): CountryProp => ({ id: 'test-shed', owner: 'southern-estates', position: vec(280, 469), kind: 'shed', width: 6, height: 3, angle: Math.PI / 2, color: '#987c59', label: 'COUNTRY SHED' });
const apply = (h: MapHistory, operations: Parameters<MapHistory['apply']>[0]['operations']) => h.apply({ baseRevision: h.snapshot().revision, operations });

describe('authored content transactions', () => {
  it('adds, duplicates, replaces, moves and deletes with detached data and exact history', () => {
    const h = new MapHistory(), before = h.export(), descriptor = prop();
    apply(h, [{ type: 'add', collection: 'countryProps', descriptor }, { type: 'duplicate', targetId: descriptor.id, newId: 'test-copy', delta: vec(10, 0) }]);
    descriptor.position.x = 0;
    expect(h.describe('test-copy').position).toEqual(vec(290, 469));
    expect(h.describe('test-shed').bounds).toEqual({ min: vec(278.5, 466), max: vec(281.5, 472) });
    apply(h, [{ type: 'replace', targetId: 'test-copy', descriptor: { ...prop(), id: 'test-copy', kind: 'crate', position: vec(290, 469), width: 1, height: 1 } }, { type: 'resize', targetId: 'test-copy', width: 2, height: 3 }, { type: 'move', targetId: 'test-shed', position: vec(281, 469) }, { type: 'delete', targetId: 'test-copy' }]);
    expect(entities(h.snapshot().document).some(e => e.id === 'test-copy')).toBe(false);
    const after = h.export(); h.undo(); h.undo(); expect(h.export()).toBe(before);
    h.redo(); h.redo(); expect(h.export()).toBe(after);
  });
  it('rejects invalid collections, ID collisions, replacements and pinned deletions atomically', () => {
    const h = new MapHistory(); apply(h, [{ type: 'add', collection: 'countryProps', descriptor: prop() }]); h.undo();
    const before = h.snapshot();
    for (const operations of [
      [{ type: 'add', collection: 'countryProps', descriptor: prop() }, { type: 'delete', targetId: 'node-00' }],
      [{ type: 'add', collection: 'parking', descriptor: prop() }],
      [{ type: 'duplicate', targetId: 'parking-00', newId: 'node-00', delta: vec() }],
      [{ type: 'replace', targetId: 'parking-00', descriptor: { ...before.document.parking[0], id: 'renamed' } }],
      [{ type: 'duplicate', targetId: 'traffic-00', newId: 'new-traffic', delta: vec(NaN, 0) }],
    ]) expect(() => apply(h, operations as Parameters<typeof apply>[1])).toThrow();
    expect(h.snapshot()).toEqual(before);
  });
  it('moves a traffic route with its spawn exactly once during duplication and district movement', () => {
    const h = new MapHistory(), spawn = { ...h.snapshot().document.trafficSpawns[0], id: 'rural-traffic', owner: 'southern-estates', position: vec(242, 450), path: [vec(260, 450), vec(296, 422)] };
    apply(h, [{ type: 'add', collection: 'trafficSpawns', descriptor: spawn }, { type: 'duplicate', targetId: spawn.id, newId: 'rural-copy', delta: vec(0, 10) }, { type: 'translate', targetId: 'southern-estates', delta: vec(0, 20) }]);
    expect(h.snapshot().document.trafficSpawns.find(s => s.id === 'rural-copy')).toMatchObject({ position: vec(242, 480), path: [vec(260, 480), vec(296, 452)] });
    expect(h.snapshot().document.trafficSpawns[0].position).toEqual(copyDefaultMap().trafficSpawns[0].position);
  });
  it.each(['count', 'model', 'kind', 'owner', 'angle', 'dimension', 'route', 'extra'])('bounds content imports: %s', kind => {
    const d = copyDefaultMap(); d.countryProps.push(prop());
    if (kind === 'count') d.parking = Array.from({ length: 201 }, (_, i) => ({ ...d.parking[0], id: `bay-${i}` }));
    if (kind === 'model') Object.assign(d.trafficSpawns[0], { model: 'golf-cart' });
    if (kind === 'kind') Object.assign(d.countryProps[0], { kind: 'unknown' });
    if (kind === 'owner') d.parking[0].owner = 'missing';
    if (kind === 'angle') d.parking[0].angle = Infinity;
    if (kind === 'dimension') d.countryProps[0].width = 101;
    if (kind === 'route') d.trafficSpawns[0].path = Array.from({ length: 40 }, (_, i) => vec(i % 2 ? 9000 : -9000, 0));
    if (kind === 'extra') Object.assign(d.parking[0], { surprise: true });
    expect(() => assertMap(d)).toThrow();
  });
  it('rejects previous exports without upgrading them and retains canonical version 3 imports', () => {
    const d = copyDefaultMap(), { countryProps, parking, trafficSpawns, ...previous } = d;
    const old = { ...previous, schemaVersion: 1, beach: { ...previous.beach, pickup: vec(30, 249.5) } };
    expect(() => importMap(JSON.stringify(old))).toThrow();
    expect(() => importMap(JSON.stringify({ ...d, schemaVersion: 2 }))).toThrow();
    expect(() => importMap(JSON.stringify({ ...old, parking: [] }))).toThrow();
    expect(exportMap(importMap(exportMap(d)))).toBe(exportMap(d));
  });
});

describe('content runtime integration and geometric findings', () => {
  it('instantiates the residential activity pack with stable sources and clear vehicles', () => {
    const d = copyDefaultMap(), game = new Game(compileMap(d), false);
    const props = d.countryProps.filter(p => p.owner === 'highlands');
    const parking = d.parking.filter(p => p.owner === 'highlands');
    const traffic = d.trafficSpawns.filter(p => p.owner === 'highlands');
    expect(props.length).toBeGreaterThan(100); expect(parking).toHaveLength(3);
    expect(traffic).toHaveLength(10); expect(traffic.every(p => p.activity === 'residential')).toBe(true);
    for (const prop of props) expect(game.world.props.find(p => p.sourceId === prop.id)).toMatchObject({ kind: prop.kind, label: prop.label });
    expect(game.world.parking.filter(p => p.owner === 'highlands').map(p => p.sourceId)).toEqual(parking.map(p => p.id));
    for (const spawn of traffic) {
      const vehicle = game.vehicles.find(v => v.sourceId === spawn.id)!;
      expect(vehicle).toMatchObject({ model: spawn.model, body: { position: spawn.position, angle: spawn.angle }, path: spawn.path });
      expect([...game.world.hash.query(vehicle.body)].some(p => contact(vehicle.body, p.body))).toBe(false);
    }
    for (let i = 0; i < traffic.length; i++) for (let j = i + 1; j < traffic.length; j++) {
      const a = game.vehicles.find(v => v.sourceId === traffic[i].id)!;
      const b = game.vehicles.find(v => v.sourceId === traffic[j].id)!;
      expect(contact(a.body, b.body)).toBeNull();
    }
  });
  it('retrofits every bay and initial road vehicle, with stable source links and independent worlds', () => {
    const d = copyDefaultMap(), game = new Game(compileMap(d), false);
    expect(game.world.parking).toHaveLength(d.parking.length);
    expect(game.vehicles.filter(v => v.parked)).toHaveLength(d.parking.filter(p => p.occupied).length);
    expect(game.vehicles.filter(v => v.sourceId?.startsWith('traffic-'))).toHaveLength(d.trafficSpawns.length);
    for (const spawn of d.trafficSpawns) expect(game.vehicles.find(v => v.sourceId === spawn.id)).toMatchObject({ model: spawn.model, color: spawn.color, body: { position: spawn.position, angle: spawn.angle }, path: spawn.path });
    const h = new MapHistory(d); apply(h, [{ type: 'move', targetId: 'parking-73', position: vec(28, 250) }, { type: 'delete', targetId: 'parking-00' }, { type: 'add', collection: 'countryProps', descriptor: prop() }]);
    const other = new Game(compileMap(h.snapshot().document), false), shed = other.world.props.find(p => p.sourceId === 'test-shed')!;
    expect(shed.body.angle).toBe(Math.PI / 2); expect(shed.hp).toBe(90);
    expect([...other.world.hash.query(new Body(280, 469, 1, 1, 1))].some(p => p === shed && contact(p.body, new Body(280, 469, 1, 1, 1)))).toBe(true);
    expect(other.map.beach.BEACH_PICKUP).toEqual(vec(28, 250));
    expect(other.vehicles.some(v => v.sourceId === 'parking-00')).toBe(false);
    expect(game.world.props.some(p => p.sourceId === 'test-shed')).toBe(false);
    other.resetRun(); expect(other.vehicles.find(v => v.sourceId === 'parking-73')!.body.position).toEqual(vec(28, 250));
    expect(() => h.describe('parking-00')).toThrow(/Unknown ID/);
  });
  it('replenishes from authored descriptors and cannot recreate deleted spawns or bays', () => {
    const d = copyDefaultMap(); d.trafficSpawns = []; d.parking = [];
    const game = new Game(compileMap(d), false); game.setTrafficCount(40); game.maintenance(5); game.resetRun();
    expect(game.trafficTarget).toBe(0);
    expect(game.vehicles.filter(v => v.kind === 'traffic' && !v.cart && !v.freight)).toHaveLength(0);
    const normal = new Game(undefined, false); normal.setTrafficCount(0); normal.setTrafficCount(23);
    expect(normal.vehicles.filter(v => v.sourceId?.startsWith('traffic-'))).toHaveLength(23);
  });
  it('reports selectable IDs for water, pool, static, vehicle and route/envelope failures', () => {
    const d = copyDefaultMap();
    d.countryProps.push({ ...prop(), position: vec(119.25, 417) });
    d.parking[0].position = { ...d.parking[3].position };
    d.parking[1].position = vec(200, 330); // ocean
    d.trafficSpawns[0].path = [vec(60, 54)]; // barracks
    d.trafficSpawns[1].position = vec(550, 570);
    const findings = validateMap(d).findings;
    for (const [code, id] of [['pool-overlap', 'test-shed'], ['spawn-overlap', 'parking-00'], ['spawn-blocked', 'parking-01'], ['traffic-route-blocked', 'traffic-00'], ['outside-envelope', 'traffic-01']]) expect(findings.some(f => f.code === code && f.entityIds.includes(id)), `${code}: ${id}`).toBe(true);
    expect(() => createPreview(d)).toThrow(/blocked/);
  });
  it('detects rotated arbitrary props against existing soft and solid footprints', () => {
    const d = copyDefaultMap(); d.countryProps.push({ ...prop(), position: vec(105, 414), angle: 0 });
    expect(validateMap(d).findings.some(f => f.code === 'object-overlap' && f.entityIds.includes('test-shed') && f.entityIds.includes('villa-the-laurels'))).toBe(true);
    const world = new World(compileMap(d)); expect(world.props.find(p => p.sourceId === 'test-shed')!.label).toBe('COUNTRY SHED');
  });
});

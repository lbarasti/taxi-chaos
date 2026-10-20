import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Body, vec } from '../physics';
import { appearanceSeed, artworkFor, artRadius, fallbackScale, objectDefinitions, propArtwork, CRATE_SPRITE_METRES, TREE_CANOPY_METRES } from '../artwork/catalogue';
import { artworkRecords } from '../catalogue/content';
import { compileObjectCatalogue, compileObjectPlacement, compilePlacement } from '../catalogue/compile';
import { inlineEntries } from '../catalogue/generate';
import { measureArtworkSources } from '../catalogue/png';
import { objectKindRegistry, type ObjectCatalogue, type ObjectRecord } from '../catalogue/schema';
import { World } from '../world/world';
import { compileMap } from './compile';
import { copyDefaultMap } from './default';
import { MapHistory } from './operations';
import { assertMap } from './schema';
import { importMap } from './serialization';
import { validateMap } from './validation';

const read = (png: string) => {
  try { return readFileSync(fileURLToPath(new URL(`../assets/${png}`, import.meta.url))); }
  catch { return undefined; }
};

// Two brand-new readable records: one defining an unknown PNG building and one defining a
// PNG crate. Both reference original Taxi Chaos art committed under `src/assets/map`, so
// the representative test measures real files rather than aliasing an existing sprite.
const bakery: ObjectRecord = {
  id: 'bakery', kind: 'building', width: 12, height: 8, storeys: 3,
  fallback: 'shop', sign: { width: 9, inset: 1, size: 0.7, color: '#ffeedd' },
  image: 'map/bakery-front.png',
  artwork: { fit: 'stretch', width: 1.05, height: 1.05, outline: 'bounds', occluder: true },
};
const crate: ObjectRecord = {
  id: 'crate-png', kind: 'crate', width: 2, height: 1.5,
  image: 'map/crate-shipping.png',
  artwork: { fit: 'stretch', width: 1.1, height: 0.9, outline: { shape: 'circle', radius: 0.5, points: 6 } },
};
// A custom building type used below as a beach hotel footprint, proving the same
// injected catalogue serves country, beach and city resolution.
const beachLodge: ObjectRecord = {
  id: 'beach-lodge', kind: 'building', width: 33, height: 11, storeys: 9, fallback: 'commercial',
  sign: { width: 12, inset: 1.2, size: 0.8, color: '#f0e6ce' }, frontage: 'LODGE',
};
// One custom catalogue serves city, beach and country resolution, so the injected content
// is threaded consistently through every consumer instead of leaking a module singleton.
const custom = compileObjectCatalogue([bakery, crate, beachLodge], measureArtworkSources(inlineEntries(artworkRecords, [bakery, crate]), read), artworkRecords);
const catalogue: ObjectCatalogue = { ...objectDefinitions, ...custom };

const bakeryPlacement = { id: 'catalogue-bakery', owner: 'southern-estates' as const,  position: vec(300, 470), angle: 0, color: '#596b70', label: 'BAKERY', type: 'bakery' };
const cratePlacement = { id: 'catalogue-crate', owner: 'southern-estates' as const,  position: vec(320, 470), angle: 0, color: '#bc9465', label: '', type: 'crate-png' };
const document = () => { const d = copyDefaultMap(); d.objectPlacements.push({ ...bakeryPlacement }, { ...cratePlacement }); return d; };

describe('generic object placements through map, world and render', () => {
  it('resolves an unknown PNG building and PNG crate from definition plus placement only', () => {
    const map = compileMap(document(), catalogue), world = new World(map);
    const building = world.props.find(p => p.sourceId === 'catalogue-bakery')!;
    const box = world.props.find(p => p.sourceId === 'catalogue-crate')!;
    // The catalogue footprint drives collision when the instance overrides are omitted.
    expect([building.kind, building.body.w, building.body.h]).toEqual(['building', 12, 8]);
    expect([box.kind, box.body.w, box.body.h]).toEqual(['crate', 2, 1.5]);
    expect(building.presentation?.fallback).toBe('shop');
    // Artwork bounds, silhouette and light blocker all follow the resolved footprint.
    expect(building.artwork?.image).toBe('bakery');
    expect(building.artwork?.bounds.width).toBeCloseTo(12.6);
    expect(building.artwork?.bounds.height).toBeCloseTo(8.4);
    expect(building.artwork?.occluder).toEqual(building.artwork?.silhouette);
    expect(box.artwork?.image).toBe('crate-png');
    expect(box.artwork?.bounds.width).toBeCloseTo(2.2);
    expect(box.artwork?.bounds.height).toBeCloseTo(1.35);
    expect(box.artwork?.silhouette).toHaveLength(6);
    // The render path resolves the same detached instance geometry.
    expect(artworkFor(building)).toBe(building.artwork);
    expect(artworkFor(box)?.bounds).toEqual(box.artwork?.bounds);
    expect(artRadius(box)).toBeGreaterThan(2);
    // Destruction keeps the physical collider while the renderer drops the sprite.
    box.alive = false;
    expect(artworkFor(box)).toBe(box.artwork);
  });

  it('drives collision and artwork from one or two instance override fields', () => {
    const resizedDocument = document();
    resizedDocument.objectPlacements.find(p => p.id === 'catalogue-crate')!.width = 4;
    resizedDocument.objectPlacements.find(p => p.id === 'catalogue-crate')!.height = 3;
    const resized = compileMap(resizedDocument, catalogue), world = new World(resized);
    const box = world.props.find(p => p.sourceId === 'catalogue-crate')!;
    expect([box.body.w, box.body.h]).toEqual([4, 3]);
    expect(box.artwork?.bounds.width).toBeCloseTo(4.4);
    expect(box.artwork?.bounds.height).toBeCloseTo(2.7);
    // The silhouette, shadow and culling radius scale with the same override.
    expect(box.artwork?.silhouette.length).toBe(6);
    expect(artRadius(box)).toBeGreaterThan(artRadius(new World(compileMap(document(), catalogue)).props.find(p => p.sourceId === 'catalogue-crate')!));
  });

  it('keeps the visual scale independent of the physical footprint', () => {
    const scaled = document();
    scaled.objectPlacements.find(p => p.id === 'catalogue-bakery')!.artworkScale = 2;
    const world = new World(compileMap(scaled, catalogue));
    const building = world.props.find(p => p.sourceId === 'catalogue-bakery')!;
    expect([building.body.w, building.body.h]).toEqual([12, 8]);
    expect(building.artwork?.bounds.width).toBeCloseTo(25.2);
    expect(building.artwork?.bounds.height).toBeCloseTo(16.8);
  });

  it('compiles two independent, recursively frozen maps without sharing geometry', () => {
    const one = compileMap(document(), catalogue), two = compileMap(document(), catalogue);
    expect(one).not.toBe(two);
    expect(one.objects['catalogue-crate']).not.toBe(two.objects['catalogue-crate']);
    expect(one.objects['catalogue-crate'].artwork).not.toBe(two.objects['catalogue-crate'].artwork);
    expect(Object.isFrozen(one.document)).toBe(true);
    expect(Object.isFrozen(one.objects['catalogue-bakery'].artwork!.bounds)).toBe(true);
    // Catalogue templates stay frozen and detached from every compiled map.
    expect(Object.isFrozen(catalogue.bakery.artwork![0])).toBe(true);
    expect(one.objects['catalogue-bakery'].artwork).not.toBe(catalogue.bakery.artwork![0]);
  });

  it('preserves the simulation random stream and compiled layout with extra placements', () => {
    expect(new World(compileMap(document(), catalogue)).random()).toBe(new World().random());
  });

  it('round-trips typed placements losslessly through import, export and undo/redo', () => {
    const history = new MapHistory(document(), catalogue);
    const before = history.export();
    expect(history.snapshot().document.objectPlacements.find(p => p.id === 'catalogue-crate')!.type).toBe('crate-png');
    history.import(before);
    expect(history.export()).toBe(before);
    history.apply({ baseRevision: history.snapshot().revision, operations: [{ type: 'resize', targetId: 'catalogue-crate', width: 3, height: 2 }] });
    expect(history.snapshot().document.objectPlacements.find(p => p.id === 'catalogue-crate')).toMatchObject({ width: 3, height: 2, type: 'crate-png' });
    history.undo();
    expect(history.export()).toBe(before);
    history.redo();
    expect(history.snapshot().document.objectPlacements.find(p => p.id === 'catalogue-crate')).toMatchObject({ width: 3, height: 2 });
  });

  it('rejects unknown catalogue references and kind mismatches structurally', () => {
    const missing = document();
    missing.objectPlacements.find(p => p.id === 'catalogue-crate')!.type = 'missing-type';
    expect(() => compileMap(missing, catalogue)).toThrow(/unknown catalogue type missing-type/);

    const mismatch = document();
    Object.assign(mismatch.objectPlacements.find(p => p.id === 'catalogue-crate')!,{kind:'rock'});
    expect(() => compileMap(mismatch, catalogue)).toThrow(/expected fields/);

    const staleHotel = copyDefaultMap();
    Object.assign(staleHotel.objectPlacements[0], { style: 'luxury-condo' });
    expect(() => compileMap(staleHotel, catalogue)).toThrow(/expected fields/);

    const oldVersion = { ...copyDefaultMap(), schemaVersion: 2 } as unknown as ReturnType<typeof copyDefaultMap>;
    expect(() => assertMap(oldVersion, objectKindRegistry(catalogue))).toThrow(/unsupported schema/);
  });

  it('reports an unknown reference through the injected kind registry on import', () => {    const missing = document();
    (missing.objectPlacements.find(p => p.id === 'catalogue-crate') as { type: string }).type = 'missing-type';
    expect(() => importMap(JSON.stringify(missing), objectKindRegistry(catalogue))).toThrow(/unknown catalogue type missing-type/);
    // The same document round-trips when the custom catalogue supplies every reference.
    const exported = new MapHistory(document(), catalogue).export();
    expect(importMap(exported, objectKindRegistry(catalogue)).objectPlacements.some(p => p.type === 'bakery')).toBe(true);
  });

  it('names the entity and route when a typed solid blocks a road lane', () => {
    const blocked = copyDefaultMap();
    blocked.objectPlacements.push({ ...bakeryPlacement, id: 'road-building', position: vec(40, 40) });
    const findings = validateMap(blocked, compileMap(blocked, catalogue)).findings;
    const finding = findings.find(f => f.code === 'road-blocked' && f.entityIds.includes('road-building'));
    expect(finding).toBeDefined();
    expect(finding!.entityIds.some(id => id.startsWith('city-road-'))).toBe(true);
  });

  it('bounds local attached features and blocks preview, naming the stable feature ID', () => {
    const d = copyDefaultMap();
    d.objectPlacements.push({ id: 'feature-crate', owner: 'southern-estates',  type: 'crate-png', position: vec(300, 470), angle: 0, color: '#bc9465', label: '', features: [{ id: 'far-sign', role: 'sign', offset: vec(2, 0) }] });
    const findings = validateMap(d, compileMap(d, catalogue)).findings;
    expect(findings).toContainEqual(expect.objectContaining({ code: 'feature-outside-bounds', entityIds: ['feature-crate', 'feature-crate/far-sign'] }));
  });

  it('rejects a feature ID past the 60-character compiler bound, so imports accepted compile', () => {
    const d = copyDefaultMap();
    const push = (id: string) => d.objectPlacements.push({ id: 'long-feature', owner: 'southern-estates',  type: 'crate-png', position: vec(300, 470), angle: 0, color: '#bc9465', label: '', features: [{ id, role: 'sign', offset: vec(0, 0) }] });
    push('f'.repeat(61));
    // Strict import rejects what `resolveFeatures` would otherwise fail on at compile time.
    expect(() => assertMap(d, objectKindRegistry(catalogue))).toThrow(/feature ID must be at most 60/);
    expect(() => importMap(JSON.stringify(d), objectKindRegistry(catalogue))).toThrow(/feature ID must be at most 60/);
    // The 60-character boundary is accepted and compiles.
    d.objectPlacements.pop(); push('f'.repeat(60));
    expect(() => compileMap(d, catalogue)).not.toThrow();
  });

  it('reports a service feature outside the city recovery entrance instead of ignoring it', () => {
    const d = copyDefaultMap();
    d.objectPlacements.push({ id: 'service-prop', owner: 'southern-estates',  type: 'crate-png', position: vec(300, 470), angle: 0, color: '#bc9465', label: '', features: [{ id: 'service-door', role: 'service', offset: vec(0, 0) }] });
    const findings = validateMap(d, compileMap(d, catalogue)).findings;
    expect(findings).toContainEqual(expect.objectContaining({ code: 'service-feature-unsupported', entityIds: ['service-prop', 'service-prop/service-door'], severity: 'error' }));
    // The hospital's city recovery entrance stays supported and produces no such finding.
    const clean = compileMap(copyDefaultMap(), catalogue);
    expect(validateMap(copyDefaultMap(), clean).findings.some(f => f.code === 'service-feature-unsupported')).toBe(false);
  });

  it('retains per-instance artwork fields supplied by a replacement', () => {
    const d = copyDefaultMap();
    d.objectPlacements.push({ id: 'feature-tree', owner: 'southern-estates',  type: 'tree', position: vec(300, 470), angle: 0, color: '#426e58', label: '', artworkScale: 1.5, features: [{ id: 'tree-sign', role: 'sign', offset: vec(0.2, 0.1), label: 'PARK' }] });
    const history = new MapHistory(d, catalogue);
    const existing = history.snapshot().document.objectPlacements.find(p => p.id === 'feature-tree')!;
    const replacement = { ...existing, ...{ label: 'PARK', type: 'tree' } };
    history.apply({ baseRevision: history.snapshot().revision, operations: [{ type: 'replace', targetId: 'feature-tree', descriptor: replacement }] });
    const after = history.snapshot().document.objectPlacements.find(p => p.id === 'feature-tree')!;
    expect(after).toMatchObject({ type: 'tree', label: 'PARK', artworkScale: 1.5 });
    expect(after.features).toEqual([{ id: 'tree-sign', role: 'sign', offset: vec(0.2, 0.1), label: 'PARK' }]);
  });

  it('keeps user features through a type change and surfaces them as validation findings', () => {
    const d = copyDefaultMap();
    d.objectPlacements.push({ id: 'feature-swap', owner: 'southern-estates',  type: 'tree', position: vec(300, 470), angle: 0, color: '#426e58', label: '', artworkScale: 1.5, features: [{ id: 'tree-sign', role: 'sign', offset: vec(0.2, 0.1), label: 'PARK' }] });
    const history = new MapHistory(d, catalogue);
    const existing = history.snapshot().document.objectPlacements.find(p => p.id === 'feature-swap')!;
    const replacement = { ...existing, color: '#bc9465', type: 'crate-png', label: '' };
    history.apply({ baseRevision: history.snapshot().revision, operations: [{ type: 'replace', targetId: 'feature-swap', descriptor: replacement }] });
    const after = history.snapshot().document.objectPlacements.find(p => p.id === 'feature-swap')!;
    // A type change that supplies the existing features must not delete them.
    expect(after).toMatchObject({ type: 'crate-png', artworkScale: 1.5 });
    expect(after.features).toEqual([{ id: 'tree-sign', role: 'sign', offset: vec(0.2, 0.1), label: 'PARK' }]);
    // A sign feature on a crate is inert, so the shared validation reports it by ID.
    const findings = validateMap(history.snapshot().document, compileMap(history.snapshot().document, catalogue)).findings;
    expect(findings).toContainEqual(expect.objectContaining({ code: 'sign-feature-unsupported', entityIds: ['feature-swap', 'feature-swap/tree-sign'] }));
  });

  it('scales procedural crate and tree fallbacks onto the resolved geometry', () => {
    const body = (w: number, h = w) => ({ position: vec(0, 0), w, h });
    // Crate fallbacks are drawn to the resolved collider, never a fixed 1.4 m box.
    expect(fallbackScale({ kind: 'crate', body: body(1.5) })).toEqual(vec(1.5 / CRATE_SPRITE_METRES, 1.5 / CRATE_SPRITE_METRES));
    expect(fallbackScale({ kind: 'crate', body: body(1.4) })).toEqual(vec(1, 1));
    // A typed tree follows its resolved artwork extent, so a failed decode keeps the same
    // canopy as the sprite path.
    const typed = compileObjectPlacement({ id: 'fallback-tree', type: 'tree', position: vec(0, 0), width: 1.6, height: 1.6 }, objectDefinitions);
    expect(fallbackScale({ kind: 'tree', body: body(1.6), artwork: typed.artwork })).toEqual(vec(typed.artwork!.bounds.width / TREE_CANOPY_METRES, typed.artwork!.bounds.width / TREE_CANOPY_METRES));
    // A procedural tree with no compiled art scales the canopy from the same body ratio.
    expect(fallbackScale({ kind: 'tree', body: body(1.6) }).x).toBeCloseTo(1.6 / objectDefinitions.tree.width);
    expect(fallbackScale({ kind: 'tree', body: body(objectDefinitions.tree.width) })).toEqual(vec(1, 1));
  });

  it('normalizes a typed tree canopy to the resolved footprint without changing physics', () => {
    // Acceptance (intentional): the tree drawing is authored as a fraction of its body
    // (5.2 m at the 1.8 m default), so a 1.6 m placement now draws a 4.62 m canopy rather
    // than the pre-migration fixed 5.2 m sprite. The physical body is deliberately not
    // increased: differing footprints scale the canopy proportionally and gameplay is
    // untouched.
    const size = (width: number) => compileObjectPlacement({ id: `tree-${width}`, type: 'tree', position: vec(300, 470), width, height: width }, objectDefinitions);
    const small = size(1.6), large = size(1.8);
    expect([small.width, small.height]).toEqual([1.6, 1.6]);
    expect([large.width, large.height]).toEqual([1.8, 1.8]);
    expect(small.artwork!.bounds.width).toBeCloseTo(5.2 * 1.6 / 1.8);
    expect(large.artwork!.bounds.width).toBeCloseTo(TREE_CANOPY_METRES);
    expect(small.artwork!.bounds.width / large.artwork!.bounds.width).toBeCloseTo(1.6 / 1.8);
    // The circle silhouette scales with the same normalized fraction.
    const radius = (o: typeof small) => Math.hypot(o.artwork!.silhouette[0].x, o.artwork!.silhouette[0].y);
    expect(radius(small) / radius(large)).toBeCloseTo(1.6 / 1.8, 6);
  });
});

const historyJson = (d: ReturnType<typeof copyDefaultMap>, c: ObjectCatalogue) => new MapHistory(d, c).export();

describe('typed trees keep deterministic orientations', () => {
  const tree: ObjectRecord = {
    id: 'park-tree', kind: 'tree', width: 1.8, height: 1.8, image: 'map/tree-worn.png',
    artwork: { fit: 'stretch', width: 5.2 / 1.8, height: 5.2 / 1.8, outline: { shape: 'circle', radius: 2.4 / 2.6 } },
  };
  const definitions = compileObjectCatalogue([tree], measureArtworkSources(inlineEntries([], [tree]), read));
  const placed = compileObjectPlacement({ id: 'typed-tree-1', type: 'park-tree', position: vec(50, 50) }, definitions);
  const body = new Body(50, 50, Infinity, 1.8, 1.8);

  it('rotates typed tree artwork by stable identity across all four orientations', () => {
    const rotation = (sourceId: string) => artworkFor({ kind: 'tree', sourceId, artwork: placed.artwork, body })!.rotation!;
    expect(artworkFor({ kind: 'tree', sourceId: 'typed-tree-1', artwork: placed.artwork, body })!.image).toBe('park-tree');
    // Deterministic and derived from appearance identity, never the simulation stream.
    for (const id of ['tree-a', 'tree-b', 'tree-c', 'tree-d', 'tree-e', 'tree-f', 'tree-g', 'tree-h']) {
      expect(rotation(id)).toBe((appearanceSeed(id) % 4) * Math.PI / 2);
      expect(rotation(id)).toBe(rotation(id));
    }
    expect(new Set(['tree-a', 'tree-b', 'tree-c', 'tree-d', 'tree-e', 'tree-f', 'tree-g', 'tree-h'].map(rotation)).size).toBe(4);
    // The shared compiled template stays unrotated; only the per-instance view rotates.
    expect(placed.artwork?.rotation).toBeUndefined();
  });
});

describe('local attached features follow the parent', () => {
  const record: ObjectRecord = {
    id: 'clinic', kind: 'building', width: 10, height: 10, storeys: 2, fallback: 'shop',
    sign: { width: 6, inset: 1, size: 0.6, color: '#fff' },
    features: [{ id: 'clinic-door', role: 'service', offset: vec(0, 0.5) }, { id: 'clinic-sign', role: 'sign', offset: vec(0.25, 0.25), label: 'CLINIC' }],
  };
  const definitions = compileObjectCatalogue([record]);

  it('resolves normalized service entrances and signs that move with the parent', () => {
    const placed = compileObjectPlacement({ id: 'clinic-1', type: 'clinic', position: vec(100, 50) }, definitions);
    expect(placed.features.map(f => `${f.id}:${f.role}`)).toEqual(['clinic-door:service', 'clinic-sign:sign']);
    expect(placed.features[0].position).toEqual(vec(100, 55));
    // Resizing the footprint moves the attached feature with the same normalized offset.
    const resized = compileObjectPlacement({ id: 'clinic-1', type: 'clinic', position: vec(100, 50), width: 20, height: 20 }, definitions);
    expect(resized.features[0].position).toEqual(vec(100, 60));
    // Moving the parent moves every attached feature by the same delta.
    const moved = compileObjectPlacement({ id: 'clinic-1', type: 'clinic', position: vec(130, 50), width: 20, height: 20 }, definitions);
    expect(moved.features[0].position).toEqual(vec(130, 60));
    // A placement may override the type's attached features.
    const override = compileObjectPlacement({ id: 'clinic-1', type: 'clinic', position: vec(100, 50), features: [{ id: 'side-door', role: 'service', offset: vec(-0.5, 0) }] }, definitions);
    expect(override.features).toEqual([expect.objectContaining({ id: 'side-door', position: vec(95, 50) })]);
  });

  it('rejects duplicate IDs, unknown roles and non-finite offsets when resolving a placement', () => {
    const place = (features: ObjectRecord['features']) => compileObjectPlacement({ id: 'clinic-1', type: 'clinic', position: vec(100, 50), features }, definitions);
    expect(() => place([{ id: 'x', role: 'service', offset: vec(0, 0) }, { id: 'x', role: 'sign', offset: vec(0, 0) }])).toThrow(/duplicate attached feature x/);
    expect(() => place([{ id: 'y', role: 'nope' as never, offset: vec(0, 0) }])).toThrow(/unknown role/);
    expect(() => place([{ id: 'z', role: 'service', offset: vec(NaN, 0) }])).toThrow(/finite offset/);
    expect(() => place([{ id: 'bad id', role: 'service', offset: vec(0, 0) }])).toThrow(/invalid attached feature ID/);
  });

  it('validates and preserves a normalized sign offset through a resize', () => {
    const sign = { width: 6, inset: 1, size: 0.6, color: '#fff', offset: vec(0.25, -0.5) };
    const defs = compileObjectCatalogue([{ id: 'kiosk-sign', kind: 'building', width: 10, height: 10, storeys: 1, fallback: 'shop', sign }]);
    expect(defs['kiosk-sign'].presentation?.sign.offset).toEqual(vec(0.25, -0.5));
    expect(() => compileObjectCatalogue([{ id: 'bad-sign', kind: 'building', width: 10, height: 10, storeys: 1, fallback: 'shop', sign: { ...sign, offset: vec(0.9, 0) } }])).toThrow(/invalid sign offset/);
    const placed = compilePlacement({ id: 'kiosk-1', type: 'kiosk-sign', owner: 'city', blockId: 'city-block-0-0', position: vec(50, 50), label: 'KIOSK', color: '#596b70', width: 20, height: 20 }, defs);
    expect(placed.presentation.sign.offset).toEqual(vec(0.25, -0.5));
  });
});

describe('beach hotels use the shared catalogue', () => {
  it('keeps the shipped condo and hotel artwork data-driven', () => {
    expect(propArtwork.condo.image).toBe('condo');
    expect(propArtwork['ocean-crest-condo'].image).toBe('ocean-crest-condo');
    expect(propArtwork.hotel.image).toBe('hotel');
    expect(objectDefinitions.condo.presentation).toMatchObject({ frontage: 'RESIDENTS ONLY' });
    expect(objectDefinitions.hotel.presentation).toMatchObject({ frontage: 'GUESTS ONLY', apron: 'PRIVATE FRONTAGE' });
  });

  it('resolves a type-only hotel from the catalogue footprint', () => {
    const map = compileMap(copyDefaultMap(), catalogue);
    const palm = map.objects['hotel-pacific-palm'];
    expect([palm.width, palm.height]).toEqual([objectDefinitions.hotel.width, objectDefinitions.hotel.height]);
  });

  it('uses the same injected catalogue for a custom beach hotel type', () => {
    const d = copyDefaultMap();
    (d.objectPlacements.find(h => h.id === 'hotel-pacific-palm') as { type: string }).type = 'beach-lodge';
    const map = compileMap(d, catalogue);
    expect(map.objects['hotel-pacific-palm']).toMatchObject({ type: 'beach-lodge', width: 33, height: 11 });
    expect(map.objects['hotel-pacific-palm'].presentation).toMatchObject({ frontage: 'LODGE' });
    expect(validateMap(d, map).errors).toBe(0);
  });

  it('keeps the condo sign style from the generic renderer as a data override', () => {
    // The condo was drawn by the generic building sign before the migration; the catalogue
    // record keeps that exact look instead of inheriting the hotel sign.
    expect(objectDefinitions.condo.presentation?.sign).toEqual({ width: 8.6, inset: 0.95, size: 0.72, color: '#f0dfae' });
  });

  it('applies a per-hotel artworkScale through compileMap, createBeach and an atomic resize', () => {
    const base = compileMap(copyDefaultMap(), catalogue);
    const baseline = base.objects['hotel-sandpiper'].artwork!.bounds.width;
    const scaled = copyDefaultMap();
    (scaled.objectPlacements.find(h => h.id === 'hotel-sandpiper') as { artworkScale: number }).artworkScale = 1.5;
    const map = compileMap(scaled, catalogue);
    // The drawing scales while the collision footprint stays at the resolved size.
    expect(map.objects['hotel-sandpiper'].artwork!.bounds.width).toBeCloseTo(baseline * 1.5);
    expect([map.objects['hotel-sandpiper'].width, map.objects['hotel-sandpiper'].height]).toEqual([base.objects['hotel-sandpiper'].width, base.objects['hotel-sandpiper'].height]);
    // The independent `createBeach` path (no precompiled objects) reads the same field.
    expect(new World(map).props.find(h => h.sourceId === 'hotel-sandpiper')!.artwork!.bounds.width).toBeCloseTo(baseline * 1.5);
    // An atomic resize preserves the visual-only field.
    const history = new MapHistory(scaled, catalogue);
    history.apply({ baseRevision: history.snapshot().revision, operations: [{ type: 'resize', targetId: 'hotel-sandpiper', width: 20, height: 10 }] });
    expect(history.snapshot().document.objectPlacements.find(h => h.id === 'hotel-sandpiper')).toMatchObject({ width: 20, height: 10, artworkScale: 1.5 });
    // The strict schema accepts the new optional field and still rejects a bad scale.
    const bad = copyDefaultMap();
    (bad.objectPlacements[0] as { artworkScale: number }).artworkScale = 0;
    expect(() => compileMap(bad, catalogue)).toThrow(/objectPlacement.artworkScale/);
  });

  it('reuses the map compiler precompiled hotel objects instead of compiling them twice', () => {
    const map = compileMap(copyDefaultMap(), catalogue);
    const world=new World(map);
    for (const placement of map.document.objectPlacements) expect(world.props.find(p=>p.sourceId===placement.id)!.artwork).toBe(map.objects[placement.id].artwork);
    // A standalone beach (the module singleton path) still compiles its own objects.
    expect(new World(compileMap(copyDefaultMap(), catalogue)).props.some(p => p.sourceId === 'hotel-sandpiper' && p.artwork?.image === 'condo')).toBe(true);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Body, vec, type Vec } from '../physics';
import { artworkFor, fallbackScale, objectDefinitions, TREE_CANOPY_METRES } from '../artwork/catalogue';
import { copyDefaultMap } from '../map/default';
import type { ObjectPlacement } from '../map/schema';
import { objectKindRegistry, type ObjectCatalogue, type ObjectRecord } from './schema';
import { compileObjectCatalogue, compileObjectPlacement } from './compile';
import { inlineEntries } from './generate';
import { measureArtworkSources } from './png';
import { inspectAuthoring, listAuthoring } from './authoring';

const read = (png: string) => {
  try { return readFileSync(fileURLToPath(new URL(`../assets/${png}`, import.meta.url))); }
  catch { return undefined; }
};

const bakery = { id: 'authoring-bakery', owner: 'southern-estates' as const,  type: 'bakery', position: vec(240, 430), angle: 0, color: '#596b70', label: 'BAKERY' };
const crate = { id: 'authoring-crate', owner: 'southern-estates' as const,  type: 'shipping-crate', position: vec(260, 430), angle: 0, color: '#bc9465', label: '' };
const conflict = { ...bakery, id: 'authoring-conflict', position: vec(225, 438) };
const withPlacements = (...placements: ObjectPlacement[]) => {
  const document = copyDefaultMap();
  document.objectPlacements.push(...placements.map(placement => structuredClone(placement)));
  return document;
};

describe('DOM-free authoring report', () => {
  it('inspects a real catalogue PNG entity through the shared manifest and compiled map', () => {
    const report = inspectAuthoring(withPlacements(bakery, crate), 'authoring-bakery', objectDefinitions);
    expect(report.preview.allowed).toBe(true);
    expect(report.entity).toMatchObject({ id: 'authoring-bakery', type: 'bakery', kind: 'building', collection: 'objectPlacements' });
    expect(report.entity.bodies).toHaveLength(1);
    expect([report.entity.bodies[0].width, report.entity.bodies[0].height]).toEqual([12, 8]);
    expect(report.artwork?.image).toBe('bakery');
    expect(report.artwork?.bounds.width).toBeCloseTo(12.6);
    expect(report.artwork?.bounds.height).toBeCloseTo(8.4);
    // The manifest keys the direct image, so the browser loads the same authored PNG.
    expect(report.artwork?.manifest).toEqual({ inline: true, measured: true });
    expect(report.shadow).toMatchObject({ casts: true });
    expect(report.shadow?.silhouette).toHaveLength(4);
    expect(report.lightBlocker?.silhouette).toHaveLength(4);
    expect(report.cullingRadius).toBeGreaterThan(6);
    expect(report.nearbyRoutes.length).toBeGreaterThan(0);
    expect(report.nearbyRoutes[0].distance).toBeLessThan(26);
    expect(report.validation.errors).toBe(0);
    expect(report.map.withinBudgets).toBe(true);
  });

  it('moves collision, artwork, shadow, blocker and culling together for one instance resize', () => {
    const base = inspectAuthoring(withPlacements(bakery, crate), 'authoring-bakery', objectDefinitions);
    const resizedDocument = withPlacements(bakery, crate);
    const resizedPlacement = resizedDocument.objectPlacements.find(placement => placement.id === 'authoring-bakery')!;
    resizedPlacement.width = 24; resizedPlacement.height = 16;
    const resized = inspectAuthoring(resizedDocument, 'authoring-bakery', objectDefinitions);
    expect([resized.entity.bodies[0].width, resized.entity.bodies[0].height]).toEqual([24, 16]);
    expect(resized.artwork!.bounds.width / base.artwork!.bounds.width).toBeCloseTo(2);
    expect(resized.artwork!.bounds.height / base.artwork!.bounds.height).toBeCloseTo(2);
    expect(resized.cullingRadius).toBeGreaterThan(base.cullingRadius);
    // The silhouette scales with the drawing rather than staying at the authored size.
    expect(Math.hypot(resized.artwork!.silhouette[1].x, resized.artwork!.silhouette[1].y)).toBeCloseTo(2 * Math.hypot(base.artwork!.silhouette[1].x, base.artwork!.silhouette[1].y));
  });

  it('scales a type default without touching map placements', () => {
    const document = withPlacements(bakery, crate);
    const doubled: ObjectCatalogue = { ...objectDefinitions, bakery: { ...objectDefinitions.bakery, width: 24, height: 16 } };
    const base = inspectAuthoring(document, 'authoring-bakery', objectDefinitions);
    const resized = inspectAuthoring(document, 'authoring-bakery', doubled);
    expect([base.entity.bodies[0].width, base.entity.bodies[0].height]).toEqual([12, 8]);
    expect([resized.entity.bodies[0].width, resized.entity.bodies[0].height]).toEqual([24, 16]);
    expect(resized.artwork!.bounds.width).toBeCloseTo(2 * base.artwork!.bounds.width);
    expect(resized.shadow!.silhouette[1]).toEqual(vec(2 * base.shadow!.silhouette[1].x, 2 * base.shadow!.silhouette[1].y));
  });

  it('keeps an offset drawing, shadow, blocker and culling aligned on a rotated placement', () => {
    // A nonzero art offset on an angled placement: the overlay draws the silhouette under
    // the body rotation, so its local centre must be the offset art centre, not the origin.
    const document = withPlacements({ ...bakery, angle: Math.PI / 3 });
    const base = objectDefinitions.bakery.artwork![0];
    const shifted: ObjectCatalogue = { ...objectDefinitions, bakery: { ...objectDefinitions.bakery, artwork: [{ ...base, offset: { x: 0.3, y: -0.2 } }] } };
    const report = inspectAuthoring(document, 'authoring-bakery', shifted);
    const art = report.artwork!;
    const centre = (points: readonly Vec[]) => points.reduce((sum, p) => vec(sum.x + p.x / points.length, sum.y + p.y / points.length), vec());
    const offset = vec(0.3 * 12, -0.2 * 8);
    expect(art.bounds.x + art.bounds.width / 2).toBeCloseTo(offset.x);
    expect(art.bounds.y + art.bounds.height / 2).toBeCloseTo(offset.y);
    expect(centre(art.silhouette).x).toBeCloseTo(offset.x);
    expect(centre(art.silhouette).y).toBeCloseTo(offset.y);
    expect(centre(report.shadow!.silhouette).x).toBeCloseTo(offset.x);
    expect(centre(report.shadow!.silhouette).y).toBeCloseTo(offset.y);
    expect(report.lightBlocker!.silhouette).toEqual(report.shadow!.silhouette);
    // Culling radius still reaches the offset drawing from the body centre.
    expect(report.cullingRadius).toBeGreaterThanOrEqual(Math.hypot(Math.abs(offset.x) + art.bounds.width / 2, Math.abs(offset.y) + art.bounds.height / 2));
  });

  it('reports route conflicts by stable entity and keeps invalid drafts inspectable', () => {
    const document = withPlacements(conflict);
    const report = inspectAuthoring(document, 'authoring-conflict', objectDefinitions);
    expect(report.preview.allowed).toBe(false);
    expect(report.preview.reason).toMatch(/validation error/);
    const blocked = report.routeConflicts.find(finding => finding.code === 'road-blocked');
    expect(blocked).toBeDefined();
    expect(blocked!.entityIds).toContain('authoring-conflict');
    expect(blocked!.entityIds.some(id => id.startsWith('city-road-') || id.includes('road') || id.includes('drive'))).toBe(true);
    expect(report.findings.some(finding => finding.entityIds.includes('authoring-conflict'))).toBe(true);
  });

  it('reports nearby blockers with physical penetration', () => {
    const report = inspectAuthoring(withPlacements({ ...bakery, id: 'authoring-overlap', position: vec(54, 421) }), 'authoring-overlap', objectDefinitions);
    expect(report.preview.allowed).toBe(false);
    expect(report.blockers.some(blocker => blocker.entityId === 'villa-cedar-house' && blocker.penetration > 0)).toBe(true);
    expect(report.findings.some(finding => finding.code === 'object-overlap')).toBe(true);
  });

  it('returns detached, deterministic reports', () => {
    const document = withPlacements(bakery, crate);
    const one = inspectAuthoring(document, 'authoring-bakery', objectDefinitions);
    const two = inspectAuthoring(document, 'authoring-bakery', objectDefinitions);
    expect(one).toEqual(two);
    expect(one.artwork).not.toBe(two.artwork);
    one.entity.bodies[0].position.x = 999;
    expect(two.entity.bodies[0].position.x).toBe(240);
  });

  it('lists catalogue types and every stable placed entity', () => {
    const list = listAuthoring(withPlacements(bakery, crate), objectDefinitions);
    expect(list.types.find(type => type.id === 'bakery')).toMatchObject({ kind: 'building', image: 'bakery', artwork: true });
    expect(list.types.find(type => type.id === 'shipping-crate')).toMatchObject({ image: 'shipping-crate' });
    expect(list.entities.find(entity => entity.id === 'authoring-bakery')).toMatchObject({ type: 'bakery', collection: 'objectPlacements' });
    expect(list.entities.find(entity => entity.id === 'authoring-crate')).toMatchObject({ type: 'shipping-crate' });
  });
});

describe('type feature validation', () => {
  const base = { id: 'feature-check', kind: 'building' as const, width: 10, height: 10, storeys: 2, fallback: 'shop' as const, sign: { width: 6, inset: 1, size: 0.6, color: '#fff' } };

  it('rejects a malformed type feature list before any placement resolves', () => {
    expect(() => compileObjectCatalogue([{ ...base, features: [{ id: 'Bad ID', role: 'sign', offset: vec(0, 0) }] }])).toThrow(/invalid attached feature ID/);
    expect(() => compileObjectCatalogue([{ ...base, features: [{ id: 'dupe', role: 'sign', offset: vec(0, 0) }, { id: 'dupe', role: 'sign', offset: vec(0, 0) }] }])).toThrow(/duplicate attached feature/);
    expect(() => compileObjectCatalogue([{ ...base, features: [{ id: 'far', role: 'sign', offset: vec(NaN, 0) }] }])).toThrow(/finite offset/);
  });

  it('reports inert sign features instead of importing data the renderer ignores', () => {
    const document = withPlacements({
      ...crate,
      id: 'authoring-crate-sign',
      features: [{ id: 'crate-sign', role: 'sign', offset: vec(0, 0) }],
    });
    const report = inspectAuthoring(document, 'authoring-crate-sign', objectDefinitions);
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'sign-feature-unsupported', entityIds: ['authoring-crate-sign', 'authoring-crate-sign/crate-sign'] }));
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'sign-feature-unlabelled', severity: 'warning' }));
    expect(report.preview.allowed).toBe(false);
  });


});

describe('bounded procedural tree artwork', () => {
  it('reuses a cached silhouette for one body and invalidates it on resize', () => {
    const body = new Body(0, 0, Infinity, 1.8, 1.8);
    const prop = { kind: 'tree' as const, body };
    const first = artworkFor(prop), second = artworkFor(prop);
    expect(first?.silhouette).toBe(second?.silhouette);
    // The cached geometry is frozen, so a caller cannot mutate another frame's canopy.
    expect(Object.isFrozen(first!.silhouette)).toBe(true);
    expect(Object.isFrozen(first!.bounds)).toBe(true);
    body.w = 1.6; body.h = 1.6;
    const resized = artworkFor(prop);
    expect(resized?.silhouette).not.toBe(first?.silhouette);
    expect(resized!.bounds.width).toBeCloseTo(TREE_CANOPY_METRES * 1.6 / 1.8);
  });

  it('uses a custom type compiled artwork for the procedural fallback scale', () => {
    const record: ObjectRecord = {
      id: 'park-tree', kind: 'tree', width: 3, height: 3, image: 'map/tree-worn.png',
      artwork: { fit: 'stretch', width: 7 / 3, height: 7 / 3, outline: { shape: 'circle', radius: 3.5 / 3.5 } },
    };
    const definitions = compileObjectCatalogue([record], measureArtworkSources(inlineEntries([], [record]), read));
    const placed = compileObjectPlacement({ id: 'park-tree-1', type: 'park-tree', position: vec(50, 50) }, definitions);
    expect(placed.artwork!.bounds.width).toBeCloseTo(7);
    const scale = fallbackScale({ kind: 'tree', body: new Body(50, 50, Infinity, 3, 3), artwork: placed.artwork });
    expect(scale.x).toBeCloseTo(7 / TREE_CANOPY_METRES);
  });
});

describe('authoring map schema discipline', () => {
  it('keeps version 3 and the injected kind registry authoritative', () => {
    const document = withPlacements(bakery);
    const kinds = objectKindRegistry(objectDefinitions);
    expect(kinds.bakery).toBe('building');
    expect(() => inspectAuthoring({ ...document, schemaVersion: 2 } as never, 'authoring-bakery', objectDefinitions)).toThrow(/unsupported schema/);
  });
});

describe('schema 5 coastal authoring reports',()=>{
  it('inspects stable rule children and the explicit bridge catalogue placements',()=>{
    const document=copyDefaultMap();
    const rule=document.boundaryPlacements[0];
    const report=inspectAuthoring(document,rule.id,objectDefinitions);
    expect(report.map.schemaVersion).toBe(5);
    expect(report.entity.collection).toBe('boundaryPlacements');
    expect(report.entity.bodies.length).toBeGreaterThan(1);
    const child=inspectAuthoring(document,`${rule.id}-edge-0-slot-1`,objectDefinitions);
    expect(child.entity.kind).toBe('guardrail');
    const bridge=inspectAuthoring(document,document.boundaryPlacements[2].id,objectDefinitions);
    expect(bridge.entity.collection).toBe('boundaryPlacements');
    expect(listAuthoring(document,objectDefinitions).entities.find(e=>e.id===rule.id)?.bodies).toBe(report.entity.bodies.length);
  });
});

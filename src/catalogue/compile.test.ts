import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { vec, type Vec } from '../physics';
import { propArtwork, asphaltArtwork, objectDefinitions } from '../artwork/catalogue';
import { buildingDefinitions } from '../buildings';
import { artworkRecords, objectRecords } from './content';
import { compileArtworkCatalogue, compileBuildingCatalogue, compileObjectCatalogue, compileObjectPlacement, compilePlacement, deriveArtwork } from './compile';
import { inlineEntries } from './generate';
import { artworkInline } from './generated';
import { measureArtworkSources } from './png';
import type { ArtworkRecord, BuildingCatalogue, BuildingSign, ObjectRecord } from './schema';

const read = (png: string) => {
  try { return readFileSync(fileURLToPath(new URL(`../assets/${png}`, import.meta.url))); }
  catch { return undefined; }
};
const sign: BuildingSign = { width: 10, inset: 1.2, size: 0.7, color: '#ffffff' };
const placement = { id: 'east-clinic', type: 'clinic', owner: 'city' as const, blockId: 'city-block-5-4', position: vec(220, 180), label: 'EAST CLINIC', color: '#596b70' };
const sourcesFor = (objects: readonly ObjectRecord[], legacy: readonly ArtworkRecord[] = []) => measureArtworkSources(inlineEntries(legacy, objects), read);

const clinic = (width = 20, height = 18): ObjectRecord => ({
  id: 'clinic', kind: 'building', width, height, storeys: 3,
  fallback: 'commercial', sign, image: 'map/luxury-condo.png',
});

describe('shared catalogue compiler', () => {
  it('compiles a brand-new PNG building from one type record and one placement record', () => {
    // Nothing is registered by hand: the manifest comes from the record's direct image
    // reference and the crop comes from measuring that file.
    const objects = [clinic()];
    const sources = sourcesFor(objects);
    const definitions = compileBuildingCatalogue(objects, sources);
    const building = compilePlacement({ ...placement, type: 'clinic' }, definitions);
    expect([building.width, building.height, building.storeys]).toEqual([20, 18, 3]);
    expect(building.presentation.fallback).toBe('commercial');
    expect(building.artwork?.image).toBe('clinic');
    expect(building.artwork?.source).toEqual({ x: 0, y: 17, width: 1160, height: 1213 });
    // The cropped source is centred and its aspect is preserved by default.
    expect(building.artwork?.bounds.height).toBeCloseTo(18);
    expect(building.artwork?.bounds.width).toBeCloseTo(18 * 1160 / 1213);
    expect(building.artwork?.bounds.x).toBeCloseTo(-building.artwork!.bounds.width / 2);
    expect(building.artwork?.bounds.y).toBeCloseTo(-9);
    expect(objectRecords.some(record => (record.id as string) === 'clinic')).toBe(false);
  });

  it('translates an offset silhouette and its light blocker with the art bounds', () => {
    // A nonzero, asymmetric art offset must move the drawing rectangle, the shadow
    // silhouette and the shared light blocker together: a silhouette left at the origin
    // would report a shadow that no longer sits over its sprite.
    const offset: ObjectRecord = { ...clinic(), artwork: { fit: 'stretch', width: 1, height: 1, offset: { x: 0.25, y: -0.1 }, outline: 'bounds', occluder: true } };
    const art = deriveArtwork(compileObjectCatalogue([offset], sourcesFor([offset])).clinic.artwork![0], 20, 18);
    expect(art.bounds).toEqual({ x: -5, y: -10.8, width: 20, height: 18 });
    const centre = (points: readonly Vec[]) => points.reduce((sum, p) => vec(sum.x + p.x / points.length, sum.y + p.y / points.length), vec());
    expect(centre(art.silhouette).x).toBeCloseTo(5);
    expect(centre(art.silhouette).y).toBeCloseTo(-1.8);
    expect(art.occluder).toBe(art.silhouette);
    // The outline keeps its authored extent; only its centre moves.
    expect(art.silhouette[0]).toEqual(vec(-5, -10.8));
  });

  it('fits artwork to the footprint by default and stretches or offsets it only when declared', () => {
    const contain = compileObjectCatalogue([clinic()], sourcesFor([clinic()])).clinic;
    const contained = deriveArtwork(contain.artwork![0], 20, 18);
    expect(contained.bounds.height).toBeCloseTo(18);
    expect(contained.bounds.width).toBeCloseTo(18 * 1160 / 1213);

    const stretch: ObjectRecord = { ...clinic(), artwork: { fit: 'stretch' } };
    const stretched = deriveArtwork(compileObjectCatalogue([stretch], sourcesFor([stretch])).clinic.artwork![0], 20, 18);
    expect(stretched.bounds).toEqual({ x: -10, y: -9, width: 20, height: 18 });

    // Width, height and offset are fractions of the resolved footprint, never metres.
    const overhang: ObjectRecord = { ...clinic(), artwork: { fit: 'stretch', width: 1.1, height: 0.9, offset: { x: 0.1, y: -0.2 } } };
    const offset = deriveArtwork(compileObjectCatalogue([overhang], sourcesFor([overhang])).clinic.artwork![0], 20, 18);
    expect(offset.bounds).toEqual({ x: -9, y: -11.7, width: 22, height: 16.2 });

    const outlined: ObjectRecord = { ...clinic(), artwork: { fit: 'stretch', outline: { shape: 'path', points: [vec(0, -0.5), vec(0.5, 0.5), vec(-0.5, 0.5)] } } };
    const outline = deriveArtwork(compileObjectCatalogue([outlined], sourcesFor([outlined])).clinic.artwork![0], 20, 18);
    expect(outline.silhouette).toEqual([vec(0, -9), vec(10, 9), vec(-10, 9)]);
    // The normalized outline scales with the resolved art extent, so a resize keeps
    // the shadow silhouette and light blocker aligned with the drawing.
    const resizedOutline = deriveArtwork(compileObjectCatalogue([outlined], sourcesFor([outlined])).clinic.artwork![0], 40, 36);
    expect(resizedOutline.silhouette).toEqual([vec(0, -18), vec(20, 18), vec(-20, 18)]);
    expect(outline.occluder).toBeUndefined();
  });

  it('doubles collision and artwork together when only the type default size changes', () => {
    // The original bug: art was stored in absolute metres, so changing definition.width
    // left the drawing unchanged. Templates are normalized to the resolved footprint.
    const single = [clinic()];
    const doubled = [clinic(40, 36)];
    const one = compilePlacement({ ...placement, type: 'clinic' }, compileBuildingCatalogue(single, sourcesFor(single)));
    const two = compilePlacement({ ...placement, type: 'clinic' }, compileBuildingCatalogue(doubled, sourcesFor(doubled)));
    expect([two.width, two.height]).toEqual([one.width * 2, one.height * 2]);
    expect(two.artwork?.bounds.width).toBeCloseTo(one.artwork!.bounds.width * 2);
    expect(two.artwork?.bounds.height).toBeCloseTo(one.artwork!.bounds.height * 2);
    expect(two.artwork?.bounds.x).toBeCloseTo(one.artwork!.bounds.x * 2);
    expect(two.artwork?.bounds.y).toBeCloseTo(one.artwork!.bounds.y * 2);
    expect(two.artwork?.source).toEqual(one.artwork?.source);

    // A compiled definition is normalized too: changing its default size still drives art.
    const resizedDefinition = { ...buildingDefinitions.hospital, width: 52, height: 132 };
    const resized = compilePlacement({ ...placement, type: 'hospital' }, { ...buildingDefinitions, hospital: resizedDefinition });
    const regular = compilePlacement({ ...placement, type: 'hospital' }, buildingDefinitions);
    expect([resized.width, resized.height]).toEqual([52, 132]);
    expect(resized.artwork?.bounds.width).toBeCloseTo(regular.artwork!.bounds.width * 2);
    expect(resized.artwork?.bounds.height).toBeCloseTo(regular.artwork!.bounds.height * 2);

    // Shared legacy variants follow the same rule; the variant art itself is untouched.
    const doubledShop = { ...objectRecords.find(record => record.id === 'shop')!, width: 20, height: 20 };
    const shops = compileBuildingCatalogue([doubledShop], sourcesFor([doubledShop], artworkRecords), artworkRecords);
    const shop = compilePlacement({ ...placement, type: 'shop', id: 'city-building-0-2-shop-0-0' }, shops);
    expect([shop.width, shop.height]).toEqual([20, 20]);
    expect(shop.artwork?.bounds.width).toBeCloseTo(10.6 * 2);
    expect(shop.artwork?.bounds.height).toBeCloseTo(10.6 * 2);
  });

  it('applies instance and type artworkScale to drawing only, and instance overrides win', () => {
    const scaledType: ObjectRecord = { ...clinic(), artworkScale: 1.5 };
    const definitions = compileBuildingCatalogue([scaledType], sourcesFor([scaledType]));
    const base = compilePlacement({ ...placement, type: 'clinic' }, definitions);
    expect([base.width, base.height]).toEqual([20, 18]);
    expect(base.artwork?.bounds.width).toBeCloseTo(18 * 1160 / 1213 * 1.5);
    const overridden = compilePlacement({ ...placement, type: 'clinic', width: 40, height: 36, artworkScale: 2 }, definitions);
    expect([overridden.width, overridden.height]).toEqual([40, 36]);
    expect(overridden.artwork?.bounds.width).toBeCloseTo(36 * 1160 / 1213 * 2);
    expect(() => compilePlacement({ ...placement, type: 'clinic', artworkScale: 0 }, definitions)).toThrow(/invalid artwork scale/);
  });

  it('keeps the migrated hospital layout exactly, expressed as normalized factors', () => {
    const hospital = objectRecords.find(record => record.id === 'hospital')!;
    expect(hospital.artwork?.width).toBe(26.6 / 26);
    expect(hospital.artwork?.height).toBe(66.6 / 66);
    const defaultArt = propArtwork.hospital;
    expect(defaultArt.bounds.width).toBeCloseTo(26.6);
    expect(defaultArt.bounds.height).toBeCloseTo(66.6);
    expect(defaultArt.source).toEqual({ x: 33, y: 16, width: 726, height: 1951 });
    const resized = compilePlacement({ ...placement, type: 'hospital', width: 24, height: 64 }, buildingDefinitions);
    expect(resized.artwork?.bounds.width).toBeCloseTo(26.6 * 24 / 26);
    expect(resized.artwork?.bounds.height).toBeCloseTo(66.6 * 64 / 66);
  });

  it('compiles a crate through the same object compiler with no building fields', () => {
    const crate: ObjectRecord = {
      id: 'crate', kind: 'crate', width: 1.4, height: 1.4,
      image: 'map/shop-rust.png',
      artwork: { fit: 'stretch', width: 1.1, height: 0.9, outline: { shape: 'circle', radius: 0.5, points: 6 } },
    };
    const definitions = compileObjectCatalogue([crate], sourcesFor([crate]));
    const definition = definitions.crate;
    expect(definition.kind).toBe('crate');
    expect(definition.storeys).toBeUndefined();
    expect(definition.presentation).toBeUndefined();
    const art = deriveArtwork(definition.artwork![0], definition.width, definition.height);
    expect(art.image).toBe('crate');
    expect(art.bounds.width).toBeCloseTo(1.54);
    expect(art.bounds.height).toBeCloseTo(1.26);
    expect(art.silhouette).toHaveLength(6);
  });

  it('resolves default rectangles, circles and explicit silhouettes', () => {
    const objects: readonly ObjectRecord[] = [
      { id: 'rect', kind: 'crate', width: 8, height: 8, image: 'map/shop-tar.png' },
      { id: 'circle', kind: 'tree', width: 4, height: 4, image: 'map/tree-worn.png', artwork: { outline: { shape: 'circle', radius: 0.75, points: 4 } } },
      { id: 'explicit', kind: 'crate', width: 2, height: 2, image: 'map/tree-worn.png', artwork: { outline: [vec(0, -0.5), vec(0.5, 0.5), vec(-0.5, 0.5)] } },
    ];
    const definitions = compileObjectCatalogue(objects, sourcesFor(objects));
    const art = (id: string) => deriveArtwork(definitions[id].artwork![0], definitions[id].width, definitions[id].height);
    expect(art('rect').silhouette).toEqual([vec(-4, -4), vec(4, -4), vec(4, 4), vec(-4, 4)]);
    expect(art('rect').occluder).toBeUndefined();
    expect(art('circle').silhouette).toHaveLength(4);
    art('circle').silhouette.forEach((point, i) => {
      expect(point.x).toBeCloseTo(Math.cos(i * Math.PI / 2) * 1.5);
      expect(point.y).toBeCloseTo(Math.sin(i * Math.PI / 2) * 1.5);
    });
    expect(art('explicit').silhouette).toEqual([vec(0, -1), vec(1, 1), vec(-1, 1)]);
  });

  it('detaches instance geometry and clones source crops away from authored records', () => {
    const objects = [clinic()];
    const sources = sourcesFor(objects);
    const definitions = compileBuildingCatalogue(objects, sources);
    const one = compilePlacement({ ...placement, type: 'clinic' }, definitions);
    const two = compilePlacement({ ...placement, type: 'clinic', width: 30 }, definitions);
    expect(one.artwork).not.toBe(two.artwork);
    expect(one.artwork?.bounds).not.toBe(two.artwork?.bounds);
    expect(one.artwork?.source).not.toBe(two.artwork?.source);
    expect(one.artwork?.source).not.toBe(sources.clinic.crop);
    expect(one.artwork?.silhouette).not.toBe(two.artwork?.silhouette);
    expect(Object.isFrozen(definitions.clinic.artwork![0])).toBe(true);
    expect(Object.isFrozen(definitions.clinic.artwork![0].source)).toBe(true);
  });

  it('reports unknown references and unmeasurable geometry by stable ID', () => {
    const types = { clinic: { ...clinic(), image: undefined, variants: ['missing-wing'] } } satisfies Record<string, ObjectRecord>;
    expect(() => compileBuildingCatalogue(Object.values(types), sourcesFor(Object.values(types)))).toThrow(/unknown artwork missing-wing/);
    expect(() => compileObjectCatalogue([{ ...clinic(), artworkScale: 0 }], sourcesFor([clinic()]))).toThrow(/invalid artwork scale/);
    expect(() => compilePlacement(placement, buildingDefinitions)).toThrow(/unknown type clinic/);
    expect(() => compileObjectCatalogue([{ ...clinic(), crop: { x: 1200, y: 0, width: 100, height: 100 } }], sourcesFor([clinic()]))).toThrow(/must stay inside its 1254×1254 source/);
    expect(() => compileObjectCatalogue([{ ...clinic(), image: 'map/absent.png' }])).toThrow(/centred aspect fit needs a measured source/);
    expect(() => compileObjectCatalogue([{ ...clinic(), image: 'map/asphalt.svg' }])).toThrow(/centred aspect fit needs a measured source/);
    expect(() => compileObjectCatalogue([{ ...clinic(), variants: ['shop-tar'] }])).toThrow(/choose a direct image or shared variants/);
    expect(() => compileObjectCatalogue([clinic(), clinic()], sourcesFor([clinic()]))).toThrow(/duplicate ID/);
    expect(() => compileArtworkCatalogue([{ id: 'asphalt', png: 'map/asphalt.svg', layer: 'ground' }])).toThrow(/tile size/);
    expect(() => compileArtworkCatalogue([{ id: 'a', png: 'map/tree-worn.png', layer: 'structure', metres: 2 }, { id: 'a', png: 'map/tree-worn.png', layer: 'structure', metres: 2 }], measureArtworkSources([{ id: 'a', png: 'map/tree-worn.png' }], read))).toThrow(/duplicate ID/);
  });

  it('reproduces the hand-written city metadata exactly', () => {
    expect(propArtwork['shop-tar']).toMatchObject({ image: 'shop-tar', layer: 'structure', bounds: { x: -5.3, y: -5.3, width: 10.6, height: 10.6 } });
    expect(propArtwork['shop-tar'].source).toBeUndefined();
    expect(propArtwork['shop-tar'].silhouette).toEqual([vec(-5.3, -5.3), vec(5.3, -5.3), vec(5.3, 5.3), vec(-5.3, 5.3)]);
    expect(propArtwork['shop-tar'].occluder).toBe(propArtwork['shop-tar'].silhouette);
    expect(propArtwork.hospital.bounds.width).toBeCloseTo(26.6);
    expect(propArtwork.hospital.bounds.height).toBeCloseTo(66.6);
    expect(propArtwork.hospital.source).toEqual({ x: 33, y: 16, width: 726, height: 1951 });
    const hospitalOutline = propArtwork.hospital.silhouette;
    expect(hospitalOutline).toHaveLength(4);
    [[-13.3, -33.3], [13.3, -33.3], [13.3, 33.3], [-13.3, 33.3]].forEach(([x, y], i) => {
      expect(hospitalOutline[i].x).toBeCloseTo(x);
      expect(hospitalOutline[i].y).toBeCloseTo(y);
    });
    expect(propArtwork.condo.source).toEqual({ x: 100, y: 60, width: 1055, height: 1090 });
    expect(propArtwork.condo.castsShadow).toBe(false);
    expect(propArtwork.condo.bounds.x).toBeCloseTo(-7.15);
    expect(propArtwork.condo.bounds.y).toBeCloseTo(-6.65);
    expect(propArtwork.condo.bounds.width).toBeCloseTo(14.3);
    expect(propArtwork.condo.bounds.height).toBeCloseTo(13.3);
    expect(propArtwork['tree-worn'].silhouette).toHaveLength(12);
    propArtwork['tree-worn'].silhouette.forEach((point: Vec, i: number) => {
      expect(point.x).toBeCloseTo(Math.cos(i * Math.PI / 6) * 2.4);
      expect(point.y).toBeCloseTo(Math.sin(i * Math.PI / 6) * 2.4);
    });
    expect(asphaltArtwork).toEqual({ image: 'asphalt', layer: 'ground', tileMetres: 48 });
    const commercialSign: BuildingSign = { width: 14, inset: 1.72, size: 0.78, color: '#eadab8' };
    expect(buildingDefinitions.shop).toMatchObject({ id: 'shop', kind: 'building', width: 10, height: 10, storeys: 2, presentation: { fallback: 'shop', sign: { width: 8.6, inset: 0.95, size: 0.72, color: '#f0dfae' } } });
    expect(buildingDefinitions.shop.artwork).toHaveLength(3);
    expect(buildingDefinitions.shop.artwork!.map(template => template.image)).toEqual(['shop-tar', 'shop-rust', 'shop-concrete']);
    expect(buildingDefinitions.commercial).toMatchObject({ width: 23, height: 10, storeys: 4, presentation: { fallback: 'commercial', sign: commercialSign } });
    expect(buildingDefinitions.commercial.artwork).toBeUndefined();
    expect(buildingDefinitions.landmark).toMatchObject({ width: 23, height: 23, storeys: 8, presentation: { fallback: 'terraced', sign: commercialSign } });
    expect(buildingDefinitions.hospital.presentation).toEqual({ fallback: 'wards', sign: { width: 14, inset: 1.4, size: 0.9, color: '#f0dfae' } });
    expect(buildingDefinitions.condo.presentation).toMatchObject({ frontage: 'RESIDENTS ONLY' });
    expect(buildingDefinitions.hotel.presentation).toMatchObject({ frontage: 'GUESTS ONLY', apron: 'PRIVATE FRONTAGE' });
    // Inventory is derived from the authored records and the generated manifest, so a new
    // record or PNG needs no test edit. The concrete art regressions above stay.
    expect(Object.keys(artworkInline)).toEqual(inlineEntries(artworkRecords, objectRecords).map(entry => entry.id));
    expect(Object.keys(objectDefinitions)).toEqual(objectRecords.map(record => record.id));
    expect(Object.keys(buildingDefinitions)).toEqual(objectRecords.filter(record => record.kind === 'building').map(record => record.id));
  });

  it('compiles a non-building placement generically and rejects it through the building compiler', () => {
    const crate: ObjectRecord = { id: 'crate', kind: 'crate', width: 1.4, height: 1.4 };
    const definitions = compileObjectCatalogue([crate]);
    const placed = compileObjectPlacement({ id: 'crate-1', type: 'crate', position: vec(5, 5), width: 2, height: 2 }, definitions);
    expect(placed).toMatchObject({ kind: 'crate', type: 'crate', width: 2, height: 2 });
    expect(placed.artwork).toBeUndefined();
    expect(placed.silhouette).toEqual([vec(-1, -1), vec(1, -1), vec(1, 1), vec(-1, 1)]);
    // The building compiler reports a clear error rather than failing on missing fields.
    expect(() => compilePlacement({ ...placement, type: 'crate' }, { crate: definitions.crate } as unknown as BuildingCatalogue)).toThrow(/is crate artwork; compile props with compileObjectPlacement/);
    expect(() => compileObjectPlacement({ id: 'missing', type: 'nope', position: vec() }, definitions)).toThrow(/unknown type nope/);
  });

  it('freezes the legacy artwork catalogue and validates explicit outlines eagerly', () => {
    const legacy = compileArtworkCatalogue(artworkRecords, sourcesFor([], artworkRecords));
    expect(Object.isFrozen(legacy)).toBe(true);
    expect(Object.isFrozen(legacy.structures['shop-tar'])).toBe(true);
    expect(Object.isFrozen(propArtwork['shop-tar'].silhouette)).toBe(true);
    const bad = (points: readonly Vec[], id = 'bad'): ObjectRecord => ({ id, kind: 'crate', width: 2, height: 2, image: 'map/shop-tar.png', artwork: { outline: points } });
    expect(() => compileObjectCatalogue([bad([])])).toThrow(/outline needs at least one point/);
    expect(() => compileObjectCatalogue([bad([vec(0, 0), vec(NaN, 1)])])).toThrow(/outline points must be finite/);
    expect(() => compileObjectCatalogue([{ ...bad([vec(0, 0)], 'bad2'), artwork: { outline: { shape: 'circle', radius: 0, points: 4 } } }])).toThrow(/invalid artwork outline/);
  });
});

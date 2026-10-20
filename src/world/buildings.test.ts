import { describe, expect, it } from 'vitest';
import { buildingDefinitions, compileBuilding } from './buildings';
import { createCity, citySegmentOpen } from './city';
import { cityContent, type CityContent } from './city-content';
import { artworkFor, propArtwork } from '../artwork/catalogue';
import { compileMap } from '../map/compile';
import { copyDefaultMap, freezeGeometry } from '../map/default';
import { validateMap } from '../map/validation';
import { World } from './world';
import { Game } from '../game/game';
import { Body, contact, dist, vec } from '../physics/physics';
import { createVehicleBody, vehicleDefinition } from '../vehicles/vehicles';

const mapWith = (content: CityContent, catalogue = buildingDefinitions) => freezeGeometry({ ...compileMap(copyDefaultMap()), city: createCity(content, catalogue) });

describe('building authoring', () => {
  it('renames, re-identifies and resizes a building without losing artwork or routing', () => {
    const entrance = vec(149, 74.6);
    const map = mapWith({ ...cityContent, buildings: cityContent.buildings.map(b => b.type === 'hospital'
      ? { ...b, id: 'metropolitan-care', label: 'METROPOLITAN CARE', width: 24, height: 64, features: [{ id: 'care-service', role: 'service' as const, offset: vec(9 / 24, 34.6 / 64) }] } : b) });
    const world = new World(map), prop = world.props.find(p => p.sourceId === 'metropolitan-care')!;
    const art = artworkFor(prop)!;
    expect(art.image).toBe('hospital');
    expect(art.source).toEqual(propArtwork.hospital.source);
    expect(art.bounds.width).toBeCloseTo(26.6 * 24 / 26);
    expect(art.bounds.height).toBeCloseTo(66.6 * 64 / 66);
    expect(art.occluder).toEqual(art.silhouette);
    expect([prop.body.w, prop.body.h]).toEqual([24, 64]);
    expect(world.navigation.roadPath(vec(140, 40), vec(180, 40))).toEqual([vec(140, 40)]);
    expect(world.navigation.roadPath(vec(120, 40), vec(140, 40)).at(-1)).toEqual(vec(160, 40));
    const game = new Game(map, false); game.setMode('wasted'); game.recover();
    expect(game.driver.position).toEqual(entrance);
    expect(Object.isFrozen(prop.building!.artwork!.bounds)).toBe(true);
  });

  it('works with no special buildings or campuses', () => {
    const world = new World(mapWith({ buildings: [], campuses: [] }));
    expect(world.map.city.closedRoads).toEqual([]);
    expect(world.navigation.roadPath(vec(100, 43), vec(180, 43))).toEqual([vec(100, 43), vec(180, 43)]);
  });

  it('adds another building type and a horizontal campus entirely through data', () => {
    const catalogue = { ...buildingDefinitions, library: { ...buildingDefinitions.landmark, width: 66, height: 26, storeys: 5 } };
    const content: CityContent = {
      buildings: [...cityContent.buildings, { id: 'central-library', type: 'library', owner: 'city', blockId: 'city-block-4-3', position: vec(200, 140), label: 'CENTRAL LIBRARY', color: '#596b70' }],
      campuses: [...cityContent.campuses, {
        id: 'library-campus', position: vec(200, 140), width: 68, height: 28, blocks: ['city-block-4-3', 'city-block-5-3'], props: [],
        residents: { 'city-block-4-3': [vec(170, 126), vec(176, 126), vec(182, 126), vec(188, 126)], 'city-block-5-3': [vec(210, 126), vec(216, 126), vec(222, 126), vec(228, 126)] },
      }],
    };
    const map = mapWith(content, catalogue), world = new World(map);
    const library = world.props.find(p => p.sourceId === 'central-library')!;
    expect(library.building!.presentation.fallback).toBe('terraced');
    expect([library.body.w, library.body.h]).toEqual([66, 26]);
    expect(map.city.closedRoads).toHaveLength(2);
    expect(world.navigation.roadNeighbours(vec(200, 120))).not.toContainEqual(vec(200, 160));
    const route = world.navigation.roadPath(vec(203, 100), vec(203, 180));
    expect(route[0]).toEqual(vec(203, 100)); expect(route.at(-1)).toEqual(vec(203, 180));
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i], distance = dist(a, b), angle = Math.atan2(b.y - a.y, b.x - a.x);
      expect(citySegmentOpen(map.city, a, b)).toBe(true);
      for (let d = 0; d <= distance; d += 0.5) for (const model of ['car', 'truck-loaded'] as const) {
        const p = vec(a.x + (b.x - a.x) * d / distance, a.y + (b.y - a.y) * d / distance);
        expect(contact(createVehicleBody(vehicleDefinition(model), p, angle), library.body)).toBeNull();
      }
    }
    expect(world.navigation.roadPath(vec(200, 140), vec(203, 180))).toEqual([vec(200, 140)]);
    expect(world.people.some(p => p.home.x === 170 && p.home.y === 126)).toBe(true);
    expect(world.random()).toBe(new World().random());
  });

  it('lets another type reuse registered artwork without placement or renderer conditions', () => {
    const catalogue = { ...buildingDefinitions, clinic: buildingDefinitions.hospital };
    const building = compileBuilding({ id: 'a-new-clinic', type: 'clinic', owner: 'city', blockId: 'city-block-5-4', position: vec(220, 180), label: 'EAST CLINIC', color: '#596b70' }, catalogue);
    expect(artworkFor({ kind: 'building', sourceId: building.id, building, body: new Body(220, 180, Infinity, building.width, building.height) })!.image).toBe('hospital');
  });

  it('deterministically compiles the current content when a placement replaces a park', () => {
    const world = new World(mapWith({ ...cityContent, buildings: [...cityContent.buildings, { id: 'garden-hall', type: 'landmark', owner: 'city', blockId: 'city-block-2-2', position: vec(100.5, 100.5), label: 'GARDEN HALL', color: '#596b70', replaceBlock: true }] }));
    expect(world.blocks.find(b => b.id === 'city-block-2-2')!.park).toBe(false);
    expect(world.props.some(p => p.sourceId === 'garden-hall')).toBe(true);
    expect(world.props).toEqual(new World(world.map).props);
    expect(world.people).toEqual(new World(world.map).people);
  });

  it('replaces one generated shop with a new type while preserving its neighbours and alleys', () => {
    const catalogue = { ...buildingDefinitions, bakery: buildingDefinitions.shop };
    const id = 'city-building-0-2-shop-0-0';
    const map = mapWith({ ...cityContent, buildings: [...cityContent.buildings, { id, type: 'bakery', owner: 'city', blockId: 'city-block-0-2', position: vec(14, 94), label: 'BAKERY', color: '#596b70' }] }, catalogue);
    const before = new World(), after = new World(map), original = before.map.city.blocks.find(b => b.id === 'city-block-0-2')!, changed = map.city.blocks.find(b => b.id === original.id)!;
    expect(changed.alleys).toBe(original.alleys);
    expect(changed.buildings.map(b => b.id)).toEqual(original.buildings.map(b => b.id));
    expect(changed.buildings.find(b => b.id === id)!.type).toBe('bakery');
    expect(artworkFor(after.props.find(p => p.sourceId === id)!)!.image.startsWith('shop')).toBe(true);
    expect(after.props.length).toBe(before.props.length);
    expect(after.random()).toBe(before.random());
  });

  it('reports invalid authored residents and service entrances by stable entity', () => {
    const map = mapWith({ ...cityContent,
      buildings: cityContent.buildings.map(b => b.features ? { ...b, features: b.features.map(f => ({ ...f, offset: vec(0, 0) })) } : b),
      campuses: cityContent.campuses.map(s => ({ ...s, residents: { ...s.residents, 'city-block-3-0': [vec(140, 40), vec(154, 14), vec(126, 26), vec(154, 26)] } })),
    });
    const result = validateMap(map.document, map);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'resident-home-blocked', entityIds: ['city-block-3-0', 'city-building-3-1-landmark'] }));
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'recovery-entrance-blocked', entityIds: ['city-building-3-1-landmark'] }));
  });
});

import { describe, expect, it } from 'vitest';
import { citySegmentOpen } from './city';
import { compileMap, defaultCompiledMap } from './map/compile';
import { copyDefaultMap } from './map/default';
import { World } from './world';
import { Game } from './game';
import { Body, contact, vec } from './physics';
import { createVehicleBody, vehicleDefinition } from './vehicles';
import { occluderFor, pointInConvex } from './lighting-occlusion';

describe('city building scale and access', () => {
  it('compiles independent, frozen city footprints with stable identities', () => {
    const a = compileMap(copyDefaultMap()), b = compileMap(copyDefaultMap());
    expect(a.city).toEqual(b.city); expect(a.city).not.toBe(b.city);
    expect(Object.isFrozen(a.city.buildings[0].position)).toBe(true);
    expect(Object.isFrozen(a.city.blocks[0].buildings)).toBe(true);
    expect(new Set(a.city.buildings.map(p => p.id)).size).toBe(a.city.buildings.length);
    const sizes = new Set(a.city.buildings.map(p => `${p.width}x${p.height}`));
    expect(sizes).toEqual(new Set(['10x10', '23x10', '10x23', '23x23', '26x66']));
    const world = new World(a);
    for (const building of a.city.buildings) {
      const prop = world.props.find(p => p.sourceId === building.id)!;
      expect(prop.building).toBe(building);
      expect(prop.body.position).toEqual(building.position);
      expect([prop.body.w, prop.body.h]).toEqual([building.width, building.height]);
    }
  });

  it('keeps merged footprints clear of props and waiting pedestrians', () => {
    const world = new World();
    for (const prop of world.props.filter(p => p.building && (p.body.w > 10 || p.body.h > 10))) {
      for (const other of world.hash.query(prop.body)) {
        if (other !== prop) expect(contact(prop.body, other.body)?.depth ?? 0, `${prop.sourceId} / ${other.label || other.kind}`).toBeLessThan(0.001);
      }
      for (const person of world.people) {
        expect(contact(prop.body, new Body(person.home.x, person.home.y, 75, 0.7, 0.7)), `${prop.sourceId} / person ${person.id}`).toBeNull();
      }
    }
  });

  it('sweeps actual car and truck bodies along both street lanes and retained alleys', () => {
    const world = new World(), buildings = world.props.filter(p => p.building);
    const clear = (body: Body) => {
      for (const prop of buildings) expect(contact(body, prop.body), prop.sourceId).toBeNull();
    };
    for (const model of ['car', 'truck-loaded'] as const) {
      for (const road of world.map.city.roads) for (const lane of [-3, 3]) for (let along = 0; along <= 40; along += 2) {
        const vertical = road.from.x === road.to.x;
        const p = vertical ? vec(road.from.x + lane, road.from.y + along) : vec(road.from.x + along, road.from.y + lane);
        clear(createVehicleBody(vehicleDefinition(model), p, vertical ? Math.PI / 2 : 0));
      }
      for (const block of world.blocks.filter(b => !b.special && !b.park)) for (let along = 4; along <= 36; along += 0.5) {
        if (['vertical', 'cross', 'west'].includes(block.alleys)) clear(createVehicleBody(vehicleDefinition(model), vec(block.x + 20.5, block.y + along), Math.PI / 2));
        if (['horizontal', 'cross'].includes(block.alleys)) clear(createVehicleBody(vehicleDefinition(model), vec(block.x + along, block.y + 20.5)));
      }
    }
  });

  it('retains story frontages and the simulation random stream', () => {
    const game = new Game(undefined, false);
    expect(Object.fromEntries(Object.entries(game.campaignSites).map(([key, p]) => [key, p?.body.position]))).toEqual({
      cafe: vec(94, 54), newsroom: vec(14, 107), hotel: vec(174, 107),
    });
    expect(game.world.random()).toBe(0.781380180735141);
  });

  it('occupies two blocks and the former street while keeping both outer intersections open', () => {
    const { city } = defaultCompiledMap, world = new World();
    const site = city.campuses[0], hospital = world.props.find(p => p.label === 'HOSPITAL')!;
    expect(site.blocks).toEqual(['city-block-3-0', 'city-block-3-1']);
    expect(hospital.body.h).toBeGreaterThan(40 + 23);
    expect(contact(hospital.body, new Body(140, 40, 1000, 4.2, 2.1))).not.toBeNull();
    expect(world.navigation.roadDistance(vec(140, 40))).toBe(20);
    expect(world.navigation.roadNeighbours(vec(120, 40))).not.toContainEqual(vec(160, 40));
    expect(world.navigation.roadNeighbours(vec(160, 40))).not.toContainEqual(vec(120, 40));
    expect(world.navigation.roadNeighbours(vec(120, 40))).toContainEqual(vec(120, 80));
    expect(world.navigation.roadNeighbours(vec(160, 40))).toContainEqual(vec(160, 0));
    expect(citySegmentOpen(city, vec(100, 43), vec(180, 43))).toBe(false);
    expect(citySegmentOpen(city, vec(120, 0), vec(120, 80))).toBe(true);
  });

  it('routes car/truck bodies around the former street in both directions, including approaches on its lanes', () => {
    const world = new World(), hospital = world.props.find(p => p.label === 'HOSPITAL')!;
    for (const [a, b] of [[vec(100, 43), vec(180, 43)], [vec(180, 37), vec(100, 37)], [vec(123, 15), vec(163, 65)]]) {
      const path = world.navigation.roadPath(a, b);
      expect(path[0]).toEqual(a); expect(path.at(-1)).toEqual(b);
      expect(path.length).toBeGreaterThan(2);
      for (let i = 1; i < path.length; i++) {
        const from = path[i - 1], to = path[i], distance = Math.hypot(to.x - from.x, to.y - from.y), angle = Math.atan2(to.y - from.y, to.x - from.x);
        expect(citySegmentOpen(world.map.city, from, to)).toBe(true);
        for (let d = 0; d <= distance; d += 0.5) for (const model of ['car', 'truck-loaded'] as const) {
          const p = vec(from.x + (to.x - from.x) * d / distance, from.y + (to.y - from.y) * d / distance);
          expect(contact(createVehicleBody(vehicleDefinition(model), p, angle), hospital.body)).toBeNull();
        }
      }
    }
    // Interior targets do not fabricate a route through the hospital wall.
    const target = world.navigation.roadPath(vec(120, 40), vec(140, 40));
    expect(target.at(-1)).toEqual(vec(160, 40));
    expect(world.navigation.roadPath(vec(140, 40), vec(180, 40))).toEqual([vec(140, 40)]);
  });

  it('uses the full landmark roof to block light and physical driving', () => {
    const hospital = defaultCompiledMap.city.buildings.find(b => b.label === 'HOSPITAL')!;
    const game = new Game(undefined, false); game.vehicles = [game.player]; game.setMode('playing');
    const prop = game.world.props.find(p => p.sourceId === hospital.id)!;
    const outline = occluderFor(prop, hospital.silhouette)!;
    expect(pointInConvex(vec(130, 50), outline.points)).toBe(true);
    game.player.body.position = vec(140, 2); game.player.body.angle = Math.PI / 2; game.player.body.velocity = vec(0, 16);
    game.keys.add('KeyW');
    for (let i = 0; i < 120; i++) game.update(1 / 120);
    expect(game.player.body.position.y).toBeLessThan(5);
    expect(game.health).toBeLessThan(100);
    expect(contact(game.player.body, prop.body)?.depth ?? 0).toBeLessThan(0.025);
    expect(prop.alive).toBe(true);
  });

  it.each(['car', 'truck-loaded'] as const)('physically drives a %s around the hospital instead of taking the closed street', model => {
    const game = new Game(undefined, false); game.setTrafficCount(0); game.vehicles = [game.player]; game.setMode('playing');
    game.player.body.position = vec(244, 244);
    const vehicle = game.spawnVehicle({ model, position: vec(100, 43), angle: 0 });
    const target = vec(180, 43), hospital = game.world.props.find(p => p.label === 'HOSPITAL')!;
    vehicle.path = game.world.navigation.roadPath(vehicle.body.position, target).slice(1);
    let reached = false;
    // Keep the full physical journey, including the loaded truck's slow corners.
    for (let i = 0; i < 60 * 120; i++) {
      game.update(1 / 120);
      expect(contact(vehicle.body, hospital.body)?.depth ?? 0).toBeLessThan(0.025);
      if (Math.hypot(vehicle.body.position.x - target.x, vehicle.body.position.y - target.y) < 6) { reached = true; break; }
    }
    expect(reached, JSON.stringify({ position: vehicle.body.position, path: vehicle.path, phase: vehicle.ai.phase })).toBe(true); expect(vehicle.damage.health).toBe(100);
    expect(vehicle.ai.attempts).toBe(0);
  }, 20000);
});

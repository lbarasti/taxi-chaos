import { describe, expect, it } from 'vitest';
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
    expect(sizes).toEqual(new Set(['10x10', '23x10', '10x23', '23x23']));
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
      for (let street = 0; street <= 240; street += 40) for (const lane of [-3, 3]) for (let along = 0; along <= 240; along += 2) {
        clear(createVehicleBody(vehicleDefinition(model), vec(street + lane, along), Math.PI / 2));
        clear(createVehicleBody(vehicleDefinition(model), vec(along, street + lane)));
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

  it('uses the full landmark roof to block light and physical driving', () => {
    const hospital = defaultCompiledMap.city.buildings.find(b => b.label === 'HOSPITAL')!;
    const game = new Game(undefined, false); game.vehicles = [game.player]; game.setMode('playing');
    const prop = game.world.props.find(p => p.sourceId === hospital.id)!;
    const outline = occluderFor(prop, hospital.silhouette)!;
    expect(pointInConvex(vec(130, 50), outline.points)).toBe(true);
    game.player.body.position = vec(140.5, 44); game.player.body.angle = Math.PI / 2; game.player.body.velocity = vec(0, 16);
    game.keys.add('KeyW');
    for (let i = 0; i < 120; i++) game.update(1 / 120);
    expect(game.player.body.position.y).toBeLessThan(47);
    expect(game.health).toBeLessThan(100);
    expect(contact(game.player.body, prop.body)?.depth ?? 0).toBeLessThan(0.025);
    expect(prop.alive).toBe(true);
  });
});

import { createNavigation } from './world';
import { describe, expect, it } from 'vitest';
import { Body, contact, dist, vec, type Vec } from '../physics/physics';
import { pathLength } from './countryside';
import { World, district } from './world';
import { Game } from '../game/game';
import { defaultCompiledMap } from '../map/compile';
import { loadScenario } from '../debug/lab';
import { killPedestrian, updatePedestrians } from './pedestrians';

const { BRIDGE_Y, COUNTRY_ROADS, HIGHLAND_STOPS, ROAD_NODES, countryAccess } = defaultCompiledMap.country;
const { roadDistance, roadNeighbours, roadPath, roadProjection } = createNavigation(defaultCompiledMap);
const { inOcean } = defaultCompiledMap.land;

function samples(points: Vec[], stride = 2): { point: Vec; angle: number }[] {
  return points.flatMap((b, i) => {
    if (!i) return [];
    const a = points[i - 1], steps = Math.ceil(dist(a, b) / stride), angle = Math.atan2(b.y - a.y, b.x - a.x);
    return Array.from({ length: steps + 1 }, (_, j) => ({ point: vec(a.x + (b.x - a.x) * j / steps, a.y + (b.y - a.y) * j / steps), angle }));
  });
}

describe('eastern bridges and highland roads', () => {
  it('keeps rural corpses at the impact site and stops their kick at bridge rails', () => {
    const world = new World(); world.people = [];
    for (const position of [vec(358, 114), vec(404, 245), vec(276, 85)]) {
      const person = world.addPerson(position);
      killPedestrian(person, vec(0, 20), 0);
      updatePedestrians(world, [], { gore: true }, 1 / 120, 1 / 120);
      expect(dist(person.position, position)).toBeLessThan(0.1);
    }
    for (let i = 0; i < 240; i++) updatePedestrians(world, [], { gore: true }, 1 / 120, (i + 2) / 120);
    const bridgeCorpse = world.people[2];
    expect(bridgeCorpse.position.y).toBeLessThan(87);
    const probe = new Body(bridgeCorpse.position.x, bridgeCorpse.position.y, 1, 0.6, 0.6);
    expect([...world.hash.query(probe)].filter(p => contact(probe, p.body))).toEqual([]);
  });
  it('opens both bridge decks for cars and walkers while treating the river as drowning water elsewhere', () => {
    const world = new World();
    for (const y of BRIDGE_Y) for (let x = 244; x <= 310; x += 2) for (const lane of [-3, 0, 3]) {
      const car = new Body(x, y + lane);
      expect(inOcean(car.position)).toBe(false);
      expect([...world.hash.query(car)].filter(p => contact(car, p.body)), `blocked deck at ${x},${y + lane}`).toEqual([]);
    }
    for (const y of [20, 40, 120, 160, 235]) {
      const probe = new Body(276, y, 1, 0.7, 0.7);
      expect(inOcean(probe.position)).toBe(true);
      expect([...world.hash.query(probe)].filter(p => contact(probe, p.body))).toEqual([]);
      expect(roadDistance(probe.position)).toBeGreaterThan(6);
    }
  });
  it('keeps the entire curved network free of solid scenery, including bends and shore landings', () => {
    const world = new World();
    for (const road of COUNTRY_ROADS) for (const { point, angle } of samples(road.points)) {
      const car = new Body(point.x, point.y); car.angle = angle;
      expect([...world.hash.query(car)].filter(p => contact(car, p.body)), `blocked ${road.name} at ${point.x},${point.y}`).toEqual([]);
    }
  });
  it('routes city/highland journeys in both directions through an actual bridge and follows the bends', () => {
    for (const stop of HIGHLAND_STOPS) for (const start of [vec(204, 44), vec(204, 204)]) {
      for (const [a, b] of [[start, stop.position], [stop.position, start]]) {
        const route = roadPath(a, b);
        expect(route[0]).toEqual(a); expect(route.at(-1)).toEqual(b);
        const crossings = samples(route).filter(s => s.point.x > 256 && s.point.x < 296 && s.point.y < 254);
        expect(crossings.length).toBeGreaterThan(0);
        for (const { point } of crossings) expect(BRIDGE_Y.some(y => Math.abs(point.y - y) < 0.01)).toBe(true);
        for (const { point } of samples(route)) expect(roadDistance(point)).toBeLessThan(6.01);
      }
    }
    const ridge = roadPath(ROAD_NODES[2], ROAD_NODES[3]);
    expect(ridge.length).toBeGreaterThan(10);
    expect(pathLength(ridge)).toBeGreaterThan(dist(ROAD_NODES[2], ROAD_NODES[3]) + 5);
  });
  it('allows traffic to enter and leave both bridge mouths and projects onto real curved roads', () => {
    expect(roadNeighbours(ROAD_NODES[0])).toContainEqual(ROAD_NODES[1]);
    expect(roadNeighbours(ROAD_NODES[1])).toContainEqual(ROAD_NODES[0]);
    expect(roadNeighbours(ROAD_NODES[7])).toContainEqual(ROAD_NODES[6]);
    expect(roadNeighbours(ROAD_NODES[6])).toContainEqual(ROAD_NODES[7]);
    const p = vec(415, 72), projected = roadProjection(p);
    expect(countryAccess(projected).distance).toBeLessThan(0.001);
    expect(district(vec(340, 100))).toBe('PINE WOODS');
    expect(district(vec(474, 58))).toBe('EAGLE HIGHLANDS');
  });
  it('physically drives a cab across each bridge without damage or entering water', () => {
    for (const y of BRIDGE_Y) {
      const g = new Game(); loadScenario(g, 'eastern-bridges');
      g.player.body.position = vec(236, y); g.world.people = [];
      g.keys = new Set(['KeyW']);
      for (let i = 0; i < 5 * 120; i++) g.update(1 / 120);
      expect(g.player.body.position.x).toBeGreaterThan(310);
      expect(g.health).toBe(100);
      expect(Math.abs(g.player.body.position.y - y)).toBeLessThan(0.1);
    }
  });
  it('dispatches rural jobs with road-distance pay and enough time for the bridge detour', () => {
    const g = new Game(undefined, false, false);
    expect(g.job.pickup).toEqual(vec(4, 14)); expect(g.job.dropoff).toEqual(vec(44, 14));
    g.offer = 2; g.newJob(); // Third dispatched trip includes Eagle Lookout as its destination.
    expect(g.job.pickup.x > 246 || g.job.dropoff.x > 246).toBe(true);
    const distance = pathLength(roadPath(g.job.pickup, g.job.dropoff));
    expect(g.job.fare).toBe(Math.round((55 + distance * 0.7) / 10));
    expect(g.job.time).toBeCloseTo(28 + distance / 3);
  });
  it('loads and pays rural parcel deliveries using the road-distance fare', () => {
    const g = new Game(undefined, false, false); g.vehicles = [g.player]; g.world.people = []; g.settings.noPolice = true; g.setMode('playing');
    g.player = g.spawnVehicle({ kind: 'taxi', model: 'motorcycle', position: { ...g.player.body.position } }); g.vehicles = [g.player]; g.offer = 2; g.newJob();
    const fare = g.job.fare, cash = g.save.cash;
    expect(g.job.type).toBe('parcel'); expect(g.job.destination).toBe('Eagle Lookout');
    g.player.body.position = { ...g.job.pickup };
    for (let i = 0; i < 100; i++) g.update(1 / 120);
    expect(g.job.stage).toBe('dropoff');
    g.player.body.position = { ...g.job.dropoff };
    for (let i = 0; i < 100; i++) g.update(1 / 120);
    expect(g.jobsDone).toBe(1); expect(g.save.cash).toBeGreaterThanOrEqual(cash + fare);
  });
  it('drives civilian traffic over a bridge in either direction and around the ridge bends', () => {
    for (const [from, to] of [[vec(236, 80), vec(358, 114)], [vec(310, 200), vec(204, 204)], [vec(358, 114), vec(474, 58)]]) {
      const g = new Game(); g.vehicles = [g.player]; g.world.people = []; g.settings.noPolice = true; g.setMode('playing');
      g.player.body.position = vec(4, 32);
      const path = roadPath(from, to), angle = Math.atan2(path[1].y - from.y, path[1].x - from.x);
      const car = g.vehicle('traffic', from.x, from.y, angle, '#91b5b0'); car.path = path.slice(1);
      let reached = false;
      for (let i = 0; i < 30 * 120; i++) {
        g.update(1 / 120);
        if (dist(car.body.position, to) < 8) { reached = true; break; }
      }
      expect(reached, `traffic failed ${from.x},${from.y} to ${to.x},${to.y}`).toBe(true);
      expect(car.damage.health).toBe(100);
    }
  });
  it('pursues a rural sighting over Pine Bridge and follows the ridge bends', () => {
    const g = new Game(); g.vehicles = [g.player]; g.world.people = []; g.settings.noPolice = true; g.setMode('playing');
    g.player.body.position = vec(474, 58);
    const cop = g.vehicle('police', 236, 80, 0, '#cfdfdf'); cop.ai.role = 'pursuit';
    let reached = false;
    for (let i = 0; i < 40 * 120; i++) {
      g.policeIntel = { position: { ...g.player.body.position }, velocity: vec(), seenAt: g.time };
      g.update(1 / 120);
      if (dist(cop.body.position, g.player.body.position) < 12) { reached = true; break; }
    }
    expect(reached).toBe(true); expect(cop.damage.health).toBe(100);
  });
});

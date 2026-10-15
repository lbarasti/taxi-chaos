import { describe, expect, it } from 'vitest';
import { residentialActivity } from './residential-activity';
import { Game } from './game';
import { Body, contact, dist, vec } from './physics';
import { updatePedestrians } from './pedestrians';
import { copyDefaultMap } from './map/default';
import { compileMap } from './map/compile';
import { MapHistory } from './map/operations';
import { assertMap } from './map/schema';

const residents = (g: Game) => g.world.people.filter(p => p.residentialSlot !== undefined && p.alive);
const localCars = (g: Game) => g.vehicles.filter(v => g.map.document.trafficSpawns.some(s => s.id === v.sourceId && s.activity === 'residential') && v.kind === 'traffic');

describe('residential daily activity', () => {
  it.each([6, 7, 8.99, 9, 16.99, 17, 19.99, 20, 21.99, 22, 2])('uses civil time at %s, including the full 17–20 evening peak', hour => {
    const peak = hour >= 7 && hour < 9 || hour >= 17 && hour < 20;
    expect(residentialActivity(hour).traffic).toBe(peak ? 1 : hour >= 6 && hour < 22 ? .6 : .2);
    expect(residentialActivity(hour + 24)).toEqual(residentialActivity(hour));
  });

  it('scales real bodies through both peaks and overnight without consuming the gameplay RNG', () => {
    const g = new Game(undefined, false, false), control = new Game(undefined, false, false);
    for (const [hour, cars, people] of [[2, 2, 3], [8, 10, 18], [12, 6, 11], [18, 10, 18], [20, 6, 11], [23, 2, 3]]) {
      g.dayNight.configure({ hour, frozen: true }); g.maintenance(5);
      expect(localCars(g)).toHaveLength(cars); expect(residents(g)).toHaveLength(people);
      for (const car of localCars(g)) expect([...g.world.hash.query(car.body)].some(p => contact(car.body, p.body))).toBe(false);
      expect(g.world.random()).toBe(control.world.random());
    }
  });

  it('never removes nearby people, a passenger, the driven car or a burning fuse when night arrives', () => {
    const g = new Game(undefined, false, false), person = residents(g).at(-1)!;
    const car = localCars(g).at(-1)!; g.player.body.position = { ...person.position };
    const passenger = residents(g).at(-2)!; passenger.aboard = true; g.job.customerId = passenger.id;
    const burning = localCars(g).at(-2)!; burning.damage.status = 'burning';
    g.dayNight.configure({ hour: 2, frozen: true }); g.maintenance(5);
    expect(g.world.people).toContain(person); expect(g.world.people).toContain(passenger);
    expect(g.vehicles).toContain(burning);
    g.player = car; g.maintenance(5); expect(g.vehicles).toContain(car);
  });

  it('keeps resident walks clear, bounded and moving along the compiled curbs', () => {
    const g = new Game(undefined, false, false), people = residents(g);
    const starts = people.map(p => ({ ...p.position })); g.world.people = people;
    for (let frame = 0; frame < 20 * 60; frame++) updatePedestrians(g.world, [], { gore: false }, 1 / 60, frame / 60);
    for (const [i, person] of people.entries()) {
      expect(dist(person.position, starts[i]), `resident ${i} moves`).toBeGreaterThan(1);
      expect(g.map.coast.inOcean(person.position)).toBe(false);
      const probe = new Body(person.position.x, person.position.y, 1, .42, .42);
      expect([...g.world.hash.query(probe)].some(p => contact(probe, p.body))).toBe(false);
      expect(g.world.navigation.roadDistance(person.position)).toBeLessThan(6);
    }
  });

  it('respects explicit laboratory traffic counts and deletion of local spawns', () => {
    const g = new Game(undefined, false, false); g.setTrafficCount(0);
    g.dayNight.configure({ hour: 18 }); g.maintenance(5); expect(localCars(g)).toHaveLength(0);
    const d = copyDefaultMap(); d.trafficSpawns = d.trafficSpawns.filter(s => s.activity !== 'residential');
    const edited = new Game(compileMap(d), false, false); edited.maintenance(5); expect(localCars(edited)).toHaveLength(0);
  });
});

describe('authored residential geometry', () => {
  it('keeps footprint moves, resizing and undo lossless with no ID-dependent behavior', () => {
    const d = copyDefaultMap(), building = d.countryProps.find(p => p.architecture)!;
    building.id = 'renamed-residential-house';
    const h = new MapHistory(d), before = h.export();
    h.apply({ baseRevision: h.snapshot().revision, operations: [{ type: 'resize', targetId: building.id, width: building.width * 1.1, height: building.height * 1.1 }, { type: 'translate', targetId: building.id, delta: vec(1, 2) }] });
    const g = new Game(compileMap(h.snapshot().document), false, false), prop = g.world.props.find(p => p.sourceId === building.id)!;
    for (const [i, p] of prop.body.vertices!.entries()) { expect(p.x).toBeCloseTo(building.architecture!.outline[i].x * 1.1, 10); expect(p.y).toBeCloseTo(building.architecture!.outline[i].y * 1.1, 10); }
    expect(g.map.pobleSec!.roofs.find(r => r.id === building.id)!.outline).toEqual(prop.body.vertices);
    h.undo(); expect(h.export()).toBe(before); h.redo(); expect(h.snapshot().document.countryProps.find(p => p.id === building.id)!.position).toEqual(vec(building.position.x + 1, building.position.y + 2));
  });

  it.each(['concave', 'clockwise', 'outside', 'style', 'activity', 'amenity', 'block-ref'])('rejects malformed residential data: %s', kind => {
    const d = copyDefaultMap(), architecture = d.countryProps.find(p => p.architecture)!.architecture!;
    if (kind === 'concave') architecture.outline[1] = vec();
    if (kind === 'clockwise') architecture.outline.reverse();
    if (kind === 'outside') architecture.outline[0].x = 999;
    if (kind === 'style') Object.assign(architecture, { style: 'invented' });
    if (kind === 'activity') Object.assign(d.trafficSpawns[0], { activity: 'invented' });
    if (kind === 'amenity') d.stops[0].amenity = 'missing';
    if (kind === 'block-ref') d.neighbourhood.blocks[0].corners[0] = 'missing';
    expect(() => assertMap(d)).toThrow();
  });
});

describe('residential fare integration', () => {
  it('dispatches every named neighbourhood stop for fares and parcels, with real route pay and physical service', () => {
    for (const model of ['car', 'motorcycle'] as const) {
      const g = new Game(undefined, false, false); g.setTrafficCount(0); g.settings.noPolice = true; g.start();
      if (model === 'motorcycle') { g.player = g.spawnVehicle({ kind: 'taxi', model, position: vec(4, 32) }); g.vehicles = [g.player]; }
      const names = new Set<string>();
      for (let offer = 1; offer <= g.missions.catalogue.stops.routeStops.length * 2; offer++) {
        // Independent dispatch fixtures; placement is confined to service tests.
        g.offer = offer - 1; g.player.body.position = vec(402.44, 77.161); g.newJob();
        const stop = g.map.country.HIGHLAND_STOPS.slice(0, 4).find(s => dist(s.position, g.job.dropoff) < .01);
        if (!stop) continue;
        names.add(stop.name); expect(g.job.destination).toBe(stop.name);
        const route = g.world.navigation.roadPath(g.job.pickup, g.job.dropoff);
        expect(route.every(p => !g.map.coast.inOcean(p))).toBe(true);
        const distance = route.reduce((sum, p, i) => sum + (i ? dist(route[i - 1], p) : 0), 0);
        expect(g.job.fare).toBe(Math.round(55 + distance * .7)); expect(g.job.time).toBeCloseTo(28 + distance / 3);
        const fare = g.job.fare, cash = g.save.cash, jobs = g.jobsDone;
        g.player.body.position = { ...g.job.pickup };
        for (let frame = 0; frame < 110; frame++) g.update(1 / 120);
        expect(g.job.stage).toBe('dropoff');
        g.player.body.position = { ...g.job.dropoff };
        for (let frame = 0; frame < 110; frame++) g.update(1 / 120);
        expect(g.jobsDone).toBe(jobs + 1); expect(g.save.cash).toBeGreaterThanOrEqual(cash + fare);
      }
      expect([...names].sort()).toEqual(['Poble-sec', 'Parc del Mirador', 'Les Tres Xemeneies', 'Plaça del Sol'].sort());
    }
  }, 30000);
});

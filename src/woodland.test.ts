import { describe, expect, it } from 'vitest';
import { Body, contact, dist, vec } from './physics';
import { COUNTRY_ROADS, GOLF_COURSE, HIGHLAND_STOPS, VILLAS, VILLA_DRIVES, countryAccess, inCountryClearing, inHighlands, pathLength } from './countryside';
import { World, district, roadDistance, roadNeighbours, roadNode, roadPath, roadProjection } from './world';
import { Game } from './game';
import { loadScenario } from './lab';

const woodlandStops = HIGHLAND_STOPS.slice(4);

describe('southern woodland estates and golf club', () => {
  it('wraps the eastern woods below the city in a mirrored L and preserves the inlet', () => {
    for (const p of [vec(320, 20), vec(510, 180), vec(480, 340), vec(220, 370), vec(30, 340)]) expect(inHighlands(p)).toBe(true);
    for (const p of [vec(120, 120), vec(120, 260), vec(270, 180), vec(-30, 330), vec(220, 450)]) expect(inHighlands(p)).toBe(false);
    expect(district(vec(60, 316))).toBe('CEDAR WOODS');
    expect(district(vec(132, 338))).toBe('FAIRWAY CLUB');
    expect(district(vec(242, 330))).toBe('WOODLAND ESTATES');
  });

  it('keeps both lanes of the extended winding roads clear of estate scenery', () => {
    const world = new World();
    for (const road of COUNTRY_ROADS.slice(8)) for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], angle = Math.atan2(b.y - a.y, b.x - a.x);
      for (const lane of [-3, 0, 3]) {
        const car = new Body(b.x - Math.sin(angle) * lane, b.y + Math.cos(angle) * lane); car.angle = angle;
        expect([...world.hash.query(car)].filter(p => contact(car, p.body)), `${road.name}, lane ${lane} at ${b.x},${b.y}`).toEqual([]);
      }
    }
  });

  it('builds solid villas with accessible driveways, residents and a clear golf course', () => {
    const world = new World();
    expect(VILLAS.length).toBe(12);
    for (const [i, villa] of VILLAS.entries()) {
      expect(inHighlands(villa.position)).toBe(true);
      const prop = world.props.find(p => p.label === `VILLA ${villa.name}`)!;
      expect(prop.hp).toBe(Infinity);
      expect(world.people.some(p => dist(p.home, villa.position) < 16)).toBe(true);
      const [a, b] = VILLA_DRIVES[i], angle = Math.atan2(b.y - a.y, b.x - a.x), steps = Math.ceil(dist(a, b));
      for (let j = 0; j <= steps; j++) {
        const car = new Body(a.x + (b.x - a.x) * j / steps, a.y + (b.y - a.y) * j / steps); car.angle = angle;
        expect([...world.hash.query(car)].filter(p => contact(car, p.body)), `blocked driveway: ${villa.name}`).toEqual([]);
      }
    }
    expect(world.props.some(p => p.label === 'FAIRWAY CLUB')).toBe(true);
    for (const prop of world.props.filter(p => p.kind === 'tree' || p.kind === 'rock')) expect(inCountryClearing(prop.body.position), `${prop.kind} ${prop.body.position.x},${prop.body.position.y}`).toBe(false);
    expect(inHighlands(GOLF_COURSE.center)).toBe(true);
  });

  it('projects southern positions onto curves and routes to and from the city through bridges', () => {
    for (const stop of woodlandStops) {
      expect(roadProjection(stop.position)).toEqual(stop.position);
      expect(roadDistance(stop.position)).toBeLessThan(0.001);
      expect(roadNeighbours(roadNode(stop.position)).length).toBeGreaterThan(0);
      for (const [from, to] of [[vec(124, 14), stop.position], [stop.position, vec(124, 14)]]) {
        const route = roadPath(from, to);
        expect(pathLength(route)).toBeGreaterThan(dist(from, to));
        expect(route.some((p, i) => i > 0 && p.y === route[i - 1].y && (p.y === 80 || p.y === 200) && Math.min(p.x, route[i - 1].x) <= 240 && Math.max(p.x, route[i - 1].x) >= 310)).toBe(true);
        for (const p of route) expect(roadDistance(p)).toBeLessThan(6.01);
      }
    }
    expect(countryAccess(vec(180, 330)).distance).toBeLessThan(15);
  });

  it('drives civilian traffic through the southern network without damage', () => {
    for (const [from, to] of [[vec(378, 170), vec(242, 330)], [vec(242, 330), vec(60, 316)], [vec(60, 316), vec(306, 390)]]) {
      const g = new Game(); loadScenario(g, 'woodland-estates'); g.world.people = [];
      g.player.body.position = vec(4, 32);
      const path = roadPath(from, to), car = g.vehicle('traffic', from.x, from.y, Math.atan2(path[1].y - from.y, path[1].x - from.x), '#a3b8ab'); car.path = path.slice(1);
      let reached = false;
      for (let i = 0; i < 50 * 120; i++) { g.update(1 / 120); if (dist(car.body.position, to) < 8) { reached = true; break; } }
      expect(reached, `traffic to ${to.x},${to.y}`).toBe(true);
      expect(car.damage.health).toBe(100);
    }
  });

  it('dispatches and pays a southern delivery with road-distance fare and time', () => {
    const g = new Game(); loadScenario(g, 'woodland-estates'); g.offer = 16; g.newJob();
    expect(g.job.dropoff).toEqual(vec(132, 338));
    expect(g.job.destination).toBe('Fairway Club');
    const distance = pathLength(roadPath(g.job.pickup, g.job.dropoff));
    expect(g.job.fare).toBe(Math.round(55 + distance * 0.7));
    expect(g.job.time).toBeCloseTo(28 + distance / 3);
    const fare = g.job.fare, cash = g.save.cash;
    g.world.people = []; g.player.body.position = { ...g.job.pickup };
    for (let i = 0; i < 100; i++) g.update(1 / 120);
    expect(g.job.stage).toBe('dropoff');
    g.player.body.position = { ...g.job.dropoff };
    for (let i = 0; i < 100; i++) g.update(1 / 120);
    expect(g.jobsDone).toBe(1); expect(g.save.cash).toBeGreaterThanOrEqual(cash + fare);
  });
});

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { loadScenario, repairVehicle, resumeFromPause, scenarioInfo, scenarioNames, scenarioDescriptions, isScenarioName, type ScenarioName } from './lab';
import { igniteVehicle } from './damage';
import { contact, dist, vec } from './physics';

const make = () => { const g = new Game(); g.setMode('playing'); return g; };
const trafficAlive = (g: Game) => g.vehicles.filter(v => v.alive && v.kind === 'traffic');
const at = (g: Game, kind: string, x: number, y: number) => g.vehicles.find(v => v.alive && v.kind === kind && dist(v.body.position, vec(x, y)) < 0.5);
// Any prop the cab currently intersects. Buildings/hydrants/trees all count as solid scenery.
const solidOverlap = (g: Game): string | null => {
  for (const prop of g.world.hash.query(g.player.body)) {
    const hit = contact(g.player.body, prop.body);
    if (hit && hit.depth > 0.02) return prop.kind;
  }
  return null;
};

describe('LAB scenario catalogue', () => {
  it('exposes every documented fixture with a description', () => {
    expect(scenarioNames).toEqual<ScenarioName[]>([
      'first-fare', 'motorcycle', 'moving-car-exit', 'moving-bike-exit', 'motorcycle-impact', 'rider-impact', 'eastern-bridges', 'woodland-estates', 'beach', 'beach-pickup', 'promenade', 'harbour', 'commercial-traffic', 'flammable-cargo', 'coastal-rails', 'coastal-gap', 'coastal-bike', 'coastal-walk', 'hydrant', 'alley', 'wall', 'traffic', 'npc-recovery', 'pileup', 'police-chase', 'arrest',
      'pedestrians', 'fire', 'cab-fire', 'chain-reaction', 'barracks', 'depot', 'gas-station',
    ]);
    for (const scenario of scenarioInfo) {
      expect(scenarioDescriptions[scenario.name]).toBe(scenario.description);
      expect(scenario.description.length).toBeGreaterThan(10);
    }
    expect(isScenarioName('hydrant')).toBe(true);
    expect(isScenarioName('nope')).toBe(false);
  });

  it.each(scenarioNames)('loads %s deterministically without a DOM', name => {
    const g = make();
    expect(loadScenario(g, name)).toBe(name);
    expect(g.mode).toBe('playing');
    expect(Number.isFinite(g.player.body.position.x)).toBe(true);
    expect(Number.isFinite(g.player.body.position.y)).toBe(true);
  });
});

describe('LAB fixtures', () => {
  it('stages both moving bailout demonstrations with deterministic speeds and vehicle types', () => {
    const car = make(); loadScenario(car, 'moving-car-exit');
    expect(car.player.model).toBe('car');
    expect(car.player.body.position).toEqual(vec(90, 80));
    expect(car.player.body.velocity.x).toBeCloseTo(18);
    expect(car.settings.noPolice).toBe(true);
    expect(car.interact()).toBe(true);
    expect(car.pendingExit).not.toBeNull();

    const bike = make(); loadScenario(bike, 'moving-bike-exit');
    expect(bike.player.model).toBe('motorcycle');
    expect(bike.player.body.position).toEqual(vec(90, 80));
    expect(bike.player.body.velocity.x).toBeCloseTo(5);
    expect(bike.job.type).toBe('parcel');
    expect(bike.settings.noPolice).toBe(true);
    expect(bike.interact()).toBe(true);
    expect(bike.pendingExit).not.toBeNull();
  });

  it('stages incoming motorcycle impacts for NPC and player rider ejection', () => {
    const npc = make(); loadScenario(npc, 'motorcycle-impact');
    expect(npc.player.model).toBe('car');
    const target = npc.vehicles.find(v => v.model === 'motorcycle')!;
    expect(target.body.position).toEqual(vec(109, 80));
    expect(target.body.velocity.x).toBeCloseTo(-5);
    expect(npc.player.body.velocity.x).toBeCloseTo(18);

    const rider = make(); loadScenario(rider, 'rider-impact');
    expect(rider.player.model).toBe('motorcycle');
    expect(rider.player.body.velocity.x).toBeCloseTo(12);
    const car = rider.vehicles.find(v => v !== rider.player && v.model === 'car')!;
    expect(car.body.position).toEqual(vec(111, 80));
    expect(car.body.velocity.x).toBeCloseTo(-12);
    expect(rider.job.type).toBe('parcel');
  });

  it('hydrant, alley and wall aim the cab south at the documented speeds', () => {
    const hydrant = make(); loadScenario(hydrant, 'hydrant');
    expect(hydrant.player.body.position).toEqual(vec(7.5, 3));
    expect(hydrant.player.body.velocity.y).toBeCloseTo(12, 5);

    const alley = make(); loadScenario(alley, 'alley');
    expect(alley.player.body.position).toEqual(vec(20.5, 4));
    expect(alley.player.body.velocity.y).toBeCloseTo(16, 5);

    const wall = make(); loadScenario(wall, 'wall');
    expect(wall.player.body.position).toEqual(vec(14, 4));
    expect(wall.player.body.velocity.y).toBeCloseTo(20, 5);
  });

  it('traffic stages a head-on NPC with no background traffic', () => {
    const g = make(); loadScenario(g, 'traffic');
    expect(trafficAlive(g)).toHaveLength(1);
    const other = trafficAlive(g)[0];
    expect(other.body.position).toEqual(vec(54, 0));
    expect(other.body.velocity.x).toBeLessThan(0);
    expect(other.path).toEqual([vec(4, 0)]);
  });

  it('npc-recovery watches the stuck car from a safe, unobstructed corner', () => {
    const g = make(); loadScenario(g, 'npc-recovery');
    const car = trafficAlive(g)[0];
    expect(car.body.position).toEqual(vec(14, 6.7));
    expect(car.path).toEqual([vec(14, 24)]);
    const distance = dist(g.player.body.position, car.body.position);
    expect(distance).toBeGreaterThan(8); // cab is outside the manoeuvre
    expect(distance).toBeLessThan(60);   // actor stays on camera
    expect(solidOverlap(g)).toBeNull();  // cab is not buried in scenery
    expect(g.settings.invincible).toBe(true);
    expect(g.settings.noPolice).toBe(true);
  });

  it('pileup watches both cars from the road, clear of the standoff', () => {
    const g = make(); loadScenario(g, 'pileup');
    const cars = trafficAlive(g);
    expect(cars).toHaveLength(2);
    expect(cars.map(c => c.body.position.x).sort((a, b) => a - b)).toEqual([88, 92.1]);
    expect(cars.every(c => c.body.position.y === 83)).toBe(true);
    for (const car of cars) {
      const distance = dist(g.player.body.position, car.body.position);
      expect(distance).toBeGreaterThan(8);
      expect(distance).toBeLessThan(60);
    }
    expect(solidOverlap(g)).toBeNull();
    expect(g.settings.invincible).toBe(true);
    expect(g.settings.noPolice).toBe(true);
  });

  it('keeps the NPC recovery physical with the cab spectating', () => {
    const g = make(); loadScenario(g, 'npc-recovery');
    const car = trafficAlive(g)[0];
    const start = { ...car.body.position };
    for (let i = 0; i < 10 * 120; i++) g.update(1 / 120);
    expect(car.ai.attempts).toBeGreaterThan(0);
    expect(dist(car.body.position, start)).toBeGreaterThan(8);
  });

  it('keeps the pileup standoff physical with the cab spectating', () => {
    const g = make(); loadScenario(g, 'pileup');
    const [a, b] = trafficAlive(g);
    for (let i = 0; i < 12 * 120; i++) g.update(1 / 120);
    expect(dist(a.body.position, b.body.position)).toBeGreaterThan(9);
    expect(a.ai.attempts + b.ai.attempts).toBeGreaterThan(0);
  });

  it('police-chase sets heat, intel and an active pursuit', () => {
    const g = make(); loadScenario(g, 'police-chase');
    expect(g.heat).toBe(55);
    expect(g.player.body.velocity.x).toBeCloseTo(18, 5);
    expect(g.policeIntel.seenAt).toBe(g.time);
    expect(g.police.length).toBeGreaterThan(0);
    expect(g.police.every(p => p.alive)).toBe(true);
  });

  it('arrest boxes a stopped cab with a stationary cop', () => {
    const g = make(); loadScenario(g, 'arrest');
    expect(g.speed).toBe(0);
    expect(g.heat).toBe(55);
    const cop = at(g, 'police', 88, 80);
    expect(cop).toBeTruthy();
    expect(cop!.body.velocity.x).toBe(0);
  });

  it('pedestrians puts three people on the road and enables gore for the run only', () => {
    const g = make(); loadScenario(g, 'pedestrians');
    const near = (x: number, y: number) => g.world.people.filter(p => dist(p.position, vec(x, y)) < 0.6);
    expect(near(4, 14).length).toBeGreaterThan(0);
    expect(near(4, 17.5).length).toBeGreaterThan(0);
    expect(near(4, 21).length).toBeGreaterThan(0);
    expect(g.settings.gore).toBe(true);
    loadScenario(g, 'first-fare');
    expect(g.settings.gore).toBe(false); // cleared by the next fixture, never persisted
  });

  it('fire lights an NPC with a 7s fuse and 42 HP', () => {
    const g = make(); loadScenario(g, 'fire');
    const npc = at(g, 'traffic', 20.5, 40);
    expect(npc).toBeTruthy();
    expect(npc!.damage.status).toBe('burning');
    expect(npc!.damage.health).toBe(42);
    expect(npc!.damage.fuse).toBeCloseTo(7, 5);
    expect(npc!.baseEngine).toBe(0); // parked for the burn
    const distance = dist(g.player.body.position, npc!.body.position);
    expect(distance).toBeGreaterThan(8);
    expect(distance).toBeLessThan(60);
    expect(solidOverlap(g)).toBeNull();
  });

  it('chain-reaction parks three damaged cars and ignites the front one', () => {
    const g = make(); loadScenario(g, 'chain-reaction');
    const cars = [80, 86, 92].map(x => at(g, 'traffic', x, 80));
    expect(cars.every(Boolean)).toBe(true);
    for (const car of cars) {
      expect(car!.damage.health).toBe(28);
      expect(car!.damage.critical.fuel).toBe(40);
      expect(car!.baseEngine).toBe(0);
    }
    const burning = cars.filter(c => c!.damage.status === 'burning');
    expect(burning).toHaveLength(1);
    expect(burning[0]!.damage.fuse).toBeCloseTo(2, 5);
    expect(g.settings.invincible).toBe(true);
    const distances = cars.map(c => dist(g.player.body.position, c!.body.position));
    expect(Math.min(...distances)).toBeGreaterThan(8);
    expect(Math.max(...distances)).toBeLessThan(60);
    expect(solidOverlap(g)).toBeNull();
  });

  it('barracks, depot and gas-station enable God mode; the station also removes police', () => {
    const barracks = make(); loadScenario(barracks, 'barracks');
    expect(barracks.player.body.velocity.y).toBeCloseTo(32, 5);
    expect(barracks.settings.invincible).toBe(true);
    expect(barracks.settings.noPolice).toBe(false);

    const depot = make(); loadScenario(depot, 'depot');
    expect(depot.player.body.velocity.y).toBeCloseTo(28, 5);
    expect(depot.settings.invincible).toBe(true);

    const station = make(); loadScenario(station, 'gas-station');
    expect(station.player.body.velocity.y).toBeCloseTo(20, 5);
    expect(station.settings.invincible).toBe(true);
    expect(station.settings.noPolice).toBe(true);
  });
});

describe('LAB isolation and preservation rules', () => {
  it('clears run cheats but preserves difficulty, upgrades and cash', () => {
    const g = make();
    g.configure({ difficulty: 'chaos', gore: true, invincible: true, infiniteBoost: true, noPolice: true });
    g.save.cash = 999;
    g.save.upgrades.grip = 2;
    loadScenario(g, 'first-fare');
    expect(g.settings.difficulty).toBe('chaos');
    expect(g.settings.gore).toBe(false);
    expect(g.settings.invincible).toBe(false);
    expect(g.settings.infiniteBoost).toBe(false);
    expect(g.settings.noPolice).toBe(false);
    expect(g.save.cash).toBe(999);
    expect(g.save.upgrades.grip).toBe(2);
    expect(g.player.dynamics.grip).toBeGreaterThan(1250);
  });

  it('resets world destruction between fixtures', () => {
    const g = make();
    g.world.props[0].alive = false;
    g.smashed = 12;
    loadScenario(g, 'first-fare');
    expect(g.world.props[0].alive).toBe(true);
    expect(g.smashed).toBe(0);
  });

  it('removes background traffic for clean fixtures', () => {
    const g = make();
    expect(g.vehicles.filter(v => v.kind === 'traffic').length).toBeGreaterThan(0);
    loadScenario(g, 'first-fare');
    expect(trafficAlive(g)).toHaveLength(0);
  });

  it('repair clears a wreck and returns to play without charging the wallet', () => {
    const g = make();
    g.player.damage.health = 0;
    g.player.damage.status = 'wreck';
    g.player.damage.critical.engine = 80;
    g.setMode('wasted');
    const cash = g.save.cash;
    expect(repairVehicle(g)).toBe(true);
    expect(g.mode).toBe('playing');
    expect(g.health).toBe(100);
    expect(g.player.damage.status).toBe('intact');
    expect(g.player.damage.critical.engine).toBe(0);
    expect(g.player.wreckAt).toBe(-1);
    expect(g.save.cash).toBe(cash); // lab repair is free: no tow or bail is deducted
    expect(repairVehicle(g, 9999)).toBe(false);
  });

  it('repair rebuilds the NPC brain and driver state so a towed car can drive and burn again', () => {
    const g = make();
    const car = g.vehicle('traffic', 14, 6.7, Math.PI / 2, '#abc');
    car.ai.attempts = 5; car.ai.phase = 'reverse'; car.ai.stalled = 2;
    car.path = [vec(1, 1)]; car.routeTimer = 3; car.alive = false;
    car.damage.health = 0; car.damage.status = 'wreck'; car.damage.blamed = true; car.wreckAt = 1;
    car.driverExited = true;
    expect(repairVehicle(g, car.id)).toBe(true);
    expect(car.alive).toBe(true);
    expect(car.damage.health).toBe(100);
    expect(car.damage.status).toBe('intact');
    expect(car.damage.blamed).toBe(false);
    expect(car.ai.attempts).toBe(0);
    expect(car.ai.phase).toBe('drive');
    expect(car.ai.stalled).toBe(0);
    expect(car.path).toEqual([]);
    expect(car.routeTimer).toBe(0);
    expect(car.driverExited).toBe(false);
    // A repaired car is no longer poisoned and can catch fire / detonate on a fresh hit.
    igniteVehicle(car.damage, 2, false);
    expect(car.damage.status).toBe('burning');
    expect(car.damage.fuse).toBeCloseTo(2, 5);
  });

  it('resumes only a paused world to playing, never arrested/wasted/garage/intro', () => {
    const g = make();
    for (const mode of ['arrested', 'wasted', 'garage', 'intro'] as const) {
      g.setMode(mode);
      expect(resumeFromPause(g)).toBe(false);
      expect(g.mode).toBe(mode);
    }
    g.setMode('paused');
    expect(resumeFromPause(g)).toBe(true);
    expect(g.mode).toBe('playing');
    expect(resumeFromPause(g)).toBe(false); // already live
    expect(g.mode).toBe('playing');
  });
});

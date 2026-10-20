import { describe, expect, it, vi } from 'vitest';
import { Game } from './game';
import { loadScenario } from './debug/lab';
import { igniteVehicle } from './vehicles/damage';
import { vec } from './physics';

const run = (g: Game, seconds: number, keys: string[] = []) => { g.keys = new Set(keys); for (let i = 0; i < seconds * 120; i++) g.update(1 / 120); g.keys.clear(); };
describe('integrated fires and destruction', () => {
  it('burns an NPC for its fuse, explodes once, and leaves a solid wreck', () => {
    const g = new Game(); loadScenario(g, 'fire'); const car = g.vehicles.find(v => v.kind === 'traffic')!;
    run(g, 6); expect(car.damage.status).toBe('burning'); expect(g.explosions).toBe(0);
    run(g, 1.2); expect(car.damage.status).toBe('wreck'); expect(car.alive).toBe(true); expect(g.explosions).toBe(1);
    run(g, 3); expect(g.explosions).toBe(1);
  });
  it('lets a driver abandon a burning vehicle once before it detonates', () => {
    const g = new Game(); loadScenario(g, 'fire'); const car = g.vehicles.find(v => v.kind === 'traffic')!, people = g.world.people.length;
    run(g, 1); expect(car.driverExited).toBe(true); expect(g.world.people.length).toBe(people + 1);
    run(g, 1); expect(g.world.people.length).toBe(people + 1); expect(car.damage.status).toBe('burning');
  });
  it('chains three nearby damaged cars without re-detonating the source', () => {
    const g = new Game(); loadScenario(g, 'chain-reaction'); run(g, 6);
    expect(g.vehicles.filter(v => v.kind === 'traffic' && v.damage.status === 'wreck').length).toBe(3); expect(g.explosions).toBe(3); expect(g.health).toBe(100);
  });
  it('destroys a large barracks on a hard ram and opens its footprint', () => {
    const g = new Game(); loadScenario(g, 'barracks'); const barracks = g.world.props.find(p => p.kind === 'barracks')!; run(g, 1.2, ['KeyW']);
    expect(barracks.alive).toBe(false); expect(g.buildingsSmashed).toBe(1); expect(g.player.body.position.y).toBeGreaterThan(58); expect(g.health).toBe(100);
  });
  it('fuel pumps trigger a bounded station chain reaction', () => {
    const g = new Game(); loadScenario(g, 'gas-station'); run(g, 7, ['KeyW']);
    expect(g.world.props.filter(p => p.kind === 'pump' && !p.alive).length).toBe(3); expect(g.world.props.find(p => p.kind === 'station')?.alive).toBe(false);
    expect(g.explosions).toBe(4); expect(g.health).toBe(100); expect(g.fx.blasts.length).toBeLessThanOrEqual(30);
  });
  it('allows repairing a burning cab to extinguish the fuse and critical damage', () => {
    const g = new Game(); g.setTrafficCount(0); g.setMode('playing'); g.player.body.position = vec(4, 28); g.player.damage.health = 40; g.player.damage.critical.engine = 70; igniteVehicle(g.player.damage, 7);
    g.save.cash = 100; g.garage(); expect(g.mode).toBe('garage'); g.repair(); g.setMode('playing'); run(g, 8);
    expect(g.player.damage.status).toBe('intact'); expect(g.health).toBe(100); expect(g.explosions).toBe(0); expect(g.player.damage.critical.engine).toBe(0);
  });
});
describe('integrated gore and test controls', () => {
  it('actually kills street pedestrians in pulp mode and creates bounded blood feedback', () => {
    const g = new Game(); loadScenario(g, 'pedestrians'); g.settings.noPolice = true; run(g, 1.5, ['KeyW']);
    expect(g.kills).toBeGreaterThan(0); expect(g.world.people.some(p => !p.alive && !p.aboard && p.deathTime >= 0)).toBe(true); expect(g.fx.bloodMarks.length).toBeGreaterThan(0); expect(g.player.damage.bloodTime).toBeGreaterThan(0);
  });
  it('detects fatal contact at boosted upgrade speeds, including side-on slides', () => {
    const g = new Game(); g.setTrafficCount(0); g.world.people = []; g.setMode('playing'); g.settings.gore = true; g.settings.noPolice = true;
    const person = g.world.addPerson(vec(80, 80), 'civilian'); g.player.body.position = vec(80, 74); g.player.body.angle = 0; g.player.body.velocity = vec(0, 47);
    run(g, 0.25); expect(person.alive).toBe(false); expect(g.kills).toBe(1);
  });
  it('keeps that same street collision nonfatal when gore is disabled', () => {
    const g = new Game(); loadScenario(g, 'pedestrians'); g.settings.gore = false; g.settings.noPolice = true; run(g, 1.5, ['KeyW']);
    expect(g.kills).toBe(0); expect(g.fx.bloodMarks.length).toBe(0); expect(g.world.people.filter(p => !p.alive && !p.aboard).length).toBe(0);
  });
  it('dispatches a new customer if a waiting fare is killed, without granting money', () => {
    const g = new Game(); g.settings.gore = true; const customer = g.world.people.find(p => p.id === g.job.customerId)!; const old = g.job.customerId, cash = g.save.cash;
    customer.alive = false; customer.health = 0; customer.deathTime = 0; g.death(customer, vec(0, 10), 2, true);
    expect(g.job.customerId).not.toBe(old); expect(g.save.cash).toBe(cash); expect(g.jobsDone).toBe(0);
  });
  it('makes traffic density live-editable without vehicle ID reuse', () => {
    const g = new Game(), parked = g.vehicles.filter(v => v.parked), carts = g.vehicles.filter(v => v.cart), freight = g.vehicles.filter(v => v.freight); g.setTrafficCount(40); expect(g.vehicles.filter(v => v.kind === 'traffic' && !v.cart && !v.parked && !v.freight).length).toBe(40);
    const ids = g.vehicles.map(v => v.id); g.setTrafficCount(0); expect(g.vehicles.length).toBe(1 + parked.length + carts.length + freight.length); expect(g.vehicles.filter(v => v.parked)).toEqual(parked); expect(g.vehicles.filter(v => v.cart)).toEqual(carts); expect(g.vehicles.filter(v => v.freight)).toEqual(freight);
    g.setTrafficCount(5); expect(g.vehicles.length).toBe(6 + parked.length + carts.length + freight.length); expect(g.vehicles.filter(v => v.kind === 'traffic' && !v.cart && !v.parked && !v.freight).every(v => !ids.includes(v.id))).toBe(true);
  });
  it('freezes fire countdowns while the user pauses', () => {
    const g = new Game(); loadScenario(g, 'fire'); const car = g.vehicles.find(v => v.kind === 'traffic')!; g.setMode('paused'); run(g, 10); expect(car.damage.fuse).toBe(7); expect(g.explosions).toBe(0);
  });
  it('cleans old off-screen corpses without reusing pedestrian IDs', () => {
    const g = new Game(); const person = g.world.addPerson(vec(204, 204)); person.alive = false; person.deathTime = 0; const oldId = person.id;
    g.time = 100; g.maintenance(5); expect(g.world.people.some(p => p.id === oldId)).toBe(false);
    const next = g.world.addPerson(vec(204, 204)); expect(next.id).toBeGreaterThan(oldId);
  });
  it('does not persist a scenario-only gore flag when another cheat or difficulty changes', () => {
    const storage = new Map<string, string>(); vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    try { const g = new Game(); loadScenario(g, 'pedestrians'); expect(g.settings.gore).toBe(true); g.configure({ noPolice: true, difficulty: 'chaos' }); const next = new Game(); expect(next.settings.gore).toBe(false); expect(next.settings.difficulty).toBe('chaos'); expect(next.settings.noPolice).toBe(false); }
    finally { vi.unstubAllGlobals(); }
  });
});

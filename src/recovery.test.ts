import { describe, expect, it, vi } from 'vitest';
import { Game } from './game';
import { Body, CarDynamics, contact, dist, length, vec } from './physics';
import { igniteVehicle } from './damage';
import { loadScenario } from './lab';
import { HOSPITAL } from './world';

const run = (g: Game, seconds: number, keys: string[] = []) => { g.keys = new Set(keys); for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120); g.keys.clear(); };
const make = () => { const g = new Game(); loadScenario(g, 'cab-fire'); return g; };

describe('nitro, parking and roadside recovery', () => {
  it('makes a stock nitro burst substantially faster without an upgrade', () => {
    const drive = (boost: boolean) => { const body = new Body(0, 0), dynamics = new CarDynamics(); for (let i = 0; i < 240; i++) { dynamics.apply(body, { throttle: 1, turn: 0, handbrake: false, boost }, 1 / 120); body.integrate(1 / 120); } return length(body.velocity); };
    expect(drive(true)).toBeGreaterThan(drive(false) * 1.7);
    expect(drive(true)).toBeLessThan(55);
  });

  it('parks cars in clear, marked curb bays and both lots without starting AI', () => {
    const g = new Game(); g.setTrafficCount(0); g.settings.noPolice = true; g.setMode('playing');
    const parked = g.vehicles.filter(v => v.parked), positions = parked.map(v => ({ ...v.body.position }));
    expect(parked).toHaveLength(39); expect(g.world.blocks.filter(b => b.special === 'parking')).toHaveLength(2);
    for (const v of parked) { expect(g.world.parking.some(s => s.occupied && dist(s.position, v.body.position) < 0.01)).toBe(true); expect([...g.world.hash.query(v.body)].some(p => contact(v.body, p.body))).toBe(false); }
    run(g, 3);
    parked.forEach((v, i) => { expect(dist(v.body.position, positions[i])).toBeLessThan(0.01); expect(v.ai.attempts).toBe(0); });
  });

  it('clears nitro/control feedback when resetting a boosted run', () => {
    const g = make(); g.keys = new Set(['KeyW', 'ShiftLeft']); g.update(1 / 120); expect(g.controls.boost).toBe(true);
    g.resetRun(); expect(g.controls.boost).toBe(false); expect(g.controls.throttle).toBe(0); expect(g.keys.size).toBe(0);
  });

  it('leaves an abandoned fuse running and lets a physical walk reach a replacement', () => {
    const g = make(), old = g.player, cash = g.save.cash; g.save.upgrades.engine = 2;
    expect(g.interact()).toBe(true); expect(g.onFoot).toBe(true);
    run(g, 1.3, ['KeyD']); run(g, 0.4, ['KeyS']);
    expect(g.enterableCar?.id).not.toBe(old.id); expect(g.interact()).toBe(true);
    expect(g.player).not.toBe(old); expect(g.onFoot).toBe(false); expect(g.player.kind).toBe('taxi'); expect(old.kind).toBe('traffic');
    expect(g.player.baseEngine).toBeCloseTo(10500 * 1.44); expect(g.save.cash).toBe(cash);
    run(g, 5.5); expect(old.damage.status).toBe('wreck'); expect(g.explosions).toBe(1); expect(g.mode).toBe('playing');
    expect(g.player.damage.status).not.toBe('wreck');
  });

  it.each(['car', 'motorcycle'] as const)('ends play when the occupied %s explodes and waits for hospital acknowledgment', model => {
    const g = make(), cash = g.save.cash;
    if (model === 'motorcycle') { g.player.alive = false; g.player = g.vehicle('taxi', 4, 32, -Math.PI / 2, '#ed9b63', model); igniteVehicle(g.player.damage, 1); }
    const old = g.player; g.save.upgrades.engine = 2;
    g.heat = 90; g.arrest = g.rules.arrestTime; g.driftMeter = 12;
    // Detonate at a drop-off that would otherwise complete on this very tick.
    old.body.position = { ...g.job.dropoff }; g.job.stage = 'dropoff'; g.job.wait = 0.799;
    g.settings.noPolice = false; g.vehicle('police', old.body.position.x + 6, old.body.position.y, 0, '#fff');
    old.damage.fuse = 0.001; run(g, 1 / 120, ['KeyW', 'ShiftLeft']);
    expect(g.mode).toBe('wasted'); expect(g.onFoot).toBe(false);
    expect(g.explosions).toBe(1); expect(g.fx.blasts.length).toBeGreaterThan(0);
    expect(g.controls.throttle).toBe(0); expect(g.controls.boost).toBeFalsy(); expect(g.keys.size).toBe(0);
    expect(g.jobsDone).toBe(0); expect(g.save.cash).toBe(cash);
    expect(g.interact()).toBe(false); g.garage(); expect(g.mode).toBe('wasted');
    const time = g.time, clock = g.dayNight.snapshot().minutes, position = { ...g.actor.position }, job = { ...g.job };
    const burning = g.vehicle('traffic', 204, 204, 0, '#fff'); igniteVehicle(burning.damage, 1);
    run(g, 10, ['KeyW', 'KeyE']);
    expect(g.mode).toBe('wasted'); expect(g.time).toBe(time); expect(g.dayNight.snapshot().minutes).toBe(clock);
    expect(g.actor.position).toEqual(position); expect(g.job).toEqual(job); expect(g.explosions).toBe(1); expect(burning.damage.fuse).toBe(1);
    g.recover();
    expect(g.mode).toBe('playing'); expect(g.onFoot).toBe(true); expect(g.actor.position).toEqual(HOSPITAL);
    expect(g.speed).toBe(0); expect(old.damage.status).toBe('wreck'); expect(old.body.position).toEqual(position);
    expect(old.kind).toBe('traffic'); expect(old.parked).toBe(true);
    expect(g.save.cash).toBe(cash - Math.min(cash, 110)); expect(g.save.upgrades.engine).toBe(2); expect(g.heat).toBe(0); expect(g.arrest).toBe(0);
    expect(g.driftMeter).toBe(0); expect(g.navToGarage).toBe(false); expect(g.job.stage).toBe('pickup');
    g.recover(); expect(g.onFoot).toBe(true); expect(g.actor.position).toEqual(HOSPITAL);
    run(g, 0.3, ['KeyS']); expect(g.actor.position.y).toBeGreaterThan(HOSPITAL.y + 0.5);
  });

  it.each([
    { cash: 0, medical: 0, repairs: 0, balance: 0 },
    { cash: 25, medical: 25, repairs: 0, balance: 0 },
    { cash: 80, medical: 50, repairs: 30, balance: 0 },
    { cash: 250, medical: 50, repairs: 60, balance: 140 },
  ])('charges and persists hospital recovery once with a $$cash wallet', ({ cash, medical, repairs, balance }) => {
    const g = make(); g.save.cash = cash;
    g.player.damage.fuse = 0.001; run(g, 1 / 120);
    const persist = vi.spyOn(g, 'persist');
    expect(g.mode).toBe('wasted'); expect(g.save.cash).toBe(cash);
    expect(g.hospitalBill).toEqual({ medical, repairs, total: medical + repairs });
    g.recover();
    expect(g.save.cash).toBe(balance); expect(persist).toHaveBeenCalledTimes(1);
    expect(g.onFoot).toBe(true); expect(g.actor.position).toEqual(HOSPITAL);
    g.recover();
    expect(g.save.cash).toBe(balance); expect(persist).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('cleans up an interrupted passenger fare on hospital respawn (gore=%s)', gore => {
    const g = make(); g.settings.gore = gore;
    const passenger = g.world.addPerson(g.player.body.position, 'customer');
    g.job.stage = 'dropoff'; g.job.customerId = passenger.id; passenger.aboard = true; passenger.alive = false;
    g.player.damage.fuse = 0.001; run(g, 0.02); g.recover();
    expect(passenger.aboard).toBe(false); expect(passenger.alive).toBe(!gore);
    expect(g.world.people.some(p => p.aboard)).toBe(false); expect(g.job.customerId).not.toBe(passenger.id); expect(g.jobsDone).toBe(0);
  });

  it.each([
    { cash: 500, heat: 0, impound: 75, bail: 0, balance: 425 },
    { cash: 500, heat: 35, impound: 75, bail: 45, balance: 380 },
    { cash: 500, heat: 60, impound: 75, bail: 90, balance: 335 },
    { cash: 500, heat: 90, impound: 75, bail: 135, balance: 290 },
    { cash: 0, heat: 90, impound: 0, bail: 0, balance: 0 },
    { cash: 25, heat: 90, impound: 25, bail: 0, balance: 0 },
    { cash: 80, heat: 90, impound: 75, bail: 5, balance: 0 },
  ])('itemizes and charges arrest recovery once (cash=$cash, heat=$heat)', ({ cash, heat, impound, bail, balance }) => {
    const g = new Game(); g.start(); g.save.cash = cash; g.save.upgrades.engine = 2;
    g.heat = heat; g.boost = 20; g.player.damage.health = 40; g.setMode('arrested');
    const persist = vi.spyOn(g, 'persist');
    expect(g.arrestBill).toEqual({ impound, bail, total: impound + bail });
    run(g, 1); expect(g.save.cash).toBe(cash); expect(g.mode).toBe('arrested');
    g.recover();
    expect(g.save.cash).toBe(balance); expect(persist).toHaveBeenCalledTimes(1);
    expect(g.mode).toBe('playing'); expect(g.onFoot).toBe(false); expect(g.actor.position).toEqual(vec(4, 32));
    expect(g.health).toBe(100); expect(g.boost).toBe(100); expect(g.heat).toBe(0); expect(g.save.upgrades.engine).toBe(2);
    g.recover(); expect(g.save.cash).toBe(balance); expect(persist).toHaveBeenCalledTimes(1);
  });

  it('offers local tow recovery only after escaping before the explosion', () => {
    const g = make(), cash = g.save.cash; g.interact();
    // Bailing out is only safe if the driver also gets beyond the blast radius.
    run(g, 2.5, ['KeyD']); run(g, 4.6);
    expect(g.mode).toBe('playing'); expect(g.onFoot).toBe(true); expect(g.player.damage.status).toBe('wreck');
    run(g, 1.3); g.driver.position = g.player.body.toWorld(vec(0, 3)); g.recover(); expect(g.onFoot).toBe(false); expect(g.health).toBe(100); expect(g.save.cash).toBe(cash - Math.min(cash, 60));
  });

  it('respawns at a labeled hospital with a clear sidewalk and can take a replacement ride', () => {
    const g = new Game(); g.start(); g.vehicles = g.vehicles.filter(v => v === g.player || v.parked);
    const old = g.player;
    igniteVehicle(old.damage, 0.01); run(g, 0.02); expect(g.mode).toBe('wasted'); g.recover();
    expect(g.world.props.some(p => p.label === 'HOSPITAL' && dist(p.body.position, HOSPITAL) < 10)).toBe(true);
    expect([...g.world.hash.query(g.driver)].some(p => contact(g.driver, p.body))).toBe(false);
    expect(g.vehicles.some(v => v.alive && contact(g.driver, v.body))).toBe(false);
    const next = g.nearestCar!; g.driver.position = next.body.toWorld(vec(0, 2));
    expect(g.interact()).toBe(true); expect(g.player).toBe(next); expect(g.onFoot).toBe(false); expect(g.player.kind).toBe('taxi');
    expect(old.damage.status).toBe('wreck');
  });

  it('never treats a wreck or a burning parked car as a replacement', () => {
    const g = make(), next = g.vehicles.find(v => v.parked)!; g.interact(); g.driver.position = vec(14, 33.3);
    igniteVehicle(next.damage, 1); expect(g.enterableCar).toBeUndefined(); expect(g.interact()).toBe(false);
    next.damage.status = 'wreck'; expect(g.enterableCar).toBeUndefined(); expect(g.interact()).toBe(false);
  });

  it('cannot enter through a wall or pick up fares on foot', () => {
    const g = make(); g.interact(); const next = g.vehicles.find(v => v.parked && v !== g.player)!;
    g.driver.position = vec(14, 32.5); g.world.add('building', 14, 34, 8, 0.4, '#333');
    expect(g.enterableCar).toBeUndefined(); expect(g.interact()).toBe(false);
    g.driver.position = { ...g.job.pickup }; run(g, 1); expect(g.job.stage).toBe('pickup'); expect(next.kind).toBe('traffic');
  });

  it('blocks walking through buildings and limits diagonal movement', () => {
    const g = make(); g.interact(); g.driver.position = vec(14, 6); run(g, 1, ['KeyS']);
    expect(g.driver.position.y).toBeLessThan(8.7);
    g.driver.position = vec(80, 80); run(g, 0.2, ['KeyW', 'KeyD']); expect(g.speed).toBeLessThanOrEqual(5.5);
  });

  it('evacuates an aboard passenger and redispatches without paying an abandoned fare', () => {
    const g = make(), customer = g.world.people.find(p => p.id === g.job.customerId)!, cash = g.save.cash;
    g.job.stage = 'dropoff'; customer.aboard = true; customer.alive = false;
    g.interact(); expect(customer.aboard).toBe(false); expect(customer.alive).toBe(true); expect(g.job.customerId).not.toBe(customer.id);
    expect(g.job.stage).toBe('pickup'); expect(g.jobsDone).toBe(0); expect(g.save.cash).toBe(cash);
  });

  it('permits an emergency bail at speed but requires slowing down for ordinary exits', () => {
    const g = make(); g.player.body.velocity = vec(0, -20); expect(g.interact()).toBe(true);
    const safe = new Game(); safe.start(); safe.player.body.velocity = vec(0, -20); expect(safe.interact()).toBe(false);
  });
});

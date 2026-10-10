import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { Body, CarDynamics, contact, dist, length, vec } from './physics';
import { igniteVehicle } from './damage';
import { loadScenario } from './lab';

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

  it('shows the blast before tow recovery and allows exiting the wreck afterwards', () => {
    const g = make(), cash = g.save.cash; run(g, 7.1);
    expect(g.mode).toBe('wrecked'); expect(g.explosions).toBe(1); expect(g.fx.blasts.length).toBeGreaterThan(0);
    g.recover(); expect(g.mode).toBe('wrecked'); expect(g.save.cash).toBe(cash);
    expect(g.interact()).toBe(true); expect(g.mode).toBe('playing'); expect(g.onFoot).toBe(true); expect(g.player.damage.status).toBe('wreck');
    run(g, 1.3); g.recover(); expect(g.onFoot).toBe(false); expect(g.health).toBe(100); expect(g.save.cash).toBe(cash - Math.min(cash, 60));
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

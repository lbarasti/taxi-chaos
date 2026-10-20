import { defaultCompiledMap } from '../map/compile';
import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { Body, contact, dist, length, rotate, vec } from '../physics/physics';
import { igniteVehicle } from '../vehicles/damage';
import { contains } from '../world/regions';
import { inspectPoint } from '../debug/inspection';

const HOSPITAL=defaultCompiledMap.city.recovery!;
const { GOLF_COURSE, GOLF_PONDS, VILLA_POOLS } = defaultCompiledMap.country;

const run = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120); };
function quiet() {
  const g = new Game(); g.start(); g.settings.noPolice = true;
  g.vehicles = [g.player]; g.trafficTarget = 0; g.world.people = [];
  return g;
}
function walking() {
  const g = quiet(); g.player.body.position = vec(80, 80); g.player.body.angle = 0;
  expect(g.interact()).toBe(true); g.driver.position = vec(80, 80); g.player.body.position = vec(100, 80);
  return g;
}

describe('pool drowning', () => {
  it.each([...VILLA_POOLS, ...GOLF_PONDS])('splashes and sinks in the basin at $position before hospital respawn', pool => {
    const g = quiet(), old = g.player, cash = g.save.cash;
    old.body.position = { ...pool.position }; g.keys.add('KeyW'); g.keys.add('ShiftLeft');
    g.job.stage = 'dropoff'; g.job.dropoff = { ...pool.position }; g.job.wait = 0.799;
    // Water also extinguishes an active fuse instead of detonating underwater.
    igniteVehicle(old.damage, 0.1);
    run(g, 0.2);
    expect(old.sinking).toBeDefined(); expect(g.fx.splashes).toHaveLength(1);
    expect(g.mode).toBe('playing'); expect(g.interact()).toBe(false);
    g.garage(); expect(g.mode).toBe('playing'); expect(g.controls.throttle).toBe(0);
    run(g, 2.2);
    expect(g.mode).toBe('wasted'); expect(g.wastedReason).toBe('drowning'); expect(old.alive).toBe(false);
    expect(g.jobsDone).toBe(0); expect(g.explosions).toBe(0);
    expect(g.hospitalBill).toEqual({ medical: 50, repairs: 30, total: 80 });
    g.recover(); expect(g.onFoot).toBe(true); expect(g.actor.position).toEqual(HOSPITAL); expect(g.health).toBe(100); expect(g.save.cash).toBe(cash - 80);
    expect(old.damage.status).toBe('wreck'); expect(old.alive).toBe(false); expect(g.nearestCar).not.toBe(old);
    g.driver.position = old.body.toWorld(vec(0, 3)); g.recover();
    expect(g.onFoot).toBe(true); expect(old.alive).toBe(false); expect(g.save.cash).toBe(cash - 80);
  });

  it('drives into water from the terrace without a solid pool barrier', () => {
    const g = quiet(), pool = VILLA_POOLS[5];
    g.player.body.position = vec(pool.position.x, pool.position.y + pool.height / 2 + 3);
    g.player.body.angle = -Math.PI / 2; g.player.body.velocity = vec(0, -10);
    run(g, 0.4); expect(g.player.sinking).toBeDefined();
  });

  it('keeps terrace driving safe and sinks NPCs without wasting an unoccupied player', () => {
    const g = quiet(), p = VILLA_POOLS[0];
    g.player.body.position = vec(p.position.x, p.position.y + p.height / 2 + 2);
    const npc = g.vehicle('traffic', p.position.x, p.position.y, 0, '#fff'); npc.parked = true;
    run(g, 2.5); expect(npc.alive).toBe(false); expect(g.player.sinking).toBeUndefined(); expect(g.mode).toBe('playing');
  });
});

describe('golf pond shoreline', () => {
  it('drives into the authored pond and sinks NPCs through the pool lifecycle', () => {
    const g = quiet(), pond = g.world.pools.find(p => p.waterKind === 'pond')!;
    g.player.body.position = pond.toWorld(vec(pond.w / 2 + 3, 0));
    g.player.body.angle = pond.angle + Math.PI;
    g.player.body.velocity = rotate(vec(-10, 0), pond.angle);
    run(g, 0.5);
    expect(g.player.sinking?.pool).toBe(pond);
    expect(contains(pond.corners(), g.player.body.position)).toBe(true);

    const npcGame = quiet(), npc = npcGame.vehicle('traffic', pond.position.x, pond.position.y, 0, '#fff');
    npc.parked = true; run(npcGame, 2.5);
    expect(npc.alive).toBe(false); expect(npcGame.mode).toBe('playing');
  });

  it('uses the curved shoreline for walking, inspection and full-body clearance', () => {
    const g = walking(), pond = g.world.pools.find(p => p.waterKind === 'pond')!;
    expect(g.clearWalk(pond.toWorld(vec(-8, 0)), pond.toWorld(vec(8, 0)))).toBe(false);
    const dryCorner = pond.toWorld(vec(pond.w * 0.46, pond.h * 0.46));
    const smallProbe = new Body(dryCorner.x, dryCorner.y, 1, 0.2, 0.2);
    expect(contact(smallProbe, pond)).toBeNull();
    expect(contact(pond, smallProbe)).toBeNull();
    expect(inspectPoint(g, dryCorner).pool).toBe(false);
    expect(inspectPoint(g, pond.position).pool).toBe(true);
    const wetProbe = new Body(pond.position.x, pond.position.y, 1, 0.7, 0.7);
    expect(contact(wetProbe, pond)?.depth).toBeGreaterThan(0);
    expect(contact(pond, wetProbe)?.depth).toBeGreaterThan(0);

    g.driver.position = pond.toWorld(vec(pond.w / 2 + 2, 0));
    const toward = rotate(vec(-1, 0), pond.angle); g.touchMove = toward;
    run(g, 1);
    expect(contains(pond.corners(), g.driver.position)).toBe(false);
    expect(g.mode).toBe('playing');
  });
});

describe('golf cart patrol and impacts', () => {
  it('keeps physical carts moving within the course for a full lap', () => {
    const g = new Game(); g.start(); g.settings.noPolice = true; g.setTrafficCount(0); g.world.people = [];
    const carts = g.vehicles.filter(v => v.cart), starts = carts.map(v => ({ ...v.body.position }));
    const excursion = carts.map(() => 0), waypoints = carts.map(() => new Set<number>());
    g.vehicles = [g.player, ...carts];
    expect(carts).toHaveLength(3);
    for (let i = 0; i < 70 * 120; i++) {
      g.update(1 / 120);
      for (const [i, v] of carts.entries()) {
        excursion[i] = Math.max(excursion[i], dist(starts[i], v.body.position));
        waypoints[i].add(v.cart!.waypoint);
        expect(Math.abs(v.body.position.x - GOLF_COURSE.center.x)).toBeLessThan(GOLF_COURSE.width / 2 + 5);
        expect(Math.abs(v.body.position.y - GOLF_COURSE.center.y)).toBeLessThan(GOLF_COURSE.height / 2 + 5);
      }
    }
    // Returning near a starting point is a valid lap; measure progress over the run.
    carts.forEach((v, i) => { expect(excursion[i]).toBeGreaterThan(20); expect(waypoints[i].size).toBeGreaterThan(5); expect(v.damage.health).toBe(100); expect(v.ai.attempts).toBe(0); });
  }, 15000);

  it.each([6, 24])('uses collision strength %s to crush and possibly overturn a cart', speed => {
    const g = quiet(), cab = g.player; cab.body.position = vec(80, 80); cab.body.angle = 0; cab.body.velocity = vec(speed, 0);
    const cart = g.vehicle('traffic', 83, 80, 0, '#eee', 'golf-cart'); cart.parked = true;
    expect(contact(cab.body, cart.body)).not.toBeNull();
    g.collision(cab, cart, 1 / 120);
    expect(cart.damage.health).toBeLessThan(100); expect(cart.cart!.crush).toBeGreaterThan(0);
    expect(length(cart.body.velocity)).toBeGreaterThan(0);
    run(g, 0.6);
    if (speed < 14) { expect(cart.cart!.roll).toBe(0); expect(cart.damage.status).not.toBe('wreck'); }
    else { expect(Math.abs(cart.cart!.roll)).toBeGreaterThan(2.8); expect(cart.damage.status).toBe('wreck'); }
    expect(g.explosions).toBe(0);
  });
});

describe('driver health and knockback', () => {
  it.each([false, true])('takes distance-based blast damage and moves away with gore=%s', gore => {
    const g = walking(); g.settings.gore = gore; g.player.damage.health = 8;
    const source = g.vehicle('traffic', 74, 80, 0, '#fff'); source.parked = true; source.driverExited = true;
    igniteVehicle(source.damage, 0.001); run(g, 1 / 120);
    expect(g.health).toBeGreaterThan(0); expect(g.health).toBeLessThan(100); expect(g.player.damage.health).toBe(8);
    expect(g.driver.velocity.x).toBeGreaterThan(4); const position = { ...g.driver.position };
    run(g, 0.2); expect(g.driver.position.x).toBeGreaterThan(position.x + 0.7); expect(g.mode).toBe('playing');
  });

  it.each([false, true])('dies from a close blast and restores driver health at the hospital, gore=%s', gore => {
    const g = walking(); g.settings.gore = gore; const cash = g.save.cash;
    const source = g.vehicle('traffic', 79, 80, 0, '#fff'); source.parked = true; source.driverExited = true;
    igniteVehicle(source.damage, 0.001); run(g, 0.02);
    expect(g.mode).toBe('wasted'); expect(g.driverHealth).toBe(0); expect(g.wastedReason).toBe('explosion');
    expect(g.hospitalBill).toEqual({ medical: 50, repairs: 0, total: 50 });
    g.recover(); expect(g.mode).toBe('playing'); expect(g.actor.position).toEqual(HOSPITAL); expect(g.health).toBe(100); expect(g.save.cash).toBe(cash - 50);
  });

  it('freezes the driver and nearby vehicles after fatal on-foot damage', () => {
    const g = walking();
    const car = g.vehicle('traffic', 77.9, 80, 0, '#fff'); car.body.velocity = vec(35, 0);
    g.walk(1 / 120);
    expect(g.mode).toBe('wasted'); expect(g.driverKnockback).toBeGreaterThan(0);
    const driver = { position: { ...g.driver.position }, velocity: { ...g.driver.velocity }, angle: g.driver.angle };
    const vehicles = g.vehicles.map(v => ({ position: { ...v.body.position }, velocity: { ...v.body.velocity }, angle: v.body.angle }));
    const time = g.time;
    // New key presses must not move the dead driver or push the frozen car.
    g.keys.add('KeyW'); g.keys.add('KeyA'); run(g, 1);
    expect({ position: g.driver.position, velocity: g.driver.velocity, angle: g.driver.angle }).toEqual(driver);
    expect(g.vehicles.map(v => ({ position: v.body.position, velocity: v.body.velocity, angle: v.body.angle }))).toEqual(vehicles);
    expect(g.time).toBe(time); expect(g.mode).toBe('wasted');
    g.recover(); expect(g.actor.position).toEqual(HOSPITAL); expect(g.health).toBe(100);
  });

  it('leaves a driver outside the blast radius unharmed', () => {
    const g = walking(); g.explosion({ position: vec(60, 80), radius: 13, power: 110, blamed: false, due: 0 });
    expect(g.driverHealth).toBe(100); expect(g.driver.velocity).toEqual(vec());
  });

  it.each([10, 35])('a moving car at %s damages the driver with physical knockback and hospital recovery when fatal', speed => {
    const g = walking(); const car = g.vehicle('traffic', 77.9, 80, 0, '#fff'); car.body.velocity = vec(speed, 0);
    g.walk(1 / 120);
    expect(g.health).toBeLessThan(100); expect(g.driver.velocity.x).toBeGreaterThan(4);
    if (speed === 35) { expect(g.mode).toBe('wasted'); expect(g.wastedReason).toBe('impact'); g.recover(); expect(g.actor.position).toEqual(HOSPITAL); expect(g.health).toBe(100); }
    else { expect(g.mode).toBe('playing'); const hp = g.health; g.walk(1 / 120); expect(g.health).toBe(hp); }
  });

  it('does not injure a driver for walking into a stationary car, and respects invincibility', () => {
    const g = walking(); const car = g.vehicle('traffic', 77.9, 80, 0, '#fff'); car.parked = true;
    g.keys.add('KeyA'); g.walk(0.1); expect(g.health).toBe(100);
    g.configure({ invincible: true }); g.explosion({ position: { ...g.driver.position }, radius: 13, power: 110, blamed: false, due: 0 });
    expect(g.health).toBe(100); expect(g.mode).toBe('playing'); expect(length(g.driver.velocity)).toBeGreaterThan(0);
  });
});

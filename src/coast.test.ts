import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { COAST_RAILS, inOcean } from './coast';
import { Body, contact, dist, length, vec } from './physics';
import { HOSPITAL, World } from './world';
import { HIGHLAND_OUTLINE } from './countryside';
import { loadScenario } from './lab';
import { igniteVehicle } from './damage';

const run = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120); };
function quiet() {
  const g = new Game(); g.start(); g.settings.noPolice = true;
  g.vehicles = [g.player]; g.trafficTarget = 0; g.world.people = [];
  return g;
}
const northRail = (g: Game) => g.world.props.find(p => p.kind === 'guardrail' && p.body.position.y < -12 && p.body.position.x > -3 && p.body.position.x < -1)!;

describe('coastal geography', () => {
  it('matches dry city, woodland and bridge decks, with ocean on every outside edge and in the inlet', () => {
    for (const p of [vec(120, 120), vec(-14, 80), vec(254, 240), vec(350, 30), vec(170, 370), vec(276, 80), vec(276, 200)]) expect(inOcean(p)).toBe(false);
    for (const p of [vec(50, -15), vec(-15, 100), vec(100, 271), vec(255, 120), vec(276, 120), vec(276, 88), vec(276, 192), vec(536, 90), vec(336, 432)]) expect(inOcean(p)).toBe(true);
  });
  it('replaces perimeter walls and cliffs with short breakable panels and wide gaps on city and country shores', () => {
    const world = new World();
    const rails = world.props.filter(p => p.kind === 'guardrail');
    expect(rails.length).toBe(COAST_RAILS.length);
    expect(rails.every(p => p.hp === 24 && p.body.w <= 8)).toBe(true);
    expect(world.props.filter(p => p.kind === 'building').every(p => !!p.label)).toBe(true);
    // No solid contact in the middle of the first open section on each edge.
    for (const [a, b] of [[vec(-14, -14), vec(254, -14)], [vec(254, -14), vec(254, 254)], [vec(254, 254), vec(-14, 254)], [vec(-14, 254), vec(-14, -14)], [HIGHLAND_OUTLINE[1], HIGHLAND_OUTLINE[2]]]) {
      const n = Math.ceil(dist(a, b) / 8), t = 4 / n;
      const probe = new Body(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 1, 0.7, 0.7);
      expect([...world.hash.query(probe)].filter(p => contact(probe, p.body))).toEqual([]);
    }
  });
});

describe('guardrail impacts', () => {
  it('resists repeated low-speed hits and slows and redirects a glancing car', () => {
    const g = quiet(), rail = northRail(g), b = g.player.body;
    for (let i = 0; i < 20; i++) {
      b.position = vec(rail.body.position.x, rail.body.position.y + 2.3); b.angle = -Math.PI / 2; b.angularVelocity = 0; b.velocity = vec(0, -8);
      g.collision(g.player, rail, 1 / 120); g.time += 0.3;
      expect(rail.alive).toBe(true); expect(rail.hp).toBe(24); expect(length(b.velocity)).toBeLessThan(8);
    }
    b.position = vec(rail.body.position.x, rail.body.position.y + 2.3); b.angularVelocity = 0; b.velocity = vec(26, -4);
    g.collision(g.player, rail, 1 / 120);
    expect(rail.alive).toBe(true); expect(length(b.velocity)).toBeLessThan(Math.hypot(26, 4));
    expect(b.velocity.x).toBeGreaterThan(10); expect(b.velocity.y).toBeGreaterThan(-1);
  });
  it.each(['car', 'motorcycle'] as const)('breaks a local panel with a fast %s, slows it, damages it and leaves adjacent panels intact', model => {
    const g = quiet(), rail = northRail(g);
    if (model === 'motorcycle') { g.player.alive = false; g.player = g.vehicle('taxi', 0, 0, 0, '#ed9b63', model); g.vehicles = [g.player]; }
    const b = g.player.body;
    b.position = vec(rail.body.position.x, rail.body.position.y + b.w / 2 + 0.2); b.angle = -Math.PI / 2; b.velocity = vec(0, -26);
    g.collision(g.player, rail, 1 / 120);
    expect(rail.alive).toBe(false); expect(rail.hp).toBe(0); expect(g.fx.railDebris).toHaveLength(6);
    expect(length(b.velocity)).toBeGreaterThan(12); expect(length(b.velocity)).toBeLessThan(26); expect(g.health).toBeLessThan(100);
    const speed = length(b.velocity); g.collision(g.player, rail, 1 / 120);
    expect(length(b.velocity)).toBe(speed); expect(g.fx.railDebris).toHaveLength(6);
    expect(g.world.props.filter(p => p.kind === 'guardrail' && !p.alive)).toHaveLength(1);
    run(g, 0.5); expect(g.player.sinking).toBeDefined(); expect(g.player.sinking!.pool).toBeUndefined();
    run(g, 2.3); expect(g.mode).toBe('wasted'); expect(g.wastedReason).toBe('drowning'); expect(g.explosions).toBe(0);
  });
  it('keeps a slow driven car on land behind the rail', () => {
    const g = quiet(); g.player.body.position = vec(0, -5); g.player.body.angle = -Math.PI / 2; g.keys.add('KeyW');
    run(g, 3); expect(g.player.sinking).toBeUndefined(); expect(inOcean(g.player.body.position)).toBe(false); expect(northRail(g).alive).toBe(true);
  });
  it('lets a hard side impact break a bridge panel and carry the cab into the river', () => {
    const g = quiet(), rail = g.world.props.find(p => p.kind === 'guardrail' && p.body.position.x > 270 && p.body.position.x < 274 && p.body.position.y === 72.5)!;
    g.player.body.position = vec(rail.body.position.x, 74.8); g.player.body.angle = -Math.PI / 2; g.player.body.velocity = vec(0, -26);
    g.collision(g.player, rail, 1 / 120); expect(rail.alive).toBe(false);
    run(g, 0.5); expect(g.snapshot().water).toBe('ocean');
    run(g, 2.2); expect(g.mode).toBe('wasted'); expect(g.wastedReason).toBe('drowning');
  });
});

describe('ocean entry and recovery', () => {
  it.each(['coastal-rails', 'coastal-gap', 'coastal-bike'] as const)('%s carries momentum offshore, splashes once, sinks, and respawns at hospital', scenario => {
    const g = new Game(); loadScenario(g, scenario); g.world.people = [];
    const cash = g.save.cash, old = g.player;
    g.keys.add('KeyW'); g.keys.add('ShiftLeft'); run(g, 0.7);
    expect(g.snapshot().water).toBe('ocean'); expect(g.fx.splashes).toHaveLength(1); expect(g.mode).toBe('playing');
    expect(g.controls.boost).toBe(false); expect(g.interact()).toBe(false); g.garage(); expect(g.mode).toBe('playing');
    const entry = { ...old.body.position }; run(g, 0.4); expect(old.body.position.y).toBeLessThan(entry.y - 1);
    run(g, 2); expect(g.mode).toBe('wasted'); expect(old.alive).toBe(false); expect(g.wastedReason).toBe('drowning');
    expect(g.hospitalBill).toEqual({ medical: 50, repairs: 30, total: 80 });
    g.recover(); expect(g.onFoot).toBe(true); expect(g.actor.position).toEqual(HOSPITAL); expect(g.health).toBe(100); expect(g.save.cash).toBe(cash - 80);
    expect(g.nearestCar).not.toBe(old); expect(old.alive).toBe(false);
  });
  it.each([vec(50, -30), vec(-30, 100), vec(100, 271), vec(276, 120), vec(540, 90), vec(336, 435)])('drowns outside the entire irregular map at $x,$y without invisible bounds', p => {
    const g = quiet(); g.player.body.position = p; run(g, 2.4);
    expect(g.mode).toBe('wasted'); expect(g.wastedReason).toBe('drowning');
  });
  it('extinguishes burning rides in the ocean and sinks abandoned rides without wasting the walker', () => {
    const g = quiet(); expect(g.interact()).toBe(true);
    const npc = g.vehicle('traffic', 276, 120, 0, '#fff'); npc.parked = true; npc.driverExited = true;
    igniteVehicle(npc.damage, 0.05); run(g, 2.4);
    expect(npc.alive).toBe(false); expect(g.explosions).toBe(0); expect(g.mode).toBe('playing'); expect(g.health).toBe(100);
  });
  it('does not leave a living passenger standing underwater after hospital recovery', () => {
    const g = quiet(), passenger = g.world.addPerson(vec(0, 0), 'customer');
    g.job.customerId = passenger.id; g.job.stage = 'dropoff'; passenger.aboard = true; passenger.alive = false;
    g.player.body.position = vec(276, 120); run(g, 2.4); g.recover();
    expect(passenger.aboard).toBe(false); expect(passenger.alive).toBe(false);
  });
});

describe('walking at the coast', () => {
  it('blocks walkers at an intact rail without damage, even after sustained walking or knockback', () => {
    const g = quiet(), rail = northRail(g);
    expect(g.interact()).toBe(true); g.driver.position = vec(rail.body.position.x, -10); g.keys.add('KeyW');
    run(g, 3); expect(g.mode).toBe('playing'); expect(inOcean(g.driver.position)).toBe(false); expect(rail.hp).toBe(24); expect(rail.alive).toBe(true);
    g.driver.velocity = vec(0, -40); g.driverKnockback = 1; run(g, 0.5);
    expect(rail.alive).toBe(true); expect(inOcean(g.driver.position)).toBe(false);
  });
  it('walks through an open gap into the sea, gets Wasted, and recovers with full health', () => {
    const g = new Game(); loadScenario(g, 'coastal-walk'); g.world.people = []; g.keys.add('KeyW'); const cash = g.save.cash;
    expect(g.onFoot).toBe(true); run(g, 1.6);
    expect(g.mode).toBe('wasted'); expect(g.wastedReason).toBe('drowning'); expect(g.driverHealth).toBe(0); expect(g.fx.splashes).toHaveLength(1);
    expect(g.hospitalBill).toEqual({ medical: 50, repairs: 0, total: 50 });
    g.recover(); expect(g.actor.position).toEqual(HOSPITAL); expect(g.health).toBe(100); expect(g.save.cash).toBe(cash - 50);
  });
  it('allows walking through a panel broken by a vehicle and rejects getting into an offshore ride', () => {
    const g = quiet(), rail = northRail(g), b = g.player.body;
    b.position = vec(rail.body.position.x, rail.body.position.y + 2.3); b.angle = -Math.PI / 2; b.velocity = vec(0, -26); g.collision(g.player, rail, 1 / 120);
    b.position = vec(0, 0); b.velocity = vec(); expect(g.interact()).toBe(true);
    g.driver.position = vec(rail.body.position.x, -10); g.keys.add('KeyW'); run(g, 1.2);
    expect(g.mode).toBe('wasted'); expect(g.wastedReason).toBe('drowning');
    expect(g.clearWalk(vec(16, -12), vec(16, -16))).toBe(false);
  });
});

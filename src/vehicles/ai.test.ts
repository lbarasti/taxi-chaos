import { describe, expect, it } from 'vitest';
import { Game } from '../game/game';
import { dist, length, vec } from '../physics/physics';

const make = () => { const g = new Game(); g.setTrafficCount(0); g.player.body.position = vec(244, 244); g.setMode('playing'); return g; };
const run = (g: Game, seconds: number) => { for (let i = 0; i < seconds * 120; i++) g.update(1 / 120); };
describe('NPC incident recovery', () => {
  it('backs out of a straight-on obstruction and rejoins the street', () => {
    const g = make(), car = g.vehicle('traffic', 14, 6.7, Math.PI / 2, '#abc'); car.path = [vec(14, 24)];
    const start = { ...car.body.position }; run(g, 10);
    expect(car.ai.attempts).toBeGreaterThan(0); expect(dist(car.body.position, start)).toBeGreaterThan(8); expect(length(car.body.velocity)).toBeGreaterThan(2);
    expect(car.ai.phase).not.toBe('reverse');
  });
  it('resolves a head-on standoff between two cars', () => {
    const g = make(), a = g.vehicle('traffic', 88, 83, 0, '#abc'), b = g.vehicle('traffic', 92.1, 83, Math.PI, '#def');
    a.path = [vec(120, 83)]; b.path = [vec(40, 77)]; run(g, 12);
    expect(dist(a.body.position, b.body.position)).toBeGreaterThan(9); expect(length(a.body.velocity) + length(b.body.velocity)).toBeGreaterThan(5);
    expect(a.ai.attempts + b.ai.attempts).toBeGreaterThan(0);
  });
  it('does not mistake intentional police containment for a stuck driver', () => {
    const g = make(); g.player.body.position = vec(84, 80); const cop = g.vehicle('police', 89, 80, Math.PI, '#abc');
    run(g, 3); expect(cop.ai.attempts).toBe(0); expect(dist(cop.body.position, g.player.body.position)).toBeLessThan(8);
  });
  it('finds an alley exit rather than reversing forever between four buildings', () => {
    const g = make(), car = g.vehicle('traffic', 20.5, 20, Math.PI / 2, '#abc'); car.path = [vec(20.5, 24)];
    run(g, 18); expect(car.alive).toBe(true); expect(dist(car.body.position, vec(20.5, 20))).toBeGreaterThan(12); expect(car.ai.attempts).toBeLessThan(5);
  }, 30000); // Keep the full 18 simulated seconds; slower CI runners can exceed the default 5 s.
  it('bounds impossible recoveries and clears trapped cars only off-screen', () => {
    const g = make();
    for (const [x, y, w, h] of [[17.8, 20.5, 1, 7], [23.2, 20.5, 1, 7], [20.5, 17.3, 8, 1], [20.5, 23.7, 8, 1]]) g.world.add('building', x, y, w, h, '#333');
    const car = g.vehicle('traffic', 20.5, 20.5, 0, '#abc'); car.path = [vec(40, 20.5)]; run(g, 25);
    expect(car.ai.attempts).toBeLessThanOrEqual(4); expect(car.alive).toBe(false); expect(car.damage.status).not.toBe('wreck');
  }, 30000); // Preserve all 25 simulated seconds; slower runners can exceed 15 s.
  it('limits heavy reversing previews to one per simulation step', () => {
    const g = make(); const cars = [14, 54, 94].map(x => { const v = g.vehicle('traffic', x, 6.7, Math.PI / 2, '#abc'); v.path = [vec(x, 24)]; v.ai.stalled = 2; return v; });
    g.update(1 / 120); expect(g.recoveryBudget.used).toBeLessThanOrEqual(1); expect(cars.filter(v => v.ai.attempts > 0).length).toBe(1);
  });
  it('budgets simultaneous alley rejoin requests instead of spiking one frame', () => {
    const g = make(); for (const x of [20.5, 60.5, 100.5, 140.5, 180.5]) g.vehicle('traffic', x, 20.5, Math.PI / 2, '#abc');
    g.update(1 / 120); expect(g.recoveryBudget.rejoin).toBeLessThanOrEqual(2); expect(g.vehicles.some(v => v.ai.planPending)).toBe(true);
  });
});
describe('police intelligence and tactics', () => {
  it('uses distinct pursuit, projected interception and junction-blocking goals', () => {
    const goals: number[] = [];
    for (const role of ['pursuit', 'interceptor', 'blocker'] as const) {
      const g = make(); g.player.body.position = vec(84, 80); g.player.body.velocity = vec(10, 0); g.policeIntel = { position: vec(84, 80), velocity: vec(10, 0), seenAt: 0 };
      const cop = g.vehicle('police', 4, 80, 0, '#abc'); cop.ai.role = role; g.ai(cop, 1 / 120); goals.push(cop.path.at(-1)!.x);
    }
    expect(goals).toEqual([84, 98, 120]);
  });
  it('searches the last sighting after intel expires instead of tracking through walls', () => {
    const g = make(); g.player.body.position = vec(84, 80); g.policeIntel = { position: vec(84, 80), velocity: vec(10, 0), seenAt: 0 };
    const cop = g.vehicle('police', 4, 80, 0, '#abc'); cop.ai.role = 'interceptor'; g.ai(cop, 1 / 120);
    g.time = 6; g.player.body.position = vec(244, 244); cop.routeTimer = 0; g.ai(cop, 1 / 120);
    expect(cop.path.at(-1)).toEqual(vec(84, 80)); expect(cop.ai.seenAt).toBe(0);
  });
  it('holds an interception junction briefly rather than treating it as a jam', () => {
    const g = make(); g.player.body.position = vec(84, 80); g.player.body.velocity = vec(10, 0); g.policeIntel = { position: vec(84, 80), velocity: vec(10, 0), seenAt: 0 };
    const cop = g.vehicle('police', 118, 80, 0, '#abc'); cop.ai.role = 'blocker'; const controls = g.ai(cop, 1 / 120);
    expect(controls.throttle).toBe(0); expect(controls.handbrake).toBe(true); expect(cop.ai.attempts).toBe(0);
  });
});

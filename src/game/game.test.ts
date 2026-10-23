import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { contact, dist, vec } from '../physics/physics';

const make = () => { const g = new Game(); g.vehicles = [g.player]; g.setMode('playing'); return g; };
const step = (g: Game, seconds: number, keys: string[] = []) => { g.keys = new Set(keys); for (let i = 0; i < seconds * 120; i++) g.update(1 / 120); g.keys.clear(); };
describe('cab jobs and economy', () => {
  it('requires a slow stop for pickup; pays exactly once for a completed fare', () => {
    const g = make(); g.player.body.position = { ...g.job.pickup }; g.player.body.velocity = vec(0, -12);
    step(g, 0.9); expect(g.job.stage).toBe('pickup');
    g.player.body.position = { ...g.job.pickup }; g.player.body.velocity = vec(); step(g, 0.9); expect(g.job.stage).toBe('dropoff');
    const fare = g.job.fare, cash = g.save.cash; g.player.body.position = { ...g.job.dropoff }; step(g, 0.9);
    expect(g.jobsDone).toBe(1); expect(g.save.cash).toBeGreaterThanOrEqual(cash + fare); expect(g.job.stage).toBe('pickup');
    const paid = g.save.cash; step(g, 0.9); expect(g.save.cash).toBe(paid); expect(g.jobsDone).toBe(1);
  });
  it('finishes a late uncomfortable trip once without deducting money from the existing balance', () => {
    const g = make(); g.job.stage = 'dropoff'; g.job.elapsed = g.job.time + 50; g.job.comfort = 0;
    const cash = g.save.cash, deliveries = g.save.deliveries, earnings = g.save.shiftStats.earnings;
    g.player.body.position = { ...g.job.dropoff }; step(g, 0.9);
    expect(g.save.cash).toBe(cash); expect(g.jobsDone).toBe(1);
    expect(g.save.deliveries).toBe(deliveries + 1); expect(g.save.shiftStats.earnings).toBe(earnings);
    expect(g.notifications.items.find(card => card.receipt)?.receipt?.payout).toBe(0);
    step(g, 0.9);
    expect(g.save.cash).toBe(cash); expect(g.jobsDone).toBe(1); expect(g.save.deliveries).toBe(deliveries + 1);
  });
  it('charges upgrades, applies physics changes, caps levels and rejects unaffordable buys', () => {
    const g = make(); g.garage(); expect(g.buy('engine')).toBe(false); g.save.cash = 3000;
    const cash = g.save.cash; expect(g.buy('engine')).toBe(true); expect(g.save.cash).toBe(cash - 160); expect(g.player.dynamics.engineForce).toBeGreaterThan(10500);
    g.buy('engine'); g.buy('engine'); expect(g.buy('engine')).toBe(false); expect(g.player.upgrades.engine).toBe(3);
  });
  it('freezes physics and job clocks while paused', () => {
    const g = make(); g.job.stage = 'dropoff'; g.setMode('paused'); step(g, 2, ['KeyW']); expect(g.speed).toBe(0); expect(g.time).toBe(0); expect(g.job.elapsed).toBe(0);
  });
  it('garage navigation cannot accidentally complete a taxi job at the garage', () => {
    const g = make(); g.player.body.position = vec(84, 80); g.garage(); expect(g.navToGarage).toBe(true);
    g.player.body.position = vec(4, 28); step(g, 1); expect(g.job.stage).toBe('pickup');
    g.garage(); expect(g.mode).toBe('garage'); expect(g.navToGarage).toBe(false);
  });
});
describe('destruction, police and recovery', () => {
  it('breaks a hydrant at speed and preserves forward momentum', () => {
    const g = make(); g.player.body.position = vec(7.5, 4); g.player.body.angle = Math.PI / 2; g.player.body.velocity = vec(0, 12);
    step(g, 1, ['KeyW']); const hydrant = g.world.props.find(p => p.kind === 'hydrant' && p.body.position.x === 7.5 && p.body.position.y === 11)!;
    expect(hydrant.alive).toBe(false); expect(g.smashed).toBeGreaterThan(0); expect(g.player.body.position.y).toBeGreaterThan(14); expect(g.speed).toBeGreaterThan(8);
  });
  it('smashes a barrier and both alley crates without wedging the cab', () => {
    const g = make(); g.player.body.position = vec(20.5, 4); g.player.body.angle = Math.PI / 2; g.player.body.velocity = vec(0, 16);
    step(g, 1.1, ['KeyW']); const broken = g.world.props.filter(p => !p.alive);
    expect(broken.filter(p => p.kind === 'crate').length).toBe(2); expect(broken.some(p => p.kind === 'barrier')).toBe(true);
    expect(g.player.body.position.y).toBeGreaterThan(21); expect(g.speed).toBeGreaterThan(15); expect(g.stars).toBeGreaterThan(0); expect(g.health).toBeGreaterThan(90);
  });
  it('keeps a high-speed cab outside a solid building', () => {
    const g = make(); g.player.body.position = vec(14, 4); g.player.body.angle = Math.PI / 2; g.player.body.velocity = vec(0, 28);
    step(g, 1, ['KeyW']); const building = g.world.props.find(p => p.kind === 'building' && dist(p.body.position, vec(14, 14)) < 1)!;
    expect(building.alive).toBe(true); expect(g.player.body.position.y).toBeLessThan(7.1); expect(g.health).toBeLessThan(90);
    const overlap = contact(g.player.body, building.body); expect(overlap?.depth ?? 0).toBeLessThan(0.025);
  });
  it('reinforced chassis materially reduces damage for the same collision', () => {
    const collide = (armor: number) => { const g = make(); g.player.upgrades.armor = armor; g.player.body.position = vec(14, 4); g.player.body.angle = Math.PI / 2; g.player.body.velocity = vec(0, 28); step(g, 1, ['KeyW']); return g.health; };
    const normal = collide(0), reinforced = collide(3); expect(normal).toBeLessThan(80); expect(reinforced).toBeGreaterThan(90); expect(reinforced).toBeGreaterThan(normal + 20);
  });
  it('arrests a contained stopped cab and charges affordable bail', () => {
    const g = make(); g.player.body.position = vec(84, 80); g.heat = 35; g.vehicle('police', 89, 80, Math.PI, '#fff');
    step(g, 4); expect(g.mode).toBe('arrested'); const cash = g.save.cash; g.recover();
    expect(g.save.cash).toBeLessThan(cash); expect(g.save.cash).toBeGreaterThanOrEqual(0); expect(g.mode).toBe('playing'); expect(g.heat).toBe(0); expect(g.health).toBe(100); expect(g.police.length).toBe(0);
  });
  it('clears wanted status after eight seconds hidden behind city blocks', () => {
    const g = make(); g.player.body.position = vec(20.5, 25); g.heat = 35; g.vehicle('police', 240, 240, 0, '#fff'); g.vehicle('police', 240, 0, 0, '#fff');
    step(g, 8.3); expect(g.stars).toBe(0); expect(g.police.length).toBe(0); expect(g.eventLog.some(e => e.includes('LOST THEM'))).toBe(true);
  });
  it('repeatable lab scenarios reset world destruction while retaining purchased upgrades', () => {
    const g = make(); g.save.cash = 500; g.garage(); g.buy('grip'); g.world.props[0].alive = false; g.smashed = 10;
    g.resetRun(); expect(g.world.props[0].alive).toBe(true); expect(g.smashed).toBe(0); expect(g.player.upgrades.grip).toBe(1); expect(g.player.dynamics.grip).toBeGreaterThan(1250);
  });
});

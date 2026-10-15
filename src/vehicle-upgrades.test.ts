import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game, defaultSave, type Vehicle } from './game';
import { igniteVehicle } from './damage';
import { defaultCompiledMap } from './map/compile';
import { vec } from './physics';
import { storageKeys } from './storage';
import { parseGarage } from './garage-save';
import { stockUpgrades } from './vehicle-upgrades';

const make = () => {
  const g = new Game(defaultCompiledMap, false, false); g.start();
  g.vehicles = [g.player]; g.settings.noPolice = true; g.save.cash = 5000;
  return g;
};
function take(g: Game, v: Vehicle) {
  g.setMode('playing'); g.onFoot = true; g.tumble = null;
  g.driver.position = v.body.toWorld(vec(0, 2.5));
  expect(g.interact()).toBe(true); expect(g.player).toBe(v);
}
function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
  return values;
}
afterEach(() => vi.unstubAllGlobals());

describe('upgrades belong to the chassis', () => {
  it('leaves all upgrades and prices on the worked-on car, including when taking another identical model', () => {
    const g = make(), original = g.player; g.garage();
    for (const key of ['engine', 'grip', 'armor', 'boost'] as const) expect(g.buy(key)).toBe(true);
    const cash = g.save.cash;
    const next = g.spawnVehicle({ position: vec(14, 4), parked: true, driverExited: true });
    take(g, next);
    expect(next.upgrades).toEqual(stockUpgrades()); expect(g.price('engine')).toBe(160);
    expect(next.baseEngine).toBe(next.definition.physics.engineForce); expect(next.baseGrip).toBe(next.definition.physics.grip);
    expect(original.upgrades).toEqual({ engine: 1, grip: 1, armor: 1, boost: 1 });
    take(g, original);
    expect(g.price('engine')).toBe(320); expect(g.player.baseEngine).toBeCloseTo(original.definition.physics.engineForce * 1.22);
    expect(g.save.cash).toBe(cash);
    g.player.damage.health = 60; g.garage(); g.repair();
    expect(g.health).toBe(100); expect(g.player.upgrades).toEqual({ engine: 1, grip: 1, armor: 1, boost: 1 });
  });
  it('keeps armour on an abandoned vehicle for both impact and blast damage', () => {
    const g = make(), armored = g.player; armored.upgrades.armor = 3;
    const stock = g.spawnVehicle({ position: vec(14, 4), parked: true, driverExited: true });
    take(g, stock); stock.body.position = vec(14, 32);
    g.damageImpact(armored, 10, armored.body.toWorld(vec(2, 0)), true);
    g.damageImpact(stock, 10, stock.body.toWorld(vec(2, 0)), true);
    expect(100 - armored.damage.health).toBeCloseTo((100 - stock.damage.health) * 0.25);
    armored.damage.health = stock.damage.health = 100;
    // Equal distance from the blast, independent of which vehicle is controlled.
    g.explosion({ position: vec(9, 32), radius: 10, power: 20, blamed: false, due: 0 });
    expect(100 - armored.damage.health).toBeCloseTo((100 - stock.damage.health) * 0.25);
  });
  it('uses only the ridden vehicle’s boost tank', () => {
    const g = make(), original = g.player; original.upgrades.boost = 3;
    const bike = g.spawnVehicle({ model: 'motorcycle', position: vec(14, 4), parked: true, driverExited: true });
    take(g, bike); g.boost = 100; g.keys = new Set(['KeyW', 'ShiftLeft']); g.update(1 / 120);
    expect(g.boost).toBeCloseTo(100 - 29 / 120); expect(bike.upgrades).toEqual(stockUpgrades());
    expect(original.upgrades.boost).toBe(3);
  });
  it('rejects purchases outside the garage and destroys investment in an abandoned explosion', () => {
    const g = make(), original = g.player;
    expect(g.buy('engine')).toBe(false); g.garage(); expect(g.buy('engine')).toBe(true);
    const next = g.spawnVehicle({ position: vec(14, 4), parked: true, driverExited: true }); take(g, next);
    igniteVehicle(original.damage, 0.001); g.hazards(1 / 120);
    expect(original.damage.status).toBe('wreck'); expect(original.upgrades).toEqual(stockUpgrades());
    expect(next.upgrades).toEqual(stockUpgrades());
  });
});

describe('vehicle investment saves', () => {
  it('migrates global levels once to the starting taxi without changing career progress', () => {
    const values = storage();
    const legacy = { ...defaultSave(), cash: 975, deliveries: 12, upgrades: { engine: 2, grip: 1, armor: 3, boost: 1 } };
    delete (legacy as Partial<typeof legacy>).garage;
    values.set(storageKeys.save, JSON.stringify(legacy));
    const g = new Game(); g.start(); g.vehicles = [g.player];
    expect(g.player.upgrades).toEqual(legacy.upgrades); expect(g.save.cash).toBe(975); expect(g.save.deliveries).toBe(12);
    const next = g.spawnVehicle({ position: vec(14, 4), parked: true, driverExited: true }); take(g, next);
    const reloaded = new Game();
    expect(reloaded.player.upgrades).toEqual(stockUpgrades());
    expect(reloaded.vehicles.filter(v => v.upgrades.engine === 2)).toHaveLength(1);
    expect(JSON.parse(values.get(storageKeys.save)!)).not.toHaveProperty('upgrades');
  });
  it('restores separate invested cars, their condition and source identities without duplicate parking spawns', () => {
    storage(); const g = new Game(); g.start(); g.save.cash = 5000; g.garage(); g.buy('engine');
    const original = g.player;
    const next = g.vehicles.find(v => v.parked && v.model === 'car')!;
    take(g, next); next.upgrades.grip = 2; next.damage.health = 63; g.applyUpgrades(); g.persist();
    const reloaded = new Game();
    expect(reloaded.player.sourceId).toBe(next.sourceId); expect(reloaded.player.upgrades).toEqual({ ...stockUpgrades(), grip: 2 });
    expect(reloaded.health).toBe(63); expect(reloaded.vehicles.filter(v => v.sourceId === next.sourceId)).toHaveLength(1);
    const parked = reloaded.vehicles.find(v => v.upgrades.engine === 1)!;
    expect(parked.body.position).toEqual(original.body.position); expect(parked.upgrades.grip).toBe(0);
    reloaded.start(); take(reloaded, parked); expect(reloaded.player.baseEngine).toBeCloseTo(10500 * 1.22);
  });
  it('persists total loss and hospital recovery without recreating a tuned taxi on reload', () => {
    storage(); const g = new Game(); g.start(); g.save.cash = 5000; g.garage(); g.buy('engine'); g.garage();
    igniteVehicle(g.player.damage, 0.001); g.hazards(1 / 120);
    expect(g.mode).toBe('wasted'); expect(g.player.upgrades).toEqual(stockUpgrades());
    const wreckReload = new Game(); wreckReload.start(); expect(wreckReload.mode).toBe('wasted');
    wreckReload.recover(); const cash = wreckReload.save.cash;
    const recovered = new Game(); recovered.start();
    expect(recovered.onFoot).toBe(true); expect(recovered.mode).toBe('playing'); expect(recovered.save.cash).toBe(cash);
    expect(recovered.player.upgrades).toEqual(stockUpgrades()); expect(recovered.player.damage.status).toBe('wreck');
  });
  it('preserves a burning fuse and on-foot state across reload instead of repairing the investment', () => {
    storage(); const g = new Game(); g.start(); g.save.cash = 5000; g.garage(); g.buy('grip'); g.garage();
    igniteVehicle(g.player.damage, 3); g.interact(); g.persist();
    const reloaded = new Game();
    expect(reloaded.onFoot).toBe(true); expect(reloaded.player.damage.status).toBe('burning');
    expect(reloaded.player.damage.fuse).toBe(3); expect(reloaded.player.upgrades.grip).toBe(1);
  });
  it('records a sinking car as a total loss even when reloaded before the animation ends', () => {
    storage(); const g = new Game(); g.start(); g.save.cash = 5000; g.garage(); g.buy('engine'); g.garage();
    g.player.body.position = vec(-20, 32); g.update(1 / 120);
    expect(g.player.sinking).toBeDefined(); expect(g.player.upgrades).toEqual(stockUpgrades());
    const reloaded = new Game(); reloaded.start();
    expect(reloaded.mode).toBe('wasted'); expect(reloaded.player.upgrades).toEqual(stockUpgrades());
  });
  it('rejects unknown models and sanitizes levels, damage and duplicate source IDs', () => {
    const g = make(); g.persist(); const save = structuredClone(g.save.garage!);
    save.current.upgrades.engine = Infinity; save.current.upgrades.grip = 9;
    save.current.sourceId = 'parked-1'; save.current.damage.health = -20;
    save.parked = [structuredClone(save.current)];
    const parsed = parseGarage(save)!;
    expect(parsed.current.upgrades.engine).toBe(0); expect(parsed.current.upgrades.grip).toBe(3);
    expect(parsed.current.damage.health).toBe(0); expect(parsed.parked).toHaveLength(0);
    expect(parseGarage({ ...save, current: { ...save.current, model: '__proto__' } })).toBeNull();
  });
});

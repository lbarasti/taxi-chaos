import { describe, expect, it } from 'vitest';
import { BEACH_HOTELS, BEACH_PICKUP, PROMENADE_ENTRIES, beachShoreY, inBeach, inSand, onPromenade, sandHandling } from './beach';
import { PORT_ENTRY, PORT_FEE } from './harbour';
import { inOcean } from './coast';
import { Game } from './game';
import { loadScenario } from './lab';
import { Body, contact, dist, length, vec } from './physics';
import { createVehicleBody, createVehicleDynamics, vehicleDefinition, type VehicleModel } from './vehicles';
import { blocksWalking, district, isRigidObstacle, roadPath } from './world';

function quiet() {
  const g = new Game(); g.start(); g.settings.noPolice = true;
  g.vehicles = [g.player]; g.trafficTarget = 0; g.world.people = [];
  return g;
}
const run = (g: Game, seconds: number, keys: string[] = []) => {
  g.keys = new Set(keys); for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120);
};

describe('southern beach geography and access', () => {
  it('shares a dry, tapered shoreline and retains ocean immediately past the surf', () => {
    for (const x of [-41, -20, 0, 32, 100, 150, 200, 253]) {
      const shore = beachShoreY(x);
      expect(inOcean(vec(x, shore - 0.01))).toBe(false);
      expect(inOcean(vec(x, shore + 0.1))).toBe(true);
    }
    expect(inBeach(vec(80, 258))).toBe(true); expect(inSand(vec(184, 251))).toBe(false);
    expect(onPromenade(vec(184, 251))).toBe(true);
    expect(district(vec(80, 258))).toBe('SUNSET BEACH'); expect(district(vec(184, 251))).toBe('OCEAN WALK');
    expect(inOcean(vec(100, 278))).toBe(true); // open inlet beyond the surf
  });
  it('opens the former south rails and gives the parked pickup and hotels clear footprints', () => {
    const g = new Game();
    expect(g.world.props.some(p => p.kind === 'guardrail' && p.body.position.y > 252 && p.body.position.y < 254 && p.body.position.x < 254)).toBe(false);
    const pickup = g.vehicles.find(v => v.sourceId === 'parking-73')!;
    expect(pickup.parked).toBe(true); expect(pickup.definition.access.playerDrivable).toBe(true);
    expect(pickup.body.position).toEqual(BEACH_PICKUP);
    expect([...g.world.hash.query(pickup.body)].some(p => contact(pickup.body, p.body))).toBe(false);
    for (const hotel of BEACH_HOTELS) {
      const prop = g.world.props.find(p => p.label === hotel.name)!;
      expect(prop.body.position.y - prop.body.h / 2).toBeGreaterThanOrEqual(246);
      expect(prop.body.corners().every(p => inBeach(p) && !onPromenade(p) && !inOcean(p))).toBe(true);
      expect(g.world.props.some(p => p !== prop && p.alive && contact(p.body, prop.body))).toBe(false);
      if (hotel.style === 'luxury-condo') expect(prop.body.w * prop.body.h).toBe(4 * 14 * 13);
    }
  });
  it('routes western sand, eastern sand and promenade walkers to the city and woods on dry land', () => {
    for (const from of [vec(-40, 248), vec(80, 258), vec(220.675, 260), vec(253, 250), vec(184, 251.5), vec(200, 270.5)]) {
      for (const to of [vec(4, 32), vec(132, 458)]) {
        const path = roadPath(from, to, 'walk');
        expect(path.at(-1)).toEqual(to);
        for (let i = 1; i < path.length; i++) for (let t = 0; t <= 1; t += 0.1) {
          const a = path[i - 1], b = path[i];
          expect(inOcean(vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t))).toBe(false);
        }
      }
    }
  });
  it('approaches eastern sand from the street with vehicle clearance, rather than clipping promenade edges', () => {
    const g = new Game(), from = vec(140, 240), target = vec(180, 256.7);
    const path = roadPath(from, target);
    expect(path.at(-1)).toEqual(vec(180, 240));
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], steps = Math.ceil(dist(a, b) / 0.2);
      for (let j = 0; j <= steps; j++) {
        const probe = new Body(a.x + (b.x - a.x) * j / steps, a.y + (b.y - a.y) * j / steps, 1, 5.2, 2.15);
        probe.angle = Math.atan2(b.y - a.y, b.x - a.x);
        expect([...g.world.hash.query(probe)].some(p => isRigidObstacle(p.kind) && contact(probe, p.body))).toBe(false);
        expect(probe.corners().some(inOcean)).toBe(false);
      }
    }
  });
  it('routes walkers around hotel podiums through real entrances with full body clearance', () => {
    const g = new Game();
    for (const from of [vec(180.675, 272.6), vec(200, 270.5), vec(237, 272.6), vec(220.675, 265)]) {
      const path = roadPath(from, vec(200, 240), 'walk');
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i], steps = Math.ceil(dist(a, b) / 0.15);
        for (let j = 0; j <= steps; j++) {
          const probe = new Body(a.x + (b.x - a.x) * j / steps, a.y + (b.y - a.y) * j / steps, 1, 0.7, 0.7);
          expect([...g.world.hash.query(probe)].some(p => blocksWalking(p.kind) && contact(probe, p.body))).toBe(false);
          expect(probe.corners().some(inOcean)).toBe(false);
        }
      }
    }
  });
  it('keeps pursuing police outside the protected hotel and pedestrian strip', () => {
    const g = quiet(); g.onFoot = true; g.driver.position = vec(170, 256.7);
    const cop = g.spawnVehicle({ kind: 'police', position: vec(170, 240) });
    g.heat = 30; run(g, 0.1);
    expect(cop.path.length).toBeGreaterThan(0);
    expect(cop.path.every(p => p.y < 246)).toBe(true);
  });
});

describe('destructible beach props', () => {
  it.each(['lifeguard-tower', 'parasol', 'beach-chair', 'sandcastle', 'palm'] as const)('physically breaks a %s, slows the vehicle and leaves a clear collider', kind => {
    const g = quiet(), prop = g.world.props.find(p => p.kind === kind)!;
    expect(Number.isFinite(prop.hp)).toBe(true);
    g.player.body.position = vec(prop.body.position.x - prop.body.w / 2 - 1.9, prop.body.position.y);
    g.player.body.angle = 0; g.player.body.velocity = vec(26, 0);
    g.collision(g.player, prop, 1 / 120);
    expect(prop.alive).toBe(false); expect(g.smashed).toBe(1); expect(length(g.player.body.velocity)).toBeLessThan(26);
    expect([...g.world.hash.query(prop.body)].includes(prop)).toBe(false);
    g.collision(g.player, prop, 1 / 120); expect(g.smashed).toBe(1);
  });
  it('leaves towers standing after a parking-speed bump', () => {
    const g = quiet(), prop = g.world.props.find(p => p.kind === 'lifeguard-tower')!;
    g.player.body.position = vec(prop.body.position.x - 4.1, prop.body.position.y); g.player.body.angle = 0; g.player.body.velocity = vec(2, 0);
    g.collision(g.player, prop, 1 / 120); expect(prop.alive).toBe(true); expect(g.smashed).toBe(0);
  });
});

describe('physical sand handling', () => {
  function accelerate(model: VehicleModel, sand: boolean) {
    const def = vehicleDefinition(model), body = createVehicleBody(def, vec(40, sand ? 250 : 240)), dynamics = createVehicleDynamics(def);
    for (let i = 0; i < 360; i++) {
      dynamics.surface = sandHandling(body, def.physics.tyres, def.terrain.sand);
      dynamics.apply(body, { throttle: 1, turn: 0, handbrake: false }, 1 / 120); body.integrate(1 / 120);
    }
    return length(body.velocity);
  }
  it('bogs down road cars while the off-road pickup keeps useful acceleration', () => {
    const car = accelerate('car', true), pickup = accelerate('pickup', true), road = accelerate('car', false);
    expect(car).toBeLessThan(road * 0.45); expect(pickup).toBeGreaterThan(car * 2);
    expect(pickup).toBeGreaterThan(10);
  });
  it('loses lateral traction, caps cornering force, blends mixed tyres and restores road tuning', () => {
    const def = vehicleDefinition('car'), body = createVehicleBody(def, vec(80, 250)), dynamics = createVehicleDynamics(def);
    dynamics.surface = sandHandling(body, def.physics.tyres, def.terrain.sand); body.velocity = vec(10, 8);
    dynamics.apply(body, { throttle: 0, turn: 0, handbrake: false }, 1 / 120);
    const lateralTyreForce = body.force.y + dynamics.tuning.drag * length(body.velocity) * body.velocity.y;
    expect(Math.abs(lateralTyreForce)).toBeLessThanOrEqual(body.mass * 1.5 + 1e-6); expect(dynamics.skidding).toBe(true);
    body.position = vec(80, 246); const mixed = sandHandling(body, def.physics.tyres, def.terrain.sand);
    expect(mixed.coverage).toBe(0.5); expect(mixed.grip).toBeGreaterThan(dynamics.surface.grip);
    body.position = vec(80, 240); dynamics.surface = sandHandling(body, def.physics.tyres, def.terrain.sand);
    expect(dynamics.surface).toMatchObject({ drive: 1, grip: 1, rollingDrag: 0, lateralAcceleration: Infinity });
    expect(dynamics.grip).toBe(def.physics.grip); expect(dynamics.engineForce).toBe(def.physics.engineForce);
  });
  it('uses sand for bikes too, restores upgrades, and makes sand ruts rather than black skid marks', () => {
    const g = quiet(); g.player.body.position = vec(64, 249); g.player.body.angle = 0; g.player.upgrades.grip = 2; g.applyUpgrades();
    run(g, 1, ['KeyW']); expect(g.snapshot().surface).toBe('sand'); expect(g.skids.some(s => s.sand)).toBe(true);
    g.player.body.position = vec(80, 240); g.player.body.velocity = vec(); run(g, 0.1);
    expect(g.player.dynamics.surface.grip).toBe(1); expect(g.player.dynamics.grip).toBeCloseTo(1250 * 1.36);
    const def = vehicleDefinition('motorcycle'), bike = createVehicleBody(def, vec(64, 249)), dynamics = createVehicleDynamics(def);
    dynamics.surface = sandHandling(bike, def.physics.tyres, def.terrain.sand); bike.velocity = vec(10, 5);
    dynamics.apply(bike, { throttle: 1, turn: 0.5, handbrake: false }, 1 / 120);
    expect(dynamics.skidding).toBe(true); bike.integrate(1 / 120); expect(length(bike.velocity)).toBeLessThan(Math.hypot(10, 5));
  });
  it('keeps the surf fatal for cars and pickups and respawns the driver at hospital', () => {
    for (const model of ['car', 'pickup'] as const) {
      const g = quiet(); g.player.alive = false; g.player = g.spawnVehicle({ kind: 'taxi', model, position: vec(64, 270), angle: Math.PI / 2 });
      g.player.body.velocity = vec(0, 25); run(g, 3);
      expect(g.mode).toBe('wasted'); expect(g.wastedReason).toBe('drowning'); expect(g.explosions).toBe(0);
      g.recover(); expect(g.mode).toBe('playing'); expect(g.onFoot).toBe(true);
    }
  });
  it('merges sustained straight sand ruts and breaks tracks on teleports and surface changes', () => {
    const g = quiet(); g.player.alive = false; g.player = g.spawnVehicle({ kind: 'taxi', model: 'pickup', position: vec(36, 253) });
    g.settings.invincible = true;
    for (let lap = 0; lap < 12; lap++) {
      g.player.body.position = vec(36, 253); g.player.body.angle = 0; g.player.body.velocity = vec(8, 0);
      run(g, 5, ['KeyW']);
    }
    const ruts = g.skids.filter(s => s.sand);
    expect(ruts.length).toBeGreaterThan(20); expect(ruts.length).toBeLessThan(650);
    expect(ruts.every(s => dist(s.a, s.b) <= 4.01)).toBe(true);
    g.player.body.position = vec(64, 240); run(g, 0.1);
    const count = g.skids.filter(s => s.sand).length;
    g.player.body.position = vec(100, 253); g.player.body.angle = 0; g.player.body.velocity = vec(8, 0); run(g, 0.1);
    expect(g.skids.filter(s => s.sand).length).toBeGreaterThanOrEqual(count);
    expect(g.skids.filter(s => s.sand).every(s => inSand(s.a) && inSand(s.b) && dist(s.a, s.b) <= 4.01)).toBe(true);
  });
});

describe('protected eastern promenade', () => {
  it.each(['car', 'pickup', 'motorcycle'] as const)('stops a %s at the pedestrian entrance even under boost', model => {
    const g = quiet(); g.player.alive = false;
    g.player = g.spawnVehicle({ kind: 'taxi', model, position: vec(PROMENADE_ENTRIES[2] + 0.675, 243.5), angle: Math.PI / 2 });
    g.settings.invincible = true; g.settings.infiniteBoost = true; run(g, 3, ['KeyW', 'ShiftLeft']);
    expect(g.player.body.position.y).toBeLessThan(247); expect(onPromenade(g.player.body.position)).toBe(false);
    expect(g.world.props.filter(p => p.kind === 'bollard' || p.kind === 'promenade-edge').every(p => p.alive)).toBe(true);
  });
  it('lets the walking player enter from either side and walk east along the path', () => {
    for (const south of [false, true]) {
      const g = quiet(); g.onFoot = true; const x = 180.675;
      g.driver.position = vec(x, south ? 259 : 244.8); run(g, 0.9, [south ? 'KeyW' : 'KeyS']);
      expect(onPromenade(g.driver.position)).toBe(true);
      const before = { ...g.driver.position }; run(g, 1, ['KeyD']);
      expect(g.driver.position.x).toBeGreaterThan(before.x + 4); expect(g.driverHealth).toBe(100);
    }
  });
  it('lets the player walk to and take the real parked pickup', () => {
    const g = new Game(); g.start(); g.settings.noPolice = true; g.onFoot = true; g.driver.position = vec(28, 253);
    expect(g.enterableCar?.model).toBe('pickup'); expect(g.interact()).toBe(true); expect(g.player.model).toBe('pickup'); expect(g.onFoot).toBe(false);
  });
  it('admits the drivable pickup through the existing paid harbour exchange', () => {
    const g = quiet(); g.player.alive = false; g.player = g.spawnVehicle({ kind: 'taxi', model: 'pickup', position: PORT_ENTRY, angle: -Math.PI / 2 });
    g.save.cash = PORT_FEE + 20; expect(g.interact()).toBe(true); expect(g.save.cash).toBe(20); expect(g.harbour.vehicleId).toBe(g.player.id);
  });
  it('retains door opening, coasting and landing damage when jumping from the new pickup', () => {
    const g = quiet(); g.player.alive = false; g.player = g.spawnVehicle({ kind: 'taxi', model: 'pickup', position: vec(90, 240), angle: 0 });
    g.player.body.velocity = vec(16, 0); expect(g.interact()).toBe(true); expect(g.player.door).toBeDefined(); expect(g.pendingExit).not.toBeNull();
    run(g, 0.5); expect(g.onFoot).toBe(true); expect(g.tumble).not.toBeNull(); expect(g.driverHealth).toBeLessThan(100); expect(g.player.coastUntil).toBeGreaterThan(g.time);
  });
  it('dispatches a beach fare to the south road without sending cars onto the walking path', () => {
    const g = new Game(undefined, false, false); g.offer = 19; g.newJob();
    expect(g.job.dropoff).toEqual(vec(160, 240)); expect(g.job.destination).toBe('Ocean Walk'); expect(onPromenade(g.job.dropoff)).toBe(false);
  });
  it('loads cab, pickup and walking fixtures with no solid player overlaps', () => {
    for (const name of ['beach', 'beach-pickup', 'promenade'] as const) {
      const g = new Game(); loadScenario(g, name);
      expect([...g.world.hash.query(g.actor)].some(p => contact(g.actor, p.body))).toBe(false);
      expect(g.onFoot).toBe(name === 'promenade'); expect(g.settings.noPolice).toBe(true);
    }
  });
});

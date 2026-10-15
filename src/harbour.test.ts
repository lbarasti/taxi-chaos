import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { Body, contact, dist, length, vec } from './physics';
import { World, district, roadDistance, roadPath } from './world';
import { inOcean } from './coast';
import { HARBOUR, FREIGHT_ROUTE, PORT_ENTRY, PORT_FEE, SWAP_CONTAINER, SWAP_EXIT, SWAP_SECONDS, craneLoad, portPath } from './harbour';
import { loadScenario } from './lab';

const run = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120); };
function quiet() { const g = new Game(); g.start(); g.vehicles = [g.player]; g.world.people = []; g.trafficTarget = 0; return g; }
function atGate(g: Game) { g.player.body.position = { ...PORT_ENTRY }; g.player.body.angle = -Math.PI / 2; g.player.body.velocity = vec(); }
function atContainer(g: Game) { g.player.body.position = { ...SWAP_CONTAINER }; g.player.body.angle = Math.PI; g.player.body.velocity = vec(); g.player.body.angularVelocity = 0; }

describe('working harbour geography', () => {
  it('uses the apron as dry land, preserves sea outside the quay, and identifies the district', () => {
    for (const p of [vec(73, -133), vec(251, -15), SWAP_CONTAINER, vec(200, -17)]) { expect(inOcean(p)).toBe(false); expect(district(p)).toBe('NORTHSTAR HARBOUR'); }
    for (const p of [vec(71, -70), vec(253, -70), vec(120, HARBOUR.top - 0.1), vec(120, -151)]) expect(inOcean(p)).toBe(true);
  });
  it('routes from the city and woodland through gates, then along clear yard lanes', () => {
    const world = new World();
    expect(roadDistance(vec(117, -3))).toBe(3); expect(roadDistance(vec(203, 24))).toBe(3);
    for (const start of [vec(4, 32), vec(204, 164), vec(358, 114), vec(132, 458)]) {
      const path = roadPath(start, SWAP_CONTAINER);
      expect(path.at(-1)).toEqual(SWAP_CONTAINER); expect(path.some(p => p.y === 0 && (p.x === 200 || p.x === 220))).toBe(true);
      expect(roadPath(SWAP_CONTAINER, start).at(-1)).toEqual(start);
      for (let i = 1; i < path.length; i++) for (let t = 0; t <= 1; t += 0.1) {
        const a = path[i - 1], b = path[i], p = vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        expect(inOcean(p)).toBe(false);
        if (p.y < -14) {
          const body = new Body(p.x, p.y, 1, 4.2, 2.1); body.angle = Math.atan2(b.y - a.y, b.x - a.x);
          expect([...world.hash.query(body)].some(prop => prop.kind !== 'port-gate' && contact(body, prop.body))).toBe(false);
        }
      }
    }
  });
  it('keeps the freight loop clear of solid scenery for full-length trucks', () => {
    const world = new World();
    for (let i = 0; i < FREIGHT_ROUTE.length; i++) {
      const a = FREIGHT_ROUTE[i], b = FREIGHT_ROUTE[(i + 1) % FREIGHT_ROUTE.length];
      for (let t = 0; t <= 1; t += 0.05) {
        const body = new Body(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 4500, 8.8, 2.7); body.angle = Math.atan2(b.y - a.y, b.x - a.x);
        expect(inOcean(body.position)).toBe(false);
        expect([...world.hash.query(body)].some(p => p.kind !== 'port-gate' && contact(body, p.body))).toBe(false);
        if (body.position.y < -14) expect(roadDistance(body.position)).toBeLessThan(0.01);
      }
    }
  });
  it('animates attached cargo through lift, transfer, lower and empty return without RNG', () => {
    expect(craneLoad(0, 0)).toMatchObject({ loaded: true, lift: 0, y: -122 });
    expect(craneLoad(4.2, 0).y).toBeLessThan(-122); expect(craneLoad(4.2, 0).lift).toBe(1);
    expect(craneLoad(7, 0).y).toBe(-151); expect(craneLoad(7, 0).loaded).toBe(true);
    expect(craneLoad(11, 0).loaded).toBe(false); expect(craneLoad(14, 0)).toEqual(craneLoad(0, 0));
    expect(portPath(PORT_ENTRY, SWAP_CONTAINER).length).toBeGreaterThan(2);
  });
});

describe('harbour security and paid exchange', () => {
  it('blocks both gates physically until this particular player car has a permit', () => {
    const g = quiet(), gates = g.world.props.filter(p => p.kind === 'port-gate');
    for (const gate of gates) {
      const b = g.player.body; b.position = vec(gate.body.position.x, -15); b.angle = -Math.PI / 2; b.velocity = vec(0, -8);
      g.collision(g.player, gate, 1 / 120); expect(b.velocity.y).toBeGreaterThan(-8); expect(gate.alive).toBe(true);
    }
    atGate(g); expect(g.interact()).toBe(true); expect(g.onFoot).toBe(false);
    g.player.body.position = vec(200, -15); g.player.body.velocity = vec(0, -8);
    g.collision(g.player, gates[0], 1 / 120); expect(g.player.body.velocity).toEqual(vec(0, -8));
    const npc = g.spawnVehicle({ position: vec(200, -15), angle: -Math.PI / 2 }); npc.body.velocity = vec(0, -8);
    g.collision(npc, gates[0], 1 / 120); expect(npc.body.velocity.y).toBeGreaterThan(-8);
  });
  it('charges exactly once and includes one exchange in the admission fee', () => {
    const g = quiet(); atGate(g); g.save.cash = 150;
    expect(g.interact()).toBe(true); expect(g.save.cash).toBe(75); expect(g.target).toEqual(SWAP_CONTAINER);
    expect(g.enterHarbour()).toBe(false); expect(g.save.cash).toBe(75);
    atContainer(g); run(g, SWAP_SECONDS + 0.1);
    expect(g.harbour.exchanged).toBe(true); const id = g.player.id;
    atContainer(g); run(g, 3); expect(g.player.id).toBe(id); expect(g.save.cash).toBe(75);
  });
  it('refuses unaffordable, moving, burning, non-car and observed arrivals without charging', () => {
    for (const reason of ['cash', 'speed', 'fire', 'bike', 'cop']) {
      const g = quiet(); atGate(g); const cash = g.save.cash;
      if (reason === 'cash') g.save.cash = 74;
      if (reason === 'speed') g.player.body.velocity = vec(0, -3);
      if (reason === 'fire') g.player.damage.status = 'burning';
      if (reason === 'bike') g.player = g.spawnVehicle({ kind: 'taxi', model: 'motorcycle', position: PORT_ENTRY });
      if (reason === 'cop') g.vehicle('police', 200, 0, 0, '#eee');
      expect(g.enterHarbour()).toBe(false); expect(g.save.cash).toBe(reason === 'cash' ? 74 : cash); expect(g.harbour.vehicleId).toBeNull();
    }
  });
  it('preserves emergency bailout at security and rejects admission while paused', () => {
    const g = quiet(); atGate(g); g.setMode('paused'); expect(g.enterHarbour()).toBe(false); expect(g.save.cash).toBe(80);
    g.setMode('playing'); g.player.damage.status = 'burning'; expect(g.interact()).toBe(true); expect(g.onFoot).toBe(true); expect(g.save.cash).toBe(80);
  });
  it('uses real container occlusion, including after a cop reacquires the player', () => {
    const g = quiet(); atGate(g); g.enterHarbour(); atContainer(g);
    const cop = g.vehicle('police', 120, -40, Math.PI, '#eee');
    g.updateHarbour(1); expect(g.harbour.progress).toBe(0); expect(g.policeVisible).toBe(true);
    for (const y of [-58, -57.4, -52.7, -44]) { cop.body.position = vec(108, y); expect(g.policeVisible).toBe(false); }
    cop.body.position = vec(108, -58);
    g.updateHarbour(1); expect(g.harbour.progress).toBe(1);
    cop.body.position = vec(120, -40); g.updateHarbour(1); expect(g.harbour.progress).toBe(0);
    expect(g.harbour.exchanged).toBe(false);
  });
  it('issues a different healthy car, retains wallet/passenger but leaves upgrades behind and clears every pursuit field', () => {
    const g = quiet(); atGate(g); g.save.cash = 200; g.player.upgrades.engine = 2; g.enterHarbour(); atContainer(g);
    const old = g.player; old.damage.health = 30; g.boost = 3; g.job.stage = 'dropoff'; const job = g.job;
    const cop = g.vehicle('police', 108, -58, 0, '#eee'); cop.ai.seenAt = 10;
    g.heat = 95; g.arrest = 2; g.escape = 3; g.speedingTime = 3; g.policeIntel.seenAt = 10;
    g.updateHarbour(SWAP_SECONDS);
    expect(g.player.id).not.toBe(old.id); expect(g.player.color).not.toBe(old.color); expect(old.alive).toBe(false);
    expect(g.player.body.position).toEqual(SWAP_EXIT); expect(g.health).toBe(100); expect(g.boost).toBe(100);
    const reloaded = new Game(g.map, false, false, g.save);
    expect(reloaded.player.upgrades.engine).toBe(0); expect(reloaded.vehicles.some(v => v.upgrades.engine === 2)).toBe(false);
    expect(g.save.cash).toBe(125); expect(g.player.upgrades.engine).toBe(0); expect(old.upgrades.engine).toBe(2); expect(g.player.baseEngine).toBe(old.definition.physics.engineForce); expect(g.job).toBe(job);
    expect(g.heat + g.arrest + g.escape + g.speedingTime).toBe(0); expect(g.police).toHaveLength(0); expect(g.policeIntel.seenAt).toBe(-100); expect(g.stars).toBe(0);
    run(g, 0.1); expect(g.heat).toBe(0); g.crime(55); expect(g.stars).toBe(2); g.law(1 / 120); expect(g.police.length).toBeGreaterThan(0);
  });
  it('requires full containment, stopping, paid admission and uninterrupted concealment', () => {
    const g = quiet(); atContainer(g); g.updateHarbour(4); expect(g.harbour.exchanged).toBe(false);
    atGate(g); g.enterHarbour(); atContainer(g); g.player.body.position.x = 114;
    g.updateHarbour(4); expect(g.harbour.progress).toBe(0);
    atContainer(g); g.updateHarbour(1); g.player.body.velocity = vec(1, 0); g.updateHarbour(1); expect(g.harbour.progress).toBe(0);
    atContainer(g); g.controls.throttle = 1; g.updateHarbour(4); expect(g.harbour.exchanged).toBe(false);
    g.controls.throttle = 0; g.onFoot = true; g.updateHarbour(4); expect(g.harbour.exchanged).toBe(false);
  });
  it('waits for a clear emergence point and does not erase heat while blocked', () => {
    const g = quiet(); atGate(g); g.enterHarbour(); atContainer(g); g.heat = 15;
    const blocker = g.spawnVehicle({ position: SWAP_EXIT, parked: true });
    g.updateHarbour(4); expect(g.harbour.exchanged).toBe(false); expect(g.heat).toBe(15);
    blocker.alive = false; g.updateHarbour(1 / 120); expect(g.harbour.exchanged).toBe(true); expect(g.heat).toBe(0);
  });
  it('expires admission on departure and run reset, and requires payment for another visit', () => {
    const g = quiet(); atGate(g); g.save.cash = 200; g.enterHarbour(); atContainer(g); g.updateHarbour(1);
    g.player.body.position = vec(220, 0); g.updateHarbour(1 / 120); expect(g.harbour.vehicleId).toBeNull(); expect(g.navToHarbour).toBe(false);
    atGate(g); expect(g.enterHarbour()).toBe(true); expect(g.save.cash).toBe(50);
    g.resetRun(); expect(g.harbour.vehicleId).toBeNull(); expect(g.harbour.progress).toBe(0);
  });
  it('lets freight pass security while keeping it out of ordinary traffic density controls', () => {
    const g = new Game(), freight = g.vehicles.filter(v => v.freight);
    expect(freight).toHaveLength(3); g.setTrafficCount(0); expect(g.vehicles.filter(v => v.freight)).toEqual(freight);
    const truck = freight[0], gate = g.world.props.find(p => p.kind === 'port-gate')!;
    truck.body.position = vec(200, -16); truck.body.velocity = vec(0, -3); g.collision(truck, gate, 1 / 120); expect(truck.body.velocity.y).toBe(-3);
  });
  it('physically circulates a freight truck through the storage yard without water entry or damage', () => {
    const g = quiet(); g.settings.noPolice = true; g.populateFreight(); const truck = g.vehicles.find(v => v.freight)!;
    g.vehicles = [g.player, truck]; g.player.body.position = vec(4, 32); const start = { ...truck.body.position };
    const visited = new Set<number>();
    for (let i = 0; i < 300 * 120; i++) { g.update(1 / 120); visited.add(truck.freight!.waypoint); }
    expect(visited.has(0)).toBe(true); expect(visited.has(7)).toBe(true); expect(visited.has(9)).toBe(true);
    expect(truck.alive).toBe(true); expect(truck.sinking).toBeUndefined(); expect(truck.damage.health).toBe(100);
    expect(dist(truck.body.position, start)).toBeGreaterThan(5); expect(length(truck.body.velocity)).toBeGreaterThan(0.5);
  }, 20000); // Five simulated minutes need headroom on shared CI runners.
  it('exposes a reproducible harbour fixture with security, fee and freight', () => {
    const g = new Game(); loadScenario(g, 'harbour'); expect(g.portGateNear).toBe(true); expect(g.save.cash).toBe(180);
    expect(g.snapshot().harbour.fee).toBe(PORT_FEE); expect(g.vehicles.filter(v => v.freight)).toHaveLength(3);
  });
});

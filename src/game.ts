import { Body, CarDynamics, add, angleDiff, bodiesNear, clamp, contact, dist, dot, length, normalize, resolveCollision, rotate, scale, segmentIntersectsBody, sub, vec, type Controls, type Vec } from './physics';
import { GARAGE, HOSPITAL, World, blocksWalking, isStructural, type Person, type Prop } from './world';
import { createAI, driveNPC, type AIState } from './ai';
import { defaultSettings, difficulties, type Difficulty, type Settings } from './rules';
import { blastDamage, createVehicleDamage, igniteVehicle, impactDamage, radialEffect, tickVehicleDamage, vehiclePerformance, type VehicleDamage } from './damage';
import { killPedestrian, updatePedestrians } from './pedestrians';
import { Effects } from './effects';
import { SoundEvents } from './sound';
import { DayNight } from './day-night';
import { Dialogue } from './story';
import { characters } from './characters';
import { missionsFor, neutralMissions } from './missions/compile';
import { MissionDirector, type AbandonReason, type DirectorContext } from './missions/director';
import { defaultMissionProgress, migrateMissionProgress, type MissionProgress } from './missions/progress';
import type { MissionId } from './missions/schema';
import { MOTORCYCLE_KNOCKOFF_SPEED, MotorcycleDynamics, motorcycleEngineWorks } from './motorcycle';
import { DOOR_OPEN_TIME, LANDING_TIME, MOVING_EXIT_SPEED, JUMP_SIDE_SPEED, landingDamage, motorcycleJumpReaction, tumbleDuration, type ExitSide } from './vehicle-exit';
import { createVehicleBody, createVehicleDynamics, vehicleDefinition, type VehicleDefinition, type VehicleModel, type VehicleRole, type VehicleSpawn } from './vehicles';
import { readStorage, storageKeys } from './storage';
import { isCountry, pathLength } from './countryside';
import { RAIL_BREAK_SPEED } from './coast';
import { defaultCompiledMap, type CompiledMap } from './map/compile';
import { FREIGHT_ROUTE, PORT_ENTRY, PORT_EXIT, PORT_FEE, SWAP_CONTAINER, SWAP_EXIT, SWAP_SECONDS, inHarbour } from './harbour';

export type Vehicle = { id: number; sourceId?: string; body: Body; dynamics: CarDynamics; readonly model: VehicleModel; readonly definition: VehicleDefinition; kind: VehicleRole; color: string; path: Vec[]; routeTimer: number; alive: boolean; parked: boolean; ai: AIState; damage: VehicleDamage; baseEngine: number; baseGrip: number; wreckAt: number; driverExited: boolean; door?: { side: ExitSide; at: number }; coastUntil?: number; exitSteer?: number; freight?: { waypoint: number }; sinking?: { elapsed: number; pool?: Body; entrySpeed: number }; cart?: { waypoint: number; crush: number; roll: number; targetRoll: number } };
export type Feedback = { position: Vec; life: number; color: string; text: string };
export type Skid = { a: Vec; b: Vec; life: number; blood?: boolean; sand?: boolean };
export type Job = { type: 'fare' | 'parcel'; pickup: Vec; dropoff: Vec; name: string; destination: string; fare: number; time: number; elapsed: number; comfort: number; stage: 'pickup' | 'dropoff'; wait: number; customerId: number; missionId?: MissionId };
export type Save = { cash: number; deliveries: number; upgrades: { engine: number; grip: number; armor: number; boost: number }; best: number; story: MissionProgress };
export type Mode = 'intro' | 'playing' | 'paused' | 'garage' | 'arrested' | 'wasted';
export type Tumble = { elapsed: number; duration: number; speed: number; side: ExitSide; bike: boolean; grounded: boolean };
export const upgradeInfo = {
  engine: { name: 'Street engine', subtitle: 'More pull. More problems.', detail: '+22% acceleration per level', price: 160 },
  grip: { name: 'Sticky tyres', subtitle: 'Own the next corner.', detail: '+18% tyre grip per level', price: 120 },
  armor: { name: 'Reinforced chassis', subtitle: 'Built for the scenic route.', detail: '25% less impact damage per level', price: 140 },
  boost: { name: 'Bigger boost tank', subtitle: 'A little extra getaway.', detail: '+35% boost capacity per level', price: 180 },
};
export type Upgrade = keyof typeof upgradeInfo;
export const defaultSave = (): Save => ({ cash: 80, deliveries: 0, upgrades: { engine: 0, grip: 0, armor: 0, boost: 0 }, best: 0, story: defaultMissionProgress() });
function loadSave(): Save { try { const s = JSON.parse(readStorage(storageKeys.save) ?? 'null'); if (!s) return defaultSave(); const d = defaultSave(); d.cash = clamp(Number(s.cash) || 0, 0, 1e7); d.deliveries = clamp(Number(s.deliveries) || 0, 0, 1e5); d.best = Number(s.best) || 0; d.story = migrateMissionProgress(s.story); for (const k of Object.keys(d.upgrades) as Upgrade[]) d.upgrades[k] = clamp(Math.floor(Number(s.upgrades?.[k]) || 0), 0, 3); return d; } catch { return defaultSave(); } }
function loadSettings(): Settings { const settings = defaultSettings(); try { const s = JSON.parse(readStorage(storageKeys.settings) ?? 'null'); if (s) { settings.gore = s.gore === true; if (Object.hasOwn(difficulties, s.difficulty)) settings.difficulty = s.difficulty; } } catch {} return settings; }
const PASSENGER_NAMES = ['Mia', 'Frankie', 'Jules', 'Ravi', 'Cleo', 'Oscar', 'Sam', 'Ruby'];
const PLACES = ['Noodle Club', 'Vinyl & Co.', 'Garden Café', 'The Arcade', 'Dockside Deli', 'East Village', 'Moonlight Hotel', 'Flower Market'];
export type Blast = { position: Vec; radius: number; power: number; blamed: boolean; due: number; sourceVehicle?: number; sourceProp?: number };
export class Game {
  world: World; save: Save; mode: Mode = 'intro'; keys = new Set<string>();
  settings: Settings; policeIntel = { position: vec(4, 32), velocity: vec(), seenAt: -100 };
  private preferences: Pick<Settings, 'gore' | 'difficulty'>;
  player!: Vehicle; vehicles: Vehicle[] = []; feedback: Feedback[] = []; skids: Skid[] = [];
  harbour = { vehicleId: null as number | null, entered: false, exchanged: false, progress: 0 }; navToHarbour = false;
  onFoot = false; driver = new Body(4, 32, 75, 0.7, 0.7); wreckedAt = -1;
  driverHealth = 100; driverKnockback = 0;
  pendingExit: { vehicle: Vehicle; side: ExitSide; at: number; delay: number } | null = null;
  tumble: Tumble | null = null;
  wastedReason: 'explosion' | 'drowning' | 'impact' = 'explosion';
  private driverHits = new Map<number, number>();
  get actor() { return this.onFoot ? this.driver : this.player.body; }
  time = 0; boost = 100; heat = 0; escape = 0; arrest = 0; combo = 0; comboTimer = 0; smashed = 0; shiftEarnings = 0;
  fx = new Effects(); blasts: Blast[] = []; kills = 0; explosions = 0; buildingsSmashed = 0; offer = 0; trafficTarget = 23; recoveryBudget = { used: 0, rejoin: 0 }; private serial = 0; private pedestrianClock = 0; private maintenanceClock = 0;
  sounds = new SoundEvents();
  dayNight = new DayNight();
  dialogue = new Dialogue();
  missions!: MissionDirector;
  job!: Job; jobsDone = 0; crashCooldown = 0; speedingTime = 0; driftMeter = 0; lastDrift = 0; nearMiss = new Map<number, number>();
  toast = 'Your city. Your shortcuts.'; toastTime = 5; toastKind = ''; eventLog: string[] = []; onModeChange = () => {}; onChange = () => {}; navToGarage = false;
  touchMove: Vec | null = null;
  controls: Controls = { throttle: 0, turn: 0, handbrake: false }; previousTyres: Vec[] = [];
  private sandRuts: { anchor: Vec; segment?: Skid }[] = [];
  private rutVehicleId = -1;
  constructor(public readonly map: CompiledMap = defaultCompiledMap, private readonly persistence = true, story = true) {
    this.world = new World(map); this.fx = new Effects(map.document.envelope); this.save = persistence ? loadSave() : defaultSave();
    this.settings = persistence ? loadSettings() : defaultSettings();
    this.preferences = { gore: this.settings.gore, difficulty: this.settings.difficulty };
    // Isolated map previews opt out of story compilation; the lab and normal
    // persistence-disabled gameplay keep fresh missions for story QA.
    this.missions = new MissionDirector(story ? missionsFor(map) : neutralMissions(map), this.save.story);
    this.populateVehicles(); this.newJob(true); this.applyUpgrades();
  }
  populateVehicles() {
    const { GOLF_CART_ROUTE } = this.map.country;
    this.player = this.vehicle('taxi', 4, 32, -Math.PI / 2, '#f7ce55');
    // Preserve the historical city's post-population RNG stream; placements are
    // now explicit and are never silently relocated away from an invalid draft.
    for (let i = 0; i < 23; i++) this.world.random();
    this.trafficTarget = this.map.document.trafficSpawns.length;
    for (const spawn of this.map.document.trafficSpawns) {
      const v = this.spawnVehicle(spawn); v.sourceId = spawn.id; v.path = structuredClone(spawn.path);
    }
    for (const spot of this.world.parking) if (spot.occupied) {
      const v = this.spawnVehicle({ ...spot, parked: true, driverExited: true }); v.sourceId = spot.id;
    }
    this.populateFreight();
    for (const i of [0, 1, 2]) {
      const p = GOLF_CART_ROUTE[i], next = GOLF_CART_ROUTE[(i + 1) % GOLF_CART_ROUTE.length];
      const v = this.vehicle('traffic', p.x, p.y, Math.atan2(next.y - p.y, next.x - p.x), '#eee7c8', 'golf-cart');
      v.cart!.waypoint = (i + 1) % GOLF_CART_ROUTE.length;
    }
  }
  populateFreight() {
    for (const [i, index] of [1, 3, 5].entries()) {
      const p = FREIGHT_ROUTE[index], next = FREIGHT_ROUTE[(index + 1) % FREIGHT_ROUTE.length];
      const v = this.spawnVehicle({ model: i === 1 ? 'truck-empty' : 'truck-loaded', position: p, angle: Math.atan2(next.y - p.y, next.x - p.x) });
      v.freight = { waypoint: (index + 1) % FREIGHT_ROUTE.length };
      v.path = [next, FREIGHT_ROUTE[(index + 2) % FREIGHT_ROUTE.length]];
    }
  }
  resetRun() {
    this.missions.restartClock(this.time);
    this.sounds.reset(); this.touchMove = null;
    this.sandRuts = []; this.rutVehicleId = -1;
    this.harbour = { vehicleId: null, entered: false, exchanged: false, progress: 0 }; this.navToHarbour = false;
    this.onFoot = false; this.wreckedAt = -1; this.driver = new Body(4, 32, 75, 0.7, 0.7);
    this.driverHealth = 100; this.driverKnockback = 0; this.driverHits.clear(); this.pendingExit = null; this.tumble = null; this.wastedReason = 'explosion';
    this.controls = { throttle: 0, turn: 0, handbrake: false, boost: false };
    this.world = new World(this.map); this.vehicles = []; this.serial = 0; this.trafficTarget = 23; this.populateVehicles(); this.feedback = []; this.skids = []; this.keys.clear(); this.fx.reset(); this.blasts = [];
    this.time = 0; this.health = 100; this.boost = 100; this.heat = 0; this.escape = 0; this.arrest = 0; this.combo = 0; this.comboTimer = 0;
    this.smashed = 0; this.shiftEarnings = 0; this.jobsDone = 0; this.crashCooldown = 0; this.speedingTime = 0; this.driftMeter = 0; this.lastDrift = 0; this.nearMiss.clear(); this.navToGarage = false;
    this.kills = 0; this.explosions = 0; this.buildingsSmashed = 0; this.offer = 0; this.pedestrianClock = 0; this.maintenanceClock = 0; this.policeIntel = { position: vec(4, 32), velocity: vec(), seenAt: -100 };
    this.dayNight.reset();
    this.eventLog = []; this.newJob(true, 'reset'); this.applyUpgrades(); this.setMode('playing');
  }
  /** Explicit new-story reset. Ordinary new shifts preserve persistent story. */
  resetStory() { this.missions.reset(); this.newJob(true, 'reset'); this.persist(); }
  /** Abandons any active mission and detaches it from the current job. */
  releaseMission(reason: AbandonReason = 'shift') { if (this.missions.activeId) { const failed = this.save.story.failed.length; this.missions.abandon(reason, this.time); if (this.save.story.failed.length !== failed) this.persist(); } if (this.job) delete this.job.missionId; }
  vehicle(kind: Vehicle['kind'], x: number, y: number, angle: number, color: string, model: Vehicle['model'] = 'car') {
    return this.spawnVehicle({ kind, position: vec(x, y), angle, color, model });
  }
  spawnVehicle({ model = 'car', kind = 'traffic', position, angle = 0, color, parked = false, driverExited = false }: VehicleSpawn): Vehicle {
    const definition = vehicleDefinition(model), body = createVehicleBody(definition, position, angle);
    const id = this.serial++;
    const v: Vehicle = { id, body, definition, dynamics: createVehicleDynamics(definition), model, kind, color: color ?? definition.graphics.color, path: [], routeTimer: 0, alive: true, parked, ai: createAI(body.position, id), damage: createVehicleDamage(), baseEngine: definition.physics.engineForce, baseGrip: definition.physics.grip, wreckAt: -1, driverExited };
    if (definition.ai.controller === 'golf') v.cart = { waypoint: 0, crush: 0, roll: 0, targetRoll: 0 };
    this.vehicles.push(v); return v;
  }
  private canSpawnTraffic(body: Body, margin = 2) {
    const { inOcean } = this.map.coast;
    return !inOcean(body.position) && !this.vehicles.some(v => v.alive && bodiesNear(body, v.body, margin)) && ![...this.world.hash.query(body)].some(prop => contact(body, prop.body)) && !this.world.pools.some(pool => contact(body, pool)) && !this.world.parking.some(spot => {
      if (!spot.occupied) return false;
      const parked = createVehicleBody(vehicleDefinition(spot.model), spot.position, spot.angle);
      return bodiesNear(body, parked, margin);
    });
  }
  setTrafficCount(count: number) {
    this.trafficTarget = clamp(Math.floor(Number.isFinite(count) ? count : 0), 0, 60);
    const cars = this.vehicles.filter(v => v.kind === 'traffic' && v.definition.ai.controller === 'road' && !v.parked && !v.freight && v.alive);
    for (const v of cars.slice(this.trafficTarget)) v.alive = false;
    this.vehicles = this.vehicles.filter(v => v.alive);
    for (let attempt = 0; this.vehicles.filter(v => v.kind === 'traffic' && v.definition.ai.controller === 'road' && !v.parked && !v.freight && v.alive).length < this.trafficTarget && attempt < 300; attempt++) {
      this.replenishTraffic(attempt, 9);
    }
  }
  private replenishTraffic(index: number, minimumDistance: number) {
    const spawns = this.map.document.trafficSpawns, spawn = spawns[index % spawns.length];
    if (!spawn) return false;
    // Density changes may use clear points along the descriptor's first leg;
    // deleting every spawn disables replenishment rather than inventing city spawns.
    const t = (Math.floor(index / spawns.length) % 5) / 5;
    const position = add(spawn.position, scale(sub(spawn.path[0], spawn.position), t));
    const angle = t ? Math.atan2(spawn.path[0].y - position.y, spawn.path[0].x - position.x) : spawn.angle;
    const probe = createVehicleBody(vehicleDefinition(spawn.model), position, angle);
    if (dist(position, this.actor.position) < minimumDistance || !this.canSpawnTraffic(probe)) return false;
    const v = this.spawnVehicle({ ...spawn, position, angle }); v.sourceId = spawn.id; v.path = structuredClone(spawn.path); return true;
  }
  get target() {
    if (this.onFoot) return this.nearestCar?.body.position ?? GARAGE;
    if (this.harbour.vehicleId === this.player.id) return this.harbour.exchanged ? PORT_EXIT : SWAP_CONTAINER;
    if (this.navToHarbour) return PORT_ENTRY;
    if (this.navToGarage) return GARAGE;
    return this.job.stage === 'pickup' ? this.job.pickup : this.job.dropoff;
  }
  get speed() { return length(this.actor.velocity); }
  get lean() { return this.player.dynamics instanceof MotorcycleDynamics ? this.player.dynamics.lean : 0; }
  get nearestCar() { return this.vehicles.filter(v => v.alive && !v.sinking && (v.model !== 'motorcycle' || motorcycleEngineWorks(v.damage)) && v.definition.access.playerDrivable && v.kind !== 'police' && v.damage.status !== 'burning' && v.damage.status !== 'wreck' && length(v.body.velocity) < 2 && (v.parked || v === this.player)).sort((a, b) => dist(a.body.position, this.actor.position) - dist(b.body.position, this.actor.position))[0]; }
  get bikeDisabled() { return this.player.model === 'motorcycle' && !motorcycleEngineWorks(this.player.damage); }
  get bikeTowable() { return this.onFoot && !this.tumble && !this.player.sinking && this.bikeDisabled
    && length(this.player.body.velocity) < 2 && dist(this.driver.position, this.player.body.position) < 6; }
  get enterableCar() { if (this.tumble) return undefined; const v = this.nearestCar; return v && dist(v.body.position, this.driver.position) < 4 && this.clearWalk(this.driver.position, v.body.position) ? v : undefined; }
  clearWalk(a: Vec, b: Vec) {
    const { inOcean } = this.map.coast;
    const steps = Math.ceil(dist(a, b) / 0.35);
    for (let i = 0; i <= steps; i++) { const p = add(a, scale(sub(b, a), i / (steps || 1))), probe = new Body(p.x, p.y, 1, 0.7, 0.7); if (inOcean(p) || [...this.world.hash.query(probe)].some(prop => blocksWalking(prop.kind) && contact(probe, prop.body)) || this.world.pools.some(pool => contact(probe, pool))) return false; }
    return true;
  }
  /** Select a side with A/D, arrow keys, or the active touch stick; default to the right. */
  private get exitSide(): ExitSide {
    const move = this.touchMove?.x ?? (Number(this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.keys.has('right')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.keys.has('left')));
    return move < -0.25 ? -1 : 1;
  }
  private exitLocation(v: Vehicle, wanted: ExitSide) {
    const b = v.body, reach = Math.max(2, b.h / 2 + 0.95);
    const candidates: { position: Vec; side: ExitSide }[] = [
      { position: vec(-0.3, wanted * reach), side: wanted },
      { position: vec(-0.3, -wanted * reach), side: wanted === 1 ? -1 : 1 },
      { position: vec(-b.w / 2 - 1, 0), side: wanted },
      { position: vec(b.w / 2 + 1, 0), side: wanted },
    ];
    return candidates.map(({ position, side }) => ({ point: b.toWorld(position), side })).find(({ point }) => {
      const probe = new Body(point.x, point.y, 75, 0.7, 0.7);
      return this.clearWalk(b.position, point) && !this.vehicles.some(other => other.alive && contact(probe, other.body));
    });
  }
  interact() {
    if (this.mode !== 'playing' || !this.onFoot && (this.player.sinking || this.pendingExit)) return false;
    if (!this.onFoot && this.portGateNear && this.player.damage.status !== 'burning' && this.player.damage.status !== 'wreck') return this.enterHarbour();
    if (this.onFoot) {
      const next = this.enterableCar;
      if (!next) {
        const disabled = this.vehicles.some(v => v.alive && v.model === 'motorcycle' &&
          !motorcycleEngineWorks(v.damage) && dist(v.body.position, this.driver.position) < 4);
        this.notify(this.tumble ? 'Get back on your feet before taking another ride.'
          : disabled ? 'That motorbike is too damaged to start. Find another ride or tow your bike to repair it.'
          : 'Walk up to a parked car or motorbike, then press E to take it.');
        return false;
      }
      if (next.model === 'motorcycle' && (next.dynamics as MotorcycleDynamics).fallen) {
        const dynamics = next.dynamics as MotorcycleDynamics;
        dynamics.resetLean(); next.body.velocity = vec(); next.body.angularVelocity = 0;
        next.exitSteer = undefined; next.coastUntil = undefined;
        this.notify('Motorbike back on its wheels. Press E again to ride.');
        return true;
      }
      if (next !== this.player) { this.player.kind = 'traffic'; this.player.parked = true; this.player.driverExited = true; next.kind = 'taxi'; this.player = next; this.boost = 100; this.applyUpgrades(); }
      this.setJobType();
      next.parked = false; next.driverExited = false; next.path = []; next.coastUntil = undefined; next.exitSteer = undefined; next.door = undefined;
      if (next.model === 'motorcycle') next.body.mass = next.definition.chassis.mass;
      this.onFoot = false; this.tumble = null; this.driver.angularVelocity = 0; this.previousTyres = []; this.controls = { throttle: 0, turn: 0, handbrake: false }; this.keys.clear(); this.setMode('playing'); this.notify(next.definition.graphics.sprite === 'motorcycle' ? 'Courier bike ready. Pick up parcels in yellow; deliver to green!' : 'Replacement cab ready. Back to the fares!'); return true;
    }
    const point = this.exitLocation(this.player, this.exitSide);
    if (!point) { this.notify('Exit blocked. Move your ride to make room.', 'danger'); return false; }
    const moving = this.speed > MOVING_EXIT_SPEED, b = this.player.body;
    if (this.player.definition.physics.dynamics === 'car') this.player.door = { side: point.side, at: this.time - (moving ? 0 : 0.17) };
    if (moving) {
      const fuse = this.player.damage.status === 'burning' ? this.player.damage.fuse : Infinity;
      const delay = Math.min(DOOR_OPEN_TIME, Math.max(0, fuse - 0.05));
      if (delay > 0.02) {
        this.pendingExit = { vehicle: this.player, side: point.side, at: this.time, delay };
        this.notify(this.player.model === 'motorcycle' ? 'JUMPING OFF · Hold on for the landing!' : 'DOOR OPENING · Brace for the landing!', 'danger');
        return true;
      }
    }
    this.finishExit(point.point, point.side);
    return true;
  }
  private advanceExit() {
    const pending = this.pendingExit;
    if (!pending || this.time - pending.at < pending.delay) return;
    this.pendingExit = null;
    if (this.mode !== 'playing' || this.onFoot || this.player !== pending.vehicle || this.player.sinking) return;
    const point = this.exitLocation(pending.vehicle, pending.side);
    if (!point) { this.notify('Exit blocked! Try the other side.', 'danger'); return; }
    if (pending.vehicle.door) pending.vehicle.door.side = point.side;
    this.finishExit(point.point, point.side);
  }
  private finishExit(point: Vec, side: ExitSide) {
    const v = this.player, b = v.body, speed = length(b.velocity), moving = speed > MOVING_EXIT_SPEED, bike = v.model === 'motorcycle';
    const sideways = rotate(vec(0, side), b.angle);
    this.driver.position = point;
    this.driver.velocity = moving ? add(b.velocityAt(point), scale(sideways, JUMP_SIDE_SPEED)) : vec();
    this.driver.angle = b.angle;
    this.driver.angularVelocity = moving ? side * clamp(speed * (bike ? 0.6 : 0.4), 3, bike ? 12 : 9) : 0;
    this.driverKnockback = 0;
    this.tumble = moving ? { elapsed: 0, duration: tumbleDuration(speed) * (bike ? 1.1 : 1), speed, side, bike, grounded: false } : null;
    this.onFoot = true; v.parked = true; v.driverExited = true; this.navToGarage = false;
    const bikeMass = b.mass;
    if (bike) b.mass = Math.max(50, bikeMass - this.driver.mass);
    if (moving) {
      v.coastUntil = this.time + clamp(0.9 + speed * 0.12, 1.3, 4);
      if (bike) {
        const reaction = motorcycleJumpReaction(speed, side, bikeMass, this.driver.mass);
        b.velocity = add(b.velocity, rotate(vec(0, reaction.lateralVelocity), b.angle));
        b.angularVelocity += reaction.yawVelocity;
        (v.dynamics as MotorcycleDynamics).leanVelocity += reaction.leanVelocity;
        v.exitSteer = clamp(reaction.yawVelocity * 0.7, -1, 1);
      }
    } else { v.coastUntil = undefined; v.exitSteer = undefined; }
    if (this.job.stage === 'dropoff') {
      const passenger = this.world.people.find(p => p.id === this.job.customerId);
      if (passenger && this.job.type === 'fare') { passenger.aboard = false; passenger.alive = true; passenger.position = { ...point }; passenger.home = add(point, rotate(vec(0, 18), b.angle)); passenger.panic = 3; }
      this.newJob(false, 'left-vehicle');
    }
    this.controls = { throttle: 0, turn: 0, handbrake: false }; this.setMode('playing');
    this.notify(moving ? 'ROLL WITH THE LANDING! Speed costs health. Find another ride.' : 'Follow the blue route to a parked car or motorbike.');
  }
  walk(dt: number) {
    const { inOcean } = this.map.coast, { inSand } = this.map.beach;
    const tumbling = this.tumble;
    if (tumbling) {
      tumbling.elapsed += dt;
      // Forward momentum survives the jump. Friction on landing dissipates it
      // gradually; movement input cannot instantly cancel a floor roll.
      this.driver.velocity = scale(this.driver.velocity, Math.exp(-dt * (tumbling.elapsed < LANDING_TIME ? 0.75 : 3.8)));
      this.driver.angularVelocity *= Math.exp(-dt * 0.65);
      if (!tumbling.grounded && tumbling.elapsed >= LANDING_TIME) {
        tumbling.grounded = true;
        const damage = Math.min(95, landingDamage(tumbling.speed) * (tumbling.bike ? 1.13 : 1) * this.rules.damageScale);
        this.sounds.emit('body', this.time, { position: this.driver.position, strength: clamp(tumbling.speed / 17, 0.5, 1.2) });
        this.hurtDriver(damage, 'impact');
        if (damage > 0 && !this.settings.invincible) this.floating(this.driver.position, `LANDING -${Math.round(damage)} HP`, '#ee8675');
      }
      if (tumbling.elapsed >= tumbling.duration) { this.tumble = null; this.driver.angularVelocity = 0; }
    } else {
      const has = (...keys: string[]) => keys.some(k => this.keys.has(k));
      const direction = this.touchMove ?? vec(Number(has('KeyD', 'ArrowRight', 'right')) - Number(has('KeyA', 'ArrowLeft', 'left')), Number(has('KeyS', 'ArrowDown', 'down')) - Number(has('KeyW', 'ArrowUp', 'up')));
      const moving = length(direction) > 0, velocity = scale(this.touchMove ? direction : normalize(direction), 5.5);
      this.driverKnockback = Math.max(0, this.driverKnockback - dt);
      this.driver.velocity = add(this.driver.velocity, scale(sub(velocity, this.driver.velocity), Math.min(1, dt * (this.driverKnockback > 0 ? 2.5 : 18))));
      if (moving) this.driver.angle = Math.atan2(direction.y, direction.x);
    }
    const previous = { ...this.driver.position };
    this.driver.integrate(dt);
    if (tumbling?.grounded && dist(previous, this.driver.position) > 0.02) this.skids.push({ a: previous, b: { ...this.driver.position }, life: 1.3, sand: inSand(this.driver.position) });
    for (let pass = 0; pass < 3; pass++) for (const body of [...this.world.hash.query(this.driver)].filter(p => blocksWalking(p.kind)).map(p => p.body).concat(this.world.pools)) {
      const c = contact(this.driver, body); if (c) resolveCollision(this.driver, body, c, 0);
    }
    for (let pass = 0; pass < 3; pass++) for (const v of this.vehicles) {
      if (!v.alive || v.sinking || dist(v.body.position, this.driver.position) > 5) continue;
      const c = contact(this.driver, v.body); if (!c) continue;
      const closing = Math.max(0, -dot(sub(this.driver.velocity, v.body.velocityAt(c.point)), c.normal));
      const approaching = dot(v.body.velocity, c.normal) > 1.5;
      resolveCollision(this.driver, v.body, c, 0.1);
      if (this.mode === 'playing' && closing > 3 && approaching && this.time - (this.driverHits.get(v.id) ?? -Infinity) >= 0.5) {
        this.driverHits.set(v.id, this.time); this.driverKnockback = 0.6;
        this.sounds.emit('body', this.time, { position: this.driver.position, strength: clamp(closing / 16, 0.35, 1.2) });
        this.hurtDriver((closing - 2) * 4 * this.rules.damageScale, 'impact');
      }
    }
    if (!this.tumble) this.driver.angularVelocity = 0;
    // Resolve intact rails first. Only a real gap (or a previously broken panel)
    // lets the walker cross the shoreline; walking never calls prop damage.
    if (this.mode === 'playing' && inOcean(this.driver.position)) {
      this.fx.splash(this.driver.position, 0.6); this.driverHealth = 0; this.driver.velocity = vec(); this.waste('drowning');
    }
  }
  get health() { return this.onFoot ? this.driverHealth : this.player.damage.health; }
  set health(value: number) { if (this.onFoot) this.driverHealth = clamp(value, 0, 100); else this.player.damage.health = clamp(value, 0, 100); }
  hurtDriver(amount: number, reason: 'explosion' | 'impact') {
    if (!this.onFoot || this.mode !== 'playing' || this.settings.invincible || amount <= 0) return;
    this.driverHealth = Math.max(0, this.driverHealth - amount);
    if (this.driverHealth <= 0) this.waste(reason);
  }
  waste(reason: Game['wastedReason']) {
    if (this.mode !== 'playing') return;
    this.wastedReason = reason; this.wreckedAt = this.time;
    this.controls = { throttle: 0, turn: 0, handbrake: false, boost: false }; this.setMode('wasted');
  }
  get rules() { return difficulties[this.settings.difficulty]; }
  get repairPrice() { const d = this.player.damage; return Math.ceil(Math.max((100 - d.health) * 0.55, (d.critical.engine + d.critical.fuel + d.critical.tyres) * 0.16, d.status === 'burning' ? 30 : 0)); }
  get hospitalBill() {
    const medical = Math.min(this.save.cash, 50);
    const repairs = this.player.damage.status === 'wreck' || this.player.sinking ? Math.min(this.save.cash - medical, 60) : 0;
    return { medical, repairs, total: medical + repairs };
  }
  get arrestBill() {
    const impound = Math.min(this.save.cash, 75);
    const bail = Math.min(this.save.cash - impound, this.stars * 45);
    return { impound, bail, total: impound + bail };
  }
  get stars() { return this.heat < 20 ? 0 : this.heat < 48 ? 1 : this.heat < 76 ? 2 : 3; }
  get police() { return this.vehicles.filter(v => v.kind === 'police' && v.alive && v.damage.status !== 'wreck'); }
  get policeVisible() { return this.police.some(v => dist(v.body.position, this.actor.position) < 70 && this.lineOfSight(v.body.position, this.actor.position)); }
  get exchangeCar() { return this.player.definition.access.playerDrivable && this.player.definition.physics.dynamics === 'car'; }
  get portGateNear() { const p = this.actor.position; return !this.onFoot && this.harbour.vehicleId !== this.player.id && Math.abs(p.x - PORT_ENTRY.x) < 4.5 && p.y > -15 && p.y < -2; }
  get insideSwap() { return !this.onFoot && this.player.body.corners().every(p => Math.abs(p.x - SWAP_CONTAINER.x) < 6.7 && Math.abs(p.y - SWAP_CONTAINER.y) < 2.8); }
  get harbourPrompt(): string | null {
    if (this.portGateNear) return this.policeVisible ? 'SECURITY: lose police line of sight first.' : !this.exchangeCar ? 'SECURITY: car exchange only. Return in a car.' : this.player.damage.status === 'burning' || this.player.damage.status === 'wreck' ? 'SECURITY: burning or wrecked cars refused.' : this.speed > 2 ? 'Stop at the gate for harbour entry.' : this.save.cash < PORT_FEE ? `Harbour entry needs $${PORT_FEE}. Earn another fare.` : `E · Pay $${PORT_FEE} for entry + a fresh car.`;
    if (this.harbour.vehicleId === this.player.id && !this.harbour.exchanged && this.insideSwap) return this.policeVisible ? 'Police have eyes on you. Exchange paused.' : this.harbour.progress > 0 ? `NEW IDENTITY · ${Math.ceil((SWAP_SECONDS - this.harbour.progress) * 10) / 10}s` : 'Stop fully inside the container to exchange.';
    return null;
  }
  navigateHarbour() { if (this.mode !== 'playing' || this.onFoot) return; this.navToHarbour = !this.navToHarbour; this.navToGarage = false; this.notify(this.navToHarbour ? `Northstar Harbour: $${PORT_FEE} buys entry and a car exchange. H cancels the route.` : 'Back to the fare route.'); }
  enterHarbour() {
    if (this.mode !== 'playing' || this.player.sinking || !this.portGateNear || !this.exchangeCar || this.speed > 2 || this.policeVisible || this.save.cash < PORT_FEE || this.player.damage.status === 'burning' || this.player.damage.status === 'wreck') { this.notify(this.harbourPrompt ?? 'Stop in a car at the harbour entry gate.', 'danger'); return false; }
    this.save.cash -= PORT_FEE; this.persist();
    this.harbour = { vehicleId: this.player.id, entered: false, exchanged: false, progress: 0 };
    this.navToHarbour = true; this.navToGarage = false; this.sounds.emit('purchase', this.time);
    this.notify('SECURITY PAID. Follow cyan to container C-76. Drive fully inside and stop.'); return true;
  }
  updateHarbour(dt: number) {
    const h = this.harbour;
    if (this.mode !== 'playing' || h.vehicleId === null) return;
    const admitted = this.vehicles.find(v => v.id === h.vehicleId && v.alive);
    if (!admitted || admitted.sinking || admitted.damage.status === 'wreck') { h.vehicleId = null; h.progress = 0; return; }
    if (inHarbour(admitted.body.position)) h.entered = true;
    if (h.entered && !inHarbour(admitted.body.position)) { h.vehicleId = null; h.progress = 0; this.navToHarbour = false; return; }
    if (h.exchanged || h.vehicleId !== this.player.id) return;
    const safe = this.insideSwap && this.speed < 0.8 && !this.controls.throttle && !this.policeVisible && this.player.damage.status !== 'burning';
    h.progress = safe ? h.progress + dt : 0;
    if (h.progress + 1e-8 < SWAP_SECONDS) return;
    const probe = createVehicleBody(vehicleDefinition('car'), SWAP_EXIT, 0);
    // Never materialize a new ride over a passing truck or an occupied berth.
    if ([...this.world.hash.query(probe)].some(p => contact(probe, p.body)) || this.vehicles.some(v => v !== this.player && v.alive && bodiesNear(probe, v.body, 1))) { h.progress = SWAP_SECONDS; return; }
    const old = this.player, colors = ['#91b5b0', '#dfd5bb', '#ad9dc6', '#d77f72'];
    const color = colors.find(c => c !== old.color)!;
    old.alive = false; old.driverExited = true;
    this.player = this.spawnVehicle({ kind: 'taxi', position: { ...SWAP_EXIT }, angle: 0, color });
    this.applyUpgrades(); this.setJobType(); this.boost = 100; this.previousTyres = []; this.controls = { throttle: 0, turn: 0, handbrake: false, boost: false }; this.keys.clear();
    h.vehicleId = this.player.id; h.exchanged = true; h.progress = 0;
    this.heat = 0; this.escape = 0; this.arrest = 0; this.speedingTime = 0; this.driftMeter = 0;
    this.policeIntel = { position: vec(), velocity: vec(), seenAt: -100 };
    for (const v of this.police) v.alive = false;
    this.sounds.emit('escape', this.time); this.notify('FRESH CAR. CLEAN RECORD. All police warnings cleared. Follow cyan to the exit.', 'success'); this.onChange();
  }
  get garageNear() { return !this.onFoot && dist(this.player.body.position, GARAGE) < 9; }
  persist() { if (!this.persistence) return; try { localStorage.setItem(storageKeys.save, JSON.stringify(this.save)); } catch { /* file:// and private browsers may deny storage */ } }
  configure(settings: Partial<Settings>) {
    const enableGod = settings.invincible === true && !this.settings.invincible;
    if (settings.difficulty && Object.hasOwn(difficulties, settings.difficulty)) this.preferences.difficulty = this.settings.difficulty = settings.difficulty;
    if (typeof settings.gore === 'boolean') this.preferences.gore = settings.gore;
    for (const key of ['gore', 'invincible', 'infiniteBoost', 'noPolice'] as const) if (typeof settings[key] === 'boolean') this.settings[key] = settings[key]!;
    if (enableGod) { this.player.damage = createVehicleDamage(); this.driverHealth = 100; }
    if (this.settings.noPolice) { this.heat = 0; for (const v of this.police) v.alive = false; }
    if (this.persistence) try { localStorage.setItem(storageKeys.settings, JSON.stringify(this.preferences)); } catch {}
    this.onChange();
  }
  setMode(mode: Mode) { if (mode === 'arrested' && this.mode !== mode) this.sounds.emit('arrest', this.time); this.mode = mode; this.keys.clear(); this.touchMove = null; this.onModeChange(); }
  start() { this.setMode('playing'); this.notify('First fare is just ahead. Stop inside the yellow ring.'); }
  notify(message: string, kind = '') { this.toast = message; this.toastKind = kind; this.toastTime = 4; this.eventLog.push(message); if (this.eventLog.length > 30) this.eventLog.shift(); }
  private missionContext(): DirectorContext {
    return { deliveries: this.save.deliveries, jobType: this.player.definition.access.job, model: this.player.model, kind: this.player.kind, time: this.time };
  }
  private newMissionJob(missionId: MissionId) {
    const mission = this.missions.mission(missionId), { roadPath } = this.world.navigation;
    const pickup = { ...mission.stops.pickup }, dropoff = { ...mission.stops.dropoff };
    const distance = isCountry(pickup) || isCountry(dropoff) ? pathLength(roadPath(pickup, dropoff)) : dist(pickup, dropoff), time = 28 + distance / 3;
    const storefront = this.world.props.filter(p => p.kind === 'building' && p.label && p.label !== 'PIT STOP').reduce((a, b) => dist(a.body.position, dropoff) < dist(b.body.position, dropoff) ? a : b);
    const destination = this.missions.catalogue.stops.destinations.find(s => dist(s.position, dropoff) < 1)?.name ?? storefront?.label.toLowerCase().replace(/\b\w/g, s => s.toUpperCase()) ?? PLACES[this.jobsDone % PLACES.length];
    const type = this.player.definition.access.job;
    const customer = type === 'fare' ? this.world.addPerson(add(pickup, vec(3.4, 0)), 'customer', '#f7ce55') : undefined;
    this.missions.begin(missionId, this.missionContext());
    const name = mission.passenger ? characters[mission.passenger].name : PASSENGER_NAMES[this.offer % PASSENGER_NAMES.length];
    this.job = { type, pickup, dropoff, name, destination, fare: Math.round(55 + distance * 0.7), time, elapsed: 0, comfort: 100, stage: 'pickup', wait: 0, customerId: customer?.id ?? -1, missionId };
  }
  newJob(first = false, reason?: AbandonReason) {
    this.dialogue.clear();
    if (this.job) { const old = this.world.people.find(p => p.id === this.job.customerId); if (old?.alive) { old.role = 'civilian'; old.color = '#d4b487'; } }
    this.releaseMission(reason ?? 'replaced');
    this.offer = first ? 0 : this.offer + 1;
    // Config drives every dispatch: a due story mission takes the fare slot,
    // otherwise dispatch falls back to the procedural job below.
    // Keep recovery dispatch local without moving an authored story pickup.
    const offered = this.missions.available(this.missionContext()).find(id => dist(this.missions.mission(id).stops.pickup, this.actor.position) <= this.missions.mission(id).dispatchRadius);
    if (offered) { this.newMissionJob(offered); return; }
    const { roadPath } = this.world.navigation;
    // Authored stop identities resolve through the same registry as story missions.
    const stops = this.missions.catalogue.stops.routeStops;
    let pickup = first ? stops[0] : stops[(this.offer * 3 + 1) % stops.length];
    // Short trips first; later fares branch into the full city.
    const dropoff = first ? stops[1] : stops[(this.offer * 3 + 4) % stops.length];
    // Dispatch follows the driver after hospital respawn, not the abandoned wreck.
    if (dist(pickup, this.actor.position) > 160) pickup = stops.reduce((a, b) => dist(a, this.actor.position) < dist(b, this.actor.position) ? a : b);
    if (!first && dist(pickup, dropoff) < 10) pickup = stops.filter(p => dist(p, dropoff) >= 10).reduce((a, b) => dist(a, this.actor.position) < dist(b, this.actor.position) ? a : b);
    const distance = isCountry(pickup) || isCountry(dropoff) ? pathLength(roadPath(pickup, dropoff)) : dist(pickup, dropoff), time = 28 + distance / 3;
    const storefront = this.world.props.filter(p => p.kind === 'building' && p.label && p.label !== 'PIT STOP').reduce((a, b) => dist(a.body.position, dropoff) < dist(b.body.position, dropoff) ? a : b);
    const destination = this.missions.catalogue.stops.destinations.find(s => dist(s.position, dropoff) < 1)?.name ?? storefront?.label.toLowerCase().replace(/\b\w/g, s => s.toUpperCase()) ?? PLACES[this.jobsDone % PLACES.length];
    const type = this.player.definition.access.job;
    const customer = type === 'fare' ? this.world.addPerson(add(pickup, vec(3.4, 0)), 'customer', '#f7ce55') : undefined;
    this.job = { type, pickup: { ...pickup }, dropoff: { ...dropoff }, name: PASSENGER_NAMES[this.offer % PASSENGER_NAMES.length], destination, fare: Math.round(55 + distance * 0.7), time, elapsed: 0, comfort: 100, stage: 'pickup', wait: 0, customerId: customer?.id ?? -1 };
  }
  setJobType() {
    const type = this.player.definition.access.job;
    // Explicit mission vehicle policy: a mission that does not allow this kind,
    // model or variant is abandoned rather than silently rewritten.
    if (this.job.missionId && !this.missions.canRide(this.job.missionId, this.missionContext())) {
      const mission = this.missions.mission(this.job.missionId);
      const who = mission.passenger ? characters[mission.passenger].name : 'Your passenger';
      this.releaseMission('vehicle-change');
      this.notify(`${who} will not ride like this. Mission abandoned — switch back to retry.`, 'danger');
      this.newJob(undefined, 'vehicle-change');
      return;
    }
    if (this.job.type === type) return;
    const customer = this.world.people.find(p => p.id === this.job.customerId);
    if (type === 'parcel') {
      if (customer) { customer.role = 'civilian'; customer.color = '#d4b487'; }
      this.job.customerId = -1;
    } else {
      const person = this.world.addPerson(add(this.job.pickup, vec(3.4, 0)), 'customer', '#f7ce55');
      this.job.customerId = person.id;
    }
    this.job.type = type; this.job.wait = 0;
  }
  applyUpgrades() { const physics = this.player.definition.physics; this.player.baseEngine = this.player.dynamics.engineForce = physics.engineForce * (1 + this.save.upgrades.engine * 0.22); this.player.baseGrip = this.player.dynamics.grip = physics.grip * (1 + this.save.upgrades.grip * 0.18); }
  price(key: Upgrade) { return upgradeInfo[key].price * (this.save.upgrades[key] + 1); }
  buy(key: Upgrade) { const price = this.price(key); if (this.save.cash < price || this.save.upgrades[key] >= 3) return false; this.save.cash -= price; this.save.upgrades[key]++; this.applyUpgrades(); this.persist(); this.sounds.emit('purchase', this.time); this.onChange(); return true; }
  repair() { const price = this.repairPrice; if (this.save.cash < price || price === 0) return; this.save.cash -= price; this.player.damage = createVehicleDamage(); this.persist(); this.sounds.emit('repair', this.time); this.onChange(); }
  garage() { if (this.mode === 'garage') { this.setMode('playing'); return; } if (this.mode !== 'playing' || this.player.sinking) return; if (this.onFoot) { this.notify('Get into a car before visiting Pit Stop.'); return; } if (this.stars) { this.notify('Lose the cops before visiting the garage.', 'danger'); return; } if (!this.garageNear) { this.navToHarbour = false; this.navToGarage = !this.navToGarage; this.notify(this.navToGarage ? 'Route to Pit Stop set. Follow the blue line.' : 'Back to your fare. Follow the marked route.'); return; } if (this.speed > 3) { this.notify('Stop the cab to enter Pit Stop.'); return; } this.navToGarage = false; this.setMode('garage'); }
  recover() {
    if (this.mode === 'wasted') {
      this.harbour = { vehicleId: null, entered: false, exchanged: false, progress: 0 }; this.navToHarbour = false;
      this.sounds.reset();
      const bill = this.hospitalBill;
      this.save.cash -= bill.total; this.persist();
      // Leave the destroyed vehicle behind. Acknowledgment brings the driver back on foot.
      this.player.kind = 'traffic'; this.player.parked = true; this.player.driverExited = true;
      // Hospital recovery does not lift or repair the abandoned motorcycle.
      if (this.player.dynamics instanceof MotorcycleDynamics && !this.player.dynamics.fallen) this.player.dynamics.resetLean();
      const passenger = this.world.people.find(p => p.id === this.job.customerId);
      if (passenger?.aboard) { passenger.aboard = false; passenger.alive = !this.player.sinking; passenger.position = { ...this.player.body.position }; passenger.home = add(passenger.position, vec(0, 18)); passenger.panic = 3; }
      this.pendingExit = null; this.tumble = null; this.onFoot = true; this.driver.position = { ...HOSPITAL }; this.driver.velocity = vec(); this.driver.angularVelocity = 0; this.driver.angle = Math.PI / 2;
      this.driverHealth = 100; this.driverKnockback = 0; this.driverHits.clear();
      this.controls = { throttle: 0, turn: 0, handbrake: false, boost: false }; this.previousTyres = [];
      this.wreckedAt = -1; this.boost = 100; this.heat = 0; this.arrest = 0; this.escape = 0; this.combo = 0; this.comboTimer = 0; this.driftMeter = 0; this.navToGarage = false;
      for (const v of this.police) v.alive = false;
      this.newJob(false, 'hospital'); this.setMode('playing'); this.notify(`Hospital bill paid: $${bill.total}. Find a parked ride.`);
      return;
    }
    if (this.mode !== 'arrested' && !(this.mode === 'playing' && this.onFoot && !this.player.sinking &&
      (this.player.damage.status === 'wreck' && dist(this.driver.position, this.player.body.position) < 6 || this.bikeTowable))) return;
    if (this.mode !== 'arrested' && this.player.wreckAt >= 0 && this.time - this.player.wreckAt < 1.2) return;
    this.sounds.reset();
    this.harbour = { vehicleId: null, entered: false, exchanged: false, progress: 0 }; this.navToHarbour = false;
    const fee = this.mode === 'arrested' ? this.arrestBill.total : Math.min(this.save.cash, 60);
    this.save.cash -= fee; this.persist(); this.player.body.position = vec(4, 32); this.player.body.velocity = vec(); this.player.body.angle = -Math.PI / 2; this.player.body.angularVelocity = 0;
    this.pendingExit = null; this.tumble = null; this.onFoot = false; this.wreckedAt = -1; this.player.kind = 'taxi'; this.player.parked = false; this.player.driverExited = false; this.controls = { throttle: 0, turn: 0, handbrake: false, boost: false };
    if (this.player.model === 'motorcycle') this.player.body.mass = this.player.definition.chassis.mass;
    this.player.door = undefined; this.player.coastUntil = undefined; this.player.exitSteer = undefined;
    this.player.damage = createVehicleDamage(); this.player.wreckAt = -1; this.player.alive = true; this.boost = 100; this.heat = 0; this.arrest = 0; this.escape = 0; this.combo = 0; this.navToGarage = false;
    this.driverHealth = 100; this.driverKnockback = 0; this.driverHits.clear(); this.player.sinking = undefined;
    if (this.player.dynamics instanceof MotorcycleDynamics) this.player.dynamics.resetLean();
    for (const v of this.police) v.alive = false;
    this.newJob(true, 'arrested'); this.setMode('playing'); this.notify(`Back on the road. $${fee} paid. Make it back in fares.`);
    this.sounds.emit('repair', this.time);
  }
  crime(amount: number) { if (this.settings.noPolice) return; this.heat = clamp(this.heat + amount, 0, 100); this.escape = 0; }
  floating(p: Vec, text: string, color: string) { this.feedback.push({ position: { ...p }, life: 1.8, color, text }); }
  destroy(prop: Prop, v: Vehicle, impact: number) {
    if (!prop.alive) return;
    prop.alive = false; prop.brokenAt = this.time;
    const structural = isStructural(prop.kind);
    this.propSound(prop, impact);
    if (prop.kind === 'pump' || prop.kind === 'station') this.igniteProp(prop, v.kind === 'taxi' || prop.blamed, 0.6);
    if (v.kind === 'taxi') {
      this.smashed++; this.combo = this.comboTimer > 0 ? this.combo + 1 : 1; this.comboTimer = 3;
      if (structural) this.buildingsSmashed++;
      this.crime(structural ? 25 : prop.kind === 'kiosk' ? 15 : prop.kind === 'tree' ? 12 : 7);
      this.floating(prop.body.position, this.combo > 1 ? `${this.combo}× SMASH` : 'SMASH!', '#f9ce60');
      if (!this.settings.invincible) v.damage.health = Math.max(0, v.damage.health - Math.min(3, impact * 0.07) * (1 - this.save.upgrades.armor * 0.25));
      if (this.smashed === 1) this.notify('Shortcut unlocked. Property damage attracts the police.', 'danger');
    }
  }
  propSound(prop: Prop, impact: number) {
    const cue = isStructural(prop.kind) ? 'collapse' : ['crate', 'barrier', 'bench', 'tree', 'palm', 'lifeguard-tower', 'beach-chair', 'sandcastle'].includes(prop.kind) ? 'wood' : prop.kind === 'kiosk' ? 'glass' : 'metal';
    this.sounds.emit(cue, this.time, { position: prop.body.position, strength: clamp(impact / 14, 0.5, 1.4), key: `prop:${prop.id}`, cooldown: 1 });
  }
  /** A motorcycle and its rider are no longer a single rigid body after an impact.
   * The contact solver has already imparted real velocity/yaw; this adds a bounded
   * roll-to-pavement and an independent, sliding rider trajectory. */
  private crashMotorcycle(v: Vehicle, closingSpeed: number, away: Vec, incomingVelocity: Vec, contactPoint: Vec) {
    if (v.model !== 'motorcycle' || v.sinking || closingSpeed < MOTORCYCLE_KNOCKOFF_SPEED) return;
    const dynamics = v.dynamics as MotorcycleDynamics;
    if (dynamics.fallen) return;
    const localAway = rotate(away, -v.body.angle), localContact = rotate(sub(contactPoint, v.body.position), -v.body.angle);
    const wanted: ExitSide = Math.abs(localAway.y) > 0.2 ? localAway.y > 0 ? 1 : -1 : localContact.y >= 0 ? 1 : -1;
    const safe = this.exitLocation(v, wanted);
    const side = safe?.side ?? wanted;
    const point = safe?.point ?? v.body.toWorld(vec(0, side * (v.body.h / 2 + 1.5)));
    const outward = rotate(vec(0, side), v.body.angle);
    const shove = clamp(closingSpeed * 0.6, 3, 11);
    const occupied = !v.driverExited;
    if (occupied) {
      const preImpactMass = v.body.mass;
      v.body.mass = Math.max(50, preImpactMass - this.driver.mass);
      v.body.velocity = sub(v.body.velocity, scale(outward, shove * this.driver.mass / v.body.mass * 0.45));
      if (v === this.player && !this.onFoot) {
        this.driver.position = { ...point };
        this.driver.velocity = add(incomingVelocity, scale(outward, shove));
        this.driver.angle = v.body.angle; this.driver.angularVelocity = side * clamp(closingSpeed * 0.8, 4, 13);
        this.driverKnockback = 0;
        const fallSpeed = Math.max(length(incomingVelocity), closingSpeed);
        this.tumble = { elapsed: 0, duration: tumbleDuration(fallSpeed) * 1.15, speed: fallSpeed, side, bike: true, grounded: false };
        this.onFoot = true; this.pendingExit = null; this.navToGarage = false;
        if (this.job.stage === 'dropoff') this.newJob(false, 'ejected');
        this.controls = { throttle: 0, turn: 0, handbrake: false, boost: false };
        this.notify('THROWN OFF THE MOTORBIKE! Brace for the landing.', 'danger');
      } else {
        const rider = this.world.addPerson(point, v.kind === 'police' ? 'officer' : 'civilian', v.kind === 'police' ? '#6d91ab' : '#e4b96e');
        rider.velocity = add(incomingVelocity, scale(outward, shove));
        rider.angle = v.body.angle; rider.panic = 2;
        rider.fall = { elapsed: 0, duration: tumbleDuration(Math.max(length(incomingVelocity), closingSpeed)), angularVelocity: side * clamp(closingSpeed * 0.8, 4, 13) };
        rider.home = add(point, scale(outward, 12));
      }
    }
    v.driverExited = true; v.parked = true; v.path = [];
    v.coastUntil = undefined; v.exitSteer = undefined;
    dynamics.crash(side, closingSpeed);
    v.body.angularVelocity += side * clamp(closingSpeed * 0.09, 0.35, 1.5);
  }
  collision(v: Vehicle, other: Vehicle | Prop, dt: number) {
    if (!other.alive || 'hp' in other && other.kind === 'port-gate' && (v.freight || v.id === this.harbour.vehicleId)) return;
    const c = contact(v.body, other.body); if (!c) return;
    const before = length(v.body.velocity), incomingVelocity = { ...v.body.velocity };
    const otherVelocity = { ...other.body.velocity };
    if ('hp' in other && other.kind === 'guardrail') {
      const impact = Math.max(0, -dot(v.body.velocityAt(c.point), c.normal));
      if (impact >= RAIL_BREAK_SPEED && dt > 0) {
        other.hp = 0; this.damageImpact(v, impact, c.point, v.kind === 'taxi');
        this.crashMotorcycle(v, impact, c.normal, incomingVelocity, c.point);
        this.destroy(other, v, impact); this.fx.breakRail(c.point, v.body.velocity, other.body.angle);
        // Fracture consumes momentum even when the rider punches straight through.
        v.body.velocity = scale(v.body.velocity, 0.68); v.body.angularVelocity *= 0.7;
        return;
      }
    } else if ('hp' in other && other.kind !== 'building') {
      const impact = Math.max(0, -((v.body.velocity.x * c.normal.x) + (v.body.velocity.y * c.normal.y)));
      // Objects fracture before the impulse solver stops the car. Momentum carries through.
      const structural = isStructural(other.kind);
      const tower = other.kind === 'lifeguard-tower';
      if (structural) {
        if (impact > 3 && dt > 0 && this.time - other.lastHit > 0.25) { other.lastHit = this.time; other.hp -= impact * impact * 0.2; other.blamed ||= v.kind === 'taxi'; }
      } else if (impact > 2.5) other.hp -= impact * dt * 120;
      if (other.hp <= 0) {
        if (structural) this.damageImpact(v, impact, c.point, v.kind === 'taxi');
        this.crashMotorcycle(v, impact, c.normal, incomingVelocity, c.point);
        this.destroy(other, v, impact); v.body.velocity = scale(v.body.velocity, tower ? 0.72 : structural ? 0.6 : other.kind === 'kiosk' ? 0.78 : 0.96); return;
      }
    }
    const rail = 'hp' in other && other.kind === 'guardrail';
    const impact = resolveCollision(v.body, other.body, c, rail ? 0.08 : 0.22);
    if (rail && impact > 0.05) v.body.velocity = scale(v.body.velocity, 0.985);
    if (impact > 1.5) {
      const pair = 'hp' in other ? `contact:${v.id}:prop:${other.id}` : `contact:${Math.min(v.id, other.id)}:car:${Math.max(v.id, other.id)}`;
      this.sounds.emit(impact > 15 ? 'crash' : impact > 5 ? 'crunch' : 'bump', this.time, { position: c.point, strength: clamp(impact / 18, 0.25, 1.4), key: pair, cooldown: 0.22 });
    }
    const dynamic = !('hp' in other), totalMass = v.body.mass + other.body.mass;
    // Equal cars preserve the existing damage scale; a heavy truck takes less of the hit.
    this.damageImpact(v, impact * (dynamic ? 2 * other.body.mass / totalMass : 1), c.point, v.kind === 'taxi' || other.kind === 'taxi', impact);
    if (dynamic) this.damageImpact(other, impact * 2 * v.body.mass / totalMass, c.point, v.kind === 'taxi' || other.kind === 'taxi', impact);
    this.crashMotorcycle(v, impact, c.normal, incomingVelocity, c.point);
    if (dynamic) this.crashMotorcycle(other, impact, scale(c.normal, -1), otherVelocity, c.point);
    const involvesPlayer = v.kind === 'taxi' || ('kind' in other && other.kind === 'taxi');
    if (involvesPlayer && impact > 3 && this.crashCooldown <= 0) {
      this.crashCooldown = 0.3;
      if (this.job.stage === 'dropoff') this.job.comfort = Math.max(0, this.job.comfort - impact * 2);
      if (!('hp' in other)) this.crime(other.kind === 'police' || v.kind === 'police' ? 25 : 12);
      if (before > 12) this.floating(c.point, 'OUCH', '#f29281');
    }
  }
  damageImpact(v: Vehicle, impact: number, point: Vec, blamed: boolean, closingSpeed = impact) {
    if (v.cart) {
      if (impact < 3 || v.damage.status === 'wreck' || this.time - v.damage.hitAt < 0.22) return;
      v.damage.hitAt = this.time; v.cart.crush = clamp(v.cart.crush + (impact - 2) / 40, 0, 1);
      v.damage.health = Math.max(0, v.damage.health - (impact - 2) * 1.45 * v.definition.damage.impactScale);
      if (impact >= 14) {
        const side = rotate(sub(point, v.body.position), -v.body.angle).y;
        v.cart.targetRoll = (side < 0 ? 1 : -1) * Math.PI;
      }
      if (v.damage.health === 0 || v.cart.targetRoll) { v.damage.status = 'wreck'; v.wreckAt = this.time; v.driverExited = true; }
      return;
    }
    const local = rotate(sub(point, v.body.position), -v.body.angle), cargo = v.definition.cargo;
    const result = impactDamage(v.damage, { impact, localPoint: vec(local.x * 4.2 / v.body.w, local.y * 2.1 / v.body.h), armor: v.kind === 'taxi' ? this.save.upgrades.armor : v.kind === 'police' ? 1 : 0, time: this.time, scale: this.rules.damageScale * v.definition.damage.impactScale, blamed, fuse: this.rules.fireFuse, invincible: v.kind === 'taxi' && this.settings.invincible });
    if (cargo.flammable && result.damage > 0 && closingSpeed >= cargo.ignitionImpact && local.x < v.body.w / 2 - v.definition.graphics.cabLength) igniteVehicle(v.damage, cargo.fuse, blamed);
    if (result.ignited && v === this.player && !this.onFoot) this.notify(`${v.definition.graphics.sprite === 'motorcycle' ? 'BIKE' : 'CAB'} ON FIRE · ${v.damage.fuse.toFixed(1)}s. Press E to bail out, then run clear!`, 'danger');
  }
  igniteProp(prop: Prop, blamed: boolean, fuse = 4.5) {
    if (prop.fuelSpent || !['pump', 'station'].includes(prop.kind)) return;
    prop.fire = prop.fire > 0 ? Math.min(prop.fire, fuse) : fuse; prop.blamed ||= blamed;
  }
  death(person: Person, force: Vec, severity: number, blamed: boolean) {
    this.kills++; this.fx.bloodHit(person.position, force, severity, person.color);
    this.sounds.emit('pulp', this.time, { position: person.position, strength: clamp(severity, 0.5, 1.2) });
    if (blamed) this.crime(person.role === 'officer' ? 35 : 28);
    if (person.id === this.job.customerId && this.job.stage === 'pickup') { this.notify(`${this.job.name} won't be taking that ride. Dispatch sent another fare.`, 'danger'); this.newJob(false, 'customer-lost'); }
  }
  queueBlast(position: Vec, radius: number, power: number, blamed: boolean, sourceVehicle?: number, sourceProp?: number) {
    this.blasts.push({ position: { ...position }, radius, power, blamed, due: this.time, sourceVehicle, sourceProp });
  }
  explosion(blast: Blast) {
    this.explosions++; this.fx.explode(blast.position, blast.radius);
    this.sounds.emit('explosion', this.time, { position: blast.position, strength: clamp(blast.power / 110, 0.6, 1.6) });
    if (blast.blamed) this.crime(15);
    for (const v of this.vehicles) {
      if (!v.alive || v.sinking || v.id === blast.sourceVehicle) continue;
      const effect = radialEffect(blast.position, v.body.position, blast.radius, blast.power); if (!effect.falloff) continue;
      v.body.impulse(scale(effect.kick, Math.min(v.body.mass, 1000)), v.body.toWorld(vec(0, 0.4)));
      if (v.cart) { this.damageImpact(v, effect.damage / 3, blast.position, blast.blamed); continue; }
      const result = blastDamage(v.damage, effect.damage, { armor: v.kind === 'taxi' ? this.save.upgrades.armor : 0, time: this.time, scale: this.rules.damageScale * v.definition.damage.blastScale, blamed: blast.blamed, fuse: Math.min(this.rules.fireFuse, 1.7), invincible: v.kind === 'taxi' && this.settings.invincible });
      const cargo = v.definition.cargo;
      if (cargo.flammable && result.damage > 0 && effect.damage >= cargo.ignitionBlast) igniteVehicle(v.damage, Math.min(cargo.fuse, 1.7), blast.blamed);
      if (result.ignited && v === this.player && !this.onFoot) this.notify('FUEL ON FIRE · Press E to bail out, then run clear!', 'danger');
    }
    for (const prop of this.world.props) {
      if (!prop.alive || prop.kind === 'building' || prop.id === blast.sourceProp) continue;
      const effect = radialEffect(blast.position, prop.body.position, blast.radius, blast.power); if (effect.damage < 3) continue;
      prop.hp -= effect.damage * (isStructural(prop.kind) ? 1.3 : 1.8); prop.blamed ||= blast.blamed;
      if (effect.damage > 22) this.igniteProp(prop, blast.blamed, prop.kind === 'pump' ? 0.7 : 3);
      if (prop.hp <= 0) { prop.alive = false; prop.brokenAt = this.time; this.propSound(prop, effect.damage); if (blast.blamed) { this.smashed++; if (isStructural(prop.kind)) this.buildingsSmashed++; } this.igniteProp(prop, blast.blamed, 0.6); }
    }
    for (const person of this.world.people) {
      if (!person.alive || person.aboard) continue;
      const effect = radialEffect(blast.position, person.position, blast.radius, blast.power); if (effect.damage < 10) continue;
      person.panic = 1;
      if (this.settings.gore && effect.damage > 25 && killPedestrian(person, effect.kick, this.time)) this.death(person, effect.kick, effect.damage / 35, blast.blamed);
      else person.velocity = add(person.velocity, scale(effect.kick, 0.25));
    }
    if (this.onFoot && this.mode === 'playing') {
      const effect = radialEffect(blast.position, this.driver.position, blast.radius, blast.power);
      // An exposed driver has no chassis to absorb the blast.
      if (effect.falloff) { this.driver.velocity = add(this.driver.velocity, effect.kick); this.driverKnockback = 0.65; this.hurtDriver(effect.damage * 1.2 * this.rules.damageScale, 'explosion'); }
    }
  }
  hazards(dt: number) {
    for (const v of this.vehicles) {
      if (!v.alive || v.sinking) continue;
      if (v.kind !== 'taxi' && v.damage.status === 'burning' && v.damage.fireTime > 0.25 && !v.driverExited) {
        for (const side of [1, -1]) {
          const point = v.body.toWorld(vec(0, side * 2.6)), probe = new Body(point.x, point.y, 1, 0.6, 0.6);
          if ([...this.world.hash.query(probe)].some(prop => contact(probe, prop.body))) continue;
          const driver = this.world.addPerson(point, v.kind === 'police' ? 'officer' : 'civilian', v.kind === 'police' ? '#6d91ab' : '#d4b487');
          driver.home = add(point, rotate(vec(-16, 0), v.body.angle)); driver.panic = 2; v.driverExited = true; break;
        }
      }
      if (v.damage.status !== 'burning') v.damage.bloodTime = Math.max(0, v.damage.bloodTime - dt);
      if (tickVehicleDamage(v.damage, dt) === 'explode') {
        v.wreckAt = this.time; this.queueBlast(v.body.position, v.definition.damage.blastRadius, v.definition.damage.blastPower, v.damage.blamed, v.id);
        if (v === this.player && !this.onFoot && this.job.stage === 'dropoff' && this.settings.gore) {
          const passenger = this.world.people.find(p => p.id === this.job.customerId);
          if (passenger) { passenger.alive = true; passenger.aboard = false; passenger.position = add(v.body.position, vec(0.4, 0.4)); if (killPedestrian(passenger, vec(7, 4), this.time)) this.death(passenger, vec(7, 4), 2, v.damage.blamed); }
        }
        if (v === this.player && !this.onFoot) this.waste('explosion');
      }
    }
    for (const prop of this.world.props) if (prop.fire > 0 && !prop.fuelSpent) {
      prop.fire = Math.max(0, prop.fire - dt); prop.hp = Math.max(0, prop.hp - dt * 6);
      if (prop.fire <= 0) { const intact = prop.alive; prop.fuelSpent = true; prop.alive = false; prop.brokenAt = this.time; this.queueBlast(prop.body.position, prop.kind === 'station' ? 30 : 22, prop.kind === 'station' ? 180 : 120, prop.blamed, undefined, prop.id); if (intact && prop.blamed) { this.smashed++; if (prop.kind === 'station') this.buildingsSmashed++; } }
    }
    const pending = this.blasts; this.blasts = [];
    for (const blast of pending.slice(0, 32)) this.explosion(blast);
    if (pending.length > 32) this.blasts.push(...pending.slice(32));
  }
  ai(v: Vehicle, dt: number): Controls {
    return driveNPC(v, this, dt);
  }
  private sink(v: Vehicle, dt: number) {
    const sinking = v.sinking!; sinking.elapsed += dt;
    if (sinking.pool) {
      // Pools are confined basins. Ocean entries instead carry momentum offshore.
      v.body.position = add(v.body.position, scale(sub(sinking.pool.position, v.body.position), Math.min(1, dt * 2)));
    } else {
      v.body.velocity = scale(v.body.velocity, Math.exp(-dt * 1.7));
      v.body.angularVelocity *= Math.exp(-dt * 2); v.body.integrate(dt);
    }
    if (sinking.elapsed < 2.2) return;
    v.damage.status = 'wreck'; v.damage.health = 0; v.wreckAt = this.time; v.alive = false;
    if (v === this.player && !this.onFoot) this.waste('drowning');
  }
  private enterWater(v: Vehicle, pool?: Body) {
    v.sinking = { elapsed: 0, pool, entrySpeed: length(v.body.velocity) };
    v.damage.status = 'intact'; v.damage.fuse = 0; v.damage.fireTime = 0; v.dynamics.skidding = false;
    v.body.force = vec(); v.body.torque = 0;
    if (pool) { v.body.velocity = vec(); v.body.angularVelocity = 0; }
    this.fx.splash(v.body.position, pool ? 1 : clamp(v.sinking.entrySpeed / 15, 0.8, 2));
    if (v === this.player && !this.onFoot) this.notify(pool ? 'RIDE IN THE POOL · SINKING' : 'RIDE IN THE OCEAN · SINKING', 'danger');
  }
  lineOfSight(a: Vec, b: Vec) {
    const sweep = new Body((a.x + b.x) / 2, (a.y + b.y) / 2, 1, Math.abs(b.x - a.x) + 0.1, Math.abs(b.y - a.y) + 0.1);
    for (const prop of this.world.hash.query(sweep)) if (['building', 'rock', 'guardrail', 'container', 'lifeguard-tower', 'shed', 'barracks', 'station'].includes(prop.kind) && segmentIntersectsBody(a, b, prop.body)) return false;
    return true;
  }
  update(dt: number) {
    const { sandHandling, inSand } = this.map.beach, { inOcean } = this.map.coast;
    if (this.mode === 'wasted') { this.effects(dt); return; }
    if (this.mode !== 'playing') return;
    this.time += dt; this.dayNight.update(dt); this.toastTime -= dt; this.crashCooldown -= dt; this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    const has = (...keys: string[]) => keys.some(k => this.keys.has(k));
    const throttle = this.touchMove ? -this.touchMove.y : Number(has('KeyW', 'ArrowUp', 'up')) - Number(has('KeyS', 'ArrowDown', 'down'));
    const turn = this.touchMove ? this.touchMove.x : Number(has('KeyD', 'ArrowRight', 'right')) - Number(has('KeyA', 'ArrowLeft', 'left'));
    const boosting = !this.onFoot && !this.pendingExit && has('ShiftLeft', 'ShiftRight', 'boost') && this.boost > 1 && throttle > 0;
    this.controls = this.onFoot || this.pendingExit ? { throttle: 0, turn: 0, handbrake: false, boost: false } : { throttle, turn, handbrake: has('Space', 'handbrake'), boost: boosting };
    this.boost = this.settings.infiniteBoost ? 100 : clamp(this.boost + dt * (boosting ? -29 / (1 + this.save.upgrades.boost * 0.35) : 13), 0, 100);
    this.previousTyres = this.player.dynamics.tyres.map(t => this.player.body.toWorld(t.position));
    this.recoveryBudget.used = 0; this.recoveryBudget.rejoin = 0;
    for (const v of this.vehicles) {
      if (!v.alive) continue;
      if (v.cart) v.cart.roll += (v.cart.targetRoll - v.cart.roll) * Math.min(1, dt * 7);
      if (v.sinking) { this.sink(v, dt); continue; }
      const motion = length(v.body.velocity); if (motion > 70) v.body.velocity = scale(v.body.velocity, 70 / motion); v.body.angularVelocity = clamp(v.body.angularVelocity, -8, 8);
      const previousPosition = { ...v.body.position };
      if (v.damage.status === 'wreck') {
        v.body.velocity = scale(v.body.velocity, Math.exp(-dt * 2.2)); v.body.angularVelocity *= Math.exp(-dt * 3); v.body.integrate(dt);
      } else {
        const performance = vehiclePerformance(v.damage);
        v.dynamics.engineForce = (v.kind === 'police' ? this.rules.copEngine : v.baseEngine) * performance.engine *
          (v.model === 'motorcycle' && !motorcycleEngineWorks(v.damage) ? 0 : 1);
        v.dynamics.grip = v.baseGrip * performance.grip;
        v.dynamics.surface = sandHandling(v.body, v.definition.physics.tyres, v.definition.terrain.sand);
        const forwardSpeed = rotate(v.body.velocity, -v.body.angle).x;
        const coasting = v.parked && (v.coastUntil ?? 0) > this.time;
        const controls = coasting ? { throttle: 0, turn: v.exitSteer ?? 0, handbrake: false }
          : v.parked || v.damage.status === 'burning' && v !== this.player ? { throttle: forwardSpeed > 1.2 ? -1 : forwardSpeed < -1.2 ? 1 : 0, turn: 0, handbrake: true } : v === this.player ? this.controls : this.ai(v, dt);
        v.dynamics.apply(v.body, controls, dt); v.body.integrate(dt);
      }
      if (v.model === 'motorcycle' && (v.dynamics as MotorcycleDynamics).fallen && length(v.body.velocity) > 1) {
        const offset = rotate(vec(0, (v.dynamics as MotorcycleDynamics).fallSide * 0.45), v.body.angle);
        this.skids.push({ a: add(previousPosition, offset), b: add(v.body.position, offset), life: 9 });
      }
      const pool = this.world.pools.find(pool => Math.abs(v.body.position.x - pool.position.x) < pool.w / 2 && Math.abs(v.body.position.y - pool.position.y) < pool.h / 2);
      if (pool) {
        this.enterWater(v, pool);
        continue;
      }
      // At 120 Hz even a boosted taxi moves <0.4 m: narrow props cannot be tunnelled.
      for (let pass = 0; pass < 2; pass++) for (const prop of this.world.hash.query(v.body)) this.collision(v, prop, pass ? 0 : dt);
      if (inOcean(v.body.position)) this.enterWater(v);
    }
    for (let i = 0; i < this.vehicles.length; i++) for (let j = i + 1; j < this.vehicles.length; j++) {
      const a = this.vehicles[i], b = this.vehicles[j]; if (a.alive && b.alive && !a.sinking && !b.sinking && bodiesNear(a.body, b.body)) this.collision(a, b, dt);
    }
    this.advanceExit();
    if (this.onFoot) this.walk(dt);
    if (!this.onFoot && !this.player.sinking && this.player.dynamics.skidding) {
      this.player.dynamics.tyres.forEach((t, i) => { if (t.skidding && !inSand(this.player.body.toWorld(t.position))) this.skids.push({ a: this.previousTyres[i], b: this.player.body.toWorld(t.position), life: 18 }); });
      if (this.speed > 8) this.driftMeter += this.speed * dt;
    } else if (this.driftMeter > 7) {
      if (this.time - this.lastDrift > 1) { const tip = Math.min(20, Math.round(this.driftMeter * 0.35)); this.save.cash += tip; this.shiftEarnings += tip; this.floating(this.player.body.position, `DRIFT +$${tip}`, '#a6dac0'); this.lastDrift = this.time; this.persist(); }
      this.driftMeter = 0;
    } else this.driftMeter = 0;
    if (!this.onFoot && this.settings.gore && this.player.damage.bloodTime > 0 && this.speed > 1) this.player.dynamics.tyres.forEach((t, i) => { if (!t.steered) this.skids.push({ a: this.previousTyres[i], b: this.player.body.toWorld(t.position), life: 30, blood: true }); });
    this.recordSandRuts();
    this.pedestrianClock += dt;
    // Fast/boosted side impacts need the full contact cadence; ordinary walking
    // stays at 60 Hz, while vehicle and collision physics always use 120 Hz.
    const pedestrianStep = this.vehicles.some(v => v.alive && length(v.body.velocity) > 40) ? 1 / 120 : 1 / 60;
    if (this.pedestrianClock >= pedestrianStep - 1e-8) { this.people(this.pedestrianClock); this.pedestrianClock = 0; }
    this.hazards(dt);
    if (!this.onFoot && this.player.damage.status === 'wreck' && this.mode === 'playing') this.waste('explosion');
    if (this.mode !== 'playing') { this.effects(dt); return; }
    if (!this.onFoot && this.player.sinking) { this.controls = { throttle: 0, turn: 0, handbrake: false, boost: false }; this.job.wait = 0; this.effects(dt); return; }
    this.updateHarbour(dt); this.jobs(dt); this.law(dt); this.effects(dt); this.maintenance(dt);
  }
  private recordSandRuts() {
    const { inSand } = this.map.beach;
    if (this.onFoot || this.player.sinking || this.speed <= 0.8 || this.rutVehicleId !== this.player.id) {
      this.sandRuts = []; this.rutVehicleId = this.player.id;
      if (this.onFoot || this.player.sinking || this.speed <= 0.8) return;
    }
    this.player.dynamics.tyres.forEach((t, i) => {
      const p = this.player.body.toWorld(t.position), previous = this.previousTyres[i];
      if (!inSand(p) || !inSand(previous) || dist(p, previous) > 1.5) { delete this.sandRuts[i]; return; }
      const rut = this.sandRuts[i] ??= { anchor: previous };
      // Teleports and vehicle changes must not paint a line across the world.
      if (dist(rut.anchor, p) > 5) { this.sandRuts[i] = { anchor: p }; return; }
      if (dist(rut.anchor, p) < 0.65) return;
      const segment = rut.segment, delta = sub(p, rut.anchor);
      const straight = segment && Math.abs(angleDiff(Math.atan2(delta.y, delta.x), Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x))) < 0.12;
      if (segment && segment.life > 21 && straight && dist(segment.a, p) <= 4) {
        segment.b = p; segment.life = 24;
      } else {
        rut.segment = { a: rut.anchor, b: p, life: 24, sand: true }; this.skids.push(rut.segment);
      }
      rut.anchor = p;
    });
  }
  people(dt: number) {
    const events = updatePedestrians(this.world, this.vehicles.filter(v => v.alive && !v.sinking), this.settings, dt, this.time);
    for (const event of events) {
      const person = this.world.people.find(p => p.id === event.personId)!;
      this.sounds.emit('body', this.time, { position: person.position, strength: clamp(event.impact / 16, 0.35, 1.2), key: `person:${person.id}`, cooldown: 0.3 });
      if (event.type === 'killed') {
        const car = this.vehicles.find(v => v.id === event.vehicleId);
        if (car) { car.damage.bloodTime = 8; car.body.velocity = scale(car.body.velocity, 0.98); }
        this.death(person, event.force, event.impact / 9, event.blamed);
      } else if (event.blamed && event.impact > 2) this.crime(5);
    }
  }
  maintenance(dt: number) {
    this.maintenanceClock += dt; if (this.maintenanceClock < 5) return; this.maintenanceClock = 0;
    this.world.people = this.world.people.filter(p => p.aboard ? p.id === this.job.customerId : p.alive || this.time - p.deathTime < 90 || dist(p.position, this.actor.position) < 80);
    if (this.world.people.length > 240) {
      let excess = this.world.people.length - 240;
      this.world.people = this.world.people.filter(p => { if (excess > 0 && p.id !== this.job.customerId && dist(p.position, this.actor.position) > 80) { excess--; return false; } return true; });
    }
    if (this.world.people.filter(p => p.alive && p.role === 'civilian').length < 112) {
      for (let i = 0; i < 10; i++) {
        const point = vec(Math.floor(this.world.random() * 6) * 40 + 8, Math.floor(this.world.random() * 6) * 40 + 12);
        if (dist(point, this.actor.position) < 85 || this.world.people.some(p => dist(p.position, point) < 2)) continue;
        const probe = new Body(point.x, point.y, 1, 0.6, 0.6); if ([...this.world.hash.query(probe)].some(p => contact(probe, p.body))) continue;
        this.world.addPerson(point, 'civilian', '#c3b7d7'); break;
      }
    }
    for (const v of this.vehicles) if (v !== this.player && v.damage.status === 'wreck' && this.time - v.wreckAt > 30 && dist(v.body.position, this.actor.position) > 85) v.alive = false;
    this.vehicles = this.vehicles.filter(v => v.alive);
    // Removed off-screen wrecks are replaced by traffic, keeping the city alive.
    const count = this.vehicles.filter(v => v.kind === 'traffic' && v.definition.ai.controller === 'road' && !v.parked && !v.freight && v.damage.status !== 'wreck').length;
    if (count < this.trafficTarget) {
      for (let i = 0; i < 12; i++) {
        if (this.replenishTraffic(Math.floor(this.world.random() * this.map.document.trafficSpawns.length * 5), 85)) break;
      }
    }
  }
  jobs(dt: number) {
    if (this.mode !== 'playing' || this.onFoot) { this.job.wait = 0; return; }
    this.dialogue.update(dt);
    const j = this.job;
    if (j.stage === 'dropoff') j.elapsed += dt;
    const jobTarget = j.stage === 'pickup' ? j.pickup : j.dropoff;
    if (dist(this.player.body.position, jobTarget) < 5.3 && this.speed < 2.8) {
      j.wait += dt;
      if (j.wait >= 0.8) {
        if (j.stage === 'pickup') {
          const outcome = j.missionId ? this.missions.pickup(this.missionContext()) : null;
          if (j.missionId && outcome?.missionId !== j.missionId) {
            this.releaseMission('vehicle-change'); this.newJob(false, 'vehicle-change');
            this.notify('That ride cannot take this mission. Dispatch sent a new job.', 'danger'); return;
          }
          j.stage = 'dropoff'; j.wait = 0;
          const person = this.world.people.find(p => p.id === j.customerId);
          if (person) { person.aboard = true; person.alive = false; }
          this.dialogue.start(outcome?.beatId ?? undefined, outcome?.message ?? null);
          if (j.missionId) this.persist();
          this.sounds.emit('pickup', this.time);
          this.notify(j.type === 'parcel' ? `Parcel secured! Deliver to ${j.destination}.` : `${j.name} is in! Head to ${j.destination}.`);
          this.floating(this.player.body.position, j.type === 'parcel' ? 'PARCEL LOADED!' : 'HOP IN!', '#f7ce55');
        }
        else {
          const timeBonus = Math.max(0, Math.round((j.time - j.elapsed) * 0.8)), comfortBonus = Math.round(j.comfort * 0.3), payout = j.fare + timeBonus + comfortBonus;
          if (j.missionId) this.missions.complete(this.missionContext());
          this.save.cash += payout; this.save.deliveries++; this.shiftEarnings += payout; this.jobsDone++; this.save.best = Math.max(this.save.best, this.shiftEarnings); this.persist();
          this.floating(this.player.body.position, `+$${payout}`, '#a8e2bd'); this.notify(`${j.type === 'parcel' ? 'DELIVERY' : 'FARE'} COMPLETE · $${payout} ($${timeBonus + comfortBonus} in tips). Next pickup marked.`, 'success');
          this.sounds.emit('payment', this.time);
          this.newJob();
        }
      }
    } else j.wait = 0;
    // Time is a tip target rather than a hard fail: the player is always able to finish.
    for (const v of this.vehicles) if (v.alive && v.kind === 'traffic') {
      if (v.parked) continue;
      const distance = dist(v.body.position, this.player.body.position);
      if (distance > 3.3 && distance < 5 && this.speed > 14 && (this.nearMiss.get(v.id) ?? 0) < this.time) { this.nearMiss.set(v.id, this.time + 8); this.save.cash += 5; this.shiftEarnings += 5; this.floating(v.body.position, 'CLOSE CALL +$5', '#b5e5cf'); this.persist(); }
    }
  }
  law(dt: number) {
    const { roadNode } = this.world.navigation, { ROAD_NODES } = this.map.country, { inBeach } = this.map.beach;
    if (this.mode !== 'playing' || this.settings.noPolice) return;
    if (!this.onFoot && this.speed > 24) { this.speedingTime += dt; if (this.speedingTime > 2) this.crime(dt * 3); }
    else this.speedingTime = 0;
    if (this.stars) {
      const rules = difficulties[this.settings.difficulty], desired = Math.min(rules.maxPolice, this.stars + (this.settings.difficulty === 'chaos' ? 3 : 1));
      if (this.police.length < desired) {
        const p = this.actor.position, node = roadNode(p);
        const candidates = (isCountry(p) && !inBeach(p) ? ROAD_NODES.filter(n => isCountry(n) && dist(n, p) > 45 && dist(n, p) < 170) : [vec(node.x + 80, node.y), vec(node.x - 80, node.y), vec(node.x, node.y + 80), vec(node.x, node.y - 80)].filter(n => n.x >= 0 && n.x <= 240 && n.y >= 0 && n.y <= 240)).filter(n => this.police.every(v => dist(v.body.position, n) > 12));
        const spawn = candidates[Math.floor(this.world.random() * candidates.length)] ?? vec(240, 240);
        const firstPatrol = this.police.length === 0;
        if (firstPatrol) this.policeIntel = { position: { ...p }, velocity: { ...this.actor.velocity }, seenAt: this.time };
        this.vehicle('police', spawn.x + 3, spawn.y - 3, Math.atan2(p.y - spawn.y, p.x - spawn.x), '#cfdfdf'); if (firstPatrol) this.notify('DISPATCH: Reckless cab reported. Lose their line of sight.', 'danger');
      }
      const seen = this.policeVisible;
      if (seen) this.policeIntel = { position: { ...this.actor.position }, velocity: { ...this.actor.velocity }, seenAt: this.time };
      this.escape = seen ? 0 : this.escape + dt;
      if (this.escape > rules.escapeTime) { this.heat = 0; this.escape = 0; for (const v of this.police) v.alive = false; this.sounds.emit('escape', this.time); this.notify('LOST THEM. Back to honest-ish work.', 'success'); this.save.cash += 25; this.shiftEarnings += 25; this.persist(); this.floating(this.player.body.position, 'ESCAPED +$25', '#a8e2bd'); }
      const pinned = this.police.some(v => dist(v.body.position, this.actor.position) < (this.onFoot ? 4 : 7.5)) && (this.onFoot ? this.speed < 2 : this.speed < 4 || (!this.controls.throttle && this.speed < 9));
      this.arrest = clamp(this.arrest + dt * (pinned ? 1 : -1.7), 0, rules.arrestTime);
      if (this.arrest >= rules.arrestTime) this.setMode('arrested');
    } else { this.heat = Math.max(0, this.heat - dt * 0.8); this.arrest = 0; }
  }
  effects(dt: number) {
    this.fx.update(dt);
    for (const p of this.feedback) { p.life -= dt; p.position.y -= dt * 2; }
    this.feedback = this.feedback.filter(p => p.life > 0).slice(-30);
    for (const s of this.skids) s.life -= dt; this.skids = this.skids.filter(s => s.life > 0).slice(-4500);
  }
  snapshot() {
    const { inSand, onPromenade, sandHandling } = this.map.beach, { roadPath } = this.world.navigation;
    return structuredClone({ mode: this.mode, time: this.time, onFoot: this.onFoot, exitPending: !!this.pendingExit, tumble: this.tumble && { ...this.tumble }, playerId: this.player.id, vehicleModel: this.player.model, surface: inSand(this.actor.position) ? 'sand' : onPromenade(this.actor.position) ? 'promenade' : 'road', sandCoverage: sandHandling(this.player.body, this.player.definition.physics.tyres, this.player.definition.terrain.sand).coverage, lean: this.lean, nearestCarId: this.nearestCar?.id ?? null, position: this.actor.position, velocity: this.actor.velocity, angle: this.actor.angle, speed: this.speed, cash: this.save.cash,
      health: this.health, driverHealth: this.driverHealth, wastedReason: this.wastedReason, sinking: this.player.sinking?.elapsed ?? null, water: this.player.sinking ? this.player.sinking.pool ? 'pool' : 'ocean' : null, condition: this.player.damage.status, critical: this.player.damage.critical, fireFuse: this.player.damage.fuse, boost: this.boost, heat: this.heat, stars: this.stars,
      police: this.police.map(p => ({ id: p.id, position: p.body.position, speed: length(p.body.velocity), role: p.ai.role, phase: p.ai.phase, condition: p.damage.status })),
      escape: this.escape, arrest: this.arrest, smashed: this.smashed, buildingsSmashed: this.buildingsSmashed, kills: this.kills, explosions: this.explosions, combo: this.combo,
      destroyed: this.world.props.filter(p => !p.alive).map(p => ({ id: p.id, kind: p.kind, position: p.body.position })),
      dialogue: this.dialogue.snapshot(),
      story: this.missions.snapshot(),
      recoveries: this.vehicles.reduce((n, v) => n + v.ai.attempts, 0), burning: this.vehicles.filter(v => v.damage.status === 'burning').map(v => ({ id: v.id, position: v.body.position, fuse: v.damage.fuse })),
      job: this.job, upgrades: this.save.upgrades, deliveries: this.save.deliveries, jobsDone: this.jobsDone, harbour: { ...this.harbour, fee: PORT_FEE, policeVisible: this.policeVisible, inside: inHarbour(this.actor.position), insideContainer: this.insideSwap, prompt: this.harbourPrompt }, navigation: this.onFoot ? 'replacement' : this.harbour.vehicleId === this.player.id || this.navToHarbour ? 'harbour' : this.navToGarage ? 'garage' : 'fare', route: roadPath(this.actor.position, this.target, this.onFoot ? 'walk' : 'drive'), settings: this.settings, events: [...this.eventLog], dayNight: this.dayNight.snapshot() });
  }
}

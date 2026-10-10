import { Body, CarDynamics, add, angleDiff, clamp, contact, dist, dot, length, normalize, resolveCollision, rotate, scale, sub, vec, type Controls, type Vec } from './physics';
import { GARAGE, HOSPITAL, World, isStructural, roadNode, roadPath, type Person, type Prop } from './world';
import { createAI, driveNPC, type AIState } from './ai';
import { defaultSettings, difficulties, type Difficulty, type Settings } from './rules';
import { blastDamage, createVehicleDamage, igniteVehicle, impactDamage, radialEffect, tickVehicleDamage, vehiclePerformance, type VehicleDamage } from './damage';
import { killPedestrian, updatePedestrians } from './pedestrians';
import { Effects } from './effects';
import { SoundEvents } from './sound';
import { DayNight } from './day-night';
import { BIKE_ENGINE, BIKE_GRIP, MotorcycleDynamics } from './motorcycle';
import { readStorage, storageKeys } from './storage';
import { GOLF_CART_ROUTE, HIGHLAND_STOPS, ROAD_NODES, isCountry, pathLength } from './countryside';
import { RAIL_BREAK_SPEED, inOcean } from './coast';

export type Vehicle = { id: number; body: Body; dynamics: CarDynamics; model: 'car' | 'motorcycle' | 'golf-cart'; kind: 'taxi' | 'police' | 'traffic'; color: string; path: Vec[]; routeTimer: number; alive: boolean; parked: boolean; ai: AIState; damage: VehicleDamage; baseEngine: number; baseGrip: number; wreckAt: number; driverExited: boolean; sinking?: { elapsed: number; pool?: Body; entrySpeed: number }; cart?: { waypoint: number; crush: number; roll: number; targetRoll: number } };
export type Feedback = { position: Vec; life: number; color: string; text: string };
export type Skid = { a: Vec; b: Vec; life: number; blood?: boolean };
export type Job = { type: 'fare' | 'parcel'; pickup: Vec; dropoff: Vec; name: string; destination: string; fare: number; time: number; elapsed: number; comfort: number; stage: 'pickup' | 'dropoff'; wait: number; customerId: number };
export type Save = { cash: number; deliveries: number; upgrades: { engine: number; grip: number; armor: number; boost: number }; best: number };
export type Mode = 'intro' | 'playing' | 'paused' | 'garage' | 'arrested' | 'wasted';
export const upgradeInfo = {
  engine: { name: 'Street engine', subtitle: 'More pull. More problems.', detail: '+22% acceleration per level', price: 160 },
  grip: { name: 'Sticky tyres', subtitle: 'Own the next corner.', detail: '+18% tyre grip per level', price: 120 },
  armor: { name: 'Reinforced chassis', subtitle: 'Built for the scenic route.', detail: '25% less impact damage per level', price: 140 },
  boost: { name: 'Bigger boost tank', subtitle: 'A little extra getaway.', detail: '+35% boost capacity per level', price: 180 },
};
export type Upgrade = keyof typeof upgradeInfo;
export const defaultSave = (): Save => ({ cash: 80, deliveries: 0, upgrades: { engine: 0, grip: 0, armor: 0, boost: 0 }, best: 0 });
function loadSave(): Save { try { const s = JSON.parse(readStorage(storageKeys.save) ?? 'null'); if (!s) return defaultSave(); const d = defaultSave(); d.cash = clamp(Number(s.cash) || 0, 0, 1e7); d.deliveries = clamp(Number(s.deliveries) || 0, 0, 1e5); d.best = Number(s.best) || 0; for (const k of Object.keys(d.upgrades) as Upgrade[]) d.upgrades[k] = clamp(Math.floor(Number(s.upgrades?.[k]) || 0), 0, 3); return d; } catch { return defaultSave(); } }
function loadSettings(): Settings { const settings = defaultSettings(); try { const s = JSON.parse(readStorage(storageKeys.settings) ?? 'null'); if (s) { settings.gore = s.gore === true; if (Object.hasOwn(difficulties, s.difficulty)) settings.difficulty = s.difficulty; } } catch {} return settings; }
export type Blast = { position: Vec; radius: number; power: number; blamed: boolean; due: number; sourceVehicle?: number; sourceProp?: number };
export class Game {
  world = new World(); save = loadSave(); mode: Mode = 'intro'; keys = new Set<string>();
  settings: Settings = loadSettings(); policeIntel = { position: vec(4, 32), velocity: vec(), seenAt: -100 };
  private preferences = { gore: this.settings.gore, difficulty: this.settings.difficulty };
  player!: Vehicle; vehicles: Vehicle[] = []; feedback: Feedback[] = []; skids: Skid[] = [];
  onFoot = false; driver = new Body(4, 32, 75, 0.7, 0.7); wreckedAt = -1;
  driverHealth = 100; driverKnockback = 0; wastedReason: 'explosion' | 'drowning' | 'impact' = 'explosion';
  private driverHits = new Map<number, number>();
  get actor() { return this.onFoot ? this.driver : this.player.body; }
  time = 0; boost = 100; heat = 0; escape = 0; arrest = 0; combo = 0; comboTimer = 0; smashed = 0; shiftEarnings = 0;
  fx = new Effects(); blasts: Blast[] = []; kills = 0; explosions = 0; buildingsSmashed = 0; offer = 0; trafficTarget = 23; recoveryBudget = { used: 0, rejoin: 0 }; private serial = 0; private pedestrianClock = 0; private maintenanceClock = 0;
  sounds = new SoundEvents();
  dayNight = new DayNight();
  job!: Job; jobsDone = 0; crashCooldown = 0; speedingTime = 0; driftMeter = 0; lastDrift = 0; nearMiss = new Map<number, number>();
  toast = 'Your city. Your shortcuts.'; toastTime = 5; toastKind = ''; eventLog: string[] = []; onModeChange = () => {}; onChange = () => {}; navToGarage = false;
  controls: Controls = { throttle: 0, turn: 0, handbrake: false }; previousTyres: Vec[] = [];
  constructor() {
    this.populateVehicles(); this.newJob(true); this.applyUpgrades();
  }
  populateVehicles() {
    this.player = this.vehicle('taxi', 4, 32, -Math.PI / 2, '#f7ce55');
    for (let i = 0; i < 23; i++) {
      const horizontal = i % 2 === 0, street = (i % 7) * 40, along = 45 + this.world.random() * 160;
      const v = this.vehicle('traffic', horizontal ? along : street + 3, horizontal ? street + 3 : along, horizontal ? 0 : -Math.PI / 2, ['#d77f72', '#91b5b0', '#ad9dc6', '#dfd5bb', '#7695ac'][i % 5]);
      const node = roadNode(v.body.position); v.path = [horizontal ? vec(Math.min(240, node.x + 40), node.y + 3) : vec(node.x + 3, Math.max(0, node.y - 40))];
    }
    for (const [i, spot] of this.world.parking.entries()) if (spot.occupied) {
      const v = this.vehicle('traffic', spot.position.x, spot.position.y, spot.angle, spot.motorcycle ? '#ed9b63' : ['#d77f72', '#91b5b0', '#ad9dc6', '#dfd5bb', '#7695ac'][i % 5], spot.motorcycle || i % 7 === 0 ? 'motorcycle' : 'car'); v.parked = true; v.driverExited = true;
    }
    for (const i of [0, 1, 2]) {
      const p = GOLF_CART_ROUTE[i], next = GOLF_CART_ROUTE[(i + 1) % GOLF_CART_ROUTE.length];
      const v = this.vehicle('traffic', p.x, p.y, Math.atan2(next.y - p.y, next.x - p.x), '#eee7c8', 'golf-cart');
      v.cart!.waypoint = (i + 1) % GOLF_CART_ROUTE.length;
    }
  }
  resetRun() {
    this.sounds.reset();
    this.onFoot = false; this.wreckedAt = -1; this.driver = new Body(4, 32, 75, 0.7, 0.7);
    this.driverHealth = 100; this.driverKnockback = 0; this.driverHits.clear(); this.wastedReason = 'explosion';
    this.controls = { throttle: 0, turn: 0, handbrake: false, boost: false };
    this.world = new World(); this.vehicles = []; this.serial = 0; this.trafficTarget = 23; this.populateVehicles(); this.feedback = []; this.skids = []; this.keys.clear(); this.fx.reset(); this.blasts = [];
    this.time = 0; this.health = 100; this.boost = 100; this.heat = 0; this.escape = 0; this.arrest = 0; this.combo = 0; this.comboTimer = 0;
    this.smashed = 0; this.shiftEarnings = 0; this.jobsDone = 0; this.crashCooldown = 0; this.speedingTime = 0; this.driftMeter = 0; this.lastDrift = 0; this.nearMiss.clear(); this.navToGarage = false;
    this.kills = 0; this.explosions = 0; this.buildingsSmashed = 0; this.offer = 0; this.pedestrianClock = 0; this.maintenanceClock = 0; this.policeIntel = { position: vec(4, 32), velocity: vec(), seenAt: -100 };
    this.dayNight.reset();
    this.eventLog = []; this.newJob(true); this.applyUpgrades(); this.setMode('playing');
  }
  vehicle(kind: Vehicle['kind'], x: number, y: number, angle: number, color: string, model: Vehicle['model'] = 'car') {
    const bike = model === 'motorcycle', cart = model === 'golf-cart', body = bike ? new Body(x, y, 260, 2.6, 0.8) : cart ? new Body(x, y, 360, 2.7, 1.6) : new Body(x, y); body.angle = angle;
    const id = this.serial++;
    const v: Vehicle = { id, body, dynamics: bike ? new MotorcycleDynamics() : new CarDynamics(), model, kind, color, path: [], routeTimer: 0, alive: true, parked: false, ai: createAI(body.position, id), damage: createVehicleDamage(), baseEngine: bike ? BIKE_ENGINE : 10500, baseGrip: bike ? BIKE_GRIP : 1250, wreckAt: -1, driverExited: false };
    if (cart) { v.baseEngine = 2300; v.baseGrip = 430; v.cart = { waypoint: 0, crush: 0, roll: 0, targetRoll: 0 }; v.dynamics.tyres.forEach(t => { t.position.x *= 0.65; t.position.y *= 0.8; }); }
    this.vehicles.push(v); return v;
  }
  setTrafficCount(count: number) {
    this.trafficTarget = clamp(Math.floor(Number.isFinite(count) ? count : 0), 0, 60);
    const cars = this.vehicles.filter(v => v.kind === 'traffic' && v.model !== 'golf-cart' && !v.parked && v.alive);
    for (const v of cars.slice(this.trafficTarget)) v.alive = false;
    this.vehicles = this.vehicles.filter(v => v.alive);
    for (let attempt = 0; this.vehicles.filter(v => v.kind === 'traffic' && v.model !== 'golf-cart' && !v.parked && v.alive).length < this.trafficTarget && attempt < 300; attempt++) {
      const horizontal = attempt % 2 === 0, street = Math.floor(this.world.random() * 7) * 40, along = 12 + this.world.random() * 216;
      const p = horizontal ? vec(along, street + 3) : vec(street + 3, along);
      if (dist(p, this.player.body.position) < 9 || this.vehicles.some(v => dist(v.body.position, p) < 7)) continue;
      const probe = new Body(p.x, p.y); probe.angle = horizontal ? 0 : -Math.PI / 2;
      if ([...this.world.hash.query(probe)].some(prop => contact(probe, prop.body))) continue;
      const v = this.vehicle('traffic', p.x, p.y, horizontal ? 0 : -Math.PI / 2, ['#91b5b0', '#d77f72', '#ad9dc6'][attempt % 3]);
      const node = roadNode(p); v.path = [horizontal ? vec(Math.min(240, node.x + 40), node.y + 3) : vec(node.x + 3, Math.max(0, node.y - 40))];
    }
  }
  get target() { return this.onFoot ? this.nearestCar?.body.position ?? GARAGE : this.navToGarage ? GARAGE : this.job.stage === 'pickup' ? this.job.pickup : this.job.dropoff; }
  get speed() { return length(this.actor.velocity); }
  get lean() { return this.player.dynamics instanceof MotorcycleDynamics ? this.player.dynamics.lean : 0; }
  get nearestCar() { return this.vehicles.filter(v => v.alive && !v.sinking && v.model !== 'golf-cart' && v.kind !== 'police' && v.damage.status !== 'burning' && v.damage.status !== 'wreck' && length(v.body.velocity) < 2 && (v.parked || v === this.player)).sort((a, b) => dist(a.body.position, this.actor.position) - dist(b.body.position, this.actor.position))[0]; }
  get enterableCar() { const v = this.nearestCar; return v && dist(v.body.position, this.driver.position) < 4 && this.clearWalk(this.driver.position, v.body.position) ? v : undefined; }
  clearWalk(a: Vec, b: Vec) {
    const steps = Math.ceil(dist(a, b) / 0.35);
    for (let i = 0; i <= steps; i++) { const p = add(a, scale(sub(b, a), i / (steps || 1))), probe = new Body(p.x, p.y, 1, 0.7, 0.7); if (inOcean(p) || [...this.world.hash.query(probe)].some(prop => contact(probe, prop.body)) || this.world.pools.some(pool => contact(probe, pool))) return false; }
    return true;
  }
  interact() {
    if (this.mode !== 'playing' || !this.onFoot && this.player.sinking) return false;
    if (this.onFoot) {
      const next = this.enterableCar;
      if (!next) { this.notify('Walk up to a parked car or motorbike, then press E to take it.'); return false; }
      if (next !== this.player) { this.player.kind = 'traffic'; this.player.parked = true; this.player.driverExited = true; next.kind = 'taxi'; this.player = next; this.boost = 100; this.applyUpgrades(); }
      this.setJobType();
      next.parked = false; next.driverExited = false; next.path = []; this.onFoot = false; this.previousTyres = []; this.controls = { throttle: 0, turn: 0, handbrake: false }; this.keys.clear(); this.setMode('playing'); this.notify(next.model === 'motorcycle' ? 'Courier bike ready. Pick up parcels in yellow; deliver to green!' : 'Replacement cab ready. Back to the fares!'); return true;
    }
    if (this.speed > 6 && this.player.damage.status !== 'burning' && this.player.damage.status !== 'wreck') { this.notify('Slow down before exiting or dismounting. E bails out immediately in a fire.'); return false; }
    const b = this.player.body;
    const offsets = [vec(0, 2), vec(0, -2), vec(-3.2, 0), vec(3.2, 0), vec(0, 3.2), vec(0, -3.2)];
    const point = offsets.map(p => b.toWorld(p)).find(p => { const probe = new Body(p.x, p.y, 75, 0.7, 0.7); return this.clearWalk(b.position, p) && !this.vehicles.some(v => v.alive && contact(probe, v.body)); });
    if (!point) { this.notify('Exit blocked. Move your ride to make room.', 'danger'); return false; }
    this.driver.position = point; this.driver.velocity = vec(); this.driver.angle = b.angle; this.onFoot = true; this.player.parked = true; this.player.driverExited = true; this.navToGarage = false;
    if (this.job.stage === 'dropoff') { const passenger = this.world.people.find(p => p.id === this.job.customerId); if (passenger && this.job.type === 'fare') { passenger.aboard = false; passenger.alive = true; passenger.position = { ...point }; passenger.home = add(point, rotate(vec(0, 18), b.angle)); passenger.panic = 3; } this.newJob(); }
    this.controls = { throttle: 0, turn: 0, handbrake: false }; this.setMode('playing'); this.notify('WASD / arrows to walk. E takes a parked car or motorbike.'); return true;
  }
  walk(dt: number) {
    const has = (...keys: string[]) => keys.some(k => this.keys.has(k));
    const direction = vec(Number(has('KeyD', 'ArrowRight', 'right')) - Number(has('KeyA', 'ArrowLeft', 'left')), Number(has('KeyS', 'ArrowDown', 'down')) - Number(has('KeyW', 'ArrowUp', 'up')));
    const moving = length(direction) > 0, velocity = scale(normalize(direction), 5.5);
    this.driverKnockback = Math.max(0, this.driverKnockback - dt);
    this.driver.velocity = add(this.driver.velocity, scale(sub(velocity, this.driver.velocity), Math.min(1, dt * (this.driverKnockback > 0 ? 2.5 : 18))));
    if (moving) this.driver.angle = Math.atan2(direction.y, direction.x);
    this.driver.integrate(dt);
    for (let pass = 0; pass < 3; pass++) for (const body of [...this.world.hash.query(this.driver)].map(p => p.body).concat(this.world.pools)) {
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
    this.driver.angularVelocity = 0;
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
  get stars() { return this.heat < 20 ? 0 : this.heat < 48 ? 1 : this.heat < 76 ? 2 : 3; }
  get police() { return this.vehicles.filter(v => v.kind === 'police' && v.alive && v.damage.status !== 'wreck'); }
  get garageNear() { return !this.onFoot && dist(this.player.body.position, GARAGE) < 9; }
  persist() { try { localStorage.setItem(storageKeys.save, JSON.stringify(this.save)); } catch { /* file:// and private browsers may deny storage */ } }
  configure(settings: Partial<Settings>) {
    const enableGod = settings.invincible === true && !this.settings.invincible;
    if (settings.difficulty && Object.hasOwn(difficulties, settings.difficulty)) this.preferences.difficulty = this.settings.difficulty = settings.difficulty;
    if (typeof settings.gore === 'boolean') this.preferences.gore = settings.gore;
    for (const key of ['gore', 'invincible', 'infiniteBoost', 'noPolice'] as const) if (typeof settings[key] === 'boolean') this.settings[key] = settings[key]!;
    if (enableGod) { this.player.damage = createVehicleDamage(); this.driverHealth = 100; }
    if (this.settings.noPolice) { this.heat = 0; for (const v of this.police) v.alive = false; }
    try { localStorage.setItem(storageKeys.settings, JSON.stringify(this.preferences)); } catch {}
    this.onChange();
  }
  setMode(mode: Mode) { if (mode === 'arrested' && this.mode !== mode) this.sounds.emit('arrest', this.time); this.mode = mode; this.keys.clear(); this.onModeChange(); }
  start() { this.setMode('playing'); this.notify('First fare is just ahead. Stop inside the yellow ring.'); }
  notify(message: string, kind = '') { this.toast = message; this.toastKind = kind; this.toastTime = 4; this.eventLog.push(message); if (this.eventLog.length > 30) this.eventLog.shift(); }
  newJob(first = false) {
    if (this.job) { const old = this.world.people.find(p => p.id === this.job.customerId); if (old?.alive) { old.role = 'civilian'; old.color = '#d4b487'; } }
    this.offer = first ? 0 : this.offer + 1;
    const cityStops = [vec(4, 14), vec(44, 14), vec(84, 58), vec(116, 84), vec(164, 108), vec(204, 164), vec(156, 204), vec(76, 164), vec(4, 128), vec(44, 204), vec(204, 44), vec(124, 14)];
    const stops = [...cityStops, ...HIGHLAND_STOPS.map(s => s.position)];
    const names = ['Mia', 'Frankie', 'Jules', 'Ravi', 'Cleo', 'Oscar', 'Sam', 'Ruby'];
    const places = ['Noodle Club', 'Vinyl & Co.', 'Garden Café', 'The Arcade', 'Dockside Deli', 'East Village', 'Moonlight Hotel', 'Flower Market'];
    let pickup = first ? stops[0] : stops[(this.offer * 3 + 1) % stops.length];
    // Short trips first; later fares branch into the full city.
    const dropoff = first ? stops[1] : stops[(this.offer * 3 + 4) % stops.length];
    // Dispatch follows the driver after hospital respawn, not the abandoned wreck.
    if (dist(pickup, this.actor.position) > 160) pickup = stops.reduce((a, b) => dist(a, this.actor.position) < dist(b, this.actor.position) ? a : b);
    if (!first && dist(pickup, dropoff) < 10) pickup = stops.filter(p => dist(p, dropoff) >= 10).reduce((a, b) => dist(a, this.actor.position) < dist(b, this.actor.position) ? a : b);
    const distance = isCountry(pickup) || isCountry(dropoff) ? pathLength(roadPath(pickup, dropoff)) : dist(pickup, dropoff), time = 28 + distance / 3;
    const storefront = this.world.props.filter(p => p.kind === 'building' && p.label && p.label !== 'PIT STOP').reduce((a, b) => dist(a.body.position, dropoff) < dist(b.body.position, dropoff) ? a : b);
    const destination = HIGHLAND_STOPS.find(s => dist(s.position, dropoff) < 1)?.name ?? storefront?.label.toLowerCase().replace(/\b\w/g, s => s.toUpperCase()) ?? places[this.jobsDone % places.length];
    const type = this.player.model === 'motorcycle' ? 'parcel' : 'fare';
    const customer = type === 'fare' ? this.world.addPerson(add(pickup, vec(3.4, 0)), 'customer', '#f7ce55') : undefined;
    this.job = { type, pickup: { ...pickup }, dropoff: { ...dropoff }, name: names[this.offer % names.length], destination, fare: Math.round(55 + distance * 0.7), time, elapsed: 0, comfort: 100, stage: 'pickup', wait: 0, customerId: customer?.id ?? -1 };
  }
  setJobType() {
    const type = this.player.model === 'motorcycle' ? 'parcel' : 'fare';
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
  applyUpgrades() { const bike = this.player.model === 'motorcycle'; this.player.baseEngine = this.player.dynamics.engineForce = (bike ? BIKE_ENGINE : 10500) * (1 + this.save.upgrades.engine * 0.22); this.player.baseGrip = this.player.dynamics.grip = (bike ? BIKE_GRIP : 1250) * (1 + this.save.upgrades.grip * 0.18); }
  price(key: Upgrade) { return upgradeInfo[key].price * (this.save.upgrades[key] + 1); }
  buy(key: Upgrade) { const price = this.price(key); if (this.save.cash < price || this.save.upgrades[key] >= 3) return false; this.save.cash -= price; this.save.upgrades[key]++; this.applyUpgrades(); this.persist(); this.sounds.emit('purchase', this.time); this.onChange(); return true; }
  repair() { const price = this.repairPrice; if (this.save.cash < price || price === 0) return; this.save.cash -= price; this.player.damage = createVehicleDamage(); this.persist(); this.sounds.emit('repair', this.time); this.onChange(); }
  garage() { if (this.mode === 'garage') { this.setMode('playing'); return; } if (this.mode !== 'playing' || this.player.sinking) return; if (this.onFoot) { this.notify('Get into a car before visiting Pit Stop.'); return; } if (this.stars) { this.notify('Lose the cops before visiting the garage.', 'danger'); return; } if (!this.garageNear) { this.navToGarage = !this.navToGarage; this.notify(this.navToGarage ? 'Route to Pit Stop set. Follow the blue line.' : 'Back to your fare. Follow the marked route.'); return; } if (this.speed > 3) { this.notify('Stop the cab to enter Pit Stop.'); return; } this.navToGarage = false; this.setMode('garage'); }
  recover() {
    if (this.mode === 'wasted') {
      this.sounds.reset();
      // Leave the destroyed vehicle behind. Acknowledgment brings the driver back on foot.
      this.player.kind = 'traffic'; this.player.parked = true; this.player.driverExited = true;
      const passenger = this.world.people.find(p => p.id === this.job.customerId);
      if (passenger?.aboard) { passenger.aboard = false; passenger.alive = !this.player.sinking; passenger.position = { ...this.player.body.position }; passenger.home = add(passenger.position, vec(0, 18)); passenger.panic = 3; }
      this.onFoot = true; this.driver.position = { ...HOSPITAL }; this.driver.velocity = vec(); this.driver.angularVelocity = 0; this.driver.angle = Math.PI / 2;
      this.driverHealth = 100; this.driverKnockback = 0; this.driverHits.clear();
      this.controls = { throttle: 0, turn: 0, handbrake: false, boost: false }; this.previousTyres = [];
      this.wreckedAt = -1; this.boost = 100; this.heat = 0; this.arrest = 0; this.escape = 0; this.combo = 0; this.comboTimer = 0; this.driftMeter = 0; this.navToGarage = false;
      for (const v of this.police) v.alive = false;
      this.newJob(); this.setMode('playing'); this.notify('Discharged from Midtown Hospital. Find a parked ride to get back on the road.');
      return;
    }
    if (this.mode !== 'arrested' && !(this.mode === 'playing' && this.onFoot && !this.player.sinking && this.player.damage.status === 'wreck' && dist(this.driver.position, this.player.body.position) < 6)) return;
    if (this.mode !== 'arrested' && this.player.wreckAt >= 0 && this.time - this.player.wreckAt < 1.2) return;
    this.sounds.reset();
    const fee = this.mode === 'arrested' ? Math.min(this.save.cash, 75 + this.stars * 45) : Math.min(this.save.cash, 60);
    this.save.cash -= fee; this.persist(); this.player.body.position = vec(4, 32); this.player.body.velocity = vec(); this.player.body.angle = -Math.PI / 2; this.player.body.angularVelocity = 0;
    this.onFoot = false; this.wreckedAt = -1; this.player.kind = 'taxi'; this.player.parked = false; this.player.driverExited = false; this.controls = { throttle: 0, turn: 0, handbrake: false, boost: false };
    this.player.damage = createVehicleDamage(); this.player.wreckAt = -1; this.player.alive = true; this.boost = 100; this.heat = 0; this.arrest = 0; this.escape = 0; this.combo = 0; this.navToGarage = false;
    this.driverHealth = 100; this.driverKnockback = 0; this.driverHits.clear(); this.player.sinking = undefined;
    if (this.player.dynamics instanceof MotorcycleDynamics) this.player.dynamics.resetLean();
    for (const v of this.police) v.alive = false;
    this.newJob(true); this.setMode('playing'); this.notify(`Back on the road. $${fee} paid. Make it back in fares.`);
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
    const cue = isStructural(prop.kind) ? 'collapse' : ['crate', 'barrier', 'bench', 'tree'].includes(prop.kind) ? 'wood' : prop.kind === 'kiosk' ? 'glass' : 'metal';
    this.sounds.emit(cue, this.time, { position: prop.body.position, strength: clamp(impact / 14, 0.5, 1.4), key: `prop:${prop.id}`, cooldown: 1 });
  }
  collision(v: Vehicle, other: Vehicle | Prop, dt: number) {
    if (!other.alive) return;
    const c = contact(v.body, other.body); if (!c) return;
    const before = length(v.body.velocity);
    if ('hp' in other && other.kind === 'guardrail') {
      const impact = Math.max(0, -dot(v.body.velocityAt(c.point), c.normal));
      if (impact >= RAIL_BREAK_SPEED && dt > 0) {
        other.hp = 0; this.damageImpact(v, impact, c.point, v.kind === 'taxi');
        this.destroy(other, v, impact); this.fx.breakRail(c.point, v.body.velocity, other.body.angle);
        // Fracture consumes momentum even when the rider punches straight through.
        v.body.velocity = scale(v.body.velocity, 0.68); v.body.angularVelocity *= 0.7;
        return;
      }
    } else if ('hp' in other && other.kind !== 'building') {
      const impact = Math.max(0, -((v.body.velocity.x * c.normal.x) + (v.body.velocity.y * c.normal.y)));
      // Objects fracture before the impulse solver stops the car. Momentum carries through.
      const structural = isStructural(other.kind);
      if (structural) {
        if (impact > 3 && dt > 0 && this.time - other.lastHit > 0.25) { other.lastHit = this.time; other.hp -= impact * impact * 0.2; other.blamed ||= v.kind === 'taxi'; }
      } else if (impact > 2.5) other.hp -= impact * dt * 120;
      if (other.hp <= 0) {
        if (structural) this.damageImpact(v, impact, c.point, v.kind === 'taxi');
        this.destroy(other, v, impact); v.body.velocity = scale(v.body.velocity, structural ? 0.6 : other.kind === 'kiosk' ? 0.78 : 0.96); return;
      }
    }
    const rail = 'hp' in other && other.kind === 'guardrail';
    const impact = resolveCollision(v.body, other.body, c, rail ? 0.08 : 0.22);
    if (rail && impact > 0.05) v.body.velocity = scale(v.body.velocity, 0.985);
    if (impact > 1.5) {
      const pair = 'hp' in other ? `contact:${v.id}:prop:${other.id}` : `contact:${Math.min(v.id, other.id)}:car:${Math.max(v.id, other.id)}`;
      this.sounds.emit(impact > 15 ? 'crash' : impact > 5 ? 'crunch' : 'bump', this.time, { position: c.point, strength: clamp(impact / 18, 0.25, 1.4), key: pair, cooldown: 0.22 });
    }
    this.damageImpact(v, impact, c.point, v.kind === 'taxi' || other.kind === 'taxi');
    if (!('hp' in other)) this.damageImpact(other, impact, c.point, v.kind === 'taxi' || other.kind === 'taxi');
    const involvesPlayer = v.kind === 'taxi' || ('kind' in other && other.kind === 'taxi');
    if (involvesPlayer && impact > 3 && this.crashCooldown <= 0) {
      this.crashCooldown = 0.3;
      if (this.job.stage === 'dropoff') this.job.comfort = Math.max(0, this.job.comfort - impact * 2);
      if (!('hp' in other)) this.crime(other.kind === 'police' || v.kind === 'police' ? 25 : 12);
      if (before > 12) this.floating(c.point, 'OUCH', '#f29281');
    }
  }
  damageImpact(v: Vehicle, impact: number, point: Vec, blamed: boolean) {
    if (v.cart) {
      if (impact < 3 || v.damage.status === 'wreck' || this.time - v.damage.hitAt < 0.22) return;
      v.damage.hitAt = this.time; v.cart.crush = clamp(v.cart.crush + (impact - 2) / 40, 0, 1);
      v.damage.health = Math.max(0, v.damage.health - (impact - 2) * 3);
      if (impact >= 14) {
        const side = rotate(sub(point, v.body.position), -v.body.angle).y;
        v.cart.targetRoll = (side < 0 ? 1 : -1) * Math.PI;
      }
      if (v.damage.health === 0 || v.cart.targetRoll) { v.damage.status = 'wreck'; v.wreckAt = this.time; v.driverExited = true; }
      return;
    }
    const result = impactDamage(v.damage, { impact, localPoint: rotate(sub(point, v.body.position), -v.body.angle), armor: v.kind === 'taxi' ? this.save.upgrades.armor : v.kind === 'police' ? 1 : 0, time: this.time, scale: this.rules.damageScale, blamed, fuse: this.rules.fireFuse, invincible: v.kind === 'taxi' && this.settings.invincible });
    if (result.ignited && v === this.player && !this.onFoot) this.notify(`${v.model === 'motorcycle' ? 'BIKE' : 'CAB'} ON FIRE · ${v.damage.fuse.toFixed(1)}s. Press E to bail out, then run clear!`, 'danger');
  }
  igniteProp(prop: Prop, blamed: boolean, fuse = 4.5) {
    if (prop.fuelSpent || !['pump', 'station'].includes(prop.kind)) return;
    prop.fire = prop.fire > 0 ? Math.min(prop.fire, fuse) : fuse; prop.blamed ||= blamed;
  }
  death(person: Person, force: Vec, severity: number, blamed: boolean) {
    this.kills++; this.fx.bloodHit(person.position, force, severity, person.color);
    this.sounds.emit('pulp', this.time, { position: person.position, strength: clamp(severity, 0.5, 1.2) });
    if (blamed) this.crime(person.role === 'officer' ? 35 : 28);
    if (person.id === this.job.customerId && this.job.stage === 'pickup') { this.notify(`${this.job.name} won't be taking that ride. Dispatch sent another fare.`, 'danger'); this.newJob(); }
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
      v.body.impulse(scale(effect.kick, v.body.mass), v.body.toWorld(vec(0, 0.4)));
      if (v.cart) { this.damageImpact(v, effect.damage / 3, blast.position, blast.blamed); continue; }
      const result = blastDamage(v.damage, effect.damage, { armor: v.kind === 'taxi' ? this.save.upgrades.armor : 0, time: this.time, scale: this.rules.damageScale, blamed: blast.blamed, fuse: Math.min(this.rules.fireFuse, 1.7), invincible: v.kind === 'taxi' && this.settings.invincible });
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
        v.wreckAt = this.time; this.queueBlast(v.body.position, 13, 110, v.damage.blamed, v.id);
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
    const steps = Math.ceil(dist(a, b) / 3);
    for (let i = 1; i < steps; i++) { const p = add(a, scale(sub(b, a), i / steps)); const probe = new Body(p.x, p.y, 1, 0.1, 0.1); for (const prop of this.world.hash.query(probe)) if (['building', 'rock', 'guardrail'].includes(prop.kind) && contact(probe, prop.body)) return false; }
    return true;
  }
  update(dt: number) {
    if (this.mode === 'wasted') { this.effects(dt); return; }
    if (this.mode !== 'playing') return;
    this.time += dt; this.dayNight.update(dt); this.toastTime -= dt; this.crashCooldown -= dt; this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    const has = (...keys: string[]) => keys.some(k => this.keys.has(k));
    const boosting = !this.onFoot && has('ShiftLeft', 'ShiftRight', 'boost') && this.boost > 1 && has('KeyW', 'ArrowUp', 'up');
    this.controls = this.onFoot ? { throttle: 0, turn: 0, handbrake: false, boost: false } : { throttle: Number(has('KeyW', 'ArrowUp', 'up')) - Number(has('KeyS', 'ArrowDown', 'down')), turn: Number(has('KeyD', 'ArrowRight', 'right')) - Number(has('KeyA', 'ArrowLeft', 'left')), handbrake: has('Space', 'handbrake'), boost: boosting };
    this.boost = this.settings.infiniteBoost ? 100 : clamp(this.boost + dt * (boosting ? -29 / (1 + this.save.upgrades.boost * 0.35) : 13), 0, 100);
    this.previousTyres = this.player.dynamics.tyres.map(t => this.player.body.toWorld(t.position));
    this.recoveryBudget.used = 0; this.recoveryBudget.rejoin = 0;
    for (const v of this.vehicles) {
      if (!v.alive) continue;
      if (v.cart) v.cart.roll += (v.cart.targetRoll - v.cart.roll) * Math.min(1, dt * 7);
      if (v.sinking) { this.sink(v, dt); continue; }
      const motion = length(v.body.velocity); if (motion > 70) v.body.velocity = scale(v.body.velocity, 70 / motion); v.body.angularVelocity = clamp(v.body.angularVelocity, -8, 8);
      if (v.damage.status === 'wreck') {
        v.body.velocity = scale(v.body.velocity, Math.exp(-dt * 2.2)); v.body.angularVelocity *= Math.exp(-dt * 3); v.body.integrate(dt);
      } else {
        const performance = vehiclePerformance(v.damage);
        v.dynamics.engineForce = (v.kind === 'police' ? this.rules.copEngine : v.baseEngine) * performance.engine;
        v.dynamics.grip = v.baseGrip * performance.grip;
        const forwardSpeed = rotate(v.body.velocity, -v.body.angle).x;
        const controls = v.parked || v.damage.status === 'burning' && v !== this.player ? { throttle: forwardSpeed > 1.2 ? -1 : forwardSpeed < -1.2 ? 1 : 0, turn: 0, handbrake: true } : v === this.player ? this.controls : this.ai(v, dt);
        v.dynamics.apply(v.body, controls, dt); v.body.integrate(dt);
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
      const a = this.vehicles[i], b = this.vehicles[j]; if (a.alive && b.alive && !a.sinking && !b.sinking && dist(a.body.position, b.body.position) < 6) this.collision(a, b, dt);
    }
    if (this.onFoot) this.walk(dt);
    if (!this.onFoot && !this.player.sinking && this.player.dynamics.skidding) {
      this.player.dynamics.tyres.forEach((t, i) => { if (t.skidding) this.skids.push({ a: this.previousTyres[i], b: this.player.body.toWorld(t.position), life: 18 }); });
      if (this.speed > 8) this.driftMeter += this.speed * dt;
    } else if (this.driftMeter > 7) {
      if (this.time - this.lastDrift > 1) { const tip = Math.min(20, Math.round(this.driftMeter * 0.35)); this.save.cash += tip; this.shiftEarnings += tip; this.floating(this.player.body.position, `DRIFT +$${tip}`, '#a6dac0'); this.lastDrift = this.time; this.persist(); }
      this.driftMeter = 0;
    } else this.driftMeter = 0;
    if (!this.onFoot && this.settings.gore && this.player.damage.bloodTime > 0 && this.speed > 1) this.player.dynamics.tyres.forEach((t, i) => { if (!t.steered) this.skids.push({ a: this.previousTyres[i], b: this.player.body.toWorld(t.position), life: 30, blood: true }); });
    this.pedestrianClock += dt;
    // Fast/boosted side impacts need the full contact cadence; ordinary walking
    // stays at 60 Hz, while vehicle and collision physics always use 120 Hz.
    const pedestrianStep = this.vehicles.some(v => v.alive && length(v.body.velocity) > 40) ? 1 / 120 : 1 / 60;
    if (this.pedestrianClock >= pedestrianStep - 1e-8) { this.people(this.pedestrianClock); this.pedestrianClock = 0; }
    this.hazards(dt);
    if (!this.onFoot && this.player.damage.status === 'wreck' && this.mode === 'playing') this.waste('explosion');
    if (this.mode !== 'playing') { this.effects(dt); return; }
    if (!this.onFoot && this.player.sinking) { this.controls = { throttle: 0, turn: 0, handbrake: false, boost: false }; this.job.wait = 0; this.effects(dt); return; }
    this.jobs(dt); this.law(dt); this.effects(dt); this.maintenance(dt);
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
    const count = this.vehicles.filter(v => v.kind === 'traffic' && v.model !== 'golf-cart' && !v.parked && v.damage.status !== 'wreck').length;
    if (count < this.trafficTarget) {
      for (let i = 0; i < 12; i++) {
        const p = vec(Math.floor(this.world.random() * 7) * 40 + 3, 15 + this.world.random() * 210);
        if (dist(p, this.actor.position) < 85 || this.vehicles.some(v => dist(v.body.position, p) < 8)) continue;
        this.vehicle('traffic', p.x, p.y, -Math.PI / 2, '#91b5b0'); break;
      }
    }
  }
  jobs(dt: number) {
    if (this.mode !== 'playing' || this.onFoot) { this.job.wait = 0; return; }
    const j = this.job;
    if (j.stage === 'dropoff') j.elapsed += dt;
    const jobTarget = j.stage === 'pickup' ? j.pickup : j.dropoff;
    if (dist(this.player.body.position, jobTarget) < 5.3 && this.speed < 2.8) {
      j.wait += dt;
      if (j.wait >= 0.8) {
        if (j.stage === 'pickup') { j.stage = 'dropoff'; j.wait = 0; const person = this.world.people.find(p => p.id === j.customerId); if (person) { person.aboard = true; person.alive = false; } this.sounds.emit('pickup', this.time); this.notify(j.type === 'parcel' ? `Parcel secured! Deliver to ${j.destination}.` : `${j.name} is in! Head to ${j.destination}.`); this.floating(this.player.body.position, j.type === 'parcel' ? 'PARCEL LOADED!' : 'HOP IN!', '#f7ce55'); }
        else {
          const timeBonus = Math.max(0, Math.round((j.time - j.elapsed) * 0.8)), comfortBonus = Math.round(j.comfort * 0.3), payout = j.fare + timeBonus + comfortBonus;
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
    if (this.mode !== 'playing' || this.settings.noPolice) return;
    if (this.speed > 24) { this.speedingTime += dt; if (this.speedingTime > 2) this.crime(dt * 3); }
    else this.speedingTime = 0;
    if (this.stars) {
      const rules = difficulties[this.settings.difficulty], desired = Math.min(rules.maxPolice, this.stars + (this.settings.difficulty === 'chaos' ? 3 : 1));
      if (this.police.length < desired) {
        const p = this.actor.position, node = roadNode(p);
        const candidates = (isCountry(p) ? ROAD_NODES.filter(n => isCountry(n) && dist(n, p) > 45 && dist(n, p) < 170) : [vec(node.x + 80, node.y), vec(node.x - 80, node.y), vec(node.x, node.y + 80), vec(node.x, node.y - 80)].filter(n => n.x >= 0 && n.x <= 240 && n.y >= 0 && n.y <= 240)).filter(n => this.police.every(v => dist(v.body.position, n) > 12));
        const spawn = candidates[Math.floor(this.world.random() * candidates.length)] ?? vec(240, 240);
        const firstPatrol = this.police.length === 0;
        if (firstPatrol) this.policeIntel = { position: { ...p }, velocity: { ...this.actor.velocity }, seenAt: this.time };
        this.vehicle('police', spawn.x + 3, spawn.y - 3, Math.atan2(p.y - spawn.y, p.x - spawn.x), '#cfdfdf'); if (firstPatrol) this.notify('DISPATCH: Reckless cab reported. Lose their line of sight.', 'danger');
      }
      const seen = this.police.some(v => dist(v.body.position, this.actor.position) < 62 && this.lineOfSight(v.body.position, this.actor.position));
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
    return structuredClone({ mode: this.mode, time: this.time, onFoot: this.onFoot, playerId: this.player.id, vehicleModel: this.player.model, lean: this.lean, nearestCarId: this.nearestCar?.id ?? null, position: this.actor.position, velocity: this.actor.velocity, angle: this.actor.angle, speed: this.speed, cash: this.save.cash,
      health: this.health, driverHealth: this.driverHealth, wastedReason: this.wastedReason, sinking: this.player.sinking?.elapsed ?? null, water: this.player.sinking ? this.player.sinking.pool ? 'pool' : 'ocean' : null, condition: this.player.damage.status, critical: this.player.damage.critical, fireFuse: this.player.damage.fuse, boost: this.boost, heat: this.heat, stars: this.stars,
      police: this.police.map(p => ({ id: p.id, position: p.body.position, speed: length(p.body.velocity), role: p.ai.role, phase: p.ai.phase, condition: p.damage.status })),
      escape: this.escape, arrest: this.arrest, smashed: this.smashed, buildingsSmashed: this.buildingsSmashed, kills: this.kills, explosions: this.explosions, combo: this.combo,
      destroyed: this.world.props.filter(p => !p.alive).map(p => ({ id: p.id, kind: p.kind, position: p.body.position })),
      recoveries: this.vehicles.reduce((n, v) => n + v.ai.attempts, 0), burning: this.vehicles.filter(v => v.damage.status === 'burning').map(v => ({ id: v.id, position: v.body.position, fuse: v.damage.fuse })),
      job: this.job, upgrades: this.save.upgrades, deliveries: this.save.deliveries, jobsDone: this.jobsDone, navigation: this.onFoot ? 'replacement' : this.navToGarage ? 'garage' : 'fare', route: roadPath(this.actor.position, this.target), settings: this.settings, events: [...this.eventLog], dayNight: this.dayNight.snapshot() });
  }
}

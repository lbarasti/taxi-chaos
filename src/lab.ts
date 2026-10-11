// LAB — desktop-only dev playground for Taxi Chaos.
//
// Owned entirely by this module: `main.ts` only has to call `setupLab(game, renderer, hooks)`
// (lazily for `?debug=1` or F2) and forward F2 to `lab.toggle()`. Everything else — the
// `#debug-panel` DOM, `window.__taxi`, scenario fixtures, cheat toggles and the fixed-step
// clock — lives here so gameplay files stay untouched.
//
// The API is deliberately serializable (no class instances, no cyclic references) so browser
// automation and Node tests can inspect it. `loadScenario` is exported with no DOM dependency
// so fixtures can be unit-tested outside a browser.
import './lab.css';
import { Game, upgradeInfo, type Upgrade, type Vehicle } from './game';
import type { Renderer } from './renderer';
import type { Settings } from './rules';
import { difficulties } from './rules';
import { clamp, contact, vec, type Vec } from './physics';
import { createAI } from './ai';
import { createVehicleDamage, igniteVehicle, tickVehicleDamage, type VehicleDamage } from './damage';
import type { AudioFX } from './audio';
import { audioMarkup, bindAudioControls, refreshAudioControls } from './audio-controls';
import { isSoundCue, soundLabels, type SoundCue } from './sound';
import { DAY_MINUTES, type DayNightOptions, type DayPeriod } from './day-night';
import { MotorcycleDynamics } from './motorcycle';
import { removeStorage, storageKeys } from './storage';
import { BEACH_PICKUP } from './beach';
import { HIGHLAND_STOPS } from './countryside';
import { vehicleDefinitions, type VehicleDefinition, type VehicleModel, type VehicleSpawn } from './vehicles';

const STEP = 1 / 120;
/** Representative hour for each day/night period; presets set the hour only. */
const DAY_PRESETS: Record<DayPeriod, number> = { morning: 7, afternoon: 14, evening: 19, night: 23 };
const SOUTH = Math.PI / 2;
const NORTH = -Math.PI / 2;
const EAST = 0;
const WEST = Math.PI;
const MAX_TRAFFIC = 40;

// ---------------------------------------------------------------------------------------------
// Scenario catalogue
// ---------------------------------------------------------------------------------------------

export type ScenarioName =
  | 'first-fare'
  | 'motorcycle'
  | 'moving-car-exit'
  | 'moving-bike-exit'
  | 'motorcycle-impact'
  | 'rider-impact'
  | 'eastern-bridges'
  | 'woodland-estates'
  | 'beach'
  | 'beach-pickup'
  | 'promenade'
  | 'harbour'
  | 'commercial-traffic'
  | 'flammable-cargo'
  | 'coastal-rails'
  | 'coastal-gap'
  | 'coastal-bike'
  | 'coastal-walk'
  | 'hydrant'
  | 'alley'
  | 'wall'
  | 'traffic'
  | 'npc-recovery'
  | 'pileup'
  | 'police-chase'
  | 'arrest'
  | 'pedestrians'
  | 'fire'
  | 'cab-fire'
  | 'chain-reaction'
  | 'barracks'
  | 'depot'
  | 'gas-station';

export type ScenarioInfo = { name: ScenarioName; label: string; description: string };

/** Every reproducible LAB fixture, in the order they appear in the select. */
export const scenarioInfo: ScenarioInfo[] = [
  { name: 'first-fare', label: 'First fare', description: 'Fresh run parked at Old Town; the first customer waits just down the street.' },
  { name: 'motorcycle', label: 'Motorbike deliveries', description: 'Press E to leave the cab, walk right to the courier bike, then E to ride. Yellow loads a parcel; green pays. A/D leans into corners; Space brakes.' },
  { name: 'moving-car-exit', label: 'Moving cab / jump out', description: 'A cab coasts east at 18 m/s. Press E while moving; watch the door swing outward before the jump, the driver tumble with momentum, the landing HP hit and the empty cab coast away. Hold A + E for a left-side exit.' },
  { name: 'moving-bike-exit', label: 'Moving motorbike / hop off', description: 'A courier bike rolls east at 5 m/s. Press E to jump right; the lighter empty bike recoils and steers left while the rider tumbles. Hold A + E to reverse the recoil; at rest E dismounts safely.' },
  { name: 'motorcycle-impact', label: 'Motorbike / collision ejection', description: 'A cab drives east at 18 m/s into a 5 m/s oncoming motorcyclist. Watch the rider tumble separately while the motorcycle falls on its side, skids, spins and settles. Low-damage bikes can be lifted again.' },
  { name: 'rider-impact', label: 'Motorbike / rider knocked off', description: 'You ride east at 12 m/s toward an incoming 12 m/s car. Watch your rider get thrown, tumble and lose HP on landing; the bike skids on its side. Recover and find another ride.' },
  { name: 'eastern-bridges', label: 'Eastern bridges / highlands', description: 'Head east across Pine Bridge, then follow the winding ridge road to Eagle Lookout. The southern Fern Bridge completes a forest loop back to the city. No police for this scenic run.' },
  { name: 'woodland-estates', label: 'Woodland villas / golf club', description: 'Explore Millionaires Row, the Cedar Woods villa loop and Fairway Country Club below the city. Follow the route west to the club, or head north to the original highlands. No police for this scenic run.' },
  { name: 'beach', label: 'Sunset Beach / soft sand', description: 'Drive south from the city onto sand. Road tyres slide, bog down and leave ruts. Smash pastel lifeguard towers, parasols, deck chairs and sand castles. E to leave your cab and take the parked beach pickup.' },
  { name: 'beach-pickup', label: 'Beach / off-road pickup', description: 'The same soft-sand run in the beach patrol pickup. Off-road tyres retain drive and cornering grip. The surf still sinks vehicles; head east for the pedestrian promenade and hotels.' },
  { name: 'promenade', label: 'Ocean Walk / hotel promenade', description: 'On foot on the eastern tiled promenade. Walk past hotels, palms, surf rentals, cafés and beachgoers. Physical bollards admit pedestrians and keep cars and road bikes out.' },
  { name: 'harbour', label: 'Northstar Harbour / car exchange', description: 'Stop at the security gate. E pays $75. Follow cyan into container C-76 and stop fully inside for a fresh car and a completely clean police record. Working ships, cranes and trucks fill the docks.' },
  { name: 'commercial-traffic', label: 'Vans / freight traffic', description: 'A van, empty truck, loaded truck and flammable cargo truck start together on Harbour Ave. Watch their different acceleration and follow them through the junction. NPC only; police disabled.' },
  { name: 'flammable-cargo', label: 'Flammable cargo / impact', description: 'A god-mode cab hits a fuel truck cargo bed at speed. A hard cargo impact starts a readable fire, then a larger blast can ignite the nearby parked car. Commercial vehicles remain NPC only.' },
  { name: 'coastal-rails', label: 'Coast / guardrail crash', description: 'A cab heads north into a guardrail at 26 m/s. Step or let it run to see the panel break, metal scatter and the cab splash into the ocean. Try 8 m/s with teleport for a deflection instead.' },
  { name: 'coastal-gap', label: 'Coast / open gap', description: 'A cab heads north at 26 m/s through an unguarded shore. Watch its momentum carry it offshore before sinking and hospital respawn.' },
  { name: 'coastal-bike', label: 'Coast / motorbike crash', description: 'A courier bike hits a guardrail at 26 m/s. The impact throws its rider off, the bike tips over and skids toward the open ocean. Watch where each one ends up.' },
  { name: 'coastal-walk', label: 'Coast / walk into ocean', description: 'On foot beside an open shore. Walk north with W into the ocean to get Wasted. Intact rails to your left stop walkers and cannot be broken on foot.' },
  { name: 'hydrant', label: 'Hydrant', description: 'Cab rolls south at (7.5, 3) into the kerbside hydrant at 12 m/s.' },
  { name: 'alley', label: 'Alley', description: 'Aim through the alley at (20.5, 4): barrier first, then stacked crates, at 16 m/s.' },
  { name: 'wall', label: 'Wall', description: 'Full-speed 20 m/s test into the solid building at (14, 4) — damage and bounce.' },
  { name: 'traffic', label: 'Traffic (head-on)', description: 'Cab east at 22 m/s meets an NPC car at (54, 0) travelling west at 7 m/s.' },
  { name: 'npc-recovery', label: 'NPC recovery', description: 'A stuck car at (14, 6.7) must back out and rejoin the road toward (14, 24); watch from the corner at (4, 0).' },
  { name: 'pileup', label: 'Pileup', description: 'Two opposing cars at (88, 83) and (92.1, 83) resolve a head-on standoff; watch from the road at (76, 64).' },
  { name: 'police-chase', label: 'Police chase', description: 'Cab at (84, 80), heat 55 and fresh intel: police are already pursuing.' },
  { name: 'arrest', label: 'Arrest', description: 'Stopped cab at (84, 80) boxed in by a stationary cop at (88, 80).' },
  { name: 'pedestrians', label: 'Pedestrians', description: 'Cab south at 20 m/s into three pedestrians on the road; gore on for the run only.' },
  { name: 'fire', label: 'Fire', description: 'An NPC cab burns at (20.5, 40) with a 7 s fuse and 42 HP.' },
  { name: 'cab-fire', label: 'Cab fire / escape', description: 'Your cab has a 7 s fuse. Press E, run clear with WASD, then E by the parked car east of you. Or watch the blast and choose a tow.' },
  { name: 'chain-reaction', label: 'Chain reaction', description: 'Three parked cars at 80/86/92, HP 28, rear damage 40; the front car ignites with a 2 s fuse.' },
  { name: 'barracks', label: 'Barracks', description: 'God-mode ram into the Civic Barracks at (60.5, 43) at 32 m/s.' },
  { name: 'depot', label: 'Depot', description: 'God-mode ram into the Freight Depot shed at (100.5, 3) at 28 m/s.' },
  { name: 'gas-station', label: 'Gas station', description: 'God-mode, no-police run into the fuel pumps at (173, 43) at 20 m/s.' },
];

export const scenarioNames: ScenarioName[] = scenarioInfo.map(s => s.name);
export const scenarioDescriptions: Record<ScenarioName, string> = scenarioInfo.reduce(
  (all, s) => { all[s.name] = s.description; return all; },
  {} as Record<ScenarioName, string>,
);

export function isScenarioName(value: string): value is ScenarioName {
  return (scenarioNames as string[]).includes(value);
}

// ---------------------------------------------------------------------------------------------
// Serializable API shapes
// ---------------------------------------------------------------------------------------------

export type LabClock = { frozen: boolean; timeScale: number; scenario: ScenarioName | null };
export type LabSnapshot = ReturnType<Game['snapshot']> & { lab: LabClock };

export type VehiclePatch = { health?: number; engine?: number; fuel?: number; tyres?: number; ignite?: boolean; fuse?: number };

export type VehicleSummary = {
  id: number; kind: Vehicle['kind']; model: Vehicle['model']; lean: number; alive: boolean; parked: boolean;
  position: Vec; velocity: Vec; angle: number;
  mass: number; inertia: number; size: { length: number; width: number }; playerDrivable: boolean;
  cargo: { kind: VehicleDefinition['cargo']['kind']; mass: number; flammable: boolean };
  damage: { health: number; status: VehicleDamage['status']; critical: { engine: number; fuel: number; tyres: number }; fuse: number; fireTime: number; blamed: boolean };
  ai: { phase: Vehicle['ai']['phase']; role: Vehicle['ai']['role']; attempts: number; path: Vec[] };
};

export type PropSummary = { id: number; kind: string; position: Vec; hp: number; maxHp: number; alive: boolean; fire: number; fuelSpent: boolean; blamed: boolean };
export type PersonSummary = { id: number; role: string; position: Vec; velocity: Vec; angle: number; alive: boolean; aboard: boolean; panic: number; health: number };
export type ContactSummary = { id: number; kind: string; depth: number };

export type LabHooks = {
  setExternalClock: (frozen: boolean) => void;
  setTimeScale: (scale: number) => void;
  refresh: () => void;
  focus: () => void;
  audio?: AudioFX;
};

export type LabAPI = {
  toggle(force?: boolean): boolean;
  open(): boolean;
  close(): boolean;
  isOpen(): boolean;
  scenarios: ScenarioInfo[];
  state(): LabSnapshot;
  vehicles(): VehicleSummary[];
  vehicleModels(): { model: VehicleModel; definition: VehicleDefinition }[];
  spawnVehicle(options: VehicleSpawn): number;
  contacts(): ContactSummary[];
  step(seconds: number, keys?: string[]): LabSnapshot;
  realtime(): void;
  teleport(x: number, y: number, angle?: number, speed?: number): void;
  scenario(name: ScenarioName): LabSnapshot;
  reset(): LabSnapshot;
  garage(): void;
  resetSave(): void;
  configure(settings: Partial<Settings>): void;
  upgrades(patch: Partial<Record<Upgrade, number>>): void;
  cash(amount: number): number;
  repair(id?: number): void;
  damageVehicle(id: number, patch: VehiclePatch): void;
  ignite(id?: number, fuse?: number): void;
  explode(id?: number): void;
  traffic(count: number): void;
  props(): PropSummary[];
  people(): PersonSummary[];
  dayNight(options?: DayNightOptions): LabSnapshot;
  refreshUI(): void;
  audio(): ReturnType<AudioFX['state']> | null;
  sound(cue: SoundCue): Promise<boolean>;
  stopSound(): void;
  interact(): boolean;
};

// The two integration points the owner is adding concurrently: tolerate their absence so the
// module type-checks and the Node fixtures run before the rest of the branch lands.
type TrafficCapable = { setTrafficCount?: (count: number) => void };
type DebugFlags = { debugColliders?: boolean; debugAI?: boolean };

// ---------------------------------------------------------------------------------------------
// Fixtures (DOM-free)
// ---------------------------------------------------------------------------------------------

/** Reset the run, wipe run-only cheats, and clear traffic so a fixture is deterministic. */
function prepare(game: Game, keepCarts = false) {
  game.resetRun();
  game.settings.gore = false;
  game.settings.invincible = false;
  game.settings.infiniteBoost = false;
  game.settings.noPolice = false;
  setTraffic(game, 0);
  game.vehicles = game.vehicles.filter(v => !v.freight && !v.parked && (keepCarts || !v.cart));
}

/** Place a vehicle without touching its damage/upgrades. */
function pose(game: Game, renderer: Renderer | undefined, vehicle: Vehicle, x: number, y: number, angle: number, speed = 0) {
  const body = vehicle.body;
  body.position = vec(x, y);
  body.angle = angle;
  body.velocity = vec(Math.cos(angle) * speed, Math.sin(angle) * speed);
  body.angularVelocity = 0;
  if (vehicle.dynamics instanceof MotorcycleDynamics) vehicle.dynamics.resetLean();
  if (vehicle === game.player) {
    if (renderer) renderer.camera = vec(x, y);
    game.previousTyres = game.player.dynamics.tyres.map(t => game.player.body.toWorld(t.position));
  }
}

/** Spawn a parked lab car: AI is neutered so it stays exactly where the fixture put it. */
function parked(game: Game, kind: Vehicle['kind'], x: number, y: number, angle: number, color: string): Vehicle {
  const car = game.vehicle(kind, x, y, angle, color);
  car.baseEngine = 0;
  car.parked = true;
  car.dynamics.engineForce = 0;
  car.body.velocity = vec();
  car.body.angularVelocity = 0;
  return car;
}

/** Apply a scenario to a live Game. Returns the name so callers can chain/assert. */
export function loadScenario(game: Game, name: ScenarioName, renderer?: Renderer): ScenarioName {
  prepare(game, name === 'woodland-estates');
  const player = game.player;
  switch (name) {
    case 'first-fare':
      pose(game, renderer, player, 4, 32, NORTH, 0);
      break;
    case 'motorcycle': {
      pose(game, renderer, player, 4, 32, NORTH, 0);
      const bike = game.vehicle('traffic', 6.5, 34.6, NORTH, '#ed9b63', 'motorcycle');
      bike.parked = true; bike.driverExited = true; game.settings.noPolice = true;
      break;
    }
    case 'moving-car-exit': {
      pose(game, renderer, player, 90, 80, EAST, 18);
      game.settings.noPolice = true;
      game.notify('MOVING CAB · Press E to jump. Door opens first. Hold A + E to leave on the left.', 'danger');
      break;
    }
    case 'motorcycle-impact': {
      pose(game, renderer, player, 90, 80, EAST, 18);
      const bike = game.vehicle('traffic', 109, 80, WEST, '#ed9b63', 'motorcycle');
      bike.body.velocity = vec(-5, 0); bike.path = [vec(60, 80)];
      game.settings.noPolice = true;
      game.notify('MOTORBIKE IMPACT · Drive straight. The rider and bike fly and slide separately.', 'danger');
      break;
    }
    case 'rider-impact': {
      player.alive = false;
      game.vehicles = game.vehicles.filter(v => v !== player);
      const bike = game.vehicle('taxi', 90, 80, EAST, '#ed9b63', 'motorcycle');
      game.player = bike; game.setJobType(); game.applyUpgrades();
      pose(game, renderer, bike, 90, 80, EAST, 12);
      const oncoming = game.vehicle('traffic', 111, 80, WEST, '#91b5b0');
      oncoming.body.velocity = vec(-12, 0); oncoming.path = [vec(60, 80)];
      game.settings.noPolice = true;
      game.notify('RIDER IMPACT · Hold your line. A collision will throw you off the bike.', 'danger');
      break;
    }
    case 'moving-bike-exit': {
      player.alive = false;
      game.vehicles = game.vehicles.filter(v => v !== player);
      const bike = game.vehicle('taxi', 90, 80, EAST, '#ed9b63', 'motorcycle');
      game.player = bike; game.setJobType(); game.applyUpgrades();
      pose(game, renderer, bike, 90, 80, EAST, 5);
      game.settings.noPolice = true;
      game.notify('MOVING BIKE · Press E to jump right. Hold A + E to jump left; compare the recoil.', 'danger');
      break;
    }
    case 'eastern-bridges': {
      pose(game, renderer, player, 236, 80, EAST, 0);
      game.settings.noPolice = true;
      game.job.pickup = vec(236, 80); game.job.dropoff = vec(474, 58); game.job.destination = 'Eagle Lookout'; game.job.stage = 'dropoff'; game.job.time = 140;
      const customer = game.world.people.find(p => p.id === game.job.customerId);
      if (customer) { customer.aboard = true; customer.alive = false; }
      game.notify('Cross Pine Bridge, then follow the ridge road to Eagle Lookout.');
      break;
    }
    case 'woodland-estates': {
      const estates = HIGHLAND_STOPS[4].position, club = HIGHLAND_STOPS[5].position;
      pose(game, renderer, player, estates.x, estates.y, WEST, 0);
      game.settings.noPolice = true;
      game.job.pickup = { ...estates }; game.job.dropoff = { ...club }; game.job.destination = 'Fairway Club'; game.job.stage = 'dropoff'; game.job.time = 140;
      const customer = game.world.people.find(p => p.id === game.job.customerId);
      if (customer) { customer.aboard = true; customer.alive = false; }
      game.notify('Explore the woodland villas and deliver your passenger to Fairway Club.');
      break;
    }
    case 'beach':
    case 'beach-pickup': {
      if (name === 'beach-pickup') {
        player.kind = 'traffic'; player.parked = true;
        game.player = game.spawnVehicle({ kind: 'taxi', model: 'pickup', position: vec(64, 249), angle: EAST });
        player.alive = false; game.applyUpgrades();
      }
      pose(game, renderer, game.player, 64, 249, EAST, 6);
      if (name === 'beach') game.spawnVehicle({ model: 'pickup', position: BEACH_PICKUP, parked: true, driverExited: true });
      game.settings.noPolice = true;
      game.notify(name === 'beach' ? 'Soft sand: road tyres struggle. E to take the beach pickup, or smash the beach props.' : 'Off-road pickup: more traction on sand. Head east for Ocean Walk; stay clear of the surf.');
      break;
    }
    case 'promenade': {
      pose(game, renderer, player, 180, 240, EAST);
      game.interact(); game.driver.position = vec(184, 251.5);
      if (renderer) renderer.camera = { ...game.driver.position };
      game.settings.noPolice = true; game.notify('Ocean Walk: pedestrians only. Explore the hotels, cafés and palms.');
      break;
    }
    case 'harbour': {
      pose(game, renderer, player, 200, -8, NORTH); game.save.cash = 180; game.heat = 15; game.navToHarbour = true; game.populateFreight();
      game.notify('E pays security $75. Follow cyan to container C-76 for a clean ride.');
      break;
    }
    case 'commercial-traffic': {
      pose(game, renderer, player, 82, 77, EAST);
      game.settings.noPolice = true;
      for (const [i, model] of (['van', 'truck-empty', 'truck-loaded', 'truck-flammable'] as const).entries()) {
        const v = game.spawnVehicle({ model, position: vec(62 + i * 16, 83), angle: EAST });
        v.path = [vec(160, 83), vec(163, 120), vec(200, 123)];
      }
      game.notify('Commercial traffic: vans, empty flatbeds, freight and flammable cargo. NPC only.');
      break;
    }
    case 'flammable-cargo': {
      pose(game, renderer, player, 76, 83, EAST, 22);
      game.settings.noPolice = true; game.settings.invincible = true;
      game.spawnVehicle({ model: 'truck-flammable', position: vec(94, 83), angle: EAST, parked: true });
      const neighbour = game.spawnVehicle({ position: vec(109, 83), angle: EAST, parked: true, driverExited: true });
      neighbour.damage.health = 28;
      game.notify('Hard cargo impact: fuel catches fire, then explodes. God mode enabled for this fixture.');
      break;
    }
    case 'coastal-rails':
    case 'coastal-gap':
    case 'coastal-bike':
    case 'coastal-walk': {
      game.settings.noPolice = true;
      if (name === 'coastal-bike') {
        player.alive = false;
        game.player = game.vehicle('taxi', 0, -4, NORTH, '#ed9b63', 'motorcycle');
        game.vehicles = [game.player]; game.applyUpgrades(); game.newJob(true);
      }
      pose(game, renderer, game.player, name === 'coastal-gap' || name === 'coastal-walk' ? 16 : 0, -4, NORTH, name === 'coastal-walk' ? 0 : 26);
      if (name === 'coastal-walk') { game.interact(); game.driver.position = vec(16, -8); }
      game.notify(scenarioDescriptions[name]);
      break;
    }
    case 'hydrant':
      pose(game, renderer, player, 7.5, 3, SOUTH, 12);
      break;
    case 'alley':
      pose(game, renderer, player, 20.5, 4, SOUTH, 16);
      break;
    case 'wall':
      pose(game, renderer, player, 14, 4, SOUTH, 20);
      break;
    case 'traffic': {
      pose(game, renderer, player, 44, 0, EAST, 22);
      const other = game.vehicle('traffic', 54, 0, WEST, '#91b5b0');
      other.body.velocity = vec(-7, 0);
      other.path = [vec(4, 0)];
      break;
    }
    case 'npc-recovery': {
      // Spectate from the Old Town corner; the recovering car at (14, 6.7) stays on camera
      // (12 m away, no building between) without the cab sitting inside the manoeuvre.
      pose(game, renderer, player, 4, 0, EAST, 0);
      game.settings.invincible = true;
      game.settings.noPolice = true;
      const car = game.vehicle('traffic', 14, 6.7, SOUTH, '#abc');
      car.path = [vec(14, 24)];
      break;
    }
    case 'pileup': {
      // Spectate from the west lane of the vertical road (x = 80 - 4, y = 64), ~22-25 m
      // from both actors at y = 83, safely clear of the standoff.
      pose(game, renderer, player, 76, 64, EAST, 0);
      game.settings.invincible = true;
      game.settings.noPolice = true;
      const a = game.vehicle('traffic', 88, 83, EAST, '#abc'); a.path = [vec(120, 83)];
      const b = game.vehicle('traffic', 92.1, 83, WEST, '#def'); b.path = [vec(40, 77)];
      break;
    }
    case 'police-chase': {
      pose(game, renderer, player, 84, 80, EAST, 18);
      game.heat = 55; game.escape = 0;
      game.policeIntel = { position: vec(84, 80), velocity: vec(18, 0), seenAt: game.time };
      const cop = game.vehicle('police', 124, 80, WEST, '#cfdfdf');
      cop.body.velocity = vec(-18, 0);
      cop.path = [vec(84, 80)];
      break;
    }
    case 'arrest': {
      pose(game, renderer, player, 84, 80, EAST, 0);
      game.heat = 55; game.escape = 0;
      game.policeIntel = { position: vec(84, 80), velocity: vec(), seenAt: game.time };
      game.vehicle('police', 88, 80, WEST, '#cfdfdf');
      break;
    }
    case 'pedestrians': {
      pose(game, renderer, player, 4, 4, SOUTH, 20);
      game.world.addPerson(vec(4, 14), 'civilian', '#e9a69b');
      game.world.addPerson(vec(4, 17.5), 'civilian', '#a7bce0');
      game.world.addPerson(vec(4, 21), 'civilian', '#e4ca79');
      game.settings.gore = true; // run-only: never persisted through Game.configure
      break;
    }
    case 'fire': {
      pose(game, renderer, player, 4, 32, SOUTH, 0);
      const npc = parked(game, 'traffic', 20.5, 40, EAST, '#d77f72');
      npc.damage.health = 42;
      npc.damage.critical.fuel = 60;
      igniteVehicle(npc.damage, 7, false);
      break;
    }
    case 'cab-fire': {
      pose(game, renderer, player, 4, 32, NORTH, 0);
      player.damage.health = 42; player.damage.critical.fuel = 60;
      igniteVehicle(player.damage, 7, false); game.settings.noPolice = true;
      const replacement = game.vehicle('traffic', 14, 34.6, EAST, '#91b5b0'); replacement.parked = true; replacement.driverExited = true;
      game.notify('CAB ON FIRE · E to bail out. WASD to walk. E beside the blue parked car to get in.', 'danger');
      break;
    }
    case 'chain-reaction': {
      pose(game, renderer, player, 60, 80, EAST, 0);
      game.settings.invincible = true;
      const cars = [80, 86, 92].map(x => {
        const car = parked(game, 'traffic', x, 80, EAST, '#91b5b0');
        car.damage.health = 28;
        car.damage.critical.fuel = 40;
        car.damage.status = 'smoking';
        return car;
      });
      igniteVehicle(cars[0].damage, 2, true); // source explosion chains into the neighbours
      break;
    }
    case 'barracks':
      pose(game, renderer, player, 60.5, 43, SOUTH, 32);
      game.settings.invincible = true;
      break;
    case 'depot':
      pose(game, renderer, player, 100.5, 3, SOUTH, 28);
      game.settings.invincible = true;
      break;
    case 'gas-station':
      pose(game, renderer, player, 173, 43, SOUTH, 20);
      game.settings.invincible = true;
      game.settings.noPolice = true;
      break;
  }
  return name;
}

function setTraffic(game: Game, count: number) {
  const cap = game as Game & TrafficCapable;
  if (typeof cap.setTrafficCount === 'function') { cap.setTrafficCount(count); return; }
  // Fallback for the brief window before Game.setTrafficCount lands: only trim, never spawn.
  const alive = game.vehicles.filter(v => v.kind === 'traffic' && v.alive);
  for (const v of alive.slice(Math.max(0, count))) v.alive = false;
}

/**
 * Lab repair: restores a vehicle to pristine damage, rebuilds its NPC brain from the current
 * pose and clears any driver-exit/recovery state so a towed car can drive (and burn/explode)
 * again. It is a pure cheat and deliberately never touches cash or the wallet — no toll/bail is
 * charged — and it returns a wrecked cab to `playing` so the live loop resumes.
 */
export function repairVehicle(game: Game, id = game.player.id): boolean {
  const vehicle = game.vehicles.find(v => v.id === id);
  if (!vehicle) return false;
  vehicle.damage = createVehicleDamage();
  vehicle.wreckAt = -1;
  vehicle.alive = true;
  vehicle.ai = createAI(vehicle.body.position, vehicle.id);
  vehicle.path = [];
  vehicle.routeTimer = 0;
  vehicle.driverExited = false;
  vehicle.sinking = undefined;
  if (vehicle.cart) { vehicle.cart.crush = 0; vehicle.cart.roll = 0; vehicle.cart.targetRoll = 0; }
  if (vehicle === game.player) { game.driverHealth = 100; game.driverKnockback = 0; }
  if (vehicle === game.player && game.mode === 'wasted') game.setMode('playing');
  return true;
}

/**
 * Clock helper used by `realtime()`: a paused world resumes, but arrested/wasted/garage
 * states are left alone so the LIVE label can never imply a modal has been dismissed for the
 * player or quietly waive a bail/tow fee. Returns whether the mode changed.
 */
export function resumeFromPause(game: Game): boolean {
  if (game.mode !== 'paused') return false;
  game.setMode('playing');
  return true;
}

// ---------------------------------------------------------------------------------------------
// setupLab — DOM + API
// ---------------------------------------------------------------------------------------------

export function setupLab(game: Game, renderer: Renderer, hooks: LabHooks): LabAPI {
  const flags = renderer as Renderer & DebugFlags;
  const panel = document.getElementById('debug-panel')!;
  if (!panel) throw new Error('LAB requires the #debug-panel element');

  let frozen = false;
  let timeScale = 1;
  let currentScenario: ScenarioName | null = null;
  let desiredTraffic = game.vehicles.filter(v => v.kind === 'traffic' && !v.cart && !v.parked && !v.freight && v.alive).length;
  let expanded = false;
  let lastKeys: string[] = [];

  panel.hidden = false;
  panel.classList.add('lab');
  panel.classList.remove('lab-open');
  panel.classList.add('lab-closed');
  panel.innerHTML = `
    <div class="lab-bar">
      <span class="lab-brand">LAB</span>
      <span class="lab-pill" data-lab="clock">LIVE</span>
      <span class="lab-quick" data-lab="quick"></span>
      <button class="lab-toggle" data-lab="expand" aria-expanded="false" aria-label="Expand LAB panel">Expand ▴</button>
    </div>
    <div class="lab-body" data-lab="body">
      <div class="lab-head">
        <strong>Taxi Chaos Lab</strong>
        <span class="lab-pill" data-lab="clock-2">LIVE</span>
        <span class="lab-tele" data-lab="tele"></span>
        <button data-lab="collapse" aria-label="Collapse LAB panel">Collapse ▾</button>
      </div>

      <section class="lab-sec" aria-label="Scenario">
        <h4>Scenario</h4>
        <div class="lab-row">
          <select id="lab-scenario" name="lab-scenario" data-lab="scenario" aria-label="Choose scenario"></select>
          <button data-lab="run" class="lab-primary">Run</button>
          <button data-lab="reset">Reset run</button>
        </div>
        <p class="lab-desc" data-lab="scenario-desc"></p>
      </section>

      <section class="lab-sec" aria-label="Clock">
        <h4>Clock</h4>
        <div class="lab-row">
          <button data-lab="step">Step 0.25s</button>
          <button data-lab="live" class="lab-primary">Live ▶</button>
          <span class="lab-label">Speed</span>
          <span class="lab-scales" data-lab="scales" role="group" aria-label="Time scale"></span>
        </div>
        <p class="lab-hint">FIXED freezes the wall clock so Step is deterministic. Live restores realtime play.</p>
      </section>

      <section class="lab-sec" aria-label="Day and night">
        <h4>Day / night</h4>
        <label class="lab-field">Hour <output data-lab="dn-hour-value">07:00</output>
          <input id="lab-dn-hour" name="lab-dn-hour" type="range" min="0" max="${DAY_MINUTES - 1}" step="1" value="${DAY_PRESETS.morning * 60}" data-lab="dn-hour" aria-label="Hour of day">
        </label>
        <div class="lab-row lab-presets" data-lab="dn-presets" role="group" aria-label="Day period presets">
          <button type="button" data-dn-preset="morning">Morning 07:00</button>
          <button type="button" data-dn-preset="afternoon">Afternoon 14:00</button>
          <button type="button" data-dn-preset="evening">Evening 19:00</button>
          <button type="button" data-dn-preset="night">Night 23:00</button>
        </div>
        <label class="lab-field">Rate <output data-lab="dn-rate-value">1×</output>
          <input id="lab-dn-rate" name="lab-dn-rate" type="range" min="0" max="8" step="0.25" value="1" data-lab="dn-rate" aria-label="Cycle rate, in-game minutes per simulated second">
        </label>
        <div class="lab-checks">
          <label><input id="lab-dn-freeze" name="lab-dn-freeze" type="checkbox" data-lab="dn-freeze"> Freeze cycle</label>
        </div>
        <p class="lab-hint">Cycle only: rate is in-game minutes per simulated second. Freeze pauses the day/night clock without stopping fares, fires or the simulation clock.</p>
      </section>

      ${hooks.audio ? `<section class="lab-sec" aria-label="Sound FX audition">
        <h4>Sound FX audition</h4>
        ${audioMarkup(hooks.audio)}
        <div class="lab-row"><select data-lab="sound-cue" aria-label="Choose sound FX">${Object.entries(soundLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select><button data-lab="sound-play">Audition</button><button data-lab="sound-stop">Stop</button></div>
        <p class="lab-hint">Audition isolates one FX for 2 seconds. Mute and volume still apply. Fixed stepping is silent; use Live to hear scenarios.</p>
        <p class="lab-hint" data-lab="sound-state"></p>
      </section>` : ''}

      <section class="lab-sec" aria-label="Cheats">
        <h4>Cheats &amp; difficulty</h4>
        <label class="lab-field">Difficulty
          <select id="lab-difficulty" name="lab-difficulty" data-lab="difficulty" aria-label="Difficulty"></select>
        </label>
        <div class="lab-checks">
          <label><input id="lab-gore" name="lab-gore" type="checkbox" data-cheat="gore"> Gore</label>
          <label><input id="lab-invincible" name="lab-invincible" type="checkbox" data-cheat="invincible"> God mode</label>
          <label><input id="lab-infinite" name="lab-infinite" type="checkbox" data-cheat="infiniteBoost"> Infinite boost</label>
          <label><input id="lab-nopolice" name="lab-nopolice" type="checkbox" data-cheat="noPolice"> No police</label>
          <label><input id="lab-colliders" name="lab-colliders" type="checkbox" data-debug="colliders"> Colliders</label>
          <label><input id="lab-ai" name="lab-ai" type="checkbox" data-debug="ai"> AI paths</label>
        </div>
      </section>

      <section class="lab-sec" aria-label="Traffic">
        <h4>Traffic</h4>
        <label class="lab-field">Count <output data-lab="traffic-value">0</output>
          <input id="lab-traffic" name="lab-traffic" type="range" min="0" max="${MAX_TRAFFIC}" step="1" value="0" data-lab="traffic" aria-label="Traffic count">
        </label>
      </section>

      <section class="lab-sec" aria-label="Upgrades">
        <h4>Upgrades</h4>
        <div class="lab-ups" data-lab="upgrades"></div>
        <div class="lab-row">
          <button data-lab="max-upgrades">Max all</button>
          <button data-lab="reset-upgrades">Reset upgrades</button>
        </div>
      </section>

      <section class="lab-sec" aria-label="Economy and damage">
        <h4>Economy &amp; damage</h4>
        <div class="lab-row">
          <button data-lab="cash">Cash +$1000</button>
          <button data-lab="repair">Repair cab</button>
        </div>
        <div class="lab-row">
          <button data-lab="ignite" class="lab-danger">Ignite cab</button>
          <button data-lab="explode" class="lab-danger">Detonate cab now</button>
        </div>
        <div class="lab-row">
          <button data-lab="reset-save" class="lab-danger">Erase saved progress…</button>
        </div>
      </section>
    </div>`;

  const q = <T extends HTMLElement>(name: string) => panel.querySelector<T>(`[data-lab="${name}"]`);
  const qa = <T extends HTMLElement>(name: string) => Array.from(panel.querySelectorAll<T>(`[data-${name}]`));

  const scenarioSelect = q<HTMLSelectElement>('scenario')!;
  const scenarioDesc = q<HTMLParagraphElement>('scenario-desc')!;
  const difficultySelect = q<HTMLSelectElement>('difficulty')!;
  const trafficInput = q<HTMLInputElement>('traffic')!;
  const trafficValue = q<HTMLOutputElement>('traffic-value')!;
  const upgradeHost = q<HTMLDivElement>('upgrades')!;
  const clockPills = [q<HTMLSpanElement>('clock')!, q<HTMLSpanElement>('clock-2')!];
  const quick = q<HTMLSpanElement>('quick')!;
  const tele = q<HTMLSpanElement>('tele')!;
  const expandButton = q<HTMLButtonElement>('expand')!;
  const igniteButton = q<HTMLButtonElement>('ignite')!;
  const dnHour = q<HTMLInputElement>('dn-hour')!;
  const dnHourValue = q<HTMLOutputElement>('dn-hour-value')!;
  const dnRate = q<HTMLInputElement>('dn-rate')!;
  const dnRateValue = q<HTMLOutputElement>('dn-rate-value')!;
  const dnFreeze = q<HTMLInputElement>('dn-freeze')!;
  const presetHost = q<HTMLDivElement>('dn-presets')!;
  const presetButtons = qa<HTMLButtonElement>('dn-preset');

  scenarioSelect.innerHTML = scenarioInfo.map(s => `<option value="${s.name}">${s.label}</option>`).join('');
  scenarioSelect.value = scenarioNames[0];
  difficultySelect.innerHTML = (Object.keys(difficulties) as (keyof typeof difficulties)[])
    .map(key => `<option value="${key}">${difficulties[key].name}</option>`).join('');
  upgradeHost.innerHTML = (Object.keys(upgradeInfo) as Upgrade[])
    .map(key => `<label class="lab-up"><span>${upgradeInfo[key].name}</span><input id="lab-up-${key}" name="lab-up-${key}" type="range" min="0" max="3" step="1" value="0" data-upgrade="${key}" aria-label="${upgradeInfo[key].name} level"><output data-upgrade-out="${key}">0</output></label>`)
    .join('');

  const scaleHost = q<HTMLSpanElement>('scales')!;
  const SCALES = [0.25, 0.5, 1, 2];
  scaleHost.innerHTML = SCALES.map(s => `<button data-scale="${s}" aria-label="Time scale ${s}×">${s}×</button>`).join('');

  const updateScenarioDesc = () => {
    const value = scenarioSelect.value as ScenarioName;
    scenarioDesc.textContent = scenarioDescriptions[value] ?? '';
  };
  updateScenarioDesc();

  // ---- UI <-> API wiring (defined after the API object below, via `handlers`) ---------------

  function refreshUI() {
    if (hooks.audio) {
      refreshAudioControls(hooks.audio);
      const state = hooks.audio.state();
      q<HTMLElement>('sound-state')!.textContent = `${state.status.toUpperCase()} · ${state.decoded}/${state.total} samples · ${state.loops.length} loops / ${state.voices} one-shots · ${state.lastCue || 'no one-shot yet'}`;
    }
    const condition = game.player.damage.status;
    const fuse = condition === 'burning' ? `${game.player.damage.fuse.toFixed(1)}s` : '—';
    const recoveries = game.vehicles.reduce((n, v) => n + v.ai.attempts, 0);
    for (const pill of clockPills) {
      pill.textContent = frozen ? 'FIXED' : 'LIVE';
      pill.classList.toggle('is-fixed', frozen);
      pill.classList.toggle('is-live', !frozen);
    }
    quick.textContent = `HP ${Math.ceil(game.health)} · ${condition} · cops ${game.police.length} · ${game.mode}`;
    tele.textContent = `HP ${Math.ceil(game.health)} · ${condition} · fuse ${fuse} · cops ${game.police.length} · mode ${game.mode} · kills ${game.kills} · blasts ${game.explosions} · smashes ${game.smashed} · recoveries ${recoveries}`;
    // Fuse length follows the chosen difficulty (rules.fireFuse), never a hard-coded 7 s.
    igniteButton.textContent = `Ignite cab (${game.rules.fireFuse}s fuse)`;

    updateSelect(difficultySelect, game.settings.difficulty);
    updateInput(trafficInput, String(desiredTraffic));
    trafficValue.textContent = String(desiredTraffic);

    const dn = game.dayNight.snapshot();
    updateInput(dnHour, String(Math.round(dn.minutes)));
    dnHourValue.textContent = dn.time;
    updateInput(dnRate, String(dn.rate));
    dnRateValue.textContent = `${dn.rate}×`;
    updateChecked(dnFreeze, dn.frozen);
    for (const button of presetButtons) button.classList.toggle('is-active', button.dataset.dnPreset === dn.period);

    for (const input of qa<HTMLInputElement>('cheat')) {
      const key = input.dataset.cheat as 'gore' | 'invincible' | 'infiniteBoost' | 'noPolice';
      updateChecked(input, game.settings[key]);
    }
    const colliders = panel.querySelector<HTMLInputElement>('[data-debug="colliders"]');
    const aiPaths = panel.querySelector<HTMLInputElement>('[data-debug="ai"]');
    if (colliders) updateChecked(colliders, flags.debugColliders === true);
    if (aiPaths) updateChecked(aiPaths, flags.debugAI === true);
    for (const button of Array.from(scaleHost.querySelectorAll<HTMLButtonElement>('button[data-scale]'))) {
      button.classList.toggle('is-active', Number(button.dataset.scale) === timeScale);
    }
    for (const input of Array.from(upgradeHost.querySelectorAll<HTMLInputElement>('input[data-upgrade]'))) {
      const key = input.dataset.upgrade as Upgrade;
      const value = game.save.upgrades[key];
      updateInput(input, String(value));
      const output = upgradeHost.querySelector<HTMLOutputElement>(`[data-upgrade-out="${key}"]`);
      if (output) output.textContent = String(value);
    }
  }

  function updateInput(input: HTMLInputElement | HTMLSelectElement, value: string) {
    if (document.activeElement === input) return;
    if (input.value !== value) input.value = value;
  }
  function updateSelect(input: HTMLSelectElement, value: string) {
    if (document.activeElement === input) return;
    if (input.value !== value) input.value = value;
  }
  function updateChecked(input: HTMLInputElement, checked: boolean) {
    if (document.activeElement === input) return;
    if (input.checked !== checked) input.checked = checked;
  }

  // ---- API -----------------------------------------------------------------------------------

  const snapshot = (): LabSnapshot => ({ ...game.snapshot(), lab: { frozen, timeScale, scenario: currentScenario } });
  const findVehicle = (id: number) => game.vehicles.find(v => v.id === id);

  const api: LabAPI = {
    toggle: (force?: boolean) => {
      expanded = force ?? !expanded;
      panel.hidden = false;
      panel.classList.toggle('lab-open', expanded);
      panel.classList.toggle('lab-closed', !expanded);
      expandButton.setAttribute('aria-expanded', String(expanded));
      expandButton.textContent = expanded ? 'Collapse ▾' : 'Expand ▴';
      if (expanded) refreshUI();
      return expanded;
    },
    open: () => api.toggle(true),
    close: () => api.toggle(false),
    isOpen: () => expanded,
    scenarios: scenarioInfo,
    state: snapshot,
    vehicles: () => structuredClone(game.vehicles.filter(v => v.alive).map(v => ({
      id: v.id, kind: v.kind, model: v.model, lean: v.dynamics instanceof MotorcycleDynamics ? v.dynamics.lean : 0, alive: v.alive, parked: v.parked,
      position: { ...v.body.position }, velocity: { ...v.body.velocity }, angle: v.body.angle,
      mass: v.body.mass, inertia: v.body.inertia, size: { length: v.body.w, width: v.body.h }, playerDrivable: v.definition.access.playerDrivable,
      cargo: { kind: v.definition.cargo.kind, mass: v.definition.cargo.mass, flammable: v.definition.cargo.flammable },
      damage: { health: v.damage.health, status: v.damage.status, critical: { ...v.damage.critical }, fuse: v.damage.fuse, fireTime: v.damage.fireTime, blamed: v.damage.blamed },
      ai: { phase: v.ai.phase, role: v.ai.role, attempts: v.ai.attempts, path: v.path.map(p => ({ ...p })) },
    }))),
    vehicleModels: () => structuredClone(Object.entries(vehicleDefinitions).map(([model, definition]) => ({ model: model as VehicleModel, definition }))),
    spawnVehicle: (options) => { const v = game.spawnVehicle(options); hooks.refresh(); return v.id; },
    contacts: () => [...game.world.hash.query(game.player.body)]
      .map(p => ({ id: p.id, kind: p.kind, depth: contact(game.player.body, p.body)?.depth ?? 0 }))
      .filter(p => p.depth > 0),
    step: (seconds, keys = []) => {
      frozen = true; hooks.setExternalClock(true);
      lastKeys = keys.slice();
      const duration = clamp(Number.isFinite(seconds) ? seconds : 0, 0, 120);
      game.keys = new Set(keys);
      for (let i = 0; i < Math.round(duration / STEP); i++) game.update(STEP);
      game.keys.clear();
      hooks.refresh(); refreshUI();
      return snapshot();
    },
    realtime: () => {
      frozen = false; hooks.setExternalClock(false); hooks.setTimeScale(timeScale);
      resumeFromPause(game); // only a paused world resumes; never arrested/wasted/garage
      hooks.refresh(); refreshUI();
    },
    teleport: (x, y, angle = NORTH, speed = 0) => {
      pose(game, renderer, game.player, x, y, angle, speed);
      hooks.refresh(); refreshUI();
    },
    scenario: (name) => {
      const resolved = isScenarioName(name) ? name : 'first-fare';
      frozen = true; hooks.setExternalClock(true);
      loadScenario(game, resolved, renderer);
      currentScenario = resolved;
      desiredTraffic = 0;
      scenarioSelect.value = resolved;
      updateScenarioDesc();
      hooks.refresh(); refreshUI();
      return snapshot();
    },
    reset: () => {
      frozen = true; hooks.setExternalClock(true);
      game.resetRun();
      game.settings.gore = false;
      game.settings.invincible = false;
      game.settings.infiniteBoost = false;
      game.settings.noPolice = false;
      currentScenario = null;
      desiredTraffic = game.vehicles.filter(v => v.kind === 'traffic' && !v.cart && !v.parked && !v.freight && v.alive).length;
      hooks.refresh(); refreshUI();
      return snapshot();
    },
    garage: () => {
      pose(game, renderer, game.player, 4, 28, NORTH, 0);
      game.heat = 0;
      if (game.mode !== 'playing') game.setMode('playing');
      game.garage();
      hooks.refresh(); refreshUI();
    },
    resetSave: () => { try { removeStorage(storageKeys.save); location.reload(); } catch { /* storage/location unavailable */ } },
    configure: (settings) => { game.configure(settings); hooks.refresh(); refreshUI(); },
    upgrades: (patch) => {
      for (const key of Object.keys(patch) as Upgrade[]) {
        if (!(key in upgradeInfo)) continue;
        game.save.upgrades[key] = clamp(Math.floor(patch[key] ?? game.save.upgrades[key]), 0, 3);
      }
      game.applyUpgrades(); game.persist();
      hooks.refresh(); refreshUI();
    },
    cash: (amount) => {
      const delta = Number.isFinite(amount) ? amount : 0;
      game.save.cash = Math.max(0, Math.round(game.save.cash + delta));
      game.persist(); hooks.refresh(); refreshUI();
      return game.save.cash;
    },
    repair: (id = game.player.id) => {
      if (!repairVehicle(game, id)) return;
      hooks.refresh(); refreshUI();
    },
    damageVehicle: (id, patch) => {
      const vehicle = findVehicle(id);
      if (!vehicle) return;
      const damage = vehicle.damage;
      if (patch.health !== undefined) damage.health = clamp(patch.health, 0, 100);
      if (patch.engine !== undefined) damage.critical.engine = clamp(patch.engine, 0, 100);
      if (patch.fuel !== undefined) damage.critical.fuel = clamp(patch.fuel, 0, 100);
      if (patch.tyres !== undefined) damage.critical.tyres = clamp(patch.tyres, 0, 100);
      if (patch.fuse !== undefined) damage.fuse = Math.max(0, patch.fuse);
      if (patch.ignite) igniteVehicle(damage, patch.fuse ?? game.rules.fireFuse, vehicle.kind === 'taxi');
      tickVehicleDamage(damage, 0); // recompute idle status / wreck
      hooks.refresh(); refreshUI();
    },
    ignite: (id = game.player.id, fuse = game.rules.fireFuse) => {
      const vehicle = findVehicle(id);
      if (!vehicle) return;
      igniteVehicle(vehicle.damage, fuse, vehicle.kind === 'taxi');
      hooks.refresh(); refreshUI();
    },
    explode: (id = game.player.id) => {
      const vehicle = findVehicle(id);
      if (!vehicle) return;
      // Force the normal burning-then-blast path so queueBlast, area damage and the
      // player's wasted mode all behave exactly as they do in play.
      vehicle.damage.status = 'burning';
      vehicle.damage.health = 0;
      vehicle.damage.fireTime = 0;
      vehicle.damage.fuse = 0;
      game.hazards(0);
      hooks.refresh(); refreshUI();
    },
    traffic: (count) => {
      desiredTraffic = clamp(Math.floor(Number.isFinite(count) ? count : 0), 0, MAX_TRAFFIC);
      setTraffic(game, desiredTraffic);
      hooks.refresh(); refreshUI();
    },
    dayNight: (options = {}) => {
      // Day/night options only touch the world clock; fare/fire timers and the simulation
      // clock are untouched. Re-render immediately so a preset shows its lighting at once.
      game.dayNight.configure(options);
      hooks.refresh(); refreshUI();
      return snapshot();
    },
    props: () => game.world.props.filter(p => Number.isFinite(p.maxHp)).map(p => ({
      id: p.id, kind: p.kind, position: { ...p.body.position }, hp: p.hp, maxHp: p.maxHp,
      alive: p.alive, fire: p.fire, fuelSpent: p.fuelSpent, blamed: p.blamed,
    })),
    people: () => game.world.people.map(p => ({
      id: p.id, role: p.role, position: { ...p.position }, velocity: { ...p.velocity }, angle: p.angle,
      alive: p.alive, aboard: p.aboard, panic: p.panic, health: p.health,
    })),
    refreshUI,
    audio: () => hooks.audio?.state() ?? null,
    sound: cue => isSoundCue(cue) && hooks.audio ? hooks.audio.preview(cue) : Promise.resolve(false),
    stopSound: () => hooks.audio?.stopPreview(),
    interact: () => { const result = game.interact(); hooks.refresh(); refreshUI(); return result; },
  };

  // ---- UI events -----------------------------------------------------------------------------

  expandButton.addEventListener('click', () => api.toggle());
  if (hooks.audio) {
    bindAudioControls(panel, hooks.audio);
    q<HTMLButtonElement>('sound-play')!.addEventListener('click', () => { void api.sound(q<HTMLSelectElement>('sound-cue')!.value as SoundCue); });
    q<HTMLButtonElement>('sound-stop')!.addEventListener('click', api.stopSound);
  }
  q<HTMLButtonElement>('collapse')!.addEventListener('click', () => api.close());
  scenarioSelect.addEventListener('change', updateScenarioDesc);
  q<HTMLButtonElement>('run')!.addEventListener('click', () => {
    const name = isScenarioName(scenarioSelect.value) ? scenarioSelect.value : 'first-fare';
    api.scenario(name);
    api.realtime();
    hooks.focus();
  });
  q<HTMLButtonElement>('reset')!.addEventListener('click', () => { api.reset(); api.realtime(); hooks.focus(); });
  q<HTMLButtonElement>('step')!.addEventListener('click', () => { api.step(0.25, lastKeys); });
  q<HTMLButtonElement>('live')!.addEventListener('click', () => { api.realtime(); hooks.focus(); });
  scaleHost.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-scale]');
    if (!button) return;
    timeScale = Number(button.dataset.scale);
    hooks.setTimeScale(timeScale);
    hooks.refresh(); refreshUI();
  });
  difficultySelect.addEventListener('change', () => api.configure({ difficulty: difficultySelect.value as Settings['difficulty'] }));
  for (const input of qa<HTMLInputElement>('cheat')) {
    input.addEventListener('change', () => {
      const key = input.dataset.cheat as 'gore' | 'invincible' | 'infiniteBoost' | 'noPolice';
      api.configure({ [key]: input.checked } as Partial<Settings>);
    });
  }
  panel.querySelector<HTMLInputElement>('[data-debug="colliders"]')?.addEventListener('change', e => {
    flags.debugColliders = (e.target as HTMLInputElement).checked;
    hooks.refresh();
  });
  panel.querySelector<HTMLInputElement>('[data-debug="ai"]')?.addEventListener('change', e => {
    flags.debugAI = (e.target as HTMLInputElement).checked;
    hooks.refresh();
  });
  trafficInput.addEventListener('input', () => {
    desiredTraffic = clamp(Math.floor(Number(trafficInput.value) || 0), 0, MAX_TRAFFIC);
    api.traffic(desiredTraffic);
  });
  dnHour.addEventListener('input', () => {
    const minutes = clamp(Number(dnHour.value) || 0, 0, DAY_MINUTES - 1);
    api.dayNight({ hour: minutes / 60 });
  });
  dnRate.addEventListener('input', () => api.dayNight({ rate: Number(dnRate.value) }));
  dnFreeze.addEventListener('change', () => api.dayNight({ frozen: dnFreeze.checked }));
  presetHost.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-dn-preset]');
    if (!button) return;
    const hour = DAY_PRESETS[button.dataset.dnPreset as DayPeriod];
    if (hour === undefined) return;
    api.dayNight({ hour });
  });
  upgradeHost.addEventListener('input', event => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('input[data-upgrade]');
    if (!input) return;
    const key = input.dataset.upgrade as Upgrade;
    api.upgrades({ [key]: Number(input.value) });
  });
  q<HTMLButtonElement>('max-upgrades')!.addEventListener('click', () => api.upgrades({ engine: 3, grip: 3, armor: 3, boost: 3 }));
  q<HTMLButtonElement>('reset-upgrades')!.addEventListener('click', () => api.upgrades({ engine: 0, grip: 0, armor: 0, boost: 0 }));
  q<HTMLButtonElement>('cash')!.addEventListener('click', () => api.cash(1000));
  q<HTMLButtonElement>('repair')!.addEventListener('click', () => api.repair());
  q<HTMLButtonElement>('ignite')!.addEventListener('click', () => api.ignite());
  q<HTMLButtonElement>('explode')!.addEventListener('click', () => api.explode());
  q<HTMLButtonElement>('reset-save')!.addEventListener('click', () => {
    if (window.confirm('Erase saved cash, upgrades and fares? This cannot be undone.')) api.resetSave();
  });

  // Live telemetry for hosts that do not call refreshUI themselves. Cheap text-only updates;
  // form values are skipped while focused so editing is never interrupted.
  window.setInterval(() => { if (document.visibilityState !== 'hidden') refreshUI(); }, 250);

  Object.assign(window, { __taxi: api });
  hooks.refresh();
  refreshUI();
  return api;
}

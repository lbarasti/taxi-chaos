import { Body, CarDynamics, type CarTuning, type TyreLayout, type Vec } from './physics';
import { BIKE_ENGINE, BIKE_GRIP, MotorcycleDynamics } from './motorcycle';

export type VehicleDefinition = {
  readonly name: string;
  readonly chassis: { readonly mass: number; readonly length: number; readonly width: number };
  readonly physics: Partial<CarTuning> & { readonly engineForce: number; readonly grip: number; readonly tyres: readonly TyreLayout[]; readonly dynamics: 'car' | 'motorcycle' };
  readonly graphics: { readonly sprite: 'car' | 'motorcycle' | 'golf-cart' | 'van' | 'truck'; readonly color: string; readonly trim: string; readonly glass: string; readonly roof: string; readonly cargoColor: string; readonly cabLength: number; readonly enginePitch: number };
  readonly cargo: { readonly kind: 'none' | 'crates' | 'fuel'; readonly mass: number; readonly flammable: boolean; readonly ignitionImpact: number; readonly ignitionBlast: number; readonly fuse: number };
  readonly damage: { readonly impactScale: number; readonly blastScale: number; readonly blastRadius: number; readonly blastPower: number };
  readonly ai: { readonly controller: 'road' | 'golf'; readonly cruiseSpeed: number; readonly cornerSlowdown: number; readonly followingGap: number };
  readonly access: { readonly playerDrivable: boolean; readonly job: 'fare' | 'parcel' };
};

const axles = (xs: readonly number[], track: number): TyreLayout[] => xs.flatMap(x => [-track, track].map(y => ({ x, y, steered: x === Math.max(...xs) })));
const noCargo: VehicleDefinition['cargo'] = { kind: 'none', mass: 0, flammable: false, ignitionImpact: Infinity, ignitionBlast: Infinity, fuse: 7 };
const car: VehicleDefinition = {
  name: 'City car / taxi / police', chassis: { mass: 1000, length: 4.2, width: 2.1 },
  physics: { dynamics: 'car', engineForce: 10500, grip: 1250, tyres: axles([-1.35, 1.35], 0.7) },
  graphics: { sprite: 'car', color: '#91b5b0', trim: '#24414c', glass: '#29434b', roof: '#e7e5d5', cargoColor: '#dca668', cabLength: 2.45, enginePitch: 1 },
  cargo: noCargo, damage: { impactScale: 1, blastScale: 1, blastRadius: 13, blastPower: 110 },
  ai: { controller: 'road', cruiseSpeed: 9, cornerSlowdown: 1.6, followingGap: 2 },
  access: { playerDrivable: true, job: 'fare' },
};
const truck: VehicleDefinition = {
  ...car, name: 'Empty flatbed truck', chassis: { mass: 4200, length: 7.8, width: 2.5 },
  physics: { dynamics: 'car', engineForce: 21500, grip: 2100, brakeDeceleration: 6.5, reverseRatio: 0.4, drag: 25, rollingDrag: 65, steeringLock: 0.75, steeringSpeedFalloff: 0.035, maxLateralAcceleration: 6, tyres: axles([-2.6, -1.5, 2.6], 0.92) },
  graphics: { ...car.graphics, sprite: 'truck', color: '#cd9b66', trim: '#52626a', cargoColor: '#c29762', cabLength: 2.2, enginePitch: 0.7 },
  damage: { ...car.damage, impactScale: 0.85, blastScale: 0.8 },
  ai: { controller: 'road', cruiseSpeed: 7.5, cornerSlowdown: 2.2, followingGap: 4 },
  access: { playerDrivable: false, job: 'fare' },
};

/** Add a model here; all consumers share these definitions. Roles (taxi/police/traffic)
 * remain independent of models. Payload contributes to mass AND rectangular yaw inertia.
 * Definitions are source configuration; per-vehicle mutable state belongs on Vehicle. */
export const vehicleDefinitions = {
  car,
  motorcycle: {
    ...car, name: 'Courier motorcycle', chassis: { mass: 260, length: 2.6, width: 0.8 },
    physics: { dynamics: 'motorcycle', engineForce: BIKE_ENGINE, grip: BIKE_GRIP, tyres: [-0.88, 0.88].map(x => ({ x, y: 0, steered: x > 0 })) },
    graphics: { ...car.graphics, sprite: 'motorcycle', color: '#ed9b63', trim: '#24343b', enginePitch: 1.3 },
    access: { playerDrivable: true, job: 'parcel' },
  },
  'golf-cart': {
    ...car, name: 'Country club golf cart', chassis: { mass: 360, length: 2.7, width: 1.6 },
    physics: { dynamics: 'car', engineForce: 2300, grip: 430, tyres: axles([-0.8775, 0.8775], 0.56) },
    graphics: { ...car.graphics, sprite: 'golf-cart', color: '#eee7c8', trim: '#698478', glass: '#b1ddd6', enginePitch: 0.9 },
    damage: { ...car.damage, impactScale: 3 / 1.45 },
    ai: { ...car.ai, controller: 'golf', cruiseSpeed: 5 }, access: { playerDrivable: false, job: 'fare' },
  },
  van: {
    ...car, name: 'Delivery van', chassis: { mass: 2100, length: 5.6, width: 2.2 },
    physics: { dynamics: 'car', engineForce: 13800, grip: 2050, brakeDeceleration: 8, drag: 18, rollingDrag: 48, steeringLock: 0.55, steeringSpeedFalloff: 0.03, maxLateralAcceleration: 6.5, tyres: axles([-1.8, 1.85], 0.78) },
    graphics: { ...car.graphics, sprite: 'van', color: '#c9d8ce', trim: '#617e74', cabLength: 1.85, enginePitch: 0.85 },
    ai: { ...car.ai, cruiseSpeed: 8.5, cornerSlowdown: 1.9, followingGap: 3 },
    access: { playerDrivable: false, job: 'fare' },
  },
  'truck-empty': truck,
  'truck-loaded': {
    ...truck, name: 'Loaded freight truck', cargo: { ...noCargo, kind: 'crates', mass: 4000 },
    physics: { ...truck.physics, grip: 3600, brakeDeceleration: 4.8, maxLateralAcceleration: 3.8 },
    graphics: { ...truck.graphics, color: '#85a3b1' }, ai: { ...truck.ai, cruiseSpeed: 6.8, cornerSlowdown: 2.6, followingGap: 5 },
  },
  'truck-flammable': {
    ...truck, name: 'Flammable cargo truck', cargo: { kind: 'fuel', mass: 3200, flammable: true, ignitionImpact: 14, ignitionBlast: 24, fuse: 3.5 },
    physics: { ...truck.physics, grip: 3300, brakeDeceleration: 5, maxLateralAcceleration: 4 },
    graphics: { ...truck.graphics, color: '#d58062', cargoColor: '#b94e39' },
    damage: { ...truck.damage, blastRadius: 24, blastPower: 190 }, ai: { ...truck.ai, cruiseSpeed: 6.8, cornerSlowdown: 2.6, followingGap: 5 },
  },
} satisfies Record<string, VehicleDefinition>;
export type VehicleModel = keyof typeof vehicleDefinitions;
export type VehicleRole = 'taxi' | 'police' | 'traffic';
export type VehicleSpawn = { model?: VehicleModel; kind?: VehicleRole; position: Vec; angle?: number; color?: string; parked?: boolean; driverExited?: boolean };
export const vehicleDefinition = (model: VehicleModel): VehicleDefinition => vehicleDefinitions[model];
export function createVehicleBody(definition: VehicleDefinition, position: Vec, angle = 0): Body {
  const { chassis, cargo } = definition;
  const body = new Body(position.x, position.y, chassis.mass + cargo.mass, chassis.length, chassis.width); body.angle = angle;
  return body;
}
export function createVehicleDynamics(definition: VehicleDefinition): CarDynamics {
  const { tyres, dynamics, ...tuning } = definition.physics;
  return dynamics === 'motorcycle' ? new MotorcycleDynamics(tuning, tyres) : new CarDynamics(tuning, tyres);
}
/** A deterministic mix shared by initial traffic, density changes and replenishment.
 * Spawn selection consumes no extra gameplay RNG. Golf carts keep their fairway patrol. */
export const roadTrafficModels: readonly VehicleModel[] = ['car', 'van', 'car', 'truck-empty', 'car', 'truck-loaded', 'car', 'truck-flammable', 'car', 'car'];
export const trafficModel = (index: number) => roadTrafficModels[index % roadTrafficModels.length];

import { createVehicleDamage, type VehicleDamage } from './damage';
import type { Vehicle } from '../game';
import { MotorcycleDynamics } from './motorcycle';
import { vec, type Vec } from '../physics';
import { parseUpgrades, stockUpgrades, type VehicleUpgrades } from './vehicle-upgrades';
import { vehicleDefinitions, type VehicleModel } from './vehicles';

/** Only the current ride and surviving invested cars are saved, not ambient traffic.
 * Runtime vehicle IDs are deliberately excluded: authored source IDs replace their
 * original parking/traffic spawn on reload, rather than duplicating that chassis. */
export type SavedCar = {
  model: VehicleModel; color: string; sourceId?: string; position: Vec; angle: number;
  upgrades: VehicleUpgrades; damage: VehicleDamage; alive: boolean; fallen: boolean;
};
export type GarageSave = {
  version: 1; current: SavedCar; parked: SavedCar[]; onFoot: boolean;
  driver: Vec; driverHealth: number; boost: number;
};
export function saveCar(v: Vehicle): SavedCar {
  const lost = !!v.sinking || !v.alive || v.damage.status === 'wreck';
  return structuredClone({ model: v.model, color: v.color, sourceId: v.sourceId,
    position: v.body.position, angle: v.body.angle, upgrades: lost ? stockUpgrades() : v.upgrades,
    damage: v.sinking ? { ...v.damage, status: 'wreck', health: 0 } : v.damage,
    alive: v.alive && !v.sinking, fallen: v.dynamics instanceof MotorcycleDynamics && v.dynamics.fallen });
}
export function legacyGarage(upgrades: unknown): GarageSave {
  return { version: 1, current: { model: 'car', color: '#f7ce55', position: vec(4, 32), angle: -Math.PI / 2,
    upgrades: parseUpgrades(upgrades), damage: createVehicleDamage(), alive: true, fallen: false },
    parked: [], onFoot: false, driver: vec(4, 32), driverHealth: 100, boost: 100 };
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const point = (p: any): p is Vec => !!p && finite(p.x) && finite(p.y);
const bounded = (n: unknown, max = 100) => finite(n) ? Math.max(0, Math.min(max, n)) : 0;
function parseCar(value: any): SavedCar | null {
  if (!value || !Object.hasOwn(vehicleDefinitions, value.model) || !vehicleDefinitions[value.model as VehicleModel].access.playerDrivable || !point(value.position) || !finite(value.angle) || !/^#[0-9a-f]{6}$/i.test(value.color)) return null;
  const d = value.damage;
  if (!d || !['intact', 'smoking', 'burning', 'wreck'].includes(d.status)) return null;
  const lost = value.alive === false || d.status === 'wreck';
  return { model: value.model, color: value.color, sourceId: typeof value.sourceId === 'string' ? value.sourceId : undefined,
    position: { ...value.position }, angle: value.angle, upgrades: lost ? stockUpgrades() : parseUpgrades(value.upgrades),
    alive: value.alive !== false, fallen: value.fallen === true,
    damage: { health: bounded(d.health), critical: { engine: bounded(d.critical?.engine), fuel: bounded(d.critical?.fuel), tyres: bounded(d.critical?.tyres) },
      status: d.status, fuse: bounded(d.fuse, 30), fireTime: bounded(d.fireTime, 30), hitAt: -Infinity, blamed: d.blamed === true, bloodTime: bounded(d.bloodTime) } };
}
export function parseGarage(value: any): GarageSave | null {
  if (value?.version !== 1) return null;
  const current = parseCar(value.current);
  if (!current) return null;
  const sources = new Set(current.sourceId ? [current.sourceId] : []);
  const parked: SavedCar[] = [];
  for (const entry of Array.isArray(value.parked) ? value.parked : []) {
    const car = parseCar(entry);
    if (!car || !car.alive || car.damage.status === 'wreck' || car.sourceId && sources.has(car.sourceId)) continue;
    if (car.sourceId) sources.add(car.sourceId);
    parked.push(car);
  }
  return { version: 1, current, parked, onFoot: value.onFoot === true,
    driver: point(value.driver) ? { ...value.driver } : { ...current.position }, driverHealth: bounded(value.driverHealth), boost: bounded(value.boost) };
}

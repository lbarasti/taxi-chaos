export const upgradeInfo = {
  engine: { name: 'Street engine', subtitle: 'More pull. More problems.', detail: '+22% acceleration per level', price: 160 },
  grip: { name: 'Sticky tyres', subtitle: 'Own the next corner.', detail: '+18% tyre grip per level', price: 120 },
  armor: { name: 'Reinforced chassis', subtitle: 'Built for the scenic route.', detail: '25% less impact damage per level', price: 140 },
  boost: { name: 'Bigger boost tank', subtitle: 'A little extra getaway.', detail: '+35% boost capacity per level', price: 180 },
};
export type Upgrade = keyof typeof upgradeInfo;
export type VehicleUpgrades = Record<Upgrade, number>;
export const stockUpgrades = (): VehicleUpgrades => ({ engine: 0, grip: 0, armor: 0, boost: 0 });
export const hasUpgrades = (upgrades: VehicleUpgrades) => Object.values(upgrades).some(level => level > 0);
export function parseUpgrades(value: unknown): VehicleUpgrades {
  const result = stockUpgrades();
  if (!value || typeof value !== 'object') return result;
  for (const key of Object.keys(result) as Upgrade[]) {
    const level = Number((value as Record<string, unknown>)[key]);
    result[key] = Number.isFinite(level) ? Math.max(0, Math.min(3, Math.floor(level))) : 0;
  }
  return result;
}

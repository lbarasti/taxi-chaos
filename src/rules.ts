export const difficulties = {
  cruise: { name: 'Cruise', copSpeed: 18, copEngine: 10500, maxPolice: 2, escapeTime: 6, arrestTime: 5, damageScale: 0.75, fireFuse: 9 },
  standard: { name: 'Street', copSpeed: 24, copEngine: 12500, maxPolice: 4, escapeTime: 8, arrestTime: 3.5, damageScale: 1, fireFuse: 7 },
  chaos: { name: 'Chaos', copSpeed: 30, copEngine: 16000, maxPolice: 6, escapeTime: 10, arrestTime: 2.6, damageScale: 1.2, fireFuse: 5 },
};
export type Difficulty = keyof typeof difficulties;
export type Settings = { gore: boolean; difficulty: Difficulty; invincible: boolean; infiniteBoost: boolean; noPolice: boolean };
export const defaultSettings = (): Settings => ({ gore: false, difficulty: 'standard', invincible: false, infiniteBoost: false, noPolice: false });

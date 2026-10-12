export const storageKeys = { save: 'taxi-chaos-v1', settings: 'taxi-chaos-settings', audio: 'taxi-chaos-audio' } as const;
type StorageKey = typeof storageKeys[keyof typeof storageKeys];

export function readStorage(key: StorageKey): string | null {
  return localStorage.getItem(key);
}

export function removeStorage(key: StorageKey): void {
  localStorage.removeItem(key);
}

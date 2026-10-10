export const storageKeys = { save: 'taxi-chaos-v1', settings: 'taxi-chaos-settings', audio: 'taxi-chaos-audio' } as const;
type StorageKey = typeof storageKeys[keyof typeof storageKeys];

// Keep existing progress and preferences when upgrading from the original project name.
const legacyKey = (key: StorageKey) => key.replace('taxi-chaos-', 'fare-city-');

export function readStorage(key: StorageKey): string | null {
  const current = localStorage.getItem(key);
  if (current !== null) return current;
  const previous = localStorage.getItem(legacyKey(key));
  if (previous !== null) {
    // A denied write must not prevent loading the existing save.
    try { localStorage.setItem(key, previous); localStorage.removeItem(legacyKey(key)); } catch {}
  }
  return previous;
}

export function removeStorage(key: StorageKey) {
  localStorage.removeItem(key);
  localStorage.removeItem(legacyKey(key));
}

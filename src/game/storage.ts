export const storageKeys = { save: 'taxi-chaos-v1', settings: 'taxi-chaos-settings', audio: 'taxi-chaos-audio' } as const;
export const checkpointStorageKey = (campaignId: string): `taxi-chaos-mornings-v1:${string}` => `taxi-chaos-mornings-v1:${campaignId}`;
type StorageKey = typeof storageKeys[keyof typeof storageKeys] | ReturnType<typeof checkpointStorageKey>;

export function readStorage(key: StorageKey): string | null {
  return localStorage.getItem(key);
}

export function removeStorage(key: StorageKey): void {
  localStorage.removeItem(key);
}

export function writeStorage(key: StorageKey, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function eraseSavedProgress(campaignId: string): void {
  // Attempt both even when one storage operation is unavailable.
  for (const key of [storageKeys.save, checkpointStorageKey(campaignId)]) {
    try { removeStorage(key); } catch { /* unavailable storage */ }
  }
}

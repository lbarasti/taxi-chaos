/** Player knowledge, kept separate from mission eligibility and world outcomes. */
export type TextReceipt = {
  messageId: string; missionId: string; character: string; sender: string;
  title: string; text: string; pickup: string; receivedAt: number; readAt: number | null;
};
export type PlayerRecords = { version: 1; texts: TextReceipt[] };
export const defaultPlayerRecords = (): PlayerRecords => ({ version: 1, texts: [] });
export const MAX_TEXT_RECEIPTS = 400;

export function migratePlayerRecords(raw: unknown): PlayerRecords {
  const records = defaultPlayerRecords();
  if (!raw || typeof raw !== 'object' || !('version' in raw) || raw.version !== 1 || !('texts' in raw) || !Array.isArray(raw.texts)) return records;
  const seen = new Set<string>();
  for (const value of raw.texts.slice(0, MAX_TEXT_RECEIPTS)) {
    if (!value || typeof value !== 'object') continue;
    const t = value as TextReceipt;
    if (!['messageId', 'missionId', 'character'].every(key => typeof t[key as keyof TextReceipt] === 'string' && /^[a-z][a-z0-9-]{0,99}$/.test(t[key as keyof TextReceipt] as string))) continue;
    if (!['sender', 'title', 'text', 'pickup'].every(key => typeof t[key as keyof TextReceipt] === 'string' && (t[key as keyof TextReceipt] as string).length > 0 && (t[key as keyof TextReceipt] as string).length <= 600)) continue;
    if (!Number.isFinite(t.receivedAt) || t.receivedAt < 0 || seen.has(t.messageId)) continue;
    const readAt = typeof t.readAt === 'number' && Number.isFinite(t.readAt) && t.readAt >= t.receivedAt ? t.readAt : null;
    records.texts.push({ messageId: t.messageId, missionId: t.missionId, character: t.character, sender: t.sender,
      title: t.title, text: t.text, pickup: t.pickup, receivedAt: t.receivedAt, readAt });
    seen.add(t.messageId);
  }
  return records;
}

/** Player knowledge, kept separate from mission eligibility and world outcomes. */
export type TextReceipt = {
  messageId: string; missionId: string; character: string; sender: string;
  title: string; text: string; pickup: string; receivedAt: number; readAt: number | null;
};
export type NotebookEntry = { id: string; title: string; text: string; kind: 'receipt' | 'conversation' | 'document' | 'observation'; shift: number; at: number; minute?: number; source?: string };
export type PlayerRecords = { version: 1; texts: TextReceipt[]; notebook: NotebookEntry[] };
export const defaultPlayerRecords = (): PlayerRecords => ({ version: 1, texts: [], notebook: [] });
export const MAX_TEXT_RECEIPTS = 400;
export const MAX_NOTEBOOK_ENTRIES = 400;

/** Validate and detach a current-format player record snapshot. */
export function parsePlayerRecords(raw: unknown): PlayerRecords {
  const records = defaultPlayerRecords();
  if (!raw || typeof raw !== 'object' || !('version' in raw) || raw.version !== 1 || !('texts' in raw) || !Array.isArray(raw.texts) || !('notebook' in raw) || !Array.isArray(raw.notebook)) return records;
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
  for (const value of raw.notebook.slice(0, MAX_NOTEBOOK_ENTRIES)) {
    if (!value || typeof value !== 'object') continue;
    const e = value as NotebookEntry;
    if (typeof e.id !== 'string' || !/^[a-z][a-z0-9-]{0,99}$/.test(e.id) || records.notebook.some(old => old.id === e.id)) continue;
    if (![e.title, e.text].every(t => typeof t === 'string' && t.length > 0 && t.length <= 1200)) continue;
    if (!['receipt', 'conversation', 'document', 'observation'].includes(e.kind) || !Number.isInteger(e.shift) || e.shift < 1 || e.shift > 14 || !Number.isFinite(e.at) || e.at < 0) continue;
    records.notebook.push({ id: e.id, title: e.title, text: e.text, kind: e.kind, shift: e.shift, at: e.at, ...(typeof e.minute === 'number' && Number.isFinite(e.minute) && e.minute >= 420 && e.minute <= 20580 ? { minute: e.minute } : {}), ...(typeof e.source === 'string' && /^[a-z][a-z0-9-]{0,99}$/.test(e.source) ? { source: e.source } : {}) });
  }
  return records;
}

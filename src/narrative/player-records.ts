import { characters, type CharacterId } from './characters';

/** Player knowledge, kept separate from mission eligibility and world outcomes. */
export type TextReceipt = {
  messageId: string; missionId: string; character: string; sender: string;
  title: string; text: string; pickup: string; receivedAt: number; readAt: number | null;
  /** Calendar minutes, separate from elapsed driving seconds (sleep skips time). */
  receivedMinute?: number; expiresMinute?: number;
};
export type NotebookRun = { id: string; customer: string; character?: CharacterId; type: 'fare' | 'parcel'; destination: string; minute: number; totalFare?: number };
export type NotebookEntry = { id: string; title: string; text: string; kind: 'receipt' | 'conversation' | 'document' | 'observation'; shift: number; at: number; minute?: number; source?: string; run?: NotebookRun };
export type PlayerRecords = { version: 1; texts: TextReceipt[]; notebook: NotebookEntry[] };
export const defaultPlayerRecords = (): PlayerRecords => ({ version: 1, texts: [], notebook: [] });
export const MAX_TEXT_RECEIPTS = 400;
export const MAX_NOTEBOOK_ENTRIES = 400;

/** Optional run details keep existing saves readable without interpreting free text. */
export function parseNotebookRun(raw: unknown): NotebookRun | undefined {
  if (!raw || typeof raw !== 'object') return;
  const run = raw as NotebookRun;
  if (typeof run.id !== 'string' || !/^[a-z][a-z0-9-]{0,99}$/.test(run.id)
    || typeof run.customer !== 'string' || !run.customer.trim() || run.customer.length > 120
    || typeof run.destination !== 'string' || !run.destination.trim() || run.destination.length > 120
    || !['fare', 'parcel'].includes(run.type) || !Number.isFinite(run.minute) || run.minute < 420 || run.minute > 20580) return;
  return { id: run.id, customer: run.customer, type: run.type, destination: run.destination, minute: run.minute,
    ...(typeof run.character === 'string' && Object.hasOwn(characters, run.character) ? { character: run.character } : {}),
    ...(typeof run.totalFare === 'number' && Number.isFinite(run.totalFare) && run.totalFare >= 0 && run.totalFare < 1e6 ? { totalFare: run.totalFare } : {}) };
}

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
      title: t.title, text: t.text, pickup: t.pickup, receivedAt: t.receivedAt, readAt,
      ...(typeof t.receivedMinute === 'number' && Number.isFinite(t.receivedMinute) && t.receivedMinute >= 0 ? { receivedMinute: t.receivedMinute,
        ...(typeof t.expiresMinute === 'number' && Number.isFinite(t.expiresMinute) && t.expiresMinute > t.receivedMinute && t.expiresMinute - t.receivedMinute <= 15 * 1440 ? { expiresMinute: t.expiresMinute } : {}) } : {}) });
    seen.add(t.messageId);
  }
  for (const value of raw.notebook.slice(0, MAX_NOTEBOOK_ENTRIES)) {
    if (!value || typeof value !== 'object') continue;
    const e = value as NotebookEntry;
    if (typeof e.id !== 'string' || !/^[a-z][a-z0-9-]{0,99}$/.test(e.id) || records.notebook.some(old => old.id === e.id)) continue;
    if (![e.title, e.text].every(t => typeof t === 'string' && t.length > 0 && t.length <= 1200)) continue;
    if (!['receipt', 'conversation', 'document', 'observation'].includes(e.kind) || !Number.isInteger(e.shift) || e.shift < 1 || e.shift > 14 || !Number.isFinite(e.at) || e.at < 0) continue;
    const run = parseNotebookRun(e.run);
    records.notebook.push({ id: e.id, title: e.title, text: e.text, kind: e.kind, shift: e.shift, at: e.at, ...(typeof e.minute === 'number' && Number.isFinite(e.minute) && e.minute >= 420 && e.minute <= 20580 ? { minute: e.minute } : {}), ...(typeof e.source === 'string' && /^[a-z][a-z0-9-]{0,99}$/.test(e.source) ? { source: e.source } : {}), ...(run ? { run } : {}) });
  }
  return records;
}

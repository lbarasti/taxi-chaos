import { CAMPAIGN_START } from '../campaign/clock';
import { DAY_MINUTES } from '../world/day-night';
import type { TextReceipt } from './player-records';

export const TEXT_HISTORY_DAYS = 2;
export const DEFAULT_TEXT_LIFETIME_MINUTES = 2 * DAY_MINUTES;
type PickupWindow = Readonly<{ from: number; until: number }>;

/** Older saves did not retain calendar dates; use the authored opening date. */
export function textTiming(receipt: TextReceipt, window?: PickupWindow) {
  const receivedMinute = receipt.receivedMinute ?? window?.from ?? CAMPAIGN_START + receipt.receivedAt;
  const expiresMinute = receipt.expiresMinute ?? window?.until ?? receivedMinute + DEFAULT_TEXT_LIFETIME_MINUTES;
  return { receivedMinute, expiresMinute };
}

export const textDay = (minute: number) => Math.floor((minute + 1e-6) / DAY_MINUTES) + 1;

/** Today and yesterday initially, then two more calendar days per page. */
export function textHistory(receipts: readonly TextReceipt[], now: number, days: number, windowFor: (id: string) => PickupWindow | undefined) {
  const ordered = [...receipts].sort((a, b) => textTiming(b, windowFor(b.missionId)).receivedMinute - textTiming(a, windowFor(a.missionId)).receivedMinute || b.receivedAt - a.receivedAt || a.messageId.localeCompare(b.messageId));
  const oldestDay = textDay(now) - days + 1;
  return { visible: ordered.filter(t => textDay(textTiming(t, windowFor(t.missionId)).receivedMinute) >= oldestDay),
    hasOlder: ordered.some(t => textDay(textTiming(t, windowFor(t.missionId)).receivedMinute) < oldestDay) };
}

/** Each disc holds one day. Drain left to right; retain empty discs as context. */
export function textExpiryDiscs(received: number, expires: number, now: number): number[] {
  const count = Math.max(1, Math.ceil((expires - received) / DAY_MINUTES));
  const remaining = Math.max(0, Math.min(expires - received, expires - now));
  return Array.from({ length: count }, (_, i) => Math.max(0, Math.min(1, remaining / DAY_MINUTES - (count - i - 1))));
}

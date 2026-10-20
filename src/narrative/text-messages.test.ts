import { describe, expect, it } from 'vitest';
import { dayMinute } from '../campaign/clock';
import { textExpiryDiscs, textHistory, textTiming } from './text-messages';
import { parsePlayerRecords, type TextReceipt } from './player-records';

const receipt = (id: string, minute: number, seconds = 0): TextReceipt => ({ messageId: `${id}-text`, missionId: id,
  character: 'bea', sender: 'Bea', title: id, text: 'A lift?', pickup: 'Dockside Deli', receivedAt: seconds, readAt: null,
  receivedMinute: minute, expiresMinute: minute + 2880 });

describe('text message calendar and expiry', () => {
  it('orders by calendar arrival, keeps both recent dates, and loads older days without mutating receipts', () => {
    const receipts = [receipt('old', dayMinute(1)), receipt('early', dayMinute(3, 8), 200), receipt('latest', dayMinute(3, 19), 100), receipt('yesterday', dayMinute(2, 23))];
    const original = structuredClone(receipts);
    const recent = textHistory(receipts, dayMinute(3, 20), 2, () => undefined);
    expect(recent.visible.map(t => t.missionId)).toEqual(['latest', 'early', 'yesterday']);
    expect(recent.hasOlder).toBe(true);
    expect(textHistory(receipts, dayMinute(3, 20), 4, () => undefined).visible.map(t => t.missionId)).toEqual(['latest', 'early', 'yesterday', 'old']);
    expect(textHistory(receipts, dayMinute(3, 20), 4, () => undefined).hasOlder).toBe(false);
    expect(receipts).toEqual(original);
  });

  it('turns over at midnight, even during the same working shift', () => {
    const receipts = [receipt('day-one', dayMinute(1, 23)), receipt('day-two', dayMinute(2, 1))];
    expect(textHistory(receipts, dayMinute(2, 23, 59), 2, () => undefined).visible).toHaveLength(2);
    expect(textHistory(receipts, dayMinute(3, 0), 2, () => undefined).visible.map(t => t.missionId)).toEqual(['day-two']);
    expect(textHistory(receipts, dayMinute(5), 2, () => undefined)).toEqual({ visible: [], hasOlder: true });
  });

  it('drains a partial day followed by full days and reaches zero exactly at the deadline', () => {
    const received = dayMinute(1), expires = dayMinute(2, 23);
    expect(textExpiryDiscs(received, expires, received)[0]).toBeCloseTo(2 / 3);
    expect(textExpiryDiscs(received, expires, received)[1]).toBe(1);
    expect(textExpiryDiscs(received, expires, dayMinute(2))).toEqual([0, 2 / 3]);
    expect(textExpiryDiscs(received, expires, expires - 1)[1]).toBeCloseTo(1 / 1440);
    expect(textExpiryDiscs(received, expires, expires)).toEqual([0, 0]);
    expect(textExpiryDiscs(received, expires, expires + 100)).toEqual([0, 0]);
  });

  it('restores saved calendar deadlines and gives old receipts authored dates or a bounded default lifetime', () => {
    const saved = receipt('new', dayMinute(8), 12);
    const records = parsePlayerRecords({ version: 1, texts: [saved], notebook: [] });
    expect(records.texts).toEqual([saved]);
    const legacy = { ...saved, receivedMinute: undefined, expiresMinute: undefined };
    expect(textTiming(legacy, { from: dayMinute(4), until: dayMinute(7) })).toEqual({ receivedMinute: dayMinute(4), expiresMinute: dayMinute(7) });
    expect(textTiming(legacy)).toEqual({ receivedMinute: dayMinute(1) + 12, expiresMinute: dayMinute(3) + 12 });
    const invalid = parsePlayerRecords({ version: 1, texts: [{ ...saved, expiresMinute: Infinity }], notebook: [] }).texts[0];
    expect(invalid.receivedMinute).toBe(saved.receivedMinute);
    expect(invalid.expiresMinute).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { defaultPlayerRecords, migratePlayerRecords } from './player-records';

describe('player text records migration', () => {
  it('defaults old saves and unknown future versions without inventing received information', () => {
    expect(migratePlayerRecords(undefined)).toEqual(defaultPlayerRecords());
    expect(migratePlayerRecords({ version: 2, texts: [] })).toEqual(defaultPlayerRecords());
  });
  it('preserves detached receipts, deduplicates stable IDs and rejects invalid timestamps', () => {
    const receipt = { messageId:'mia-text',missionId:'mia',character:'mia',sender:'Mia',title:'Lead',text:'Meet me?',pickup:'Café',receivedAt:12,readAt:15 };
    const saved = {version:1,texts:[receipt,receipt,{...receipt,messageId:'bad-text',receivedAt:NaN},{...receipt,messageId:'unread-text',readAt:5}]};
    const records = migratePlayerRecords(saved);
    expect(records.texts).toEqual([receipt,{...receipt,messageId:'unread-text',readAt:null}]);
    records.texts[0].text = 'Changed'; expect(receipt.text).toBe('Meet me?');
  });
});

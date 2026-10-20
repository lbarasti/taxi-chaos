import { describe, expect, it } from 'vitest';
import { defaultPlayerRecords, parsePlayerRecords } from './player-records';

describe('current player text records', () => {
  it('rejects missing or unsupported schemas instead of converting older records', () => {
    expect(parsePlayerRecords(undefined)).toEqual(defaultPlayerRecords());
    expect(parsePlayerRecords({ version: 2, texts: [], notebook: [] })).toEqual(defaultPlayerRecords());
    expect(parsePlayerRecords({ version: 1, texts: [] })).toEqual(defaultPlayerRecords());
  });
  it('preserves detached receipts, deduplicates stable IDs and rejects invalid timestamps', () => {
    const receipt = { messageId:'mia-text',missionId:'mia',character:'mia',sender:'Mia',title:'Lead',text:'Meet me?',pickup:'Café',receivedAt:12,readAt:15 };
    const saved = {version:1,texts:[receipt,receipt,{...receipt,messageId:'bad-text',receivedAt:NaN},{...receipt,messageId:'unread-text',readAt:5}],notebook:[]};
    const records = parsePlayerRecords(saved);
    expect(records.texts).toEqual([receipt,{...receipt,messageId:'unread-text',readAt:null}]);
    records.texts[0].text = 'Changed'; expect(receipt.text).toBe('Meet me?');
  });
});

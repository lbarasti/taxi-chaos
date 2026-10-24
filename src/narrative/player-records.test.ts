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
  it('detaches optional run details, rejects malformed runs and retains valid notes from existing saves', () => {
    const run = { id: 'run-1', customer: 'Cleo', character: 'cleo', type: 'parcel', destination: 'East Village', minute: 420, totalFare: 0 };
    const note = { id: 'fare-1', title: 'Signed delivery', text: 'Received.', kind: 'receipt', shift: 1, at: 5, run };
    const records = parsePlayerRecords({ version: 1, texts: [], notebook: [note, { ...note, id: 'bad-run', run: { ...run, minute: NaN } }, { ...note, id: 'old-note', run: undefined }] });
    expect(records.notebook[0].run).toEqual(run);
    records.notebook[0].run!.customer = 'Changed'; expect(run.customer).toBe('Cleo');
    expect(records.notebook[1].run).toBeUndefined(); expect(records.notebook[1].text).toBe('Received.');
    expect(records.notebook[2].run).toBeUndefined();
  });
});

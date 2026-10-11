import { dayMinute } from './clock';

export type WorldState = {
  cafe: 'open' | 'broken' | 'boarded' | 'tenancy-review' | 'closed';
  van: 'absent' | 'at-cafe' | 'departed';
  patrol: 'normal' | 'withdrawn' | 'inquiry';
  security: 'none' | 'contracted' | 'suspended';
  hearing: 'pending' | 'held';
  appearance: 'booked' | 'cancelled';
  operator: 'unannounced' | 'preferred';
  polls: boolean;
};
export const defaultWorld = (): WorldState => ({ cafe: 'open', van: 'absent', patrol: 'normal', security: 'none', hearing: 'pending', appearance: 'booked', operator: 'unannounced', polls: false });
export type Occurrence = { at: number; outcome: string };
export type WorldOperation = Readonly<{ id: string; at: number; changes: Readonly<Partial<WorldState>>; tenantOutcome?: true }>;
/** Stable operations, ordered by time then ID. Their resolution never grants player knowledge. */
export const worldOperations: readonly WorldOperation[] = Object.freeze([
  { id: 'waterfront-cover-withdrawn', at: dayMinute(2, 21), changes: { patrol: 'withdrawn' } },
  { id: 'ms14-arrives', at: dayMinute(2, 22), changes: { van: 'at-cafe', security: 'contracted' } },
  { id: 'cafe-windows-broken', at: dayMinute(2, 23), changes: { cafe: 'broken' } },
  { id: 'cafe-boarded', at: dayMinute(3, 7), changes: { cafe: 'boarded' } },
  { id: 'ms14-departs', at: dayMinute(3, 12), changes: { van: 'departed', patrol: 'normal' } },
  { id: 'tenancy-hearing', at: dayMinute(5, 10), changes: { hearing: 'held' }, tenantOutcome: true },
  { id: 'preferred-operator', at: dayMinute(9, 10), changes: { operator: 'preferred' } },
  { id: 'polls-open', at: dayMinute(14, 7), changes: { polls: true } },
].map(op => Object.freeze({ ...op, changes: Object.freeze(op.changes) })) as WorldOperation[]);

export function assertWorldOperations(operations: readonly WorldOperation[]): void {
  const ids = new Set<string>();
  for (const op of operations) {
    if (ids.has(op.id) || !/^[a-z][a-z0-9-]+$/.test(op.id)) throw new Error(`Duplicate or invalid operation: ${op.id}`);
    if (!Number.isInteger(op.at) || op.at < dayMinute(1) || op.at >= dayMinute(15)) throw new Error(`Invalid operation time: ${op.id}`);
    ids.add(op.id);
  }
}

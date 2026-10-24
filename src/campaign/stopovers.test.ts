import { describe, expect, it } from 'vitest';
import { vec } from '../physics/physics';
import type { ProceduralStopover } from './model';
import { selectProceduralStopover } from './stopovers';

const stop = (id: string, at: string): ProceduralStopover =>
  ({ id, stop: at, title: 'A short errand', request: 'A quick collection', seconds: 4, completedText: 'Thanks.', effects: [] });
const locations = {
  along: { position: vec(50, 2) },
  away: { position: vec(180, 180) },
};

describe('contextual procedural stop selection', () => {
  it('requires a planned fare slot and a plausible detour with room on both legs', () => {
    const pool = [stop('near', 'along'), stop('far', 'away')];
    expect(selectProceduralStopover(pool, locations, vec(0, 0), vec(100, 0), 0)).toBeUndefined();
    expect(selectProceduralStopover(pool, locations, vec(0, 0), vec(100, 0), 1)?.id).toBe('near');
    expect(selectProceduralStopover(pool, locations, vec(0, 0), vec(18, 0), 1)).toBeUndefined();
    expect(selectProceduralStopover([pool[1]], locations, vec(0, 0), vec(100, 0), 1)).toBeUndefined();
    expect(selectProceduralStopover(pool, locations, vec(0, 0), vec(100, 0), 2)).toBeUndefined();
  });

  it('lets different definitions and physical stops supply new situations', () => {
    const pool = [stop('parcel', 'along'), stop('other', 'away')];
    expect(selectProceduralStopover(pool, locations, vec(0, 0), vec(100, 0), 4)?.id).toBe('parcel');
    expect(selectProceduralStopover([], locations, vec(0, 0), vec(100, 0), 4)).toBeUndefined();
  });
});

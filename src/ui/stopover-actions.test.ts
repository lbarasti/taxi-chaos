import { describe, expect, it } from 'vitest';
import { stopoverActionState } from './stopover-actions';

const state = () => ({
  mode: 'playing' as const, onFoot: false, navToStopover: false,
  stopoverStatus: { title: 'East Village wash', request: 'We can wash these on the way back.', position: { x: 204, y: 164 }, nearby: false, available: false, started: false, completed: false, remaining: 12, seconds: 12 },
});

describe('optional stop actions', () => {
  it('offers reversible guidance without starting a wait or hiding the main destination', () => {
    const g = state();
    expect(stopoverActionState(g)).toMatchObject({ routeText: 'Wash stop', showWait: false, shortcutWaits: false });
    g.navToStopover = true;
    expect(stopoverActionState(g)).toMatchObject({ routeText: 'Direct to destination', routed: true, showWait: false });
    expect(g.stopoverStatus.started).toBe(false);
  });

  it('offers the explicit wait only nearby and enables it only when the game permits it', () => {
    const g = state(); g.stopoverStatus.nearby = true;
    expect(stopoverActionState(g)).toMatchObject({ showWait: true, waitDisabled: true, shortcutWaits: false });
    g.stopoverStatus.available = true;
    expect(stopoverActionState(g)).toMatchObject({ waitDisabled: false, shortcutWaits: true, waitText: 'Wait for wash · 12 min' });
  });

  it('reports the actual remaining wait and leaves the route available during it', () => {
    const g = state(); g.navToStopover = true;
    Object.assign(g.stopoverStatus, { nearby: true, available: true, started: true, remaining: 4.2 });
    expect(stopoverActionState(g)).toMatchObject({ showWait: true, waitDisabled: true, waitText: 'Washing · 5 min', routeText: 'Direct to destination', shortcutWaits: false });
    g.stopoverStatus.available = false;
    expect(stopoverActionState(g)).toMatchObject({ waitText: 'Wash paused · 5 min', waitDisabled: true });
  });

  it('hides stale actions after completion, outside gameplay, and while walking', () => {
    const g = state();
    expect(stopoverActionState({ ...g, mode: 'paused' })).toBeNull();
    expect(stopoverActionState({ ...g, onFoot: true })).toBeNull();
    expect(stopoverActionState({ ...g, stopoverStatus: null })).toBeNull();
    g.stopoverStatus.completed = true;
    expect(stopoverActionState(g)).toBeNull();
  });
});

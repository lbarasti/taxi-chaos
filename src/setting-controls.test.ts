import { describe, expect, it } from 'vitest';
import { stepChoice, stepVolume } from './setting-controls';
describe('settings changes', () => {
  it('cycles difficulty in both directions', () => {
    const choices = ['cruise', 'standard', 'chaos'];
    expect(stepChoice(choices, 'cruise', -1)).toBe('chaos');
    expect(stepChoice(choices, 'chaos', 1)).toBe('cruise');
    expect(stepChoice(choices, 'standard', -1)).toBe('cruise');
  });
  it('steps audio by five percentage points and clamps at mute/full volume', () => {
    expect(stepVolume(0.65, 1)).toBe(0.7);
    expect(stepVolume(0.25, -1)).toBe(0.2);
    expect(stepVolume(0.02, -1)).toBe(0);
    expect(stepVolume(0.99, 1)).toBe(1);
  });
});

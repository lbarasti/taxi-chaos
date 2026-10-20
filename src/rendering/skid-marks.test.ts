import { describe, expect, it } from 'vitest';
import { freshRubberMark, updateRubberMark } from './skid-marks';

describe('visual road rubber eligibility', () => {
  it('does not draw marks while tyres grip through ordinary cornering', () => {
    const state = freshRubberMark();
    for (let i = 0; i < 240; i++) expect(updateRubberMark(state, 1.8, 14, 1 / 120)).toBe(false);
  });
  it('rejects one-frame slips and low-speed manoeuvres', () => {
    const state = freshRubberMark();
    expect(updateRubberMark(state, 6, 12, 1 / 120)).toBe(false);
    expect(updateRubberMark(state, 0.5, 12, 1 / 120)).toBe(false);
    for (let i = 0; i < 120; i++) expect(updateRubberMark(state, 4, 2, 1 / 120)).toBe(false);
  });
  it('marks sustained sideways sliding, then stops as tyres regain grip', () => {
    const state = freshRubberMark();
    for (let i = 0; i < 14; i++) expect(updateRubberMark(state, 5, 12, 1 / 120)).toBe(false);
    expect(updateRubberMark(state, 5, 12, 1 / 120)).toBe(true);
    expect(updateRubberMark(state, 2.8, 12, 1 / 120)).toBe(true); // hysteresis
    expect(updateRubberMark(state, 0.8, 12, 1 / 120)).toBe(false);
    expect(updateRubberMark(state, 5, 12, 1 / 120)).toBe(false); // needs a fresh sustained slide
  });
  it('requires meaningful slip angle even when lateral speed is high', () => {
    const state = freshRubberMark();
    for (let i = 0; i < 100; i++) expect(updateRubberMark(state, 4, 35, 1 / 120)).toBe(false);
  });
});

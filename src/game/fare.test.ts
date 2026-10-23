import { describe, expect, it } from 'vitest';
import { baseFareForDistance, calculateFare } from './fare';

const trip = { fare: 50, time: 100, elapsed: 100, comfort: 50 };

describe('fare pricing', () => {
  it.each([[0, 6], [40, 8], [100, 13], [1000, 76]])('prices a %s metre trip at $%s after the tenfold reduction and whole-dollar rounding', (distance, fare) => {
    expect(baseFareForDistance(distance)).toBe(fare);
  });

  it('pays exactly the base fare at both neutral thresholds', () => {
    expect(calculateFare(trip)).toEqual({ baseFare: 50, payout: 50, adjustment: 0, speedScore: 0, comfortScore: 0, speedBonus: 0, comfortBonus: 0 });
  });

  it('retains the existing scale of speed and maximum comfort bonuses', () => {
    expect(calculateFare({ ...trip, elapsed: 25, comfort: 100 })).toMatchObject({ payout: 140, adjustment: 90, speedBonus: 60, comfortBonus: 30, speedScore: 75, comfortScore: 100 });
  });

  it.each([
    { elapsed: 125, comfort: 50, payout: 30, adjustment: -20, speedBonus: -20, comfortBonus: 0, speedScore: -25, comfortScore: 0 },
    { elapsed: 100, comfort: 25, payout: 35, adjustment: -15, speedBonus: 0, comfortBonus: -15, speedScore: 0, comfortScore: -50 },
    { elapsed: 75, comfort: 0, payout: 40, adjustment: -10, speedBonus: 20, comfortBonus: -30, speedScore: 25, comfortScore: -100 },
  ])('subtracts poor performance from base pay without discarding the other component: $elapsed seconds, $comfort comfort', expected => {
    const { elapsed, comfort, ...payment } = expected;
    expect(calculateFare({ ...trip, elapsed, comfort })).toMatchObject(payment);
  });

  it('floors the payout at zero while retaining signed components for an honest receipt', () => {
    expect(calculateFare({ ...trip, fare: 10, elapsed: 200, comfort: 0 })).toMatchObject({ payout: 0, adjustment: -110, speedBonus: -80, comfortBonus: -30 });
  });

  it('keeps deducting for lateness after the visual meter saturates, even on a short comfortable trip', () => {
    const shortTrip = { fare: 8, time: 28, elapsed: 56, comfort: 100 };
    expect(calculateFare(shortTrip)).toMatchObject({ payout: 16, speedBonus: -22, speedScore: -100 });
    expect(calculateFare({ ...shortTrip, elapsed: 100 })).toMatchObject({ payout: 0, speedBonus: -58, speedScore: -100 });
  });

  it.each([0, -5])('handles a nonpositive time target of %s without invalid scores', time => {
    expect(calculateFare({ ...trip, time, elapsed: 0 })).toMatchObject({ payout: 50, speedBonus: 0, speedScore: 0 });
    expect(calculateFare({ ...trip, time, elapsed: 1 })).toMatchObject({ payout: 49, speedBonus: -1, speedScore: -100 });
  });

  it('bounds comfort at its valid range and never exposes negative zero for rounded adjustments', () => {
    expect(calculateFare({ ...trip, comfort: -10 })).toMatchObject({ comfortBonus: -30, comfortScore: -100 });
    expect(calculateFare({ ...trip, comfort: 110 })).toMatchObject({ comfortBonus: 30, comfortScore: 100 });
    expect(calculateFare({ ...trip, elapsed: 100.1, comfort: 49.9 })).toMatchObject({ speedBonus: 0, comfortBonus: 0, speedScore: 0, comfortScore: 0 });
  });
});

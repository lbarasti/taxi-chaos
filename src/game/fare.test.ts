import { describe, expect, it } from 'vitest';
import { baseFareForDistance, calculateFare } from './fare';

const trip = { fare: 40, time: 100, elapsed: 100, comfort: 50 };

describe('fare pricing', () => {
  it.each([[0, 6], [40, 8], [100, 13], [1000, 76]])('prices a %s metre trip at $%s after the tenfold reduction and whole-dollar rounding', (distance, fare) => {
    expect(baseFareForDistance(distance)).toBe(fare);
  });

  it('pays exactly the base fare at both neutral thresholds', () => {
    expect(calculateFare(trip)).toEqual({ baseFare: 40, payout: 40, adjustment: 0, speedScore: 0, comfortScore: 0, speedBonus: 0, comfortBonus: 0 });
  });

  it('scales both adjustments with the base fare and speed with the fraction of time saved', () => {
    expect(calculateFare({ ...trip, elapsed: 20, comfort: 100 })).toMatchObject({ payout: 58, adjustment: 18, speedBonus: 8, comfortBonus: 10, speedScore: 80, comfortScore: 100 });
    expect(calculateFare({ ...trip, fare: 80, elapsed: 20, comfort: 100 })).toMatchObject({ payout: 116, speedBonus: 16, comfortBonus: 20 });
    expect(calculateFare({ ...trip, time: 200, elapsed: 40, comfort: 100 })).toEqual(calculateFare({ ...trip, elapsed: 20, comfort: 100 }));
  });

  it('limits a $12 fare to $18 and rewards a comfortable half-time arrival with $17', () => {
    expect(calculateFare({ ...trip, fare: 12, elapsed: 0, comfort: 100 })).toMatchObject({ payout: 18, speedBonus: 3, comfortBonus: 3 });
    expect(calculateFare({ ...trip, fare: 12, elapsed: 50, comfort: 100 }).payout).toBe(17);
  });

  it('keeps each bonus within 25% and total payment within 150%, including whole-dollar rounding', () => {
    for (let fare = 0; fare <= 100; fare++) {
      for (const elapsed of [-10, 0, 1, 25, 50, 100, 200, 600]) {
        for (const comfort of [-10, 0, 25, 50, 75, 100, 110]) {
          const result = calculateFare({ ...trip, fare, elapsed, comfort });
          expect(result.speedBonus).toBeLessThanOrEqual(fare * 0.25);
          expect(result.comfortBonus).toBeLessThanOrEqual(fare * 0.25);
          expect(result.payout).toBeLessThanOrEqual(fare * 1.5);
          expect(result.payout).toBeGreaterThanOrEqual(0);
          expect(result.payout).toBe(Math.max(0, fare + result.speedBonus + result.comfortBonus));
        }
      }
    }
  });

  it.each([
    { elapsed: 120, comfort: 50, payout: 38, adjustment: -2, speedBonus: -2, comfortBonus: 0, speedScore: -20, comfortScore: 0 },
    { elapsed: 100, comfort: 25, payout: 35, adjustment: -5, speedBonus: 0, comfortBonus: -5, speedScore: 0, comfortScore: -50 },
    { elapsed: 80, comfort: 0, payout: 32, adjustment: -8, speedBonus: 2, comfortBonus: -10, speedScore: 20, comfortScore: -100 },
  ])('subtracts poor performance without discarding the other component: $elapsed seconds, $comfort comfort', expected => {
    const { elapsed, comfort, ...payment } = expected;
    expect(calculateFare({ ...trip, elapsed, comfort })).toMatchObject(payment);
  });

  it('floors payout at zero while retaining signed components for an honest receipt', () => {
    expect(calculateFare({ ...trip, fare: 10, elapsed: 600, comfort: 0 })).toMatchObject({ payout: 0, adjustment: -14, speedBonus: -12, comfortBonus: -2 });
  });

  it('keeps deducting for lateness after the visual meter saturates, even on a short comfortable trip', () => {
    const shortTrip = { fare: 8, time: 28, elapsed: 56, comfort: 100 };
    expect(calculateFare(shortTrip)).toMatchObject({ payout: 8, speedBonus: -2, speedScore: -100 });
    expect(calculateFare({ ...shortTrip, elapsed: 196 })).toMatchObject({ payout: 0, speedBonus: -12, speedScore: -100 });
  });

  it.each([0, -5])('handles a nonpositive time target of %s using a one-second denominator', time => {
    expect(calculateFare({ ...trip, time, elapsed: 0 })).toMatchObject({ payout: 40, speedBonus: 0, speedScore: 0 });
    expect(calculateFare({ ...trip, time, elapsed: 1 })).toMatchObject({ payout: 30, speedBonus: -10, speedScore: -100 });
  });

  it('bounds comfort at its valid range and never exposes negative zero for rounded adjustments', () => {
    expect(calculateFare({ ...trip, comfort: -10 })).toMatchObject({ comfortBonus: -10, comfortScore: -100 });
    expect(calculateFare({ ...trip, comfort: 110 })).toMatchObject({ comfortBonus: 10, comfortScore: 100 });
    expect(calculateFare({ ...trip, elapsed: 100.1, comfort: 49.9 })).toMatchObject({ speedBonus: 0, comfortBonus: 0, speedScore: 0, comfortScore: 0 });
  });
});

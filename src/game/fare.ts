import { clamp } from '../physics/physics';

export type FareBreakdown = {
  baseFare: number; payout: number; adjustment: number;
  speedScore: number; comfortScore: number; speedBonus: number; comfortBonus: number;
};

export const baseFareForDistance = (distance: number) => Math.round((55 + distance * 0.7) / 10);

/** Authoritative payment and completed-receipt calculation. Scores are signed around zero. */
export function calculateFare(job: { fare: number; time: number; elapsed: number; comfort: number }): FareBreakdown {
  const time = Math.max(0, job.time), remaining = time - Math.max(0, job.elapsed);
  const comfort = clamp(job.comfort, 0, 100);
  const speedRatio = time > 0 ? remaining / time : remaining;
  // Each positive adjustment is capped at 25% of base, rounded down to whole dollars.
  const bonusScale = job.fare * 0.25, bonusCap = Math.floor(bonusScale);
  // The visual speed meter saturates; lateness keeps reducing the payout until it is zero.
  const speedBonus = Math.min(bonusCap, Math.round(bonusScale * speedRatio)) || 0;
  const comfortBonus = Math.min(bonusCap, Math.round(bonusScale * (comfort - 50) / 50)) || 0;
  const speedScore = Math.round(time > 0 ? clamp(remaining / time, -1, 1) * 100 : remaining < 0 ? -100 : 0) || 0;
  const comfortScore = Math.round((comfort - 50) * 2) || 0;
  const adjustment = speedBonus + comfortBonus;
  return { baseFare: job.fare, payout: Math.max(0, job.fare + adjustment), adjustment, speedScore, comfortScore, speedBonus, comfortBonus };
}

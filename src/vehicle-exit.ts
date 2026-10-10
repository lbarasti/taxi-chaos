import { clamp, type Vec } from './physics';

export type ExitSide = -1 | 1;

// Below walking pace the rider simply steps down rather than jumping.
export const MOVING_EXIT_SPEED = 1.2;
export const DOOR_OPEN_TIME = 0.24;
export const LANDING_TIME = 0.17;
export const JUMP_SIDE_SPEED = 3;

/** Open before the driver leaves, then swing shut as the empty car rolls away. */
export function doorOpenness(age: number) {
  return clamp(Math.min(age / 0.18, (0.75 - age) / 0.45), 0, 1);
}

/** Ground contact is a single speed-dependent hit, not damage every animation frame.
 * Quadratic growth approximates kinetic energy (not a real-world injury predictor).
 */
export function landingDamage(speed: number) {
  return speed <= MOVING_EXIT_SPEED ? 0 : clamp(3 + 0.085 * (speed - MOVING_EXIT_SPEED) ** 2, 0, 95);
}

export function tumbleDuration(speed: number) {
  return clamp(0.65 + speed * 0.018, 0.72, 1.35);
}

/**
 * The rider pushes sideways off a single-track vehicle. Opposite lateral momentum
 * acts on the lighter, now riderless motorcycle. Tyre contact, steer geometry and
 * gyroscopic stabilisation progressively oppose the visible swerve at speed.
 *
 * This is an arcade response tuned from motorcycle roll/steer dynamics, NOT an
 * accident reconstruction. At rest no impulse is applied; the rider dismounts.
 * https://www.mdpi.com/2076-3417/9/11/2278
 * https://www.sciencedirect.com/science/article/abs/pii/S0389430499000788
 */
export function motorcycleJumpReaction(speed: number, side: ExitSide, bikeMass = 260, riderMass = 75) {
  if (speed <= MOVING_EXIT_SPEED) return { lateralVelocity: 0, yawVelocity: 0, leanVelocity: 0 };
  const stability = 1 / (1 + (Math.max(0, speed - MOVING_EXIT_SPEED) / 8) ** 1.6);
  // The bike loses the rider's mass at launch; avoid a division by zero for mods.
  const bikeOnlyMass = Math.max(50, bikeMass - riderMass);
  return {
    lateralVelocity: -side * (riderMass / bikeOnlyMass) * JUMP_SIDE_SPEED * stability,
    yawVelocity: -side * 1.3 * stability,
    leanVelocity: -side * 4.2 * stability,
  };
}

/** The horizontal component of a leap, in the vehicle's local side direction. */
export const sideJump = (side: ExitSide): Vec => ({ x: 0, y: side * JUMP_SIDE_SPEED });

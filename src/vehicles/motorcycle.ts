import { Body, CarDynamics, add, clamp, dot, length, rotate, scale, vec, type Controls, type CarTuning, type TyreLayout } from '../physics';
import type { VehicleDamage } from './damage';

export const BIKE_ENGINE = 2800, BIKE_GRIP = 950;
export const MAX_LEAN = Math.PI * 0.26; // 46.8°, road-bike grip, not a racing slick.
const GRAVITY = 9.81;
export const MOTORCYCLE_KNOCKOFF_SPEED = 6; // relative closing speed at the contact (m/s)
export const BIKE_MIN_START_HP = 25;
export const BIKE_MAX_ENGINE_DAMAGE = 75;
export const BIKE_FALL_ANGLE = Math.PI * 0.47; // frame reaches the pavement rather than staying on its tyres

/** A damaged bike cannot be started, even when it has not yet burned or exploded. */
export function motorcycleEngineWorks(damage: VehicleDamage) {
  return damage.health > BIKE_MIN_START_HP && damage.critical.engine < BIKE_MAX_ENGINE_DAMAGE
    && damage.status !== 'wreck' && damage.status !== 'burning';
}

/** Steady cornering balance: tan(roll) = a_lateral / g = v² / (r g).
 * https://www.stevemunden.com/leanangle.html
 * https://en.wikipedia.org/wiki/Bicycle_and_motorcycle_dynamics#Leaning
 * Signed acceleration makes the bike lean INTO the turn, including reversing arcs.
 */
export const cornerLean = (lateralAcceleration: number) =>
  clamp(Math.atan2(lateralAcceleration, GRAVITY), -MAX_LEAN, MAX_LEAN);

/** Top-down orthographic roll about the tyre contact line. Higher parts move farther inward;
 * their height and transverse width shrink as the bike tips toward the ground. Not a yaw rotation.
 */
export const leanProjection = (lean: number, height: number) => ({
  offset: Math.sin(lean) * height, height: Math.cos(lean) * height, width: Math.cos(lean),
});

// Same force/integration/collision pipeline as cars, with a single-track pair of tyres.
// The rider's balance controller is represented by a damped roll response; no fragile free-fall
// balance simulation or binary steering animation. Lateral forces remain physical and grip-limited.
export class MotorcycleDynamics extends CarDynamics {
  override engineForce = BIKE_ENGINE;
  override grip = BIKE_GRIP;
  override tyres = [-0.88, 0.88].map(x => ({ position: vec(x, 0), steered: x > 0, angle: 0, skidding: false }));
  lean = 0; leanVelocity = 0; lateralAcceleration = 0;
  fallen = false;
  fallSide: -1 | 1 = 1;

  /** Knock the uncontrolled frame toward its contact side. The impact solver already
   * supplies linear and yaw impulses; this releases the rider's roll balance. */
  crash(side: -1 | 1, closingSpeed: number) {
    if (this.fallen) return;
    this.fallen = true;
    this.fallSide = side;
    this.lean = side * Math.max(0.08, side * this.lean);
    this.leanVelocity = side * clamp(1.5 + closingSpeed * 0.26, 2.3, 7);
    this.tyres.find(t => t.steered)!.angle = -side * 0.22;
  }

  private slide(body: Body, dt: number) {
    const speed = length(body.velocity);
    // Kinetic road friction: speed-independent deceleration, bounded so integration
    // never reverses a nearly stopped motorcycle. Scraping frame increases grip.
    if (speed > 1e-6 && dt > 0) {
      const decel = Math.min(speed / dt, GRAVITY * (0.53 + 0.24 * Math.abs(this.lean) / BIKE_FALL_ANGLE));
      body.addForce(scale(body.velocity, -body.mass * decel / speed));
    }
    body.angularVelocity *= Math.exp(-3.2 * dt); // collision yaw becomes a damped slide/spin
    const acceleration = 8 * Math.sin(this.lean) + this.fallSide * 5 - 2.5 * this.leanVelocity;
    this.leanVelocity += acceleration * dt;
    this.lean += this.leanVelocity * dt;
    if (this.fallSide * this.lean >= BIKE_FALL_ANGLE) {
      this.lean = this.fallSide * BIKE_FALL_ANGLE;
      this.leanVelocity = Math.abs(this.leanVelocity) > 0.9 ? -this.leanVelocity * 0.12 : 0;
    }
    this.skidding = speed > 1;
    this.lateralAcceleration = 0;
    for (const tyre of this.tyres) tyre.skidding = this.skidding;
  }

  constructor(tuning: Partial<CarTuning> = {}, tyres?: readonly TyreLayout[]) {
    super({ engineForce: BIKE_ENGINE, grip: BIKE_GRIP, brakeDeceleration: 15, reverseRatio: 0.3, drag: 2.8, rollingDrag: 12, coastDrag: 1.8, ...tuning });
    this.engineForce = this.tuning.engineForce; this.grip = this.tuning.grip;
    if (tyres) this.tyres = tyres.map(t => ({ position: vec(t.x, t.y), steered: t.steered, angle: 0, skidding: false }));
  }

  resetLean() { this.lean = 0; this.leanVelocity = 0; this.lateralAcceleration = 0; this.fallen = false; this.fallSide = 1; }

  override apply(body: Body, controls: Controls, dt: number) {
    if (this.fallen) { this.slide(body, dt); return; }
    const forward = rotate(vec(1, 0), body.angle), lateral = vec(-forward.y, forward.x);
    const speed = dot(body.velocity, forward);
    this.rearGripLoss = controls.handbrake ? 0.65 : Math.max(0, this.rearGripLoss - dt * 4);
    const braking = controls.throttle < 0 && speed > 0.5;
    const drive = braking ? body.mass * this.tuning.brakeDeceleration : controls.throttle < 0 ? this.engineForce * this.tuning.reverseRatio : this.engineForce;
    const throttle = speed < -3 && controls.throttle < 0 ? 0 : controls.throttle;
    body.addForce(scale(forward, clamp(throttle * drive * this.surface.drive * (controls.boost && !braking ? 3.1 : 1), -body.mass * 15, body.mass * 20)));
    body.addForce(scale(body.velocity, -this.tuning.drag * length(body.velocity)));
    if (controls.handbrake) body.addForce(scale(forward, -clamp(speed * body.mass * 3, -body.mass * 10, body.mass * 10)));
    if (!controls.throttle && length(body.velocity) < 4) body.addForce(scale(body.velocity, -body.mass * this.tuning.coastDrag));

    // At speed, small steering angles suffice. Limit curvature to the available road grip;
    // full lock is still available for walking-speed manoeuvres. Steering never spins a stopped bike.
    const maxAcceleration = Math.min(this.surface.lateralAcceleration, GRAVITY * Math.tan(MAX_LEAN) * clamp(this.grip * this.surface.grip / BIKE_GRIP, 0.1, 1.25));
    const wheelbase = Math.max(...this.tyres.map(t => t.position.x)) - Math.min(...this.tyres.map(t => t.position.x));
    const lock = Math.min(this.tuning.steeringLock, Math.atan2(wheelbase * maxAcceleration, Math.max(4, speed * speed)));
    let sideForce = 0;
    this.skidding = false;
    for (const tyre of this.tyres) {
      const desired = tyre.steered ? controls.turn * lock : 0;
      tyre.angle += (desired - tyre.angle) * (1 - Math.exp(-dt * 12));
      const p = body.toWorld(tyre.position), v = body.velocityAt(p);
      const rolling = rotate(vec(1, 0), body.angle + tyre.angle), side = vec(-rolling.y, rolling.x);
      const slip = dot(v, side), rear = !tyre.steered;
      const limit = body.mass * maxAcceleration * 0.5 * (rear ? 1 - this.rearGripLoss : 1);
      const demand = -this.grip * this.surface.grip * slip;
      const force = scale(side, clamp(demand, -limit, limit));
      tyre.skidding = Math.abs(slip) > 1.6 && Math.abs(demand) > limit;
      this.skidding ||= tyre.skidding;
      body.addForce(add(force, scale(rolling, -(this.tuning.rollingDrag + this.surface.rollingDrag) * dot(v, rolling))), p);
      sideForce += dot(force, lateral);
    }
    this.lateralAcceleration = sideForce / body.mass;
    const target = cornerLean(this.lateralAcceleration) * clamp(Math.abs(speed) / 2, 0, 1);
    // Critically damped roll (~0.3 s transition). No snapping when steering reverses or brakes apply.
    const frequency = 12;
    this.leanVelocity += (frequency * frequency * (target - this.lean) - 2 * frequency * this.leanVelocity) * dt;
    this.lean = clamp(this.lean + this.leanVelocity * dt, -MAX_LEAN, MAX_LEAN);
  }
}

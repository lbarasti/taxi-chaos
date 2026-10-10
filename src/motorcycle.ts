import { Body, CarDynamics, add, clamp, dot, length, rotate, scale, vec, type Controls } from './physics';

export const BIKE_ENGINE = 2800, BIKE_GRIP = 950;
export const MAX_LEAN = Math.PI * 0.26; // 46.8°, road-bike grip, not a racing slick.
const GRAVITY = 9.81;

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

  resetLean() { this.lean = 0; this.leanVelocity = 0; this.lateralAcceleration = 0; }

  override apply(body: Body, controls: Controls, dt: number) {
    const forward = rotate(vec(1, 0), body.angle), lateral = vec(-forward.y, forward.x);
    const speed = dot(body.velocity, forward);
    this.rearGripLoss = controls.handbrake ? 0.65 : Math.max(0, this.rearGripLoss - dt * 4);
    const braking = controls.throttle < 0 && speed > 0.5;
    const drive = braking ? body.mass * 15 : controls.throttle < 0 ? this.engineForce * 0.3 : this.engineForce;
    const throttle = speed < -3 && controls.throttle < 0 ? 0 : controls.throttle;
    body.addForce(scale(forward, clamp(throttle * drive * (controls.boost && !braking ? 3.1 : 1), -body.mass * 15, body.mass * 20)));
    body.addForce(scale(body.velocity, -2.8 * length(body.velocity)));
    if (controls.handbrake) body.addForce(scale(forward, -clamp(speed * body.mass * 3, -body.mass * 10, body.mass * 10)));
    if (!controls.throttle && length(body.velocity) < 4) body.addForce(scale(body.velocity, -body.mass * 1.8));

    // At speed, small steering angles suffice. Limit curvature to the available road grip;
    // full lock is still available for walking-speed manoeuvres. Steering never spins a stopped bike.
    const maxAcceleration = GRAVITY * Math.tan(MAX_LEAN) * clamp(this.grip / BIKE_GRIP, 0.45, 1.25);
    const lock = Math.min(0.55, Math.atan2(1.76 * maxAcceleration, Math.max(4, speed * speed)));
    let sideForce = 0;
    this.skidding = false;
    for (const tyre of this.tyres) {
      const desired = tyre.steered ? controls.turn * lock : 0;
      tyre.angle += (desired - tyre.angle) * (1 - Math.exp(-dt * 12));
      const p = body.toWorld(tyre.position), v = body.velocityAt(p);
      const rolling = rotate(vec(1, 0), body.angle + tyre.angle), side = vec(-rolling.y, rolling.x);
      const slip = dot(v, side), rear = !tyre.steered;
      const limit = body.mass * maxAcceleration * 0.5 * (rear ? 1 - this.rearGripLoss : 1);
      const demand = -this.grip * slip;
      const force = scale(side, clamp(demand, -limit, limit));
      tyre.skidding = Math.abs(slip) > 1.6 && Math.abs(demand) > limit;
      this.skidding ||= tyre.skidding;
      body.addForce(add(force, scale(rolling, -12 * dot(v, rolling))), p);
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

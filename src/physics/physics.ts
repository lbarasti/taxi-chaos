// Adapted from Pat Kerr's Motion Lab (v0.8.2): math.js, physics.js, dynamics.js.
// https://patkerr.co.uk/motion-lab/ — four-tyre forces + semi-implicit rigid bodies.
export type Vec = { x: number; y: number };
export const vec = (x = 0, y = 0): Vec => ({ x, y });
export const add = (a: Vec, b: Vec) => vec(a.x + b.x, a.y + b.y);
export const sub = (a: Vec, b: Vec) => vec(a.x - b.x, a.y - b.y);
export const scale = (v: Vec, s: number) => vec(v.x * s, v.y * s);
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const length = (v: Vec) => Math.hypot(v.x, v.y);
export const dist = (a: Vec, b: Vec) => length(sub(a, b));
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const rotate = (v: Vec, angle: number) => vec(Math.cos(angle) * v.x - Math.sin(angle) * v.y, Math.sin(angle) * v.x + Math.cos(angle) * v.y);
export const normalize = (v: Vec) => scale(v, 1 / (length(v) || 1));
export const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Rectangular solid section, normalized to its parent envelope (±0.5). */
export type CollisionRect = Readonly<{ x: number; y: number; width: number; height: number }>;

/** Authored convex footprints are bounded so SAT work stays predictable. */
export function validateCollisionPolygon(points: readonly Vec[], id: string): void {
  const fail = (reason: string): never => { throw new Error(`${id}: collision polygon ${reason}`); };
  if (!Array.isArray(points) || points.length < 3 || points.length > 32) fail('needs 3–32 vertices');
  if (points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 0.5 || Math.abs(p.y) > 0.5)) fail('must stay inside the normalized footprint');
  const area = points.reduce((sum, p, i) => sum + cross(p, points[(i + 1) % points.length]), 0);
  if (Math.abs(area) < 1e-8) fail('must have nonzero area');
  for (let i = 0; i < points.length; i++) {
    const a = points[i], edge = sub(points[(i + 1) % points.length], a);
    if (length(edge) < 1e-6) fail('has a duplicate vertex');
    if (points.some((p, j) => j !== i && dist(a, p) < 1e-6)) fail('has a duplicate vertex');
    if (points.some(p => Math.sign(area) * cross(edge, sub(p, a)) < -1e-10)) fail('must be convex and ordered around its boundary');
  }
}

export class Body {
  collisionRects?: readonly CollisionRect[];
  /** Optional convex footprint in normalized body coordinates (±0.5). */
  collisionPolygon?: readonly Vec[];
  position: Vec; velocity = vec(); angle = 0; angularVelocity = 0; force = vec(); torque = 0;
  constructor(x: number, y: number, public mass = 1000, public w = 4.2, public h = 2.1) { this.position = vec(x, y); }
  get inertia() { return this.mass * (this.w ** 2 + this.h ** 2) / 12; }
  get invMass() { return Number.isFinite(this.mass) ? 1 / this.mass : 0; }
  get invInertia() { return Number.isFinite(this.mass) ? 1 / this.inertia : 0; }
  toWorld(p: Vec) { return add(this.position, rotate(p, this.angle)); }
  velocityAt(p: Vec) { const r = sub(p, this.position); return add(this.velocity, vec(-this.angularVelocity * r.y, this.angularVelocity * r.x)); }
  addForce(f: Vec, p = this.position) { this.force = add(this.force, f); this.torque += cross(sub(p, this.position), f); }
  impulse(f: Vec, p = this.position) { this.velocity = add(this.velocity, scale(f, this.invMass)); this.angularVelocity += cross(sub(p, this.position), f) * this.invInertia; }
  integrate(dt: number) { this.velocity = add(this.velocity, scale(this.force, dt * this.invMass)); this.angularVelocity += this.torque * dt * this.invInertia; this.position = add(this.position, scale(this.velocity, dt)); this.angle += this.angularVelocity * dt; this.force = vec(); this.torque = 0; }
  localCorners() { return this.collisionPolygon
    ? this.collisionPolygon.map(p => vec(p.x * this.w, p.y * this.h))
    : [vec(-this.w / 2, -this.h / 2), vec(this.w / 2, -this.h / 2), vec(this.w / 2, this.h / 2), vec(-this.w / 2, this.h / 2)]; }
  corners() {
    if (this.collisionPolygon) return this.collisionPolygon.map(p => this.toWorld(vec(p.x * this.w, p.y * this.h)));
    const x = this.w / 2, y = this.h / 2;
    return [this.toWorld(vec(-x, -y)), this.toWorld(vec(x, -y)), this.toWorld(vec(x, y)), this.toWorld(vec(-x, y))];
  }
}

/** Cache only derived geometry; static compounds avoid rebuilding their sections
 * per contact, while moved/rotated/resized bodies invalidate the same cache. */
const sectionCache = new WeakMap<Body, { x: number; y: number; angle: number; w: number; h: number; source: readonly CollisionRect[]; parts: Body[] }>();
export function bodyParts(body: Body): readonly Body[] {
  if (!body.collisionRects) return [body];
  const cached = sectionCache.get(body), { x, y } = body.position;
  if (cached && cached.x === x && cached.y === y && cached.angle === body.angle && cached.w === body.w && cached.h === body.h && cached.source === body.collisionRects) return cached.parts;
  const parts = body.collisionRects.map(r => {
    const p = body.toWorld(vec((r.x + r.width / 2) * body.w, (r.y + r.height / 2) * body.h));
    const part = new Body(p.x, p.y, body.mass, r.width * body.w, r.height * body.h);
    part.angle = body.angle; return part;
  });
  sectionCache.set(body, { x, y, angle: body.angle, w: body.w, h: body.h, source: body.collisionRects, parts });
  return parts;
}

export type Controls = { throttle: number; turn: number; handbrake: boolean; boost?: boolean };
export type TyreLayout = { x: number; y: number; steered: boolean };
export type CarTuning = {
  engineForce: number; grip: number; brakeDeceleration: number; reverseRatio: number;
  drag: number; rollingDrag: number; coastDrag: number; steeringLock: number;
  steeringSpeedFalloff: number; maxLateralAcceleration: number;
};
export const defaultCarTuning: CarTuning = {
  engineForce: 10500, grip: 1250, brakeDeceleration: 19, reverseRatio: 0.55,
  drag: 12, rollingDrag: 35, coastDrag: 0.8, steeringLock: 0.55,
  steeringSpeedFalloff: 0.018, maxLateralAcceleration: Infinity,
};
export class CarDynamics {
  rearGripLoss = 0; skidding = false;
  surface = { drive: 1, grip: 1, rollingDrag: 0, lateralAcceleration: Infinity };
  tyres = [-1.35, 1.35].flatMap(x => [-0.7, 0.7].map(y => ({ position: vec(x, y), steered: x > 0, angle: 0, skidding: false })));
  engineForce = 10500; grip = 1250;
  tuning: CarTuning;
  constructor(tuning: Partial<CarTuning> = {}, tyres?: readonly TyreLayout[]) {
    this.tuning = { ...defaultCarTuning, ...tuning };
    this.engineForce = this.tuning.engineForce; this.grip = this.tuning.grip;
    if (tyres) this.tyres = tyres.map(t => ({ position: vec(t.x, t.y), steered: t.steered, angle: 0, skidding: false }));
  }
  apply(body: Body, controls: Controls, dt: number) {
    this.rearGripLoss = controls.handbrake ? 1 : Math.max(0, this.rearGripLoss - dt / 0.2);
    const forward = rotate(vec(1, 0), body.angle);
    const speed = dot(body.velocity, forward);
    // Braking is stronger than reverse; aerodynamic drag gives a finite top speed.
    const force = controls.throttle < 0 ? (speed > 0.5 ? body.mass * this.tuning.brakeDeceleration : this.engineForce * this.tuning.reverseRatio) : this.engineForce;
    body.addForce(scale(forward, controls.throttle * force * this.surface.drive * (controls.boost ? 3.1 : 1)));
    body.addForce(scale(body.velocity, -this.tuning.drag * length(body.velocity)));
    // Low-speed coast settles naturally into a pickup rather than creeping forever.
    if (!controls.throttle && length(body.velocity) < 4) body.addForce(scale(body.velocity, -body.mass * this.tuning.coastDrag));
    this.skidding = false;
    for (const tyre of this.tyres) {
      tyre.angle = tyre.steered ? controls.turn * (this.tuning.steeringLock / (1 + Math.abs(speed) * this.tuning.steeringSpeedFalloff)) : 0;
      const p = body.toWorld(tyre.position), v = body.velocityAt(p), rolling = rotate(vec(1, 0), body.angle + tyre.angle), lateral = vec(-rolling.y, rolling.x);
      const side = dot(v, lateral), rear = !tyre.steered;
      tyre.skidding = rear && Math.abs(side) > (tyre.skidding ? 1.1 : 2);
      this.skidding ||= tyre.skidding;
      const rollDrag = (this.tuning.rollingDrag + this.surface.rollingDrag) * (rear && controls.handbrake ? 6 : 1);
      const sideDrag = this.grip * this.surface.grip * (rear ? 1 - this.rearGripLoss * 0.8 : 1);
      const limit = body.mass * Math.min(this.tuning.maxLateralAcceleration, this.surface.lateralAcceleration) / this.tyres.length;
      const sideForce = clamp(-sideDrag * side, -limit, limit);
      tyre.skidding ||= Math.abs(sideDrag * side) > limit;
      this.skidding ||= tyre.skidding;
      body.addForce(add(scale(rolling, -rollDrag * dot(v, rolling)), scale(lateral, sideForce)), p);
    }
  }
}

export const bodyRadius = (body: Body) => Math.hypot(body.w, body.h) / 2;
/** Conservative broad phase for every vehicle size and orientation. */
export const bodiesNear = (a: Body, b: Body, margin = 0) => dist(a.position, b.position) < bodyRadius(a) + bodyRadius(b) + margin;

export type Contact = { normal: Vec; depth: number; point: Vec };
// SAT for rotated rectangles and convex footprints, with stable face contacts.
export function contact(a: Body, b: Body): Contact | null {
  if (!a.collisionRects && !b.collisionRects) return rectangleContact(a, b);
  if (!rectangleContact(a, b)) return null;
  let deepest: Contact | null = null;
  for (const ap of bodyParts(a)) for (const bp of bodyParts(b)) {
    const hit = rectangleContact(ap, bp);
    if (hit && (!deepest || hit.depth > deepest.depth)) deepest = hit;
  }
  return deepest;
}
function axesFor(body: Body, points: Vec[]) {
  return body.collisionPolygon
    ? points.map((p, i) => { const edge = sub(points[(i + 1) % points.length], p); return normalize(vec(-edge.y, edge.x)); })
    : [rotate(vec(1, 0), body.angle), rotate(vec(0, 1), body.angle)];
}
function rectangleContact(a: Body, b: Body): Contact | null {
  const ac = a.corners(), bc = b.corners(); let depth = Infinity, normal = vec();
  const axes = axesFor(a, ac);
  for (const axis of axesFor(b, bc)) axes.push(axis);
  for (let axis of axes) {
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const p of ac) { const value = p.x * axis.x + p.y * axis.y; if (value < amin) amin = value; if (value > amax) amax = value; }
    for (const p of bc) { const value = p.x * axis.x + p.y * axis.y; if (value < bmin) bmin = value; if (value > bmax) bmax = value; }
    // Compare the two escape distances, including containment. A polygon need not
    // surround its envelope centre, so body positions cannot orient its contact.
    const positive = bmax - amin, negative = amax - bmin;
    if (positive <= 0 || negative <= 0) return null;
    const overlap = Math.min(positive, negative);
    if (overlap < depth) {
      depth = overlap;
      if (negative < positive || negative === positive && dot(sub(a.position, b.position), axis) < 0) axis = scale(axis, -1);
      normal = axis;
    }
  }
  const support = (points: Vec[], sign: number) => {
    const projections = points.map(p => dot(p, normal) * sign), min = Math.min(...projections);
    const face = points.filter((_, i) => projections[i] < min + 0.03);
    return scale(face.reduce((s, p) => add(s, p), vec()), 1 / face.length);
  };
  const pa = support(ac, 1), pb = support(bc, -1);
  // Clamp face contacts to the overlapping tangential interval to avoid remote lever arms.
  const tangent = vec(-normal.y, normal.x);
  const lo = Math.max(Math.min(...ac.map(p => dot(p, tangent))), Math.min(...bc.map(p => dot(p, tangent))));
  const hi = Math.min(Math.max(...ac.map(p => dot(p, tangent))), Math.max(...bc.map(p => dot(p, tangent))));
  const middle = scale(add(pa, pb), 0.5);
  return { normal, depth, point: add(scale(normal, dot(middle, normal)), scale(tangent, clamp(dot(middle, tangent), lo, hi))) };
}

export function resolveCollision(a: Body, b: Body, c: Contact, restitution = 0.22): number {
  const inv = a.invMass + b.invMass; if (!inv) return 0;
  const correction = scale(c.normal, Math.max(c.depth - 0.005, 0) * 0.85 / inv);
  a.position = add(a.position, scale(correction, a.invMass)); b.position = sub(b.position, scale(correction, b.invMass));
  const relative = sub(a.velocityAt(c.point), b.velocityAt(c.point)), speed = dot(relative, c.normal);
  if (speed >= 0) return 0;
  const ra = cross(sub(c.point, a.position), c.normal), rb = cross(sub(c.point, b.position), c.normal);
  const impulse = -(1 + (speed < -1 ? restitution : 0)) * speed / (inv + ra * ra * a.invInertia + rb * rb * b.invInertia);
  const f = scale(c.normal, impulse); a.impulse(f, c.point); b.impulse(scale(f, -1), c.point);
  const t = vec(-c.normal.y, c.normal.x);
  const ta = cross(sub(c.point, a.position), t), tb = cross(sub(c.point, b.position), t);
  const tangentInverseMass = inv + ta * ta * a.invInertia + tb * tb * b.invInertia;
  // Recompute slip after the normal impulse; off-center friction must include inertia.
  const slip = dot(sub(a.velocityAt(c.point), b.velocityAt(c.point)), t);
  const friction = clamp(-slip / tangentInverseMass, -impulse * 0.3, impulse * 0.3);
  a.impulse(scale(t, friction), c.point); b.impulse(scale(t, -friction), c.point);
  return -speed;
}

export class SpatialHash<T extends { body: Body; alive: boolean }> {
  cells = new Map<string, T[]>();
  constructor(public size = 12) {}
  keys(body: Body) { const p = body.position, r = Math.hypot(body.w, body.h) / 2; const result: string[] = []; for (let x = Math.floor((p.x - r) / this.size); x <= Math.floor((p.x + r) / this.size); x++) for (let y = Math.floor((p.y - r) / this.size); y <= Math.floor((p.y + r) / this.size); y++) result.push(`${x},${y}`); return result; }
  insert(item: T) { for (const key of this.keys(item.body)) { const cell = this.cells.get(key) ?? []; cell.push(item); this.cells.set(key, cell); } }
  query(body: Body) { const found = new Set<T>(); for (const key of this.keys(body)) for (const item of this.cells.get(key) ?? []) if (item.alive) found.add(item); return found; }
}

/** Exact segment test for rectangles, convex polygons and compound sections. */
export function segmentIntersectsBody(a: Vec, b: Vec, body: Body): boolean {
  if (body.collisionRects) return bodyParts(body).some(part => segmentIntersectsBody(a, b, part));
  const start = rotate(sub(a, body.position), -body.angle), end = rotate(sub(b, body.position), -body.angle), delta = sub(end, start);
  let enter = 0, leave = 1;
  if (body.collisionPolygon) {
    const points = body.localCorners();
    const winding = Math.sign(points.reduce((sum, p, i) => sum + cross(p, points[(i + 1) % points.length]), 0));
    for (let i = 0; i < points.length; i++) {
      const p = points[i], edge = sub(points[(i + 1) % points.length], p);
      const offset = winding * cross(edge, sub(start, p)), change = winding * cross(edge, delta);
      if (Math.abs(change) < 1e-9) { if (offset < -1e-9) return false; continue; }
      const t = -offset / change;
      if (change > 0) enter = Math.max(enter, t); else leave = Math.min(leave, t);
      if (enter > leave) return false;
    }
    return leave > 1e-5 && enter < 1 - 1e-5;
  }
  for (const axis of ['x', 'y'] as const) {
    const half = (axis === 'x' ? body.w : body.h) / 2;
    if (Math.abs(delta[axis]) < 1e-9) { if (Math.abs(start[axis]) > half) return false; continue; }
    const t1 = (-half - start[axis]) / delta[axis], t2 = (half - start[axis]) / delta[axis];
    enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2));
    if (enter > leave) return false;
  }
  return leave > 1e-5 && enter < 1 - 1e-5;
}

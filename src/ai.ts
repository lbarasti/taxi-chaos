import { Body, add, angleDiff, bodiesNear, clamp, contact, dist, dot, length, rotate, scale, sub, vec, type Controls, type Vec } from './physics';
import { createVehicleDynamics } from './vehicles';
import { GRID, SIZE, World, isRigidObstacle } from './world';
import { isCountry } from './countryside';
import type { Vehicle } from './game';
import { difficulties, type Difficulty } from './rules';
import { FREIGHT_ROUTE, PORT_NODES, onPortRoad } from './harbour';

export type AIState = {
  anchor: Vec; progressClock: number; stalled: number; phase: 'drive' | 'reverse' | 'rejoin' | 'waiting'; phaseTime: number; reverseTurn: number; attempts: number; failures: number;
  sensorClock: number; avoidTurn: number; blocked: boolean; role: 'pursuit' | 'interceptor' | 'blocker'; lastSeen: Vec; seenAt: number; waitTime: number;
  planPending: boolean;
};
export const createAI = (p: Vec, id: number): AIState => ({ anchor: { ...p }, progressClock: 0, stalled: 0, phase: 'drive', phaseTime: 0, reverseTurn: 0, attempts: 0, failures: 0, sensorClock: 0, avoidTurn: 0, blocked: false, role: (['pursuit', 'interceptor', 'blocker'] as const)[id % 3], lastSeen: { ...p }, seenAt: -100, waitTime: 0, planPending: false });
export type AIContext = { world: World; vehicles: Vehicle[]; player: Vehicle; actor: Body; time: number; stars: number; speed: number; settings: { difficulty: Difficulty }; recoveryBudget: { used: number; rejoin: number }; policeIntel: { position: Vec; velocity: Vec; seenAt: number }; lineOfSight(a: Vec, b: Vec): boolean };

function clearCorridor(v: Vehicle, body: Body, target: Vec, c: AIContext, ignoreSoft = false): boolean {
  const { inOcean } = c.world.map.coast;
  const delta = sub(target, body.position), distance = length(delta), heading = Math.atan2(delta.y, delta.x);
  for (let d = 1.2; d <= distance; d += 1.2) {
    const p = add(body.position, scale(delta, d / distance));
    if (inOcean(p)) return false;
    const probe = new Body(p.x, p.y, Infinity, body.w + 0.1, body.h + 0.25); probe.angle = heading;
    for (const prop of c.world.hash.query(probe)) {
      if (prop.kind === 'port-gate' && v.freight) continue;
      if (ignoreSoft && !isRigidObstacle(prop.kind)) continue;
      if ((contact(probe, prop.body)?.depth ?? 0) > 0.04) return false;
    }
    for (const other of c.vehicles) {
      if (!other.alive || other === v || (v.kind === 'police' && other.kind === 'taxi')) continue;
      if (!bodiesNear(probe, other.body, 0.15)) continue;
      if ((contact(probe, other.body)?.depth ?? 0) > 0.08) return false;
    }
  }
  return true;
}

function roadRejoin(v: Vehicle, body: Body, c: AIContext): { point: Vec; score: number } | undefined {
  const { roadNode } = c.world.navigation, { inBeach } = c.world.map.beach, { countryAccess } = c.world.map.country;
  const node = roadNode(body.position), points: Vec[] = [];
  if (onPortRoad(body.position)) { points.push(...PORT_NODES); } else if (isCountry(body.position) && !inBeach(body.position)) {
    for (const point of countryAccess(body.position).road.points) if (dist(point, body.position) >= 5 && dist(point, body.position) <= 24) points.push(point);
  } else {
    // Alley exits preserve the open channel rather than cutting through a building.
    for (const lane of [-3, 3]) {
      for (const y of [Math.floor(body.position.y / GRID) * GRID, Math.ceil(body.position.y / GRID) * GRID]) points.push(vec(body.position.x, clamp(y + lane, -3, SIZE + 3)));
      for (const x of [Math.floor(body.position.x / GRID) * GRID, Math.ceil(body.position.x / GRID) * GRID]) points.push(vec(clamp(x + lane, -3, SIZE + 3), body.position.y));
    }
    for (const offset of [-18, -10, 10, 18]) for (const lane of [-3, 3]) {
      if (Math.abs(node.x - body.position.x) < 15) points.push(vec(node.x + lane, clamp(body.position.y + offset, 1, SIZE - 1)));
      if (Math.abs(node.y - body.position.y) < 15) points.push(vec(clamp(body.position.x + offset, 1, SIZE - 1), node.y + lane));
    }
  }
  let best: { point: Vec; score: number } | undefined;
  for (const point of points) {
    const d = dist(point, body.position); if (d < 5) continue;
    const angle = Math.abs(angleDiff(Math.atan2(point.y - body.position.y, point.x - body.position.x), body.angle));
    if (angle > 1.6 || !clearCorridor(v, body, point, c)) continue;
    const score = angle * 9 + d * 0.15;
    if (!best || score < best.score) best = { point, score };
  }
  return best;
}

function beginRecovery(v: Vehicle, c: AIContext): boolean {
  const { sandHandling } = c.world.map.beach, { inOcean } = c.world.map.coast, { roadDistance } = c.world.navigation;
  if (v.ai.failures >= 4) {
    v.ai.phase = 'waiting'; v.ai.phaseTime = 8;
    if (dist(v.body.position, c.actor.position) > 75) v.alive = false; // off-screen roadside clearance; never pop a visible car
    return false;
  }
  if (c.recoveryBudget.used >= 1) return false;
  c.recoveryBudget.used++;
  let bestTurn = 0, bestScore = Infinity;
  // Preview three physical reversing arcs. This chooses space, not a coin flip.
  for (const turn of [-0.85, 0, 0.85]) {
    const body = new Body(v.body.position.x, v.body.position.y, v.body.mass, v.body.w, v.body.h); body.angle = v.body.angle; body.velocity = { ...v.body.velocity }; body.angularVelocity = v.body.angularVelocity;
    const dynamics = createVehicleDynamics(v.definition); dynamics.engineForce = v.dynamics.engineForce; dynamics.grip = v.dynamics.grip; let penalty = 0;
    for (let i = 0; i < 60; i++) {
      dynamics.surface = sandHandling(body, v.definition.physics.tyres, v.definition.terrain.sand);
      dynamics.apply(body, { throttle: -0.65, turn, handbrake: false }, 1 / 30); body.integrate(1 / 30);
      if (inOcean(body.position)) penalty += 100;
      for (const prop of c.world.hash.query(body)) { const hit = contact(body, prop.body); if (hit && hit.depth > 0.06) penalty += hit.depth * 12; }
      for (const other of c.vehicles) if (other !== v && other.alive && bodiesNear(other.body, body)) { const hit = contact(body, other.body); if (hit && hit.depth > 0.1) penalty += hit.depth * 8; }
    }
    const rejoin = roadRejoin(v, body, c);
    const score = penalty + (rejoin?.score ?? 24) + Math.max(0, roadDistance(body.position) - 3) * 2 - dist(body.position, v.body.position);
    if (score < bestScore) { bestScore = score; bestTurn = turn; }
  }
  v.ai.phase = 'reverse'; v.ai.phaseTime = 2; v.ai.reverseTurn = bestTurn; v.ai.stalled = 0; v.ai.attempts++; v.ai.failures++; v.ai.sensorClock = 0;
  return true;
}

function nextTrafficRoad(v: Vehicle, c: AIContext) {
  const { roadDistance, roadNode, roadNeighbours, roadPath } = c.world.navigation;
  v.ai.planPending = false;
  if (roadDistance(v.body.position) > 6) {
    if (c.recoveryBudget.rejoin >= 2) { v.ai.planPending = true; return; }
    c.recoveryBudget.rejoin++;
    const rejoin = roadRejoin(v, v.body, c);
    if (rejoin) { v.path = [rejoin.point]; v.ai.phase = 'rejoin'; v.ai.phaseTime = 7; return; }
  }
  const local = c.world.map.document.trafficSpawns.find(s => s.id === v.sourceId)?.activity === 'residential';
  const node = roadNode(v.body.position), options = roadNeighbours(node).filter(p => {
    if (local) return c.world.map.country.COUNTRY_ROADS.some(r => r.surface === 'residential' && ((dist(c.world.map.country.ROAD_NODES[r.from], node) < .01 && dist(c.world.map.country.ROAD_NODES[r.to], p) < .01) || (dist(c.world.map.country.ROAD_NODES[r.to], node) < .01 && dist(c.world.map.country.ROAD_NODES[r.from], p) < .01)));
    return onPortRoad(v.body.position) || p.y >= 0 || !onPortRoad(p);
  });
  const forward = options.filter(p => Math.cos(Math.atan2(p.y - node.y, p.x - node.x) - v.body.angle) > -0.3);
  const choices = forward.length ? forward : options;
  const straight = choices.find(p => Math.cos(Math.atan2(p.y - node.y, p.x - node.x) - v.body.angle) > 0.85);
  const p = straight && c.world.random() < 0.6 ? straight : choices[Math.floor(c.world.random() * choices.length)];
  if (!p) { v.ai.planPending = true; return; }
  const heading = Math.atan2(p.y - node.y, p.x - node.x);
  v.path = roadPath(v.body.position, isCountry(node) || isCountry(p) ? p : add(p, rotate(vec(0, 3), heading))).slice(1);
}

function policeGoal(v: Vehicle, c: AIContext): Vec {
  const { roadNode, roadProjection } = c.world.navigation, { countryNeighbours } = c.world.map.country;
  const p = c.actor, canSee = dist(v.body.position, p.position) < 70 && c.lineOfSight(v.body.position, p.position);
  if (canSee) { v.ai.lastSeen = { ...p.position }; v.ai.seenAt = c.time; }
  else if (c.policeIntel.seenAt > v.ai.seenAt) { v.ai.lastSeen = { ...c.policeIntel.position }; v.ai.seenAt = c.policeIntel.seenAt; }
  const fresh = c.time - v.ai.seenAt < 4;
  if (fresh && v.ai.role !== 'pursuit' && dist(v.body.position, p.position) > 18) {
    const lead = add(v.ai.lastSeen, scale(c.policeIntel.velocity, v.ai.role === 'blocker' ? 2.3 : 1.4));
    return v.ai.role === 'blocker' ? roadNode(lead) : roadProjection(lead);
  }
  if (canSee && dist(v.body.position, p.position) < 20) {
    // Pursuers work toward the rear quarter; driving at the exact centre makes
    // every encounter a suicidal head-on rather than a containable chase.
    return add(p.toWorld(vec(-2.5, v.id % 2 ? 1.8 : -1.8)), scale(p.velocity, 0.2));
  }
  if (fresh) return v.ai.lastSeen;
  // Search adjacent streets near the last sighting rather than tracking through walls.
  if (dist(v.body.position, v.ai.lastSeen) < 10) {
    const n = roadNode(v.ai.lastSeen), turn = v.id % 2 ? 40 : -40;
    const neighbours = countryNeighbours(n);
    v.ai.lastSeen = isCountry(n) ? neighbours[v.id % neighbours.length] ?? n : vec(clamp(n.x + turn, 0, SIZE), n.y);
  }
  return v.ai.lastSeen;
}

export function driveNPC(v: Vehicle, c: AIContext, dt: number): Controls {
  const { GOLF_CART_ROUTE } = c.world.map.country, { beachVehicleTarget } = c.world.map.beach, { roadDistance, roadPath } = c.world.navigation;
  if (v.cart) {
    // Carts patrol the fairways; never feed them into the city road/rejoin planner.
    if (dist(v.body.position, GOLF_CART_ROUTE[v.cart.waypoint]) < 3) v.cart.waypoint = (v.cart.waypoint + 1) % GOLF_CART_ROUTE.length;
    const target = GOLF_CART_ROUTE[v.cart.waypoint], delta = sub(target, v.body.position);
    const diff = angleDiff(Math.atan2(delta.y, delta.x), v.body.angle);
    const speed = dot(v.body.velocity, rotate(vec(1, 0), v.body.angle));
    return { throttle: clamp((v.definition.ai.cruiseSpeed / (1 + Math.abs(diff) * 2) - speed) * 0.6, -1, 1), turn: clamp(diff * 2 - v.body.angularVelocity * 0.3, -1, 1), handbrake: false };
  }
  if (v.freight && v.ai.phase === 'drive') {
    if (dist(v.body.position, FREIGHT_ROUTE[v.freight.waypoint]) < 5) v.freight.waypoint = (v.freight.waypoint + 1) % FREIGHT_ROUTE.length;
    v.path = [FREIGHT_ROUTE[v.freight.waypoint], FREIGHT_ROUTE[(v.freight.waypoint + 1) % FREIGHT_ROUTE.length]];
  }
  const state = v.ai, body = v.body, speed = length(body.velocity), rules = difficulties[c.settings.difficulty];
  if (v.baseEngine === 0) return { throttle: 0, turn: 0, handbrake: true };
  // A deliberate containment/roadblock stop is not a traffic jam.
  if (v.kind === 'police' && dist(body.position, c.actor.position) < (c.actor === c.player.body ? 8 : 4) && c.speed < 4) {
    state.stalled = 0; state.progressClock = 0; state.phase = 'drive';
    return { throttle: speed > 1 ? -1 : 0, turn: 0, handbrake: true };
  }
  state.progressClock += dt; state.phaseTime -= dt;
  if (state.phase === 'waiting') {
    if (dist(body.position, c.actor.position) > 75) v.alive = false;
    if (state.phaseTime <= 0) { state.failures = 3; state.stalled = 1.9; state.phase = 'drive'; }
    else return { throttle: speed > 0.7 ? -1 : 0, turn: 0, handbrake: true };
  }
  if (state.progressClock >= 1) {
    const moved = dist(state.anchor, body.position);
    state.stalled = moved < 0.9 ? state.stalled + state.progressClock : Math.max(0, state.stalled - state.progressClock * 2);
    if (moved > 3 && state.phase === 'drive' && roadDistance(body.position) < 6) state.failures = 0;
    state.anchor = { ...body.position }; state.progressClock = 0;
  }
  if (state.phase === 'reverse') {
    if (state.phaseTime <= 0) {
      const rejoin = roadRejoin(v, body, c);
      if (rejoin) { v.path = [rejoin.point]; state.phase = 'rejoin'; state.phaseTime = 5; state.stalled = 0; }
      else if (beginRecovery(v, c)) state.phaseTime = 2.5;
      else return { throttle: 0, turn: 0, handbrake: true };
    }
    if (state.phase === 'reverse') return { throttle: dot(body.velocity, rotate(vec(1, 0), body.angle)) < -5 ? 0 : -0.65, turn: state.reverseTurn, handbrake: false };
  }
  if (state.stalled >= 1.8) { const started = beginRecovery(v, c); return { throttle: started ? -0.65 : 0, turn: started ? state.reverseTurn : 0, handbrake: !started }; }
  if (state.phase === 'rejoin' && (state.phaseTime <= 0 || (v.path[0] && dist(v.path[0], body.position) < 4))) {
    if (v.path[0] && dist(v.path[0], body.position) < 4) state.failures = 0;
    state.phase = 'drive'; state.stalled = 0; v.path = []; v.routeTimer = 0;
  }
  v.routeTimer -= dt;
  if (state.phase === 'drive') {
    if (v.kind === 'police' && (v.routeTimer <= 0 || !v.path.length)) {
      const goal = beachVehicleTarget(policeGoal(v, c));
      v.path = dist(body.position, goal) < 22 && c.lineOfSight(body.position, goal) ? [goal] : roadPath(body.position, goal).slice(1);
      v.routeTimer = 0.9;
    }
    if (v.kind === 'traffic' && !v.path.length) nextTrafficRoad(v, c);
  }
  if (state.planPending) return { throttle: speed > 1 ? -1 : 0, turn: 0, handbrake: true };
  while (!v.freight && v.path.length > 1 && dist(v.path[0], body.position) < 5) v.path.shift();
  if (!v.freight && v.kind === 'traffic' && state.phase === 'drive' && v.path[0] && dist(v.path[0], body.position) < 5) { v.path.shift(); if (!v.path.length) nextTrafficRoad(v, c); }
  if (state.planPending) return { throttle: speed > 1 ? -1 : 0, turn: 0, handbrake: true };
  const target = v.path[0] ?? body.position, desired = Math.atan2(target.y - body.position.y, target.x - body.position.x), diff = angleDiff(desired, body.angle);
  if (v.kind === 'police' && state.role === 'blocker' && c.time - state.seenAt < 4 && dist(target, body.position) < 5 && dist(body.position, c.actor.position) > 12) {
    state.waitTime += dt; state.stalled = 0; state.progressClock = 0;
    if (state.waitTime < 3.5) return { throttle: speed > 1 ? -1 : 0, turn: 0, handbrake: true };
  } else state.waitTime = 0;
  const profile = v.definition.ai;
  let wantedSpeed = (state.phase === 'rejoin' ? Math.min(6, profile.cruiseSpeed) : v.kind === 'traffic' ? profile.cruiseSpeed : rules.copSpeed - (c.stars <= 1 ? 4 : 0)) / (1 + Math.abs(diff) * profile.cornerSlowdown);
  if (v.freight) wantedSpeed = Math.min(wantedSpeed, 7 / (1 + Math.abs(diff)));
  // Loaded trucks start shedding speed before the waypoint reveals a sharp turn.
  if (v.path.length > 1 && body.w > 5) {
    const next = sub(v.path[1], target), bend = Math.abs(angleDiff(Math.atan2(next.y, next.x), desired));
    const brakingDistance = speed * speed / (2 * v.dynamics.tuning.brakeDeceleration);
    if (dist(body.position, target) < brakingDistance + body.w) wantedSpeed /= 1 + bend * profile.cornerSlowdown;
  }
  if (v.kind === 'police' && dist(body.position, c.actor.position) < 19) {
    const separation = sub(c.actor.position, body.position), closing = dot(sub(body.velocity, c.actor.velocity), scale(separation, 1 / (length(separation) || 1)));
    if (closing > 20) wantedSpeed = Math.min(wantedSpeed, 3);
    else if (dist(body.position, c.actor.position) < 9) wantedSpeed = Math.min(wantedSpeed, Math.max(4, c.speed + 2));
  }
  state.sensorClock -= dt;
  if (state.sensorClock <= 0) {
    state.sensorClock = 0.12; state.avoidTurn = 0; state.blocked = false;
    const brakingDistance = speed * speed / (2 * v.dynamics.tuning.brakeDeceleration);
    let look = clamp(Math.max(4 + speed * 0.55, body.w / 2 + profile.followingGap + brakingDistance), 4.5, 30);
    // At walking-speed corners, a long straight probe reaches the opposite block
    // before the truck can turn. Keep a stopping-distance sweep while it manoeuvres.
    if (body.w > 5 && Math.abs(diff) > 0.35 && speed < 5) look = Math.min(look, 2 + brakingDistance);
    const ahead = body.toWorld(vec(look, 0));
    const canSmashSoft = v.kind === 'police' && speed > 7;
    if (!clearCorridor(v, body, ahead, c, canSmashSoft)) {
      state.blocked = true;
      for (const side of [-1, 1]) {
        const pass = body.toWorld(vec(look, side * 3.2));
        if (roadDistance(pass) <= 5 && clearCorridor(v, body, pass, c, canSmashSoft)) { state.avoidTurn = side * 0.6; break; }
      }
    }
  }
  if (state.blocked) wantedSpeed = Math.min(wantedSpeed, state.avoidTurn ? 4 : 0);
  const forwardSpeed = dot(body.velocity, rotate(vec(1, 0), body.angle));
  const throttle = clamp((wantedSpeed - forwardSpeed) * 0.45, -1, 1);
  let turn = state.avoidTurn || clamp(diff * 1.9 - body.angularVelocity * 0.25, -1, 1);
  if (forwardSpeed < -0.5) turn = -turn;
  return { throttle, turn, handbrake: false };
}

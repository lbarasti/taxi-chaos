import { Body, add, bodyParts, contact, cross, dist, scale, sub, vec, type Vec } from '../physics/physics';
import { World, blocksWalking, isRigidObstacle } from '../world/world';
import { vehicleDefinition, createVehicleBody } from '../vehicles/vehicles';
import type { CompiledObject, ResolvedFeature } from '../catalogue/schema';
import { compileMap, type CompiledMap } from './compile';
import type { MapDocument } from './schema';
import { directedWaterGap } from '../world/land';
import { contains } from '../world/regions';
import { descriptorBody } from './operations';

export type Finding = { code: string; severity: 'error' | 'warning' | 'info'; entityIds: string[]; position?: Vec; message: string; measured?: Record<string, number> };
export type Validation = { revision: string; findings: Finding[]; errors: number; warnings: number; waterGap: number | null; resolution: { roads: number; waterGap: number; footprintEdge: number; tolerance: number } };

function footprint(body: Body): Vec[] {
  if (body.collisionRects) return bodyParts(body).flatMap(footprint);
  const corners = body.corners(), points = [body.position, ...corners];
  for (let i = 0; i < corners.length; i++) { const a = corners[i], b = corners[(i + 1) % corners.length], steps = Math.ceil(dist(a, b) / 0.5); for (let j = 1; j < steps; j++) points.push(add(a, scale(sub(b, a), j / steps))); }
  return points;
}
function intersects(a: Vec, b: Vec, c: Vec, d: Vec) {
  const orient = (a: Vec, b: Vec, c: Vec) => cross(sub(b, a), sub(c, a));
  const on = (p: Vec, a: Vec, b: Vec) => Math.abs(orient(a, b, p)) < 1e-8 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0 || on(c, a, b) || on(d, a, b) || on(a, c, d) || on(b, c, d);
}
export function validateMap(document: MapDocument, compiled: CompiledMap = compileMap(document), world = new World(compiled)): Validation {
  const findings: Finding[] = [], { country, land } = compiled;
  const push = (code: string, entityIds: string[], message: string, position?: Vec, measured?: Record<string, number>, severity: Finding['severity'] = 'error') => findings.push({ code, severity, entityIds, message, position, measured });
  for (const [id, ring, refs] of [...[...land.landRegions,...document.terrainRegions,...document.accessAreas,...document.districtZones].map(r => [r.id,r.outline,[r.id,...(document.landRegions.find(l=>l.id===r.id) as { pointRefs?: string[] } | undefined)?.pointRefs ?? []]])] as [string, Vec[], string[]][]) {
    const area = Math.abs(ring.reduce((sum, a, i) => sum + cross(a, ring[(i + 1) % ring.length]), 0)) / 2;
    if (area < 1) push('degenerate-land', refs, `${id} has less than 1 m² area`, ring[0], { area });
    for (let i = 0; i < ring.length; i++) {
      if (dist(ring[i], ring[(i + 1) % ring.length]) < 0.1) push('degenerate-segment', refs.slice(i, i + 2), 'Shore segment is shorter than 0.1 m', ring[i]);
      for (let j = i + 2; j < ring.length; j++) {
        if (i === 0 && j === ring.length - 1) continue;
        if (intersects(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) push('self-intersecting-land', [id, ...refs], 'Non-adjacent shore segments intersect', ring[i]);
      }
    }
  }
  const seen = new Set([0, 7]);
  for (let pass = 0; pass < document.nodes.length; pass++) for (const road of country.COUNTRY_ROADS) if (seen.has(road.from) || seen.has(road.to)) { seen.add(road.from); seen.add(road.to); }
  for (const [i, id] of document.nodes.entries()) if (!seen.has(i)) push('disconnected-road', [id], 'Road node has no route to either fixed bridge', country.ROAD_NODES[i]);
  // Both lanes and centreline, not centre-point-only checks. Use actual definitions.
  const roads = [...compiled.city.roads.map(r => ({ ...r, points: [r.from, r.to], length: dist(r.from, r.to) })), ...country.COUNTRY_ROADS];
  for (const road of roads) {
    if (road.length < 1) { push('unusable-road', [road.id], 'Road is shorter than 1 m', road.points[0]); continue; }
    const reported = new Set<string>();
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], angle = Math.atan2(b.y - a.y, b.x - a.x), steps = Math.ceil(dist(a, b));
      for (let j = 1; j <= steps; j++) for (const lane of [-3, 0, 3]) for (const model of ['car', 'truck-loaded'] as const) {
        const p = add(add(a, scale(sub(b, a), j / steps)), vec(-Math.sin(angle) * lane, Math.cos(angle) * lane));
        const body = createVehicleBody(vehicleDefinition(model), p, angle);
        const wet = footprint(body).find(land.inOcean);
        if (wet && !reported.has(`water-${model}`)) { reported.add(`water-${model}`); push('road-enters-water', [road.id], `${model} footprint crosses ocean on lane ${lane} m`, wet, { lane, length: body.w, width: body.h }); }
        const obstacle = [...world.hash.query(body)].find(prop => isRigidObstacle(prop.kind) && prop.kind !== 'pedestrian-gate' && (contact(body, prop.body)?.depth ?? 0) > 0.04);
        if (obstacle && !reported.has(`solid-${model}`)) { reported.add(`solid-${model}`); push('road-blocked', [road.id, obstacle.sourceId ?? `runtime-prop-${obstacle.id}`], `${model} driving footprint intersects ${obstacle.label || obstacle.kind}`, p, { length: body.w, width: body.h }); }
      }
    }
  }
  const checkLand = (id: string, body: Body, land: (p: Vec) => boolean) => { const outside = footprint(body).find(p => !land(p)); if (outside) push('object-outside-land', [id], 'Composite footprint extends outside its intended land', outside, { length: body.w, width: body.h }); };
  const compiledBody = (object: CompiledObject) => { const b = new Body(object.position.x, object.position.y, 1, object.width, object.height); b.angle = object.angle; b.collisionRects = object.collision; return b; };
  // Attached features are resolved from local normalized offsets; report any that stray
  // beyond the allowed attachment band, naming the parent and stable feature ID. The
  // `service` role feeds the single city recovery entrance, so it is only consumed on
  // city buildings; elsewhere it would be silently inert, so report it by stable ID.
  // Sign features are drawn by the generic building renderer only when the building has
  // catalogue artwork and the feature carries a label. Validation can see the declared
  // catalogue artwork, not whether the browser decoded its image, so it reports the
  // inert combinations rather than promising a drawn label.
  const checkFeatures = (id: string, features: readonly ResolvedFeature[] | undefined, support: { service: boolean; sign: boolean }) => {
    for (const feature of features ?? []) {
      if (Math.abs(feature.offset.x) > 0.75 || Math.abs(feature.offset.y) > 0.75) push('feature-outside-bounds', [id, `${id}/${feature.id}`], `Attached ${feature.role} ${feature.id} lies outside its placement`, feature.position);
      if (feature.role === 'service' && !support.service) push('service-feature-unsupported', [id, `${id}/${feature.id}`], `Service feature ${feature.id} is only consumed by the city recovery entrance`, feature.position);
      if (feature.role === 'sign') {
        if (!feature.label?.trim()) push('sign-feature-unlabelled', [id, `${id}/${feature.id}`], `Sign feature ${feature.id} has no label, so the renderer draws nothing for it`, feature.position, undefined, 'warning');
        if (!support.sign) push('sign-feature-unsupported', [id, `${id}/${feature.id}`], `Sign feature ${feature.id} is only rendered for buildings with catalogue artwork`, feature.position);
      }
    }
  };
  for (const p of document.objectPlacements) {
    const object=compiled.objects[p.id],body=compiledBody(object);
    checkLand(p.id,body,q=>!land.inOcean(q));
    checkFeatures(p.id,object.features,{service:false,sign:object.kind==='building'&&!!object.artwork});
    if(world.pools.some(pool=>contact(body,pool)))push('pool-overlap',[p.id],'Object intersects a pool',p.position);
  }
  for (const building of compiled.city.buildings) checkFeatures(building.id, building.features, { service: true, sign: !!building.artwork });
  const vehiclePlacements = [...document.parking, ...document.trafficSpawns].map(e => ({ e, body: descriptorBody(e) }));
  for (const block of compiled.city.blocks) for (const home of block.residentHomes ?? []) {
    const body = new Body(home.x, home.y, 75, 0.7, 0.7);
    const solid = [...world.hash.query(body)].find(p => blocksWalking(p.kind) && contact(body, p.body));
    if (solid) push('resident-home-blocked', [block.id, solid.sourceId ?? `runtime-prop-${solid.id}`], 'Authored resident home overlaps a collision footprint', home);
    if (land.inOcean(home)) push('resident-home-water', [block.id], 'Authored resident home is in water', home);
  }
  for (const building of compiled.city.buildings) if (building.recoveryEntrance) {
    const p = building.recoveryEntrance, body = new Body(p.x, p.y, 75, 0.7, 0.7);
    const solid = [...world.hash.query(body)].find(prop => blocksWalking(prop.kind) && contact(body, prop.body));
    if (solid || land.inOcean(p)) push('recovery-entrance-blocked', [building.id], 'Recovery entrance must be clear and on dry land', p);
  }
  const checkVehicleClearance = (id: string, body: Body, code: string) => {
    const wet = footprint(body).find(land.inOcean);
    if (wet) push(code, [id], 'Vehicle footprint crosses water', wet);
    const prop = [...world.hash.query(body)].find(p => (contact(body, p.body)?.depth ?? 0) > 0.04);
    if (prop) push(code, [id, prop.sourceId ?? `runtime-prop-${prop.id}`], `Vehicle footprint intersects ${prop.label || prop.kind}`, body.position);
    const pool = world.pools.find(p => contact(body, p));
    if (pool) push(code, [id], 'Vehicle footprint intersects a pool', pool.position);
  };
  for (const { e, body } of vehiclePlacements) {
    checkVehicleClearance(e.id, body, 'spawn-blocked');
    const player = createVehicleBody(vehicleDefinition('car'), vec(4, 32), -Math.PI / 2);
    if (contact(body, player)) push('spawn-overlap', [e.id], 'Vehicle placement overlaps the starting taxi', e.position);
  }
  for (let i = 0; i < vehiclePlacements.length; i++) for (let j = i + 1; j < vehiclePlacements.length; j++) {
    const a = vehiclePlacements[i], b = vehiclePlacements[j];
    if ((contact(a.body, b.body)?.depth ?? 0) > 0.04) push('spawn-overlap', [a.e.id, b.e.id], 'Vehicle placements overlap (empty bays reserve space too)', a.e.position);
  }
  for (const spawn of document.trafficSpawns) {
    const access = country.countryAccess(spawn.position);
    if (world.navigation.roadDistance(spawn.position) > 6 || country.isCountry(spawn.position) && !world.navigation.access.areaAt(spawn.position) && !seen.has(access.road.from)) push('unreachable-spawn', [spawn.id], 'Traffic spawn lacks a reachable road lane', spawn.position);
    // Paths are waypoints, not a promise that AI can cross arbitrary water or
    // props. Sweep the actual model along every authored initial route leg.
    let from = spawn.position, reported = false;
    for (const to of spawn.path) {
      const distance = dist(from, to), angle = Math.atan2(to.y - from.y, to.x - from.x), steps = Math.ceil(distance);
      for (let i = 0; i <= steps && !reported; i++) {
        const q = add(from, scale(sub(to, from), i / (steps || 1))), body = createVehicleBody(vehicleDefinition(spawn.model), q, angle);
        if (footprint(body).some(land.inOcean) || [...world.hash.query(body)].some(p => (contact(body, p.body)?.depth ?? 0) > 0.04) || world.pools.some(p => contact(body, p))) {
          push('traffic-route-blocked', [spawn.id], 'Initial traffic route crosses water or a collision footprint', q); reported = true;
        }
      }
      from = to;
    }
  }
  for (const [i, villa] of country.VILLAS.entries()) {
    const p = villa.position;
    checkLand(villa.id, new Body(p.x, p.y, 1, 42, 34), country.inHighlands);
    const pool = country.VILLA_POOLS[i]; checkLand(villa.id, new Body(pool.position.x, pool.position.y, 1, pool.width, pool.height), country.inHighlands);
    const drive = country.VILLA_DRIVES[i]; let blocked: Vec | undefined;
    const angle = Math.atan2(drive[1].y - drive[0].y, drive[1].x - drive[0].x), steps = Math.ceil(dist(...drive as [Vec, Vec]));
    for (let j = 0; j <= steps; j++) { const q = add(drive[0], scale(sub(drive[1], drive[0]), j / (steps || 1))), body = createVehicleBody(vehicleDefinition('car'), q, angle); if (footprint(body).some(land.inOcean) || [...world.hash.query(body)].some(prop => isRigidObstacle(prop.kind) && prop.sourceId !== villa.id && (contact(body, prop.body)?.depth ?? 0) > 0.04)) { blocked = q; break; } }
    if (blocked) push('villa-drive-blocked', [villa.id], 'Car-sized access drive intersects water or another solid object', blocked);
  }
  const golf = country.GOLF_COURSE;
  checkLand(golf.id, new Body(golf.center.x, golf.center.y, 1, golf.width + 14, golf.height + 8), country.inHighlands);
  for (const p of [...country.GOLF_CART_ROUTE, ...country.GOLF_HOLES.flatMap(h => [h.tee, h.green, h.bunker])]) checkLand(golf.id, new Body(p.x, p.y, 1, 3, 3), country.inHighlands);
  const overlaps = new Set<string>();
  const placementIds = new Set(document.objectPlacements.filter(p => compiled.objects[p.id]?.kind !== 'pedestrian-gate').map(p => p.id));
  const ruleParents=new Map(compiled.boundaryPlacements.map(p=>[p.id,p.ruleId]));
  for (const prop of world.props.filter(p => p.sourceId && (isRigidObstacle(p.kind) || placementIds.has(p.sourceId)))) for (const other of world.hash.query(prop.body)) {
    if(prop.sourceId && other.sourceId && ruleParents.get(prop.sourceId) && ruleParents.get(prop.sourceId)===ruleParents.get(other.sourceId))continue;
    if (prop.kind === 'pedestrian-gate' || prop === other || prop.sourceId === other.sourceId || !placementIds.has(prop.sourceId!) && !isRigidObstacle(other.kind) || other.kind === 'pedestrian-gate') continue;
    const depth = contact(prop.body, other.body)?.depth ?? 0, ids = [prop.sourceId!, other.sourceId ?? `runtime-prop-${other.id}`].sort(), key = ids.join(':');
    if (depth > 0.04 && !overlaps.has(key)) { overlaps.add(key); push('object-overlap', ids, 'Authored solid overlaps another collision footprint (same-composite attachments are allowed)', prop.body.position, { penetration: depth }); }
  }
  for (const pool of world.pools) {
    const id = pool.sourceId;
    const solid = [...world.hash.query(pool)].find(p => isRigidObstacle(p.kind) && p.sourceId !== id && (contact(pool, p.body)?.depth ?? 0) > 0.04);
    if (solid) push('pool-overlap', [id, solid.sourceId ?? `runtime-prop-${solid.id}`], 'Pool or pond intersects another solid object', pool.position);
    if (pool.waterKind === 'pond') checkLand(id, pool, country.inHighlands);
  }
  for (const stop of country.HIGHLAND_STOPS) {
    const body = createVehicleBody(vehicleDefinition('car'), stop.position, 0), access = country.countryAccess(stop.position);
    if (access.distance > 6 || footprint(body).some(land.inOcean) || !seen.has(access.road.from)) push('unreachable-stop', [stop.id, stop.point], 'Fare destination lacks a dry reachable driving lane', stop.position, { roadDistance: access.distance });
    if (!world.props.some(p => p.sourceId === stop.id && p.kind === 'kiosk')) push('stop-clearing-unavailable', [stop.id], 'No dry kiosk clearing can be generated beside this stop', stop.position);
  }
  // Sweep authored access with actual bodies and shared water coverage. Runtime
  // refuses blocked edges too; invalid drafts are still inspectable here.
  const nodes=new Map(document.accessNodes.map(n=>[n.id,n]));
  for(const edge of document.accessEdges) for(const mode of edge.modes) {
    const a=nodes.get(edge.fromNode)!,b=nodes.get(edge.toNode)!;
    if(!world.navigation.access.clear(a.position,b.position,mode))push(mode==='walk'?'walking-entrance-blocked':'vehicle-access-blocked',[edge.id,a.id,b.id],`Required ${mode} connection crosses a collision footprint, restricted area or water`,a.position);
  }
  for(const area of document.accessAreas)if(!document.accessNodes.some(n=>contains(area.outline,n.position)))push('unconnected-access-area',[area.id],'Access area has no authored connection nodes',area.outline[0]);
  for(const node of document.accessNodes) {
    if(node.road && world.navigation.access.areaAt(node.position))push('access-road-inside-area',[node.id],'Road connection must end outside authored access areas',node.position);
    const reachable=new Set([node.id]);
    for(let i=0;i<nodes.size;i++)for(const e of document.accessEdges)if(e.modes.includes('walk')&&(reachable.has(e.fromNode)||reachable.has(e.toNode))){reachable.add(e.fromNode);reachable.add(e.toNode);}
    if(![...reachable].some(id=>nodes.get(id)!.road))push('disconnected-access',[node.id],'Walking node has no authored connection to a road',node.position);
    if(node.road && world.navigation.roadDistance(node.position)>6)push('unreachable-access-road',[node.id],'Road connection is not near a drivable road',node.position);
  }
  for(const resident of document.residents) {
    const body=new Body(resident.position.x,resident.position.y,75,.7,.7);
    if(footprint(body).some(land.inOcean)||[...world.hash.query(body)].some(p=>blocksWalking(p.kind)&&contact(body,p.body)))push('resident-home-blocked',[resident.id],'Resident home crosses water or a collision footprint',resident.position);
  }
  const env = document.envelope, outside = (p: Vec) => p.x < env.min.x - 0.001 || p.x > env.max.x + 0.001 || p.y < env.min.y - 0.001 || p.y > env.max.y + 0.001;
  for (const { e, body } of vehiclePlacements) {
    const p = footprint(body).find(outside); if (p) push('outside-envelope', [e.id], 'Vehicle footprint is outside the map envelope', p);
    if ('lot' in e) { const bay = new Body(e.position.x, e.position.y, 1, 5.4, 2.6); bay.angle = e.angle; const edge = footprint(bay).find(outside); if (edge) push('outside-envelope', [e.id], 'Parking marking is outside the map envelope', edge); checkLand(e.id, bay, q => !land.inOcean(q)); }
    if ('path' in e) { const q = e.path.find(outside); if (q) push('outside-envelope', [e.id], 'Traffic waypoint is outside the envelope', q); }
  }
  for (const p of document.points) if (outside(p.position)) push('outside-envelope', [p.id], 'Authored point is outside the map envelope', p.position);
  for (const prop of world.props) { const p = prop.body.corners().find(outside); if (p) push('outside-envelope', [prop.sourceId ?? `runtime-prop-${prop.id}`], 'Generated collision footprint is outside the map envelope', p); }
  for (const ridge of document.ridges) { const p = ridge.points.find(outside); if (p) push('outside-envelope', [ridge.id], 'Decorative ridge lies outside the envelope', p); }
  for(const region of [...land.landRegions,...document.terrainRegions,...document.accessAreas,...document.districtZones]) { const p=region.outline.find(outside);if(p)push('outside-envelope',[region.id],'Region is outside the map envelope',p); }
  for(const node of document.accessNodes)if(outside(node.position))push('outside-envelope',[node.id],'Access node is outside the envelope',node.position);
  let waterGap=Infinity;
  for(const constraint of document.constraints) {
    const a=land.landRegions.find(r=>r.id===constraint.fromLand)!,b=land.landRegions.find(r=>r.id===constraint.toLand)!;
    const gap=directedWaterGap(land,a.id,b.id,constraint.direction,constraint.resolution) ?? Infinity;
    waterGap=Math.min(waterGap,gap);
    push('water-gap',[constraint.id,constraint.fromLand,constraint.toLand],Number.isFinite(gap)?`Minimum directed water gap: ${gap.toFixed(1)} m (required ${constraint.minimum} m)`:'Cannot verify the directed water gap: no exposed water path from source to target land',a.outline[0],{gap:Number.isFinite(gap)?gap:-1,minimum:constraint.minimum},!Number.isFinite(gap)||gap<constraint.minimum?'error':gap<constraint.minimum+5?'warning':'info');
  }
  return { revision: compiled.revision, findings, errors: findings.filter(f => f.severity === 'error').length, warnings: findings.filter(f => f.severity === 'warning').length, waterGap: Number.isFinite(waterGap) ? waterGap : null, resolution: { roads: 1, waterGap: document.constraints[0]?.resolution ?? 1, footprintEdge: 0.5, tolerance: 0.04 } };
}

import { Game } from '../game';
import { contact, dist, vec } from '../physics';
import { createVehicleBody, vehicleDefinition } from '../vehicles/vehicles';
import { compileMap } from './compile';
import { entityPosition } from './operations';
import type { MapDocument } from './schema';
import { validateMap } from './validation';

export function createPreview(document: MapDocument, spawnId = 'fairway-club') {
  const map = compileMap(document), result = validateMap(document, map);
  if (result.errors) throw new Error(`Preview blocked by ${result.errors} map errors. Fix the findings first.`);
  const requested = entityPosition(document, spawnId);
  if (!requested) throw new Error(`Unknown preview spawn: ${spawnId}`);
  const game = new Game(map, false, false), p = game.world.navigation.roadProjection(requested);
  const candidates = [p, ...map.country.countryAccess(p).road.points.filter(q => Math.hypot(q.x - p.x, q.y - p.y) < 20)];
  const spawn = candidates.map(position => {
    const access = map.country.countryAccess(position), a = access.road.points[Math.max(0, access.segment - 1)], b = access.road.points[access.segment], angle = Math.atan2(b.y - a.y, b.x - a.x);
    return { position, angle, body: createVehicleBody(vehicleDefinition('car'), position, angle) };
  }).find(({ body }) => !body.corners().some(map.land.inOcean) && ![...game.world.hash.query(body)].some(p => contact(body, p.body)) && !game.world.pools.some(p => contact(body, p)) && !game.vehicles.some(v => v !== game.player && contact(body, v.body)));
  if (!spawn) throw new Error('No clear car-sized preview spawn within 20 m of selected road access');
  game.player.body.position = { ...spawn.position }; game.player.body.angle = spawn.angle; game.player.body.velocity = vec();
  game.settings.noPolice = true;
  // A real customer/job on the relocated loop makes access and fare QA useful.
  const pickup = map.country.HIGHLAND_STOPS.find(s => s.id === spawnId) ?? map.country.HIGHLAND_STOPS.find(s => s.id === 'woodland-estates') ?? map.country.HIGHLAND_STOPS[0];
  const dropoff = map.country.HIGHLAND_STOPS.find(s => s.id !== pickup.id && s.owner === 'southern-estates');
  if (pickup && dropoff) {
    const old = game.world.people.find(p => p.id === game.job.customerId); if (old) old.alive = false;
    const customer = game.world.addPerson(vec(pickup.position.x + 3.4, pickup.position.y), 'customer', '#efc86b');
    game.job = { type: 'fare', pickup: { ...pickup.position }, dropoff: { ...dropoff.position }, name: 'Map reviewer', destination: dropoff.name, fare: 80, time: 180, elapsed: 0, comfort: 100, stage: 'pickup', wait: 0, customerId: customer.id };
    const ahead = game.world.navigation.roadPath(spawn.position, dropoff.position).find(p => dist(p, spawn.position) > 3);
    if (ahead) {
      const angle = Math.atan2(ahead.y - spawn.position.y, ahead.x - spawn.position.x), probe = createVehicleBody(vehicleDefinition('car'), spawn.position, angle);
       if (!probe.corners().some(map.land.inOcean) && ![...game.world.hash.query(probe)].some(p => contact(probe, p.body)) && !game.world.pools.some(p => contact(probe, p)) && !game.vehicles.some(v => v !== game.player && contact(probe, v.body))) game.player.body.angle = angle;
    }
  }
  game.start(); return game;
}

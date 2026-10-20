import { defaultCompiledMap } from './map/compile';
import { describe, expect, it } from 'vitest';
import { igniteVehicle } from './vehicles/damage';
import { Game } from './game';
import { dist, vec } from './physics';

const HOSPITAL=defaultCompiledMap.city.recovery!;
const { HIGHLAND_STOPS } = defaultCompiledMap.country;

describe('hospital dispatch after a distant explosion', () => {
  it.each(HIGHLAND_STOPS)('offers a hospital-area pickup after dying at $name', stop => {
    const game = new Game();
    game.start();
    game.settings.noPolice = true;
    game.vehicles = game.vehicles.filter(vehicle => vehicle === game.player || vehicle.parked);
    game.player.body.position = { ...stop.position };
    game.player.body.velocity = vec();
    const wreck = game.player;
    const cash = game.save.cash;
    igniteVehicle(wreck.damage, 0.001);
    game.update(1 / 120);
    expect(game.mode).toBe('wasted');
    const crashPosition = { ...wreck.body.position };

    game.recover();
    expect(game.actor.position).toEqual(HOSPITAL);
    expect(game.onFoot).toBe(true);
    expect(wreck.body.position).toEqual(crashPosition);
    expect(wreck.damage.status).toBe('wreck');
    expect(game.save.cash).toBe(cash - Math.min(cash, 110));
    expect(game.job.stage).toBe('pickup');
    expect(game.job.pickup).toEqual(vec(164, 108));
    expect(dist(game.job.pickup, game.actor.position)).toBeLessThan(160);

    // Taking another car must keep the nearby offer, not send the driver back to the wreck.
    const replacement = game.nearestCar!;
    const pickup = { ...game.job.pickup };
    game.driver.position = replacement.body.toWorld(vec(0, 2));
    expect(game.interact()).toBe(true);
    expect(game.player).toBe(replacement);
    expect(game.job.pickup).toEqual(pickup);
  });
});

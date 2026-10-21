import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { contact, vec } from '../physics/physics';
import { inspectPoint } from '../debug/inspection';

function fixture(hole: number) {
  const g = new Game(undefined, false); g.start(); g.settings.noPolice = true;
  g.vehicles = [g.player]; g.trafficTarget = 0; g.world.people = [];
  const flag = g.world.props.find(p => p.sourceId === `fairway-flag-${hole}`)!;
  return { g, flag };
}

describe('physical golf hole flags', () => {
  it.each([1, 2, 3])('drives over hole %s and leaves its broken flag nonblocking', hole => {
    const { g, flag } = fixture(hole), p = flag.body.position;
    expect(flag.kind).toBe('golf-flag'); expect(flag.hp).toBe(3);
    expect(p).toEqual(g.map.country.GOLF_HOLES[hole - 1].green);
    expect(inspectPoint(g, p).hits.some(hit => hit.id === flag.sourceId && hit.kind === 'golf-flag')).toBe(true);
    g.player.body.position = vec(p.x - 6, p.y); g.player.body.angle = 0;
    g.player.body.velocity = vec(10, 0); g.keys.add('KeyW');
    for (let i = 0; i < 120; i++) g.update(1 / 120);
    expect(flag.alive).toBe(false); expect(flag.hp).toBeLessThanOrEqual(0);
    expect(flag.brokenAt).toBeGreaterThanOrEqual(0); expect(g.smashed).toBe(1);
    expect(g.player.body.position.x).toBeGreaterThan(p.x + 1);
    expect(g.player.alive).toBe(true); expect(g.mode).toBe('playing');
    expect([...g.world.hash.query(flag.body)]).not.toContain(flag);
    // Repeated solver passes cannot award another smash for the fallen pole.
    g.collision(g.player, flag, 1 / 120); expect(g.smashed).toBe(1);
  });

  it('keeps an intact pole after a gentle bump', () => {
    const { g, flag } = fixture(3), p = flag.body.position;
    g.player.body.position = vec(p.x - g.player.body.w / 2, p.y);
    g.player.body.angle = 0; g.player.body.velocity = vec(1, 0);
    expect(contact(g.player.body, flag.body)).not.toBeNull();
    g.collision(g.player, flag, 1 / 120);
    expect(flag.alive).toBe(true); expect(flag.hp).toBe(3); expect(g.smashed).toBe(0);
  });
});

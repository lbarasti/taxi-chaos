import { describe, expect, it } from 'vitest';
import { Body, contact, vec } from './physics';
import { World } from './world';
import { cityRoofs, cityWealth, type CityRoof } from './city-neighbourhoods';
import { artworkFor } from './artwork/catalogue';
import { occluderFor, pointInConvex } from './lighting-occlusion';

const roofs = Object.keys(cityRoofs) as CityRoof[];
describe('city neighbourhoods and physical architecture', () => {
  it('clusters wealth over adjacent blocks and covers all three levels', () => {
    const counts = new Map<string, number>();
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      const wealth = cityWealth(x, y);
      counts.set(wealth, (counts.get(wealth) ?? 0) + 1);
      expect([[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b]) => a >= 0 && a < 6 && b >= 0 && b < 6 && cityWealth(a,b) === wealth)).toBe(true);
    }
    expect(counts.size).toBe(3);
    expect([...counts.values()].every(n => n >= 8)).toBe(true);
  });
  it('places every new roof family across the city, with stable unique IDs and bounded wings', () => {
    const a = new World(), b = new World();
    expect(new Set(a.props.filter(p => p.cityLot).map(p => p.cityLot!.roof))).toEqual(new Set(roofs));
    expect(a.props.map(p => [p.sourceId, p.body.position, p.cityLot])).toEqual(b.props.map(p => [p.sourceId, p.body.position, p.cityLot]));
    expect(a.random()).toBe(b.random());
    const ids = a.props.filter(p => p.cityLot).map(p => p.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of a.props.filter(p => p.cityLot)) {
      const shape = cityRoofs[p.cityLot!.roof], part = shape.parts[p.cityLot!.part];
      const cx = p.body.position.x - part.x, cy = p.body.position.y - part.y;
      for (const corner of p.body.corners()) {
        expect(Math.abs(corner.x - cx)).toBeLessThanOrEqual(5);
        expect(Math.abs(corner.y - cy)).toBeLessThanOrEqual(5);
      }
      expect([...a.hash.query(p.body)]).toContain(p);
      const art = artworkFor(p)!;
      expect(art.hidden).toBe(p.cityLot!.part > 0);
      expect(art.bounds.x + p.body.position.x).toBe(cx - 5);
      expect(art.bounds.y + p.body.position.y).toBe(cy - 5);
    }
  });
  it.each(roofs)('%s has real empty recesses and matching convex headlight masks', roof => {
    const world = new World();
    const primary = world.props.find(p => p.cityLot?.roof === roof && p.cityLot.part === 0)!;
    const prefix = primary.sourceId!;
    const parts = world.props.filter(p => p.sourceId === prefix || p.sourceId?.startsWith(`${prefix}-wing-`));
    const base = cityRoofs[roof].parts[0];
    const center = vec(primary.body.position.x - base.x, primary.body.position.y - base.y);
    const u = roof === 'courtyard' || roof === 'limestone';
    const l = roof === 'workshop' || roof === 'copper';
    const recess = vec(center.x + (l ? 2 : u ? 0 : 3.5), center.y + (u ? -2 : 2));
    const pedestrian = new Body(recess.x, recess.y, 80, 0.7, 0.7);
    for (const p of parts) {
      expect(contact(pedestrian, p.body)).toBeNull();
      const mask = occluderFor(p, artworkFor(p)!.occluder)!;
      expect(pointInConvex(recess, mask.points)).toBe(false);
      expect(contact(new Body(p.body.position.x, p.body.position.y, 80, 0.7, 0.7), p.body)).not.toBeNull();
    }
    if (u || l) {
      // Full taxi body fits the courtyard, facing along its entrance.
      const taxi = new Body(recess.x, recess.y, 1000, 4.2, 2.1); taxi.angle = Math.PI / 2;
      expect(parts.every(p => !contact(taxi, p.body))).toBe(true);
    }
  });
});

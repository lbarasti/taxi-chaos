import { describe, expect, it } from 'vitest';
import { defaultCompiledMap } from '../map/compile';
import { compileStops } from './stops';

const stops = (list: unknown[]) => ({ schemaVersion: 1, stops: list });
const point = (x: number, y: number) => ({ x, y });
const city = (id: string, x: number, y: number) => ({ id, name: id, kind: 'city', position: point(x, y) });

describe('authored stop registry', () => {
  it('merges authored city/beach stops with the map highland stops, preserving legacy order', () => {
    const compiled = compileStops(
      stops([city('old-town-rank', 4, 14), city('dockside-deli', 44, 14), { id: 'sunset-beach', name: 'Sunset Beach', kind: 'beach', position: point(40, 240) }]),
      defaultCompiledMap,
    );
    expect(Object.keys(compiled.byId)).toContain('old-town-rank');
    expect(compiled.byId['poble-sec']).toMatchObject({ name: 'Poble-sec', kind: 'highland' });
    expect(compiled.city).toEqual([point(4, 14), point(44, 14)]);
    expect(compiled.routeStops.slice(0, 2)).toEqual([point(4, 14), point(44, 14)]);
    // Highland destinations come first, then the authored beach labels.
    expect(compiled.destinations.map(d => d.name)).toEqual([
      'Poble-sec', 'Parc del Mirador', 'Les Tres Xemeneies', 'Plaça del Sol', 'Woodland Estates', 'Fairway Club', 'Cedar Crescent', 'Sunset Beach',
    ]);
  });

  it('rejects invalid ids, duplicates, out-of-envelope and water points', () => {
    expect(() => compileStops(stops([city('ok', 4, 14), { ...city('ok', 44, 14) }]), defaultCompiledMap)).toThrow(/duplicate stop id/);
    expect(() => compileStops(stops([{ ...city('old-town-rank', 4, 14), kind: 'air' }]), defaultCompiledMap)).toThrow(/kind/);
    expect(() => compileStops(stops([city('nowhere', 9999, 4)]), defaultCompiledMap)).toThrow(/envelope/);
    expect(() => compileStops(stops([city('drowned', 0, 300)]), defaultCompiledMap)).toThrow(/open water/);
  });

  it('rejects points without road clearance and inside static props', () => {
    expect(() => compileStops(stops([city('mid-block', 14, 14)]), defaultCompiledMap)).toThrow(/drivable road/);
    const prop = defaultCompiledMap.document.countryProps[0];
    expect(() => compileStops(stops([city('on-a-tree', prop.position.x, prop.position.y)]), defaultCompiledMap)).toThrow(/overlaps a static prop/);
  });
});

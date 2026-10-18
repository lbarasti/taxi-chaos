import { Body, clamp, vec, type TyreLayout, type Vec } from './physics';
import { defaultMap } from './map/default';
import type { MapDocument } from './map/schema';
import { objectDefinitions } from './artwork/catalogue';
import { compileObjectPlacement } from './catalogue/compile';
import type { CompiledObject, ObjectCatalogue } from './catalogue/schema';

export type SandHandling = { coverage: number; drive: number; grip: number; rollingDrag: number; lateralAcceleration: number };
export function createBeach(document: MapDocument, catalogue: ObjectCatalogue = objectDefinitions, compiledObjects?: Readonly<Record<string, CompiledObject>>) {

// Screen south is +y. This shore widens to the west and tapers into Ocean Walk
// to the east. The opposite woodland shore sits across an open-water inlet.
const { left, right, top } = document.beach;
const BEACH = { left, right, top };
const BEACH_SHORE = document.beach.shore.map(id => ({ ...document.points.find(p => p.id === id)!.position }));
const BEACH_OUTLINE = [vec(BEACH.left, BEACH.top), vec(BEACH.right, BEACH.top), ...[...BEACH_SHORE].reverse()];
function beachShoreY(x: number): number {
  for (let i = 1; i < BEACH_SHORE.length; i++) {
    const a = BEACH_SHORE[i - 1], b = BEACH_SHORE[i];
    if (x <= b.x) return a.y + (b.y - a.y) * clamp((x - a.x) / (b.x - a.x), 0, 1);
  }
  return BEACH_SHORE.at(-1)!.y;
}
const inBeach = (p: Vec) => p.x >= BEACH.left && p.x <= BEACH.right && p.y >= BEACH.top && p.y <= beachShoreY(p.x);
const PROMENADE = structuredClone(document.beach.promenade);
const onPromenade = (p: Vec) => p.x >= PROMENADE.left && p.x <= PROMENADE.right && p.y >= PROMENADE.top && p.y <= PROMENADE.bottom;
const inSand = (p: Vec) => inBeach(p) && !onPromenade(p);
const beachAccess = (p: Vec) => vec(clamp(p.x, 0, 240), 240);
// The narrow sand behind the hotel wall is pedestrian access, not a vehicle
// bypass. Vehicle destinations here are approached from the south street.
const beachVehicleTarget = (p: Vec) => inBeach(p) && p.x >= PROMENADE.left - 3 && p.y >= PROMENADE.top ? beachAccess(p) : p;
function beachAccessPath(p: Vec): Vec[] {
  if (onPromenade(p)) {
    const entry = PROMENADE_ENTRIES.reduce((a, b) => Math.abs(a + 0.675 - p.x) < Math.abs(b + 0.675 - p.x) ? a : b) + 0.675;
    return [p, vec(entry, p.y), vec(entry, 240)];
  }
  if (p.x >= PROMENADE.left - 30 && p.y >= PROMENADE.top) {
    if (p.x > PROMENADE.right && p.y < PROMENADE.bottom + 1.6) return [p, vec(p.x, 244), vec(240, 244), vec(240, 240)];
    const entry = PROMENADE_SOUTH_ENTRIES.reduce((a, b) => Math.abs(a + 0.675 - p.x) < Math.abs(b + 0.675 - p.x) ? a : b) + 0.675;
    // Walk along the front apron or the remaining surf strip, then through a
    // genuine gap between the buildings. Never route through a podium.
    const inGap = BEACH_HOTELS.every(h => p.x < h.position.x - h.width / 2 - 0.4 || p.x > h.position.x + h.width / 2 + 0.4);
    const y = p.y < PROMENADE.bottom + 1.6 || inGap ? p.y : Math.max(p.y, Math.max(...BEACH_HOTELS.map(h => h.position.y + h.height / 2)) + 0.45);
    return [p, vec(p.x, y), vec(entry, y), vec(entry, 240)];
  }
  const x = clamp(p.x, 0, 240);
  return [p, vec(x, p.y), vec(x, 240)];
}
const BEACH_STOPS = [
  { position: vec(40, 240), name: 'Sunset Beach' },
  { position: vec(160, 240), name: 'Ocean Walk' },
  { position: vec(200, 240), name: 'Pacific Palm Hotel' },
];
// Compatibility fixture location follows the authored bay. A deleted bay does
// not respawn a pickup; the fallback only supplies a LAB camera location.
const BEACH_PICKUP = { ...(document.parking.find(p => p.owner === 'beach' && p.model === 'pickup')?.position ?? vec(28, 249.5)) };
const BEACH_HOTELS = document.beach.hotels.map(hotel => {
  // Beach buildings resolve through the same generic object catalogue passed down from
  // `compileMap`; strict `assertMap` already rejected unknown types and wrong kinds.
  // When the map compiler already resolved this placement, reuse that detached object
  // instead of compiling the hotel a second time.
  const type = hotel.type ?? 'hotel';
  const object = compiledObjects?.[hotel.id] ?? compileObjectPlacement({ id: hotel.id, type, position: hotel.position, angle: 0, width: hotel.width, height: hotel.height, features: hotel.features }, catalogue);
  return { ...structuredClone(hotel), width: object.width, height: object.height, artwork: object.artwork, presentation: object.presentation, features: object.features };
});
const LIFEGUARD_TOWERS = document.beach.towers.map(t => ({ ...t.position }));
const BEACH_SETS = document.beach.sets.map(t => ({ ...t.position }));
const SAND_CASTLES = document.beach.castles.map(t => ({ ...t.position }));

// Raised edging has regular pedestrian openings. 0.75 m clear gaps admit the
// 0.7 m walking body, while even the 0.8 m road bike cannot squeeze through.
const PROMENADE_ENTRIES = PROMENADE.entries;
const PROMENADE_SOUTH_ENTRIES = PROMENADE.southEntries;
const PROMENADE_EDGES: { position: Vec; width: number }[] = [];
const PROMENADE_BOLLARDS: Vec[] = [];
// Vehicle collision envelopes for each entrance's bollard group. Resolving tiny
// adjacent posts independently can squeeze a driven bike through an undersized
// gap; walkers still collide with the actual posts, not these group envelopes.
const PROMENADE_GATES: { position: Vec; width: number; angle: number }[] = [];
for (const y of [PROMENADE.top, PROMENADE.bottom]) {
  let start = PROMENADE.left;
  for (const x of y === PROMENADE.top ? PROMENADE_ENTRIES : PROMENADE_SOUTH_ENTRIES) {
    PROMENADE_GATES.push({ position: vec(x, y), width: 4.8, angle: 0 });
    const end = x - 2.4;
    PROMENADE_EDGES.push({ position: vec((start + end) / 2, y), width: end - start });
    for (const dx of [-1.35, 0, 1.35]) PROMENADE_BOLLARDS.push(vec(x + dx, y));
    start = x + 2.4;
  }
  PROMENADE_EDGES.push({ position: vec((start + PROMENADE.right) / 2, y), width: PROMENADE.right - start });
}
for (const x of [PROMENADE.left, PROMENADE.right]) {
  PROMENADE_GATES.push({ position: vec(x, (PROMENADE.top + PROMENADE.bottom) / 2), width: PROMENADE.bottom - PROMENADE.top, angle: Math.PI / 2 });
  for (let y = PROMENADE.top; y <= PROMENADE.bottom; y += 1.35) PROMENADE_BOLLARDS.push(vec(x, y));
}

/** Each tyre samples the same sand polygon used by drawing and drowning. Mixed
 * surfaces blend continuously; model aptitude comes from the vehicle catalogue. */
function sandHandling(body: Body, tyres: readonly TyreLayout[], aptitude: number): SandHandling {
  const coverage = tyres.filter(t => inSand(body.toWorld(t))).length / Math.max(1, tyres.length);
  const ability = clamp(aptitude, 0, 1);
  return {
    coverage,
    drive: 1 - coverage * (0.55 - ability * 0.43),
    grip: 1 - coverage * (0.78 - ability * 0.6),
    rollingDrag: coverage * (270 - ability * 215),
    lateralAcceleration: coverage ? (1.5 + ability * 4) / coverage : Infinity,
  };
}
return { BEACH, BEACH_SHORE, BEACH_OUTLINE, beachShoreY, inBeach, PROMENADE, onPromenade, inSand, beachAccess, beachVehicleTarget, beachAccessPath, BEACH_STOPS, BEACH_PICKUP, BEACH_HOTELS, LIFEGUARD_TOWERS, BEACH_SETS, SAND_CASTLES, PROMENADE_ENTRIES, PROMENADE_SOUTH_ENTRIES, PROMENADE_EDGES, PROMENADE_BOLLARDS, PROMENADE_GATES, sandHandling };
}
export type Beach = ReturnType<typeof createBeach>;
export const { BEACH, BEACH_SHORE, BEACH_OUTLINE, beachShoreY, inBeach, PROMENADE, onPromenade, inSand, beachAccess, beachVehicleTarget, beachAccessPath, BEACH_STOPS, BEACH_PICKUP, BEACH_HOTELS, LIFEGUARD_TOWERS, BEACH_SETS, SAND_CASTLES, PROMENADE_ENTRIES, PROMENADE_SOUTH_ENTRIES, PROMENADE_EDGES, PROMENADE_BOLLARDS, PROMENADE_GATES, sandHandling } = createBeach(defaultMap);

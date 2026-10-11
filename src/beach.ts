import { Body, clamp, vec, type TyreLayout, type Vec } from './physics';

// Screen south is +y. This shore widens to the west and tapers into Ocean Walk
// to the east, leaving the woodland inlet and its existing villas intact.
export const BEACH = { left: -42, right: 254, top: 246 };
export const BEACH_SHORE = [vec(-42, 264), vec(-22, 271), vec(32, 274), vec(108, 270), vec(162, 266), vec(214, 262), vec(254, 260)];
export const BEACH_OUTLINE = [vec(BEACH.left, BEACH.top), vec(BEACH.right, BEACH.top), ...[...BEACH_SHORE].reverse()];
export function beachShoreY(x: number): number {
  for (let i = 1; i < BEACH_SHORE.length; i++) {
    const a = BEACH_SHORE[i - 1], b = BEACH_SHORE[i];
    if (x <= b.x) return a.y + (b.y - a.y) * clamp((x - a.x) / (b.x - a.x), 0, 1);
  }
  return BEACH_SHORE.at(-1)!.y;
}
export const inBeach = (p: Vec) => p.x >= BEACH.left && p.x <= BEACH.right && p.y >= BEACH.top && p.y <= beachShoreY(p.x);
export const PROMENADE = { left: 146, right: 252, top: 247, bottom: 256 };
export const onPromenade = (p: Vec) => p.x >= PROMENADE.left && p.x <= PROMENADE.right && p.y >= PROMENADE.top && p.y <= PROMENADE.bottom;
export const inSand = (p: Vec) => inBeach(p) && !onPromenade(p);
export const beachAccess = (p: Vec) => vec(clamp(p.x, 0, 240), 240);
export function beachAccessPath(p: Vec): Vec[] {
  if (onPromenade(p)) {
    const entry = PROMENADE_ENTRIES.reduce((a, b) => Math.abs(a + 0.675 - p.x) < Math.abs(b + 0.675 - p.x) ? a : b) + 0.675;
    return [p, vec(entry, p.y), vec(entry, 240)];
  }
  if (p.x >= PROMENADE.left && p.y >= PROMENADE.top) {
    const y = Math.max(p.y, PROMENADE.bottom + 0.9);
    return [p, vec(p.x, y), vec(144, y), vec(144, 240)];
  }
  const x = clamp(p.x, 0, 240);
  return [p, vec(x, p.y), vec(x, 240)];
}
export const BEACH_STOPS = [
  { position: vec(40, 240), name: 'Sunset Beach' },
  { position: vec(160, 240), name: 'Ocean Walk' },
  { position: vec(200, 240), name: 'Pacific Palm Hotel' },
];
export const BEACH_PICKUP = vec(28, 249.5);
export const BEACH_HOTELS = [
  { position: vec(141, 226), name: 'THE SANDPIPER', color: '#e4c391' },
  { position: vec(181, 226), name: 'PACIFIC PALM HOTEL', color: '#b2d4cb' },
  { position: vec(221, 226), name: 'OCEAN SUNSET SUITES', color: '#dfa7a0' },
];
export const LIFEGUARD_TOWERS = [vec(-18, 263), vec(52, 263), vec(120, 261)];
export const BEACH_SETS = [vec(8, 257), vec(32, 258), vec(76, 256), vec(98, 258), vec(136, 258)];
export const SAND_CASTLES = [vec(-2, 267), vec(40, 268), vec(86, 267), vec(130, 266)];

// Raised edging has regular pedestrian openings. 0.75 m clear gaps admit the
// 0.7 m walking body, while even the 0.8 m road bike cannot squeeze through.
export const PROMENADE_ENTRIES = [160, 180, 200, 220, 240];
export const PROMENADE_EDGES: { position: Vec; width: number }[] = [];
export const PROMENADE_BOLLARDS: Vec[] = [];
// Vehicle collision envelopes for each entrance's bollard group. Resolving tiny
// adjacent posts independently can squeeze a driven bike through an undersized
// gap; walkers still collide with the actual posts, not these group envelopes.
export const PROMENADE_GATES: { position: Vec; width: number; angle: number }[] = [];
for (const y of [PROMENADE.top, PROMENADE.bottom]) {
  let start = PROMENADE.left;
  for (const x of PROMENADE_ENTRIES) {
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

export type SandHandling = { coverage: number; drive: number; grip: number; rollingDrag: number; lateralAcceleration: number };
/** Each tyre samples the same sand polygon used by drawing and drowning. Mixed
 * surfaces blend continuously; model aptitude comes from the vehicle catalogue. */
export function sandHandling(body: Body, tyres: readonly TyreLayout[], aptitude: number): SandHandling {
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

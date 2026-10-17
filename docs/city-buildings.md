# City building scale

City buildings use a mix of 10 × 10 m shops, 23 × 10 m commercial rows,
10 × 23 m commercial buildings and a 23 × 23 m Garden Court landmark.
Midtown Hospital occupies two adjacent city blocks and the street between them:
a 26 × 66 m collision footprint inside a 28 × 68 m continuous site.
The taxi remains 4.2 × 2.1 m. The surrounding streets stay on their 40 m grid.

`src/city.ts` compiles the fixed, read-only city with each map. Its stable
building IDs, footprints, roof silhouettes, campuses, open road segments and block alley directions are
recursively frozen. World collisions, the editor, roof rendering, lighting and
the minimap consume that geometry. The existing map document schema is unchanged.

Reusable types live in `src/buildings.ts`; unique placements, campuses, resident
homes, furniture and the recovery entrance live in `src/city-content.ts`.
See [building-authoring.md](building-authoring.md) for the authoring workflow.
Gameplay and rendering consume compiled definitions and footprints, rather than
hospital labels, placement IDs or exact dimensions.

Most ordinary blocks keep one 3 m alley. Old Town's garage keeps both original
shortcuts. The café, newsroom and story hotel keep their small frontages and
positions. Service yards, parks and public parking retain their layouts. The
hospital replaces the northern Midtown Exchange plot and its own southern plot.
The intervening east/west street, its crosswalk arms, internal curbs and roadside
clutter are removed; its two parking bays keep their IDs and move to the north
perimeter. The recovery entrance and replacement-car bay remain to the south.
Hospital residents and props use the outer sidewalks. Other clutter occupies
retained alleys, and residents of enlarged ordinary buildings start beyond the
south wall. Layout compilation and roof rendering consume no gameplay RNG draws.

Routing prefers the existing simple paths where valid. Paths crossing the
hospital site use the compiled open-road graph instead; traffic neighbour
selection cannot choose the absorbed edge, and the former road is no longer
reported as drivable. Street access connects offset lanes directly to the detour
without backtracking through intersection centres. Interior hospital targets
resolve to an outer road, while invalid starts inside it hold position. Both
CLI and editor validation sweep actual car/truck bodies along open city roads
as well as countryside roads. The hospital roof has three ward sections and a
glazed spine in its procedural fallback. The normal appearance uses the
user-supplied hospital roof, extended vertically to fit the two-block site;
see [hospital-artwork.md](hospital-artwork.md) for its source and adaptation prompt.

Ordinary large roofs are drawn as continuous structures with doors, glazing, skylights
and HVAC kept at metre scale. Their membrane texture reuses a cropped section
of the embedded shop artwork, cached once per image and canvas context; it adds
no extra asset or network dependency. The hospital PNG is also embedded in the
standalone HTML. Procedural rendering remains available when images fail;
asset attribution includes the supplied hospital image and its adaptation.

Validation:

- `npm test`: includes frozen geometry, story frontages/RNG, merged building
  overlaps, real car/truck sweeps on streets and alleys, and a physical hospital
  collision. Physical car and loaded-truck detours must finish at full health
  without recovery; each receives a full 60-second simulation budget. Hospital
  recovery measures distance to its wall, not its centre.
- `npm run build`: strict TypeScript and standalone production build.
- `npm run map:check`: shared map validation including occupied and empty bays.
- `node tools/city-scale-check.mjs`: offline production screenshots at 1440×900,
  390×844 and 844×390; uninterrupted physical drives across both city axes;
  console, external request and overflow checks in disposable browser contexts.
- `node tools/artwork-check.mjs`: image failure fallback, day/night lighting,
  deterministic physical driving and destructible artwork.

Screenshots are in `docs/screenshots/city-building-scale/`.

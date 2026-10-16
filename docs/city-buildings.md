# City building scale

City buildings use a mix of 10 × 10 m shops, 23 × 10 m commercial rows,
10 × 23 m commercial buildings and 23 × 23 m landmarks. The taxi remains
4.2 × 2.1 m and streets remain on their 40 m grid. Joined plots occupy the
original outer building boundary, retaining sidewalk and road clearances.

`src/city.ts` compiles the fixed, read-only city with each map. Its stable
building IDs, footprints, roof silhouettes and block alley directions are
recursively frozen. World collisions, the editor, roof rendering, lighting and
the minimap consume that geometry. The existing map document schema is unchanged.

Most ordinary blocks keep one 3 m alley. Old Town's garage keeps both original
shortcuts. The café, newsroom and story hotel keep their small frontages and
positions. Service yards, parks and public parking retain their layouts. Midtown
Exchange, Midtown Hospital and Garden Court occupy whole building plots.
Clutter is placed only in retained alleys, and pedestrians beside enlarged
buildings start on the sidewalk beyond the south wall. Layout compilation and
roof rendering consume no gameplay RNG draws.

Large roofs are drawn as continuous structures with doors, glazing, skylights
and HVAC kept at metre scale. Their membrane texture reuses a cropped section
of the embedded shop artwork, cached once per image and canvas context; it adds
no asset or network dependency. Procedural rendering remains available when
images fail. Existing asset attribution remains in place.

Validation:

- `npm test`: includes frozen geometry, story frontages/RNG, merged building
  overlaps, real car/truck sweeps on streets and alleys, and a physical hospital
  collision. Hospital recovery measures distance to its wall, not its centre.
- `npm run build`: strict TypeScript and standalone production build.
- `npm run map:check`: shared map validation including occupied and empty bays.
- `node tools/city-scale-check.mjs`: offline production screenshots at 1440×900,
  390×844 and 844×390; uninterrupted physical drives across both city axes;
  console, external request and overflow checks in disposable browser contexts.
- `node tools/artwork-check.mjs`: image failure fallback, day/night lighting,
  deterministic physical driving and destructible artwork.

Screenshots are in `docs/screenshots/city-building-scale/`.

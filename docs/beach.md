# Sunset Beach / Ocean Walk

A 296 m sandy shoreline extends the south side of the city. The western beach is
open and informal, with a volleyball court, pastel lifeguard huts, colourful beach
setups and sand castles. Heading east, the shore narrows into a tiled, palm-lined
promenade with three hotels, surf rentals, cafés, benches and strolling pedestrians.
The existing south street provides access and fare pickup/drop-off points.

## Aesthetic research before implementation

- [Los Angeles County: Venice Beach](https://beaches.lacounty.gov/venice-beach/): the long shoreline, Ocean Front Walk, volleyball, vendors and beach activity informed the overall layout and informal western court.
- [City of Los Angeles: Venice Beach Recreation Center / Ocean Front Walk](https://recreation.parks.lacity.gov/reccenter/venice-beach): the mix of walking, skating, recreation and beach sports informed the active promenade.
- [Venice Beach photograph / pastel lifeguard tower](https://www.getyourguide.com/venice-beach-l3919/): wide warm sand and the pale-blue raised hut informed the numbered pastel towers, wooden decks/ramps and rescue floats.
- [Venice Beach boardwalk photographs](https://www.hotels.com/go/usa/venice-beach-boardwalk-los-angeles): palm clusters, concrete walking paths, bright beach frontage and golden sand informed the transition to Ocean Walk.
- [Venice Beach Hotels](https://www.venicebeachhotels.com/) and [Venice on the Beach Hotel](https://www.veniceonthebeachhotel.com/): beachfront boutique hotels and roof terraces informed the pastel facades, balconies, sun decks and rooftop pools.

All game art is original procedural Canvas drawing. References supplied visual
inspiration; no third-party photographs, textures or runtime downloads were added.
The new beach fits the game's existing coastal inlet below the city rather than
attempting a geographically exact Los Angeles map.

## Gameplay

- **Destruction:** three lifeguard towers, five striped parasols, ten deck chairs,
  four sand castles and nine palms have physical colliders and finite HP. Impacts
  smash them, slow the vehicle, and use the existing property damage/combo/police
  rules. Wreckage remains visible while dead colliders clear. Towers leave tilted
  roofs and broken ramps; castles flatten into sand. Gentle bumps leave towers intact.
- **Sand:** each tyre samples the shared beach polygon. Ordinary road cars lose
  drive/braking force, lateral grip and cornering traction while increased rolling
  resistance makes them bog down. Mixed road/sand footprints blend by tyre coverage.
  Motorcycles also lose sand traction. No random steering inputs are injected.
- **Pickup:** a parked beach patrol pickup at **(28, 249.5)** can be taken with the
  ordinary **E / Get in** action. It uses a 1,750 kg, 5.2 × 2.15 m body, 14,500 N
  engine, its own wheelbase and off-road sand aptitude. Wallet, upgrades, fares and
  pursuit rules work normally; it can also use the paid harbour exchange.
- **Measured acceleration:** from rest with stock tuning and full throttle, the cab
  reaches **3.66 m/s** after 3 seconds on sand; the pickup reaches **13.35 m/s**.
  Off-road tyres improve handling but do not protect against the water.
- **Promenade:** permanent edging and visible bollard groups physically keep cars,
  pickups and road bikes outside the walking path. The 0.75 m clear openings admit
  the 0.7 m walking body. Vehicle collision envelopes cover each bollard group;
  walkers and civilians resolve individual posts so they can pass through.
- **Water:** the drawn coast and drowning checks use the same footprint. Driving
  into the surf still splashes/sinks the vehicle and leads to Wasted/hospital recovery.
- **Fares/navigation:** Sunset Beach, Ocean Walk and Pacific Palm Hotel stops sit on
  the south city street. Beach access paths stay on dry land; eastern sand traffic
  routes around the protected promenade. Walking navigation uses its real entrances.

## Implementation and extension

- `src/beach.ts` owns beach/shore geometry, sand detection, access paths, hotel/prop
  descriptors, pedestrian entries and per-tyre `sandHandling()` force modifiers.
- `src/world.ts` creates the actual props, hotels, barriers, parked pickup and seeded
  beachgoers. `blocksWalking()` distinguishes grouped vehicle entrance envelopes
  from individual pedestrian collision posts. Hotel footprints replace the previous
  southern half of the three eastern city blocks; road lanes remain accessible.
- `src/beach-renderer.ts` draws sand texture, wet shoreline, foam, court/towels,
  tiled walk, pastel hotels, towers, parasols, chairs, castles, palms and wreckage.
  The local radar also includes sand, promenade and hotels.
- `src/vehicles.ts` adds `terrain.sand` (0 = road, 1 = off-road) to every definition
  and introduces the player-drivable `pickup` model. Existing freight access is unchanged.
- `CarDynamics.surface` applies terrain forces without overwriting base tuning or
  upgrades. `MotorcycleDynamics` applies equivalent traction/drag modifiers. AI
  recovery previews sample the same surface at each predicted pose.
- LAB fixtures: `__taxi.scenario('beach')`, `__taxi.scenario('beach-pickup')` and
  `__taxi.scenario('promenade')`. Snapshots expose `surface` and `sandCoverage`.

## Validation

`npm test -- --maxWorkers=2 --testTimeout=20000` passes **391 tests / 28 files**,
and `npm run build` passes after rebasing onto the latest moving-exit feature. Beach integration checks cover
shore/sea boundaries, clear parked/hotel geometry, dry city/woods routing, all
requested destruction classes, gentle tower impacts, sand acceleration/lateral
traction, mixed tyre coverage, road/upgrades restoration, motorcycle sand forces,
sand ruts, drowning/recovery, boosted vehicle exclusion, pedestrian entry from both
sides, pickup entry, harbour eligibility, beach fares and all new LAB fixtures.

`tools/beach-check.cjs` runs production-browser QA with Playwright. It checks the
self-contained build after an offline reload, measures sand acceleration, physically
walks around the abandoned cab and takes the pickup, checks its moving door/jump/landing, rams all four prop classes,
walks the promenade, confirms vehicle exclusion/surf death, and captures day/night
plus 390 × 844, 320 × 568 and 844 × 390 mobile scenes. No page errors or horizontal
overflow were observed.

![Open beach](screenshots/beach/beach.png)
![Pickup and sand ruts](screenshots/beach/pickup-ruts.png)
![Beach destruction](screenshots/beach/destruction.png)
![Eastern hotel promenade](screenshots/beach/promenade.png)
![Promenade at night](screenshots/beach/promenade-night.png)
![Mobile promenade](screenshots/beach/mobile.png)

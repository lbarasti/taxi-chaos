# Taxi Chaos — continuation handoff

## South coast breathing room, 2026-10-11

- Expanded the beach-facing inlet by translating the southern woodland shore,
  seven villas and golf course 120 m south. At least 110 m of clear sea now fronts
  the entire beach; map height grows from 430 to 550 m.
- `SOUTH_COAST_OFFSET` / `southPoint()` in `src/countryside.ts` translate the estate
  loop, stops, golf holes/cart routes and renderer ridges. Extended the two eastern
  approach roads; drives, pools, colliders, residents and radar follow shared data.
- Woodland LAB now uses live stop descriptors: Estates (242,450), club (132,458).
  Southern district threshold follows the shifted woodland shore.
- 410 tests / 29 files, strict TypeScript, production build and diff whitespace
  check pass. New regression samples the entire open inlet and checks dry road
  body corners; existing traffic, clearance, carts/pools and fare tests pass.
- Offline standalone browser QA verifies desktop beach/golf, physical road driving
  at 100 HP, a paid club delivery, surf drowning and 390×844 mobile without overflow.
  No console errors/warnings or external requests. Before/after and production
  screenshots plus geometry notes are in `docs/beach.md`.
- PR #14 CI exposed the existing 300-second freight simulation exceeding Vitest's
  default 5-second wall-clock timeout. That test now has an explicit 20-second
  budget, retaining its full simulation and assertions.

## PR #13 revision — hotel appropriation and review fixes, 2026-10-11

- Moved hotels onto the actual sand south of Ocean Walk: 33×10, 33×11 and
  31×12 m podiums, with 9/14/18-storey balcony walls, penthouses, private pools
  and guests-only frontage. Their footprint consumes most eastern beach space.
  Restored the street-side city blocks; moved cafés/palms onto the public path.
- Hotel gaps align with two southern pedestrian entries. Walking navigation
  threads through these gaps; driving/police destinations use the south street.
  The previous 256.9 m vehicle bypass is removed. Full-body collider sweeps cover
  the review's near-edge case and hotel access, plus an actual police planning check.
- Sand ruts emit by distance (0.65 m), merge straight sections (up to 4 m), and
  break at teleports/surface/vehicle changes. Renderer culls and batches tracks
  into at most 12 material/fade paths. A 60 s mobile sand test uses 4 sand strokes.
- Removed the permanent sand-tip override of mobile pickup/delivery directions.
  Sand handling remains visible in the secondary status; both fare stages checked.
- Incorporated merged motorcycle crash PR #12, preserving ejections, fallen-bike
  physics, engine cutoff, recovery and all new fixtures. 409 tests / 29 files,
  production build and offline browser QA pass. There are 33 LAB fixtures.
- Refreshed all beach screenshots and docs; production QA covers the above fixes.


## Latest checkpoint — Sunset Beach and Ocean Walk, 2026-10-11

- Added a 296 m southern beach with a west-to-east tapered shoreline, sand/wet-sand
  texture, surf, volleyball court, private seeded beachgoers and palms. Existing
  woodland/villas stay intact. The old south coastal rails are removed at the join.
- Three pastel lifeguard towers, five parasols, ten deck chairs and four sand castles
  have finite HP, physical destruction, visible wreckage and momentum loss. Palms
  are breakable too. Towers occlude vehicle headlights and police sight.
- Eastern Ocean Walk adds three pastel beachfront hotels, cafés, surf rentals,
  pedestrians, lamps/benches and a tiled walking path. Edging/bollards are permanent
  traffic barriers. Each entrance group has a vehicle collision envelope to prevent
  narrow bikes squeezing through iterative contacts; walking/civilian collision uses
  the actual posts. Navigation walks through the real 0.75 m clear gaps.
- Sand samples every tyre and blends reduced engine/braking force, lateral grip,
  traction caps and rolling resistance. Motorcycles and AI recovery previews use it
  too. Road tuning/upgrades restore automatically outside sand. Tracks are tan ruts.
- A drivable beach patrol pickup is parked at (28,249.5). Its definition adds
  `terrain.sand` aptitude (0.95 versus car 0), geometry, drivetrain, art and access.
  Commercial trucks remain NPC-only. Pickup is also eligible for the harbour exchange.
- Beach dispatch uses three new stops on the existing south street, never on the
  pedestrian path. Sand navigation exits to the city instead of cutting across the inlet.
- F2 adds `beach`, `beach-pickup` and `promenade`. Snapshots expose `surface` and
  `sandCoverage`. Read `docs/beach.md` for references, API, verification and screenshots.
- Rebased onto the merged moving-exit feature (#11), preserving door opening,
  launch/tumble/landing damage and coasting for the pickup too. All 391 tests /
  28 files and the production build pass. There are now 31 LAB fixtures.
- Production Chromium QA runs fully offline: normal/pickup acceleration, real walking
  pickup entry, all four destruction classes, protected path, surf death, night and
  three mobile viewports. After 3 s, stock car on sand: 3.66 m/s; pickup: 13.35 m/s.


## Latest checkpoint — working harbour and paid car exchange, 2026-10-10

- Added Northstar Harbour on the north waterfront: shared 180 × 120 m dry apron,
  fifteen container stacks, two cargo ships, four staggered animated loading cranes,
  workers, warehouse/customs detail, open quay and separate truck entrance/exit lanes.
- Three physical empty/loaded freight NPCs follow a port/city circuit with the existing
  commercial physics and sensing/recovery AI. They are separate from road traffic density.
- H / Harbour button routes to security. E / touch payment charges $75 once in a stopped
  eligible car while unseen by police. Admission is per vehicle and includes one exchange.
  C-76 requires full containment, <0.8 m/s, no throttle and 2.5 s uninterrupted concealment.
  Safe output clearance is checked before issuing a new healthy, different-coloured car.
- Wallet, upgrades, current job/passenger persist. Heat, all warning levels, arrest/escape,
  speeding and shared police intel clear completely; active pursuers retire without an
  escape reward. Later crimes work normally. Admission expires on exit/reset/recovery.
  Emergency bailout still takes priority for burning/wrecked cars at the gate.
- Harbour navigation connects to city/woodland without altering top-street routing.
  Exact segment/OBB police visibility prevents thin container walls from being skipped;
  container stacks also occlude headlights. Gate/fence mesh does not conceal the car.
- New F2 `harbour` scenario (26 total); snapshots expose detached `harbour` state.
  Reference research, gameplay/API notes and seven production screenshots: `docs/harbour.md`.
- Rebase retains joystick/fullscreen/compact status and contextual actions, with short harbour-specific mobile instructions and accessible security payment. Native two-finger controls, five HUD layouts and small/portrait/landscape harbour exchanges pass browser QA.
- Integrated latest main (consolidated game-over billing and mobile thumb controls). All 359 tests / 26 files and
  the standalone production build pass. Physical gate-to-exchange driving caused no damage;
  a five-minute freight circuit crossed both gates at 100 HP. Desktop/night/mobile Chrome
  QA showed no runtime errors or mobile overflow.


## Latest checkpoint — commercial NPC fleet and vehicle catalogue, 2026-10-10

- New road NPCs: delivery vans, empty three-axle flatbeds, trucks with strapped crates,
  and fuel-barrel trucks. Commercial models remain unavailable for player entry/radar
  replacement markers until a later unlock. The normal 23-road-vehicle mix contains
  14 cars, 3 vans and 2 of each truck variant; parked cars/bikes and golf carts remain separate.
- `src/vehicles.ts` centralizes typed geometry, dynamics/tyre layout, artwork colors/sprite,
  audio pitch, cargo, damage/blast profiles, AI and access/job definitions for all seven models.
  `Game.spawnVehicle(options)` is the named-options API; the positional helper delegates to it.
  Model/definition identity is readonly on instances. Engine/grip upgrades derive from definitions.
- Payload increases mass and yaw inertia. Trucks have longer braking distances, lower lateral
  traction limits and earlier corner braking. Sensing/reverse previews use actual bodies/dynamics;
  collision broad phase supports overlapping trucks with centres more than 6 m apart. Collision
  damage reflects relative mass; heavy vehicles receive less velocity from blast impulses.
- Fuel cargo ignites on hard cargo-area impacts or nearby blasts and uses the existing fire
  lifecycle; detonation is one 24 m / 190-power blast. Scrapes/cab-only moderate hits stay safe;
  sinking vehicles cannot detonate underwater. Fire artwork/lights cover the cargo bed.
- F2 adds `commercial-traffic` and `flammable-cargo` (25 fixtures total). The latter physically
  rams a fuel truck with a god-mode cab and chains into a parked car. `__taxi.vehicleModels()`
  lists detached definitions; `__taxi.spawnVehicle(options)` returns a new NPC ID. Vehicle
  summaries expose mass, inertia, dimensions, cargo and player access.
- Survey, measured handling differences, extension instructions and five production screenshots:
  `docs/vehicles.md`. All 325 tests and the production build pass. Offline production-browser QA covers the fleet and
  cargo fire/explosion, no player access, night lights, mobile overflow and no runtime errors.
  Additional runs took every commercial model over bridges/highland bends at 100 HP; a 30 s
  normal-city run kept all nine commercial vehicles at 100 HP with no explosions.


## Project rename — 2026-10-10

The project is now **Taxi Chaos**, with package name `taxi-chaos`. Branding, browser title, welcome/help UI, LAB title, source comments and audio credits use the new name. Browser storage uses `taxi-chaos-v1`, `taxi-chaos-settings` and `taxi-chaos-audio`; legacy keys migrate automatically on load, and erasing progress clears both save keys. Historical browser-context names and filesystem paths below refer to the original sessions.

Read this file first after resetting context. The expanded game, sound FX, and **boost / roadside escape / parked-car follow-up are complete** as of 2026-10-08. Earlier checkpoints below are retained as history. The historical instruction to postpone audio has been superseded by the user's explicit approval to implement FX.

## Latest checkpoint — boost, escape, parking and visible explosions, 2026-10-08

User requested stronger/visible boost, clarity around burning cabs (including exiting and taking another car), parked cars in bays/lots, and unobstructed explosions instead of a game-over overlay. All four are implemented and verified.

- **Boost:** `CarDynamics` applies 3.1× engine force, up from 1.9×. Renderer draws deterministic twin blue exhaust jets/speed streaks only during active driving boost. Dashboard gains a cyan border/meter and **NITRO ACTIVE** label. Reset now clears stale controls/boost feedback. Stock production-browser two-second acceleration: **16.06 m/s normal vs 40.26 m/s boosted**, 100 HP, 42% boost remaining.
- **Parking:** `World.parking` describes occupied and empty marked curb bays plus two open public lots (blocks `(40,120)` and `(120,80)`). Normal city: **23 moving cars + 38 parked cars + player = 62 vehicles**. Curb centres are `y + 34.6`, clear of both static props and the driving lane. Lots have six bays each, four occupied. `Vehicle.parked` suppresses AI while retaining physical collisions, damage and fire. Empty parked cars set `driverExited` so fires do not spawn imaginary occupants. Moving-traffic slider/maintenance exclude parked vehicles. Deterministic fixtures clear incidental parked cars too.
- **Escape loop:** **E** exits/enters. Ordinary exits require ≤6 m/s; burning/wrecked emergency exits work at speed. Safe exit positions check props and vehicle occupancy. **WASD/arrows** move in screen directions at up to 5.5 m/s, with normalized diagonals and solid collisions. `Game.onFoot`, `driver`, and `actor` distinguish the driver from the last cab; camera, navigation, radar, police targeting and audio listener follow the actor. Engine/boost/skid loops stop on foot; nearby fire remains audible. Walking drivers receive nonfatal physical collision/blast knockback.
- On foot, a blue route, car marker, radar dots and mission guidance identify the nearest non-burning/non-wrecked parked car. **E within 4 m**, with unobstructed access and car speed below2 m/s, takes it. Old cab becomes parked traffic; new car becomes taxi, carrying wallet, upgrades and heat. Replacement damage remains real; its boost tank starts full. Walking cannot pick up/deliver fares. An aboard passenger evacuates and a fresh fare is dispatched without payout when the driver exits.
- **Fire:** burning cab HUD explicitly says **E to bail out, then run clear**. Abandoned fuses keep running; switching cars does not repair/cancel the old fire. Pit Stop still extinguishes a fire before detonation. Wrecks cannot be entered and persist until explicit repair/tow or old off-screen cleanup.
- **Explosion/recovery UI:** wrecks no longer open the full-screen dialog. Centre remains unobstructed; a small **300 px roadside card at top-right** appears 0.65s after the blast. **E** can leave the wreck; **R / Tow & repair** offers the existing wallet-capped $60 recovery. Simulation guards tow for the first1.2s, including on-foot recovery, so the blast cannot be skipped. Hazards/effects continue in wrecked mode, and normal world simulation resumes after exiting. Critical/fire guidance moved above the playfield to avoid colliding with the left HUD stack. Arrest retains its dialog.
- New F2 scenario **Cab fire / escape** (`cab-fire`): burning player with7s fuse, usable parked car at `(14,34.6)`, no police. There are now **16 scenarios**. New public API `__taxi.interact()` uses the same gameplay action as E; snapshots expose `onFoot`, `playerId`, `nearestCarId`, actor position/velocity and replacement navigation; `vehicles()` exposes `parked`. After switching, use `state().playerId` rather than assuming cab ID0.
- **Final checks:** `npm test && npm run build` passed: **161 tests /12 files**, strict TypeScript clean. Added recovery integration tests for physical walking/switching, unaltered old fuse, no duplicate blasts, tow timing/fees, passenger evacuation, blocked entry/walking, invalid replacements, parked geometry/stationarity, stronger boost and reset feedback; audio checks verify on-foot engine silence/fire audibility. Existing density/siren tests now distinguish parked cars and avoid hard-coded IDs.
- Final build: only **`dist/index.html`**, **1,108.93 kB raw /745.09 kB gzip**. README updated with controls, semantics and16 fixtures.
- Production browser QA: isolated **`fare-city-roadside-qa`**, **1440×900**, local `file://` HTML, Offline/cache-bypassed reload. Verified boost jets/HUD visually, occupied/empty lot bays visually, E-key handler bail-out, physical movement to replacement, actual Get in button, and old-cab explosion while new cab stayed intact/playing with wallet unchanged. Verified blast-time overlay/card hidden, delayed top-right card, disabled early tow and actual Tow button returning100 HP for$60. Post-wreck Get out button also verified. HUD panel bounds confirmed no mission/heat/critical overlap.
- Short live normal-city measurement with62 vehicles: **~120.6 FPS**, p95 frame interval9.2ms,38 parked,100 player HP (hardware-specific two-second sample). Final inspected console had **no errors/warnings**; network was only local HTML and embedded font, no external HTTP(S).
- Browser: **page9** (`fare-city-fx-ready`) was untouched. **page10** (`fare-city-roadside-qa`) is latest standalone at welcome,1440×900, Offline, default wallet$80/upgrades0, no lab instrumentation. QA fixed clock was restored to realtime before its final clean reload. Tell the user to refresh their existing standalone tab, then **F2 → Cab fire / escape → Run** to try the new loop.

## Latest checkpoint — sound FX, 2026-10-08

User approved the sample-based FX plan (“Looks like a great plan. Please proceed”). Music and voice remain deferred.

- `npm test && npm run build` passed: **150 tests / 11 files**, strict TypeScript clean.
- Output remains **only `dist/index.html`**, **1,098.36 kB raw / 741.91 kB gzip**.
- New `src/sound.ts`: DOM-free capped event queue, per-contact cooldowns, reset epochs,
  priority retention, stale-history dropping and pure distance/driving signals. Audio never
  consumes the world's seeded RNG or changes simulation results.
- New `src/audio.ts`, `audio-assets.ts`, `audio-controls.ts`: lazy Web Audio context, 25
  embedded samples, sample variants, quiet nearest traffic, physical tyre-slip squeal,
  speed/load-responsive engine, boost onset/loop/release, wood/metal/glass/body/pulp,
  collapse/explosions/fire, sampled subdued sirens and generated gameplay confirmations.
- Defaults: **FX 65%, sirens 25%**. Saved mute/volume/sirens in separate `fare-city-audio`
  key. **M / topbar speaker** mutes. Welcome/pause and lab expose sliders; sirens 0% disables
  sirens. Pulp gameplay audio respects gore. No music/voices.
- World audio pauses with gameplay, focus loss/background, garage/arrest and fixed lab
  stepping. Garage confirmation tones can play while world loops are stopped. Wreck-dialog
  ongoing hazards remain audible. Old fixed-step events never replay when returning Live.
- F2 → **Sound FX audition** isolates one sound for 2 seconds, with Stop. Respects mute and
  volume. Public API: `__taxi.audio()`, `await __taxi.sound('explosion')`, `__taxi.stopSound()`.
- Runtime sample loading uses **inline data URLs decoded from bytes**, including dev. WAV
  loops avoid codec padding; MP3 one-shots save space. Sources/CC0/CC BY 3.0 credits and edit
  notes: `src/assets/audio/CREDITS.md`, embedded in HTML and linked in UI. Preparation script:
  `tools/prepare-audio.py` (Python stdlib + ffmpeg, not required for ordinary builds).
- Final offline production-browser QA in isolated context `fare-city-fx-automated`:
  25/25 samples decoded, one context after activation, no context at initial load or when
  starting with saved mute enabled; native speaker-button unmute unlocked sound. All audition
  cues produced measured output with world loops isolated. Stop returned to silence when fixed.
- Live input simulation verified engine/boost loops, one boost onset/release, actual skid loop,
  26.3 m/s acceleration; gas station produced **4 blasts / 4 explosion sounds**, peak ~0.60,
  max 13 one-shots in that run. Chain reaction produced **3 blasts / 3 explosion sounds**.
  Wall collision produced severity-based crash and preserved normal damage.
- Verified pause/resume, focus-loss handler, visibility-hidden handler (simulated document
  visibility), mute, fixed stepping, siren disable and settings persistence across an offline
  reload. Final production QA console: **no errors/warnings**. Network: local HTML + embedded
  font only, **no external HTTP(S)**. Audio graph output was measured; subjective sound/mix
  preference still needs the user's ears.
- An automated keyboard harness initially dispatched at `window` and exposed an input-target
  robustness issue; fixed `main.ts` to guard `HTMLElement` targets. Fresh rebuilt QA was clean.
- Earlier preview page6 appeared to receive user driving input and was left alone; it later
  disappeared. Automated page7 and blank page8 were closed after restoring realtime. The only
  page at the last listing is **page9**, fresh standalone at welcome, isolated context
  **`fare-city-fx-ready`**, 1440×900, normal input, default settings, no instrumentation.
- README and asset attribution updated. No remaining implementation/verification blockers.

## Final verified checkpoint — 2026-10-08

- `npm test && npm run build` passed: **133 tests / 9 files**, strict TypeScript clean.
- The rebuilt `dist/` contains only `index.html`: **163.10 kB raw / 67.96 kB gzip**.
- Fresh isolated context `fare-city-final-offline-qa`, page5, opened the rebuilt `file://` HTML at **1440×900** and reloaded with **network Offline** and cache bypassed.
- Welcome → Start your shift → **F2** worked on the normal URL, without `?debug=1`. Selected **Chain reaction** and clicked **Run** through the actual UI.
- Deterministic production-browser fixture checks: fire at7.3s →1 explosion/1 wreck; chain reaction at6s →3 explosions/3 wrecks; gas station at7s with W →4 explosions,3 destroyed pumps,1 destroyed structure, player still playing at100 HP.
- Final stock first-fare drive: accelerated/braked to pick up Mia, steered along Harbour Ave to Bodega, stopped and delivered. Only keyboard-input simulation was used after fixture placement; no mid-drive teleports, upgrades or cheats. **$137 earned ($54 tips),100 HP,0 heat**, next fare dispatched.
- No console messages/errors; requests were only the local HTML and embedded data-URL font. No external HTTP(S) resource requests; fonts loaded; **0 AudioContext creations**.
- Page5 left in **LIVE / playing**, lab collapsed, final fare completed. Page4 remains the earlier isolated dev preview. No user-context page was reset or reloaded.
- README documents all implemented systems and the test API. No remaining verification blockers.

## Workspace and commands

- Project: `/Users/lorenzobarasti/code/racer`
- Frontend-only TypeScript + Canvas, Vite 8.3.3, Vitest 5.0.3, Node 24 available.
- Git repository initialized on `main` at the user's request on 2026-10-08. Source, assets, tests, tooling and project notes are versioned; dependencies, `dist/`, local environment files, logs and caches are ignored. On 2026-10-10 the user gave standing approval to commit completed requested work, publish feature branches, and raise PRs in `lbarasti/taxi-chaos` without reconfirmation; see `AGENTS.md`.
- `npm run dev` serves `http://localhost:5173` (server was running at handoff).
- `npm test` runs all tests.
- `npm run build` runs strict TypeScript checking and creates **only `dist/index.html`**.
- `npm run preview` serves the production bundle.
- `README.md` has recently been updated with the expanded mechanics, controls, scenarios, API and architecture.
- `vite.config.ts` contains our single-file build plugin: embed JS/CSS/font, fail if external output assets remain, append the full Space Grotesk OFL license as an HTML comment.

## User goals and steering

Original request: use Pat Kerr's https://patkerr.co.uk/motion-lab/ as the physics foundation for a top-down taxi delivery game. Pick up customers, deliver, earn money, buy upgrades, evade police, get arrested and pay bail. Frontend only, TypeScript, single standalone HTML, easy testability, tight browser feedback loops. Prioritize collision/destruction and detailed city geometry over textures. Stop only when it is fun.

Subsequent feedback:

1. **Desktop first**. Phone viewport was only a secondary check; use 1440×900 for primary playtesting.
2. **Historical: postpone sound**. The initial synthesized siren was annoying. The original `src/audio.ts` was deleted. **Superseded:** user later approved the FX plan; the new sample-based audio implementation is described at the top. Keep sirens subdued/separately adjustable.
3. Generic decorative FX/camera shake/flashing police lights were removed. The later expansion explicitly requested fire/explosion/gore feedback; those targeted effects are now implemented, with deterministic animation, no camera shake and no fullscreen flashes.
4. NPC cars got stuck after accidents; improve recovery.
5. Destination trajectories were too complicated; simplify them.
6. User then requested a substantial expansion:
   - Improve civilian and police AI.
   - Opt-in pulp gore, fatal pedestrian impacts.
   - Critical vehicle damage, fires and eventual explosions.
   - Larger destructible structures, including gas stations.
   - More scenarios/cheats/upgrades/difficulty controls for rapid playtesting.
   - Give a report when done.
7. User explicitly authorized parallel coding agents, asking about Luna/Terra 6.1. Explained that Task supports coding agents but **does not expose model selection**, so no claim that those models were used. Delegated four bounded modules and used a read-only AI stress reviewer; all work is now integrated.

Latest user request: **“Looks like a great plan. Please proceed”**, approving sound FX. Implementation and verification are complete; see the latest checkpoint above.

## Current implementation

### Foundation / physics

`src/physics.ts` ports/adapts Motion Lab's vectors, semi-implicit rigid body integration, four tyre-point forces, lateral damping and handbrake grip loss. Added rotated-rectangle SAT, spatial hash, normal/friction impulses and energy tests. Friction includes rotational effective mass and recomputes slip after the normal impulse. Physics is fixed at **120 Hz**.

Cars settle naturally when coasting at low speed, brake/reverse with S, steer via tyre forces, drift with Space and use rechargeable Shift boost. Engine/grip/armor/boost have three upgrade levels each.

### City and routes

`src/world.ts` generates a seeded 240×240 m city, 40 m street grid, 36 blocks, parks, shops, hydrants, bins, benches, lamps, kiosks, crates, barriers and people. Borders are around -14…254 m.

`roadPath()` now:
- Goes directly between positions on the same street corridor.
- Connects perpendicular streets with one bend.
- Connects parallel streets via the closest avenue, at most two turns.
- Uses street access projections for off-road/alley positions instead of snapping both ends to intersections.
- Removes duplicates/collinear vertices.

Regular town buildings are solid. Special destructible structures:
- **Civic Barracks:** centre `(60.5, 54)`, 23×10 m, 180 HP.
- **Freight Depot:** centre `(100.5, 14)`, 23×10 m, 90 HP.
- **Last Chance Fuel shop:** centre `(174, 67)`, 10×10 m, 220 HP.
- Pumps at `(173, 53)`, `(181, 53)`, `(189, 53)`, 18 HP each.

Large structures take impact-energy damage, show HP/cracks and open drivable rubble when destroyed. Pumps/station ignite and blast; the station's blast has 30 m radius.

### NPC / police AI

`src/ai.ts`:
- Smooth speed control, corner slowing, static/dynamic obstacle sensing, passing where clear.
- Stuck detection uses **actual movement**, not heading alone (fixed the original straight-into-wall bug).
- Recovery previews three physical reversing arcs using the car's actual engine/grip, 60 steps at 30 Hz for a two-second preview.
- At most **one heavy reverse preview per physics frame** and two off-road rejoin requests; deferred cars wait rather than all causing one expensive frame.
- Street rejoin includes all four straight alley portals; off-road cars rejoin before choosing a new traffic destination.
- Traffic uses `roadPath()` to reach its next road waypoint, not diagonal shortcuts through buildings.
- Four failed recovery attempts lead to a labelled **AWAITING TOW**/backoff state. An impossible trap is cleared only when >75 m from the player; no visible teleport/pop. Natural/default traffic tests did not hit this fallback.
- Police have pursuit/interceptor/blocker roles, shared last-known sightings, predicted interception, junction holds, last-sighting searches after memory expires, rear-quarter close-range goals and high-closing-speed braking.
- Intentional containment/roadblock stops do not trigger stuck recovery.
- Low-speed recovery avoids soft props consistently; fast police may smash soft clutter.

`Game.policeIntel`, `Game.recoveryBudget`, `settings.difficulty` are required AI context fields. Role/debug paths are visible via the lab.

### Damage / fire / explosions

`src/damage.ts` is pure, tested independently. Every Vehicle has `damage`:

```ts
{ health, critical: {engine, fuel, tyres}, status, fireTime, fuse,
  hitAt, blamed, bloodTime }
```

Statuses: intact → smoking → burning → wreck.
- Front/rear/side contact points damage engine/fuel/tyres respectively.
- Impacts below 3 m/s are free; damaging impacts have 0.22 s cooldown.
- Baseline damage: `max(0, impact - 2) * 1.45 * difficultyScale * (1 - .25 * armor)`.
- Smoke: engine >45 or HP <45.
- Ignite: engine >65, fuel >55, HP ≤18, or catastrophic front impact >32 with meaningful engine damage.
- Fire countdown controls detonation, **not HP alone**. Lethal hits still give up to ~1.5 s readable fire.
- Repeated impacts never restart a burning fuse. Blasts can shorten it to 1.2–2 s. Each vehicle detonates once.
- Radial damage uses falloff; velocity kick is bounded (~13 m/s at power100, max20), not 100 m/s.
- Component damage reduces engine/grip. Wrecks remain solid, pushable bodies; old off-screen wrecks are recycled.
- NPC drivers bail from burning cars once. Police drivers use officer-colored sprites.
- Pit Stop repairs reset all damage/critical/fire state.

`Game.hazards()` integrates fuses, queues/executes blasts, affects cars/props/people and handles chains. During ordinary pause/garage/arrest, clocks freeze. After a player wreck, hazard/effect updates continue under the wreck dialog so ongoing chains finish.

Game clamps extreme blast motion before physics integration (70 m/s linear, ±8 rad/s angular) as a stability bound, above normal driving speeds.

### Pedestrians and gore

`src/pedestrians.ts`:
- Anticipates moving cars of all kinds, finds collision-free escapes, handles parked obstacles and walls.
- Customers hold near pickup; civilian walking is local sidewalk motion.
- Actual car-local circle-vs-OBB contacts.
- Gore enabled: fast closing impacts >6 m/s, accumulated fatal injury and severe blasts kill once; corpses drag/resolve against statics.
- Gore disabled: never dies (HP floor1), displacement/knockback instead.
- Aboard passengers excluded from street contacts; car explosion can kill the riding customer in gore mode.
- Pedestrian updates run at 60 Hz, rise to 120 Hz whenever a car is >40 m/s (fixes boosted sideways-hit sampling).

`src/effects.ts` draws deterministic fire/smoke, expanding blast rings, cartoon pulp/clothing/bone-like shards, pools/corpses and blood tyre tracks. No audio/shake/fullscreen flash. Effect caps: 400 blood marks, 180 chunks, 30 rings, 220 embers, 160 smoke puffs; TTLs release them.

Gore is off by default and exposed in welcome/pause options and lab. Waiting customers are real Person entities; killing one dispatches a new fare without awarding money. Delivered/aboard old passengers are cleaned up. Recent maintenance changes clear old off-screen corpses, replenish civilians off-screen, cap excess off-screen population, and use monotonic person IDs.

### Economy / gameplay

Core fare loop remains: stop in yellow pickup ring, stop in green delivery ring, time/comfort tips, no hard late-delivery failure. Drift/near-miss bonuses, local saved cash/upgrades/fares, affordable bail/tow capped to wallet, workshop upgrades and repair.

`src/rules.ts` difficulties:

| Internal key / label | Max cops | Escape | Arrest | Collision scale | Fire fuse |
|---|---:|---:|---:|---:|---:|
| cruise / Cruise | 2 | 6s | 5s | .75 | 9s |
| standard / Street | 4 | 8s | 3.5s | 1 | 7s |
| chaos / Chaos | 6 | 10s | 2.6s | 1.2 | 5s |

God mode prevents impact/blast damage, not physical collision. Explicit Ignite/Detonate cheats intentionally force their event. NoPolice removes wanted/patrols. InfiniteBoost avoids depletion. Cheats are not loaded as permanent settings; only explicit difficulty/gore preferences are persisted.

**Verified fix:** `Game.preferences` stores explicit user gore/difficulty choices separately from scenario-only flags, so changing NoPolice or difficulty after a gore fixture does not accidentally persist gore. The regression test passed in the final133-test run.

## Test lab / API

`src/lab.ts` / `src/lab.css`, lazy setup via **F2 / Test Lab button**, or automatic setup at `?debug=1`.
- Inspector: 15 scenarios, 0.25s stepping, Live, .25/.5/1/2× speed.
- Gore, difficulty, God, infinite boost, no police.
- 0–40 traffic slider (tested through actual keyboard Home/End on range input: 0 and 40 vehicles).
- Four upgrade sliders, Max all/reset, cash, free repair, ignite/detonate.
- Collider and AI overlays.
- LIVE vs FIXED plus game mode, fuse/HP/cops/kills/blasts/smashes/recoveries telemetry.
- Lab z-index50 lets controls be used over arrest/wreck dialog. Tab handler permits lab controls above modal.
- `realtime()` resumes **paused only**, not arrest/wreck/garage. `repair()` explicitly repairs a player wreck and resumes playing with no fee; recovery UI remains the normal gameplay path.

Scenarios (exact API names):

```
first-fare, hydrant, alley, wall, traffic, npc-recovery, pileup,
police-chase, arrest, pedestrians, fire, chain-reaction,
barracks, depot, gas-station
```

Fixtures reset city, clear incidental traffic, preserve cash/upgrades/difficulty, clear run cheats then apply described fixture-specific ones. They use safe, on-camera spectator poses. `Reset run` restores normal 23-car city.

Public opt-in `window.__taxi`:

```js
__taxi.scenario('npc-recovery');
__taxi.step(10);                        // fixed 120 Hz, no waits; freezes automatic clock
__taxi.state();                        // full serializable snapshot incl route and lab clock
__taxi.vehicles();                     // positions, velocities, damage, AI role/phase/path
__taxi.contacts();                     // live static penetration depths
__taxi.props(); __taxi.people();
__taxi.configure({difficulty:'chaos', gore:true, invincible:true});
__taxi.upgrades({engine:3, grip:3, armor:3, boost:3});
__taxi.traffic(40); __taxi.cash(1000);
__taxi.damageVehicle(0, {engine:60, tyres:70});
__taxi.ignite(0, 5); __taxi.explode(0); __taxi.repair(0);
__taxi.teleport(x, y, angle, speed);
__taxi.reset(); __taxi.garage();
__taxi.open(); __taxi.close(); __taxi.realtime();
```

**Always call `realtime()` at the end of automated steps when leaving a page for someone to drive.** Driving keys also restore live clock and synchronize its UI. Fixed clock + ongoing render interpolation previously made the user think nothing moved; the labelled clock/Live button avoids that confusion.

`loadScenario(game, name)` and `repairVehicle()` in lab.ts also work in Node tests without DOM.

## Validation completed so far

### Last successful workspace check

`npm test && npm run build` passed:
- **131 tests / 9 files**.
- Strict TypeScript clean.
- One output file: `dist/index.html`, **162.05 kB raw / 67.71 kB gzip** at that checkpoint.

This was an earlier checkpoint. The final run passed **133 tests** and rebuilt the bundle; see the final verified checkpoint above.

Source changes since that earlier run, now verified by the final run:
1. Monotonic Person IDs.
2. Old off-screen corpse / delivered-passenger cleanup, off-screen civilian replenishment / excess population cleanup, associated regression test.
3. Separate persisted preferences so scenario gore does not leak via another configuration change, associated regression test.
4. Lab collapsed bar moved above keyboard-control footer (bottom70), toast repositioned while collapsed.
5. README expanded to document new systems/API.

### Desktop browser fixtures verified

In an **isolated 1440×900 Chrome context**, through real compiled frontend API:

| Fixture | Observed result |
|---|---|
| Hydrant, 1.1s W | 1 object broken, momentum retained, HP~99 |
| Alley, 1.1s W | Barrier + both crates broken, HP~96, no wedging |
| Wall, 2.5s W | Solid building holds; HP~70; penetration ~0.005m solver slop |
| NPC recovery, 10s | Car physically moved ~35.7m, 1 recovery, back to drive |
| Pileup, 12s | Both cars separated/resumed; moved ~38.6m and24.2m; 1 recovery each |
| Pedestrians, 1.5s W | 3 deaths, blood/corpses, game remains playable |
| Fire, 7.3s | 1 explosion, 1 solid wreck, no repeat |
| Chain reaction, 6s | 3 explosions, 3 wrecks |
| Barracks, 1.2s W | Large structure destroyed, cab through footprint, rubble |
| Depot, 1.2s W | Large structure destroyed, cab through footprint |
| Gas station, 7s W | 3 pumps + shop destroyed, **4 blasts**, one structure counted |
| Arrest, 4.2s | Arrested modal reached |

Also verified via UI (not just API):
- Difficulty → Chaos updates Ignite label to5s.
- Gore/God/infinite boost/NoPolice/collider/AI checkboxes.
- Max all → levels3 for all4 upgrades.
- Density range Home→0, End→40 with actual vehicle count change.
- Fire screenshot: local readable flame/fuse, driver escaped; no camera shake.
- Pulp screenshot: three corpses/pools, directional chunks and red tracks; still coherent city/HUD.

### Performance/reliability

- Live Chrome with40 cars: **~120 FPS**, p95 frame interval9.5ms, 38 moving at sample, 0 recovering, 0 waiting. This is a short hardware-specific measurement, not a platform guarantee.
- Read-only reviewer did120s simulated stress runs at earlier integration checkpoint: default23 cars, heavy40, old alley trap, eight alley cars, boxed/off-road adversarial groups, police pursuit. Fixed permanent reverse loop and preview spikes.
- Old `(20.5,20)` alley repro now naturally exits and keeps driving, not merely culled.
- No major/critical findings remained in tested AI scope. Impossible boxes use backoff/off-screen cleanup deliberately.
- Earlier standalone builds were opened successfully from `file://`, including Offline emulation, with zero AudioContext creations. **Repeat final offline test for the newest expanded bundle.**
- No console errors on current isolated dev preview during inspected runs.

## Original remaining-work checklist — now completed

The checklist below describes the work pending at the reset; final results are recorded at the top of this file. No repeat broad verification is needed unless source changes or a new concern warrants it.

1. Run **`npm test && npm run build`**. Expect133 tests, investigate any failure honestly, and update bundle-size facts from output. Don't run broad/repeated checks again unless a change/failure warrants it.
2. Open **new built `dist/index.html` in an isolated Chrome context**, desktop1440×900, network Offline. Test welcome → F2 (normal page, no debug query), then a fire/chain/gas fixture to verify inline bundle and lab work offline. Check console/network for external runtime requests.
3. Optional final physical-driving check: clean first-fare scene, stock upgrades, drive/brake to pickup, route via Harbour Ave to Bodega, complete fare. Core job tests and earlier real fare route passed, but a final updated-system lap would be useful if time permits.
4. Keep automated resets in isolated context. Do not reload/reset user's existing standalone tab or clear their saves. Restore realtime before leaving our own preview.
5. Finish todo verification, then produce user's requested final report: implementation overview, AI/routes, damage/fire, gore/structures, lab controls/scenarios, test/stress/browser outcomes, single HTML deployment and how to try features. Be honest about on-screen impossible traps waiting for assistance and off-screen recycling.
6. Tell user to **refresh their existing standalone tab** for the rebuilt version, or use localhost latest source. Quick test path: F2 → scenario → Run; flags/difficulty/upgrades adjustable. Normal gameplay gore toggle is in welcome/pause.

## Browser/session care

The user accidentally played in the agent's preview earlier, so this is important.

At last listing (IDs can change; list pages again):
- **Page2:** user's/default-context standalone `file:///Users/lorenzobarasti/code/racer/dist/index.html`. **Do not disturb.** It may be an older loaded inline version even though file on disk changed.
- **Page3:** agent-created temporary `LAB check` at `http://localhost:5178/labcheck.html`. Temp harness was removed; avoid using/reloading it.
- **Page4:** our isolated `http://localhost:5173/?debug=1`, context **`fare-city-expanded-tests`**, desktop1440×900. Most recent actions: UI cheating/density test and40-car live performance run; source edits may have hot-reloaded it afterward.

Use `chrome-devtools_new_page(... isolatedContext:'fare-city-expanded-tests' ...)` or a new named QA context. Chrome DevTools tools are available; no need to launch new debug Chrome unless disconnected.

Select fields in `chrome-devtools_fill_form` required **visible option text** (`Chaos`, `Street`) rather than internal values (`chaos`, `standard`). Take fresh snapshots for UIDs after HMR/reload.

## Delegated sessions (optional resumes)

All implemented files are already on disk and integrated. Do not redo delegated work.

| Agent | Task session | Owned work |
|---|---|---|
| coder | `ses_ee749e7bbffeRL5b2sQEnhms7z` | damage.ts + tests; fuse/idempotency/kick fixes |
| coder | `ses_ee749e682ffe9tjutRaxQDmW7E` | pedestrians.ts + tests; fatal injury/cadence fixes |
| coder | `ses_ee749e65affeHt6gjJNCDGJ5uE` | effects.ts + tests; structural ring radius/caps |
| coder | `ses_ee61bed49ffewd7f2FcH7sESCq` | lab.ts/css/tests; on-camera spectators, modal-accessible inspector, repair brain reset |
| review (read-only) | `ses_ee5fac961ffeQFjynShleq8FY1` | AI reliability/stress/performance reviews |

Review harness/results (outside workspace, approved temp location):
`/var/folders/qs/n4rrp9w16zb91hscklb968_40000gn/T/opencode/racer-sim/`
Contains `sim*.test.ts` and `result*.json` if needed. Dev log:
`/var/folders/qs/n4rrp9w16zb91hscklb968_40000gn/T/opencode/fare-city-vite.log`.

## File map

- `src/physics.ts` / physics.test.ts
- `src/world.ts` / world.test.ts
- `src/ai.ts` / ai.test.ts
- `src/damage.ts` / damage.test.ts
- `src/pedestrians.ts` / pedestrians.test.ts
- `src/effects.ts` / effects.test.ts
- `src/game.ts` / game.test.ts
- `src/lab.ts`, lab.css / lab.test.ts
- `src/simulation.test.ts` — integrated fires, chains, structures, gore, settings, maintenance tests
- `src/renderer.ts` — city/special structures, damage visuals, corpses, overlays
- `src/main.ts`, style.css — HUD, input, settings/modals, lab bootstrap, fixed clock
- `src/sound.ts`, sound.test.ts — DOM-free audio events, cooldowns and pure mix signals
- `src/audio.ts`, audio.test.ts, audio-assets.ts, audio-controls.ts — browser mixer, embedded sample imports, controls
- `src/assets/audio/` — curated edited samples + CREDITS.md; `tools/prepare-audio.py` reproduces edits
- `src/rules.ts` — difficulty/settings defaults
- `src/assets/space-grotesk.woff2`, OFL.txt, ATTRIBUTION.md
- `index.html`, package.json/lock, tsconfig.json, vite.config.ts, README.md

No textures or external runtime fetches. Physics foundation credit to Pat Kerr/Motion Lab; Space Grotesk downloaded from Google Fonts under OFL. Sound FX sources/licences are documented in `src/assets/audio/CREDITS.md`. Expanded-game and FX verification are complete.

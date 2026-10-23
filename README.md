# Taxi Chaos

A frontend-only TypeScript driving game with fixed-step vehicle physics, procedural Canvas visuals, and locally embedded sound. There is no backend or runtime network access. For controls and gameplay, see [HOW_TO.md](HOW_TO.md).

## Development

Requires Node.js 22.12+ (or 24+), npm, and the WebP encoder `cwebp` (`brew install webp` on macOS; `sudo apt-get install webp` on Ubuntu). CI installs the encoder automatically.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. Vite serves the game with instant TypeScript and CSS updates.

## Testing

```sh
npm test
npm run build
npm run map:check -- --input src/map/default-map.json --json
npm run tools:test
npm run browser:test -- --require-browser
```

If managed Chromium blocks `file://`, serve `dist/` at `http://localhost:4173`
and set `GAME_URL=http://localhost:4173/index.html` for the notification, HUD,
observation and edition browser checks. They load the standalone artifact from
localhost and switch offline before interacting. Use `CHROMIUM_PATH` to select
an already installed browser.

`npm run build` runs the strict TypeScript check and builds the standalone game. `npm test` runs the physics, collision, jobs, destruction, pursuit, economy, and map tests. The map check validates the authored default map. `npm run artwork:test` runs browser-free checks for derivative cache reuse, manifest freshness and artwork geometry; CI runs it alongside unit tests, the build and map validation. `npm run tools:test` additionally runs the scenario and authoring CLI suites, whose screenshot checks require an installed Chromium. `npm run assets:prepare` generates or reuses display-resolution WebP derivatives and refreshes the inline image manifest; `npm run artwork:prep -- --check` verifies that manifest and reports measured PNG padding. `npm run authoring:preview -- --list --input tools/examples/map-authoring.json` lists stable catalogue IDs. The optional GPU benchmark is `npm run performance:bench -- --frames 180`; it writes results under `scenario-runs/artwork-performance/`.

For simulation and main-thread profiling, `npm run perf:bench` times fixed 120 Hz updates across four city workloads, starting each warmup and measured run from a fresh, persistence-disabled game. Setup, snapshots, UI and drawing are excluded from simulation timing; world render submission is timed separately. JSON includes raw samples, step counts, per-run/per-simulated-second/per-step timings, and browser/Canvas metadata. `npm run perf:profile -- --scenario cruise --traffic 23` records a Chrome CPU profile and real frame intervals while driving. Both write JSON and captures under `scenario-runs/perf/`; `--cpu 4` throttles either harness, and `--headless` supports cached Chromium on servers. Compare runs with the same browser, viewport, CPU setting and Canvas acceleration; render submission timing alone does not measure displayed FPS. Page errors make either command fail.

For interactive testing, open **http://localhost:5173/?debug=1** or press **F2**. The lab also works in the standalone HTML and includes deterministic 120 Hz stepping, scenario fixtures, debug views, traffic controls, and gameplay/audio cheats.

The opt-in browser automation harness is exposed as `window.__taxi` after opening the lab:

```js
__taxi.reset();
__taxi.scenario('alley');
__taxi.step(1.1, ['KeyW']);
__taxi.state();
__taxi.vehicles();
__taxi.realtime(); // restore interactive play after automation
```

Other useful harness methods include `step`, `scenario`, `spawnVehicle`, `contacts`, `configure`, `upgrades`, `traffic`, `damageVehicle`, `repair`, `props`, `people`, `audio`, `sound`, `dayNight`, and `resetSave`.

Automated browser tests should use an isolated browser context, especially when working with shared browser sessions or saved progress. The test API supports deterministic stepping without wall-clock waits. `loadScenario(game, name)` in `src/debug/lab.ts` is also available to Node tests without a DOM.

After building, `npm run browser:test` runs six offline suites: menus, input, HUD, campaign UI, world rendering and driving, and map inspection. Use `npm run browser:test -- --list`, `--suite hud`, or `--case player-hud` to narrow a run. Each case reports pass, fail or skip independently; results and failure screenshots go to `scenario-runs/browser/`. Set `CHROMIUM_PATH` to use an existing Chromium executable. `--require-browser` makes unavailable Chromium a failure. Browser and tool suites run locally; CI keeps the core tests, production build and map validation. The inbox case covers date grouping, older texts, read tracking, countdowns and expired pickups on desktop and touch layouts.

Browser checks write generated captures to ignored `scenario-runs/` directories.
`SCREENSHOT_DIR` overrides their root. Attach relevant captures to the PR. Historical
rationale belongs in [the decision log](docs/DECISIONS.md); routine changes need
no decision entry or separate feature document.

## Map development

[`src/map/default-map.json`](src/map/default-map.json) is the authored source for
the shipped map. There is no in-game map editor or **Map studio** entry point:
authored geometry is changed through the checked map CLI and the programmatic
`__taxi.map` automation described below. Drafts stay in memory; export before
reloading. Invalid geometry remains editable but blocks preview.

```sh
npm run map:check -- --input src/map/default-map.json --json
npm run map:check -- --input src/map/default-map.json \
  --operations tools/examples/map-move-estates.json --output /tmp/taxi-map-moved.json --json
```

Operation output must name a new file. Take `baseRevision` from the current
checker report after editing the baseline; examples are tied to their baseline.
`tools/examples/map-invalid-road.json` demonstrates a rejected road placement.
The checker exits 1 for structural errors or geometric errors, and may export a
structurally valid draft that still needs repair. Invoke `node tools/map-check.mjs`
directly for JSON stdout without npm's banner.

Terrain (`terrainRegions`), dry land (`landRegions`), catalogue objects
(`objectPlacements`), walking/vehicle access (`accessAreas`, `accessNodes`,
`accessEdges`), residents, district zones and presentation are independent
collections. Every prop requires a catalogue `type` in `objectPlacements`; there
is no untyped or country-specific prop format. All object placements compile and
spawn through one path. Higher terrain priority wins; equal priorities use stable ID order.
The terrain renderer and tyre sampler use that same order. Materials never grant
access or create land, and adding land creates neither access nor a material.

Schema 5 puts **every** land boundary in `landRegions`, including the original
city, countryside, harbour and bridge decks. Each owned region has exactly one
boundary source: `outline: [{ x, y }, ...]` or `pointRefs: ["shore-00", ...]`.
The latter resolves the existing named points, so ownership, weighted Southern
Estates seams and pinned attachments keep their existing meaning. There is no
separate highland outline. The generic `src/world/land.ts` compiler accepts resolved
polygons with arbitrary IDs; its detached union supplies bounds, inclusive dry-land
queries, exposed segments, outward normals and all contributing source identities.
World and minimap drawing clip to that same polygon union, including overlaps.

Map compilation uses explicit source references in `generation`: `cityLand`,
`countryLand`, `harbourLand` and `bridgeLands`. Their IDs have no engine meaning.
Seeded scenery samples the current region bounds and rejects actual water, roads,
clearings, placements and reserved vehicle footprints. Compilation never consults
a previous or default map to reproduce an old sequence. City blocks, road graphs
and harbour missions use these references for their land-dependent inputs.
Read-only ownership policy is separate: city/harbour land and bridge attachments
stay pinned in operations. Strict imports still allow inspection of invalid drafts,
but validation must pass before gameplay preview.

Coastal composition is explicit, bounded data:

- `landPresentation` references a land ID for ground colour and optional asphalt
  artwork. It changes neither collision nor tyre material.
- `surf` references a land ID and selected ring `edges` (zero-based indices).
  Only exposed portions draw foam; removing surf leaves land and collisions intact.
- `boundaryPlacements` references a land ID and a guardrail catalogue type. A run
  declares selected `edges`, `maxLength`, inward `inset`, a `panels`/`period` repeat (open slots),
  `excludeLand`, and explicit `excludeRoads`/`clearance` openings. At most 20 runs
  and 2,000 candidate slots are accepted. Child IDs are
  `<rule-id>-edge-<index>-slot-<index>`; openings never renumber surviving children.
- Bridge panels use that same bounded rule with continuous slots on selected deck
  edges. There is no coastal-only object collection or special spawn phase.

Access edges declare modes and connect independently owned nodes; moving a district
moves each owned endpoint once and leaves the coordinate-free edge unchanged.
Validation and runtime routing sweep real bodies against the complete live world.
Directed water-gap constraints resolve **any** two distinct land IDs. A measurement
must leave the union at the source and reach the target through water; hidden or
unobservable targets produce blocking findings rather than infinite clearance.

`src/map/fixtures/second-coast.json` is an executable data-only island and pedestrian
connection with terrain, buildings, presentation and access. Its regression composes
records using transactional add operations. Collections support add/replace/delete
and duplicate; moving reference-only presentation requires moving its geometry.
Shared-ring duplication creates independent named points. Export/import and exact
undo/redo include the whole composition. `__taxi.map.describe(id)` reports resolved
land bounds and named-point seams; the authoring CLI can inspect individual rail
children or an entire boundary-placement run by stable ID.

Only version-5 documents are accepted, with `v5-` revision fingerprints. Older
schemas, stale fields, missing land/point references and unknown catalogue types
are rejected structurally rather than upgraded. Refresh each CLI example's
`baseRevision` from `map:check` after changing the baseline.

Browser automation exposes `__taxi.map`: `open`, `snapshot`, `describe`, `select`,
`apply`, `validate`, `undo`, `redo`, `import`, `export`, `preview`, `step`,
`previewState`, `live`, `edit` and `close`. Apply batches as
`{ baseRevision, operations }`; operation types are defined in
[`src/map/operations.ts`](src/map/operations.ts). `open()` freezes a programmatic
drafting session, and `preview({ spawnId: 'fairway-club' })` starts an isolated
persistence-disabled game; `edit()` discards it and `close()` restores the original
game. `live()` restores realtime preview after fixed stepping.

**F2 → Map layers** opens a read-only inspector in the temporary lab game. The
**Layers** button also works in validated map previews while the Lab is locked.
Choose Normal, Land/water, Terrain, Collision/artwork or Lighting; toggle or solo
scene layers and geometry overlays, and adjust prop/overlay opacity. Click a point
to inspect overlapping entities, their IDs and owners, the sampled terrain and its
winning region. Generated scenery without an authored ID is explicitly labelled
with a runtime ID. Land coverage, tyre materials and light blockers use the current
compiled map and live world. Hiding artwork never removes physics or light blockers.

Free camera supports pointer drag, WASD/arrows, wheel zoom and touch-friendly +/−
buttons. Pause stops realtime simulation without changing its prior fixed/live clock;
explicit fixed steps still work. Reset view restores normal rendering and actor follow;
closing or changing games clears inspection state. Map prop shadows are independent
of artwork; actor shadows remain with actors, and baked-in sprite shading stays with
the image. The map document, saved settings and progress never store these controls.

The same controls are available as `__taxi.layers`: `open`, `close`, `state`,
`preset`, `solo`, `configure`, `inspect`, `select`, `camera`, `reset`. For example:

```js
__taxi.layers.preset('terrain');
__taxi.layers.camera({ x: 185, y: 256 }, 7);
__taxi.layers.inspect({ x: 200, y: 259 });
__taxi.layers.configure({ overlays: { collision: true }, propOpacity: 0.25 });
__taxi.layers.close();
__taxi.realtime();
```

After building, `npm run browser:test -- --suite map-inspection` checks the standalone inspector offline
on desktop and three touch layouts, including selection, physical driving, free-camera
input isolation, pause and preview restoration.

For city buildings, edit reusable object records in
[`src/catalogue/content.ts`](src/catalogue/content.ts) and placements/campuses in
[`src/world/city-content.ts`](src/world/city-content.ts). A type declares its footprint, storeys,
fallback, sign and normalized artwork — a direct `image` path or shared `variants`; a
placement references it by stable ID and type. A matching placement ID replaces one
generated building; `replaceBlock` or campus ownership replaces whole blocks. Campus
bounds derive street closures; relocate affected parking/traffic descriptors in the map.
Declare resident homes and an exterior recovery entrance explicitly.
[`src/world/buildings.test.ts`](src/world/buildings.test.ts) contains examples.

An ordinary new image type is two records — one object type and one placement:

```ts
// src/catalogue/content.ts
{
  id: 'bakery', kind: 'building', width: 10, height: 10, storeys: 2,
  fallback: 'shop',
  sign: { width: 8.6, inset: 0.95, size: 0.72, color: '#f0dfae' },
  image: 'map/bakery-front.png',
  artwork: { fit: 'stretch', width: 10.6 / 10, height: 10.6 / 10, outline: 'bounds', occluder: true },
},
```

Reference the PNG as the type's `image` and run `npm run artwork:prep -- --write`: the
CLI measures the source, regenerates the inline manifest in
[`src/catalogue/generated.ts`](src/catalogue/generated.ts) and reports the transparent
padding it trimmed. There is no import list, artwork record or asset union to edit by
hand. Artwork geometry is stored as fractions of the resolved footprint, so resizing a
type default or a placement moves collision and drawing together; `artworkScale` changes
the drawing alone. Keep provenance in asset attribution.

PNG masters are the only committed raster sources. Before a build, test, dev
session or authoring preview, `npm run assets:prepare` automatically generates
display-resolution WebP derivatives in `src/assets/optimized/` and refreshes
`src/catalogue/generated.ts`. Neither output is tracked in Git. The single-file
standalone build still inlines the derivatives, with no runtime asset requests.

Derivative sizes follow the largest compiled authored placement at 2x DPR and
the closest gameplay camera; portrait derivatives are 256 px wide. The optimiser
uses content fingerprints (PNG bytes, resolution budgets and encoding settings)
and re-encodes **only** changed or missing assets. Repeated builds reuse cached
derivatives and PNG measurements, invalidating measurements when the master bytes
or decoder change. Automatic preparation shares one module runner and file cache
between optimisation and manifest generation; portraits need only header dimensions.
`npm run artwork:optimize -- --force` forces a full derivative refresh.
Changes to PNG masters during an already-running Vite dev session require a
dev-server restart to run preparation again.

### Authoring previews

```sh
npm run authoring:preview -- --list --input tools/examples/map-authoring.json
npm run authoring:preview -- --input tools/examples/map-authoring.json --entity authoring-bakery --json
npm run authoring:preview -- --input tools/examples/map-authoring.json --entity authoring-bakery --resize 24,16 --drive-from 240,450
```

Any stable entity ID in any version-5 map can be inspected; there is no per-image
command or script. `--input` accepts a full strict map or a small placement list (a JSON
array of catalogue placements) composed onto `--base`, so the fixture cannot drift when the
baseline map changes. `--list` prints the catalogue types and every inspectable ID;
`--json` returns the DOM-free report without Chromium. PNG mode records real frames with
art bounds, collision, shadow, light blocker, culling radius, attached features and
findings, plus a `manifest.json`, into `scenario-runs/authoring/ENTITY-TIMESTAMP` by
default (override with `--output`). `--resize W,H`, `--artwork-scale N` and
`--type-size W,H` preview instance or type changes without editing committed records, and
`--drive-from X,Y` proves a physical hit on the selected entity's own body. Run
`npm run authoring:test` for the DOM-free report and offline CLI.

To publish a reviewed map change, export the validated draft to `src/map/default-map.json`, run the map check, tests, and build, then open a pull request with affected fixtures updated. Merging to `main` triggers the Pages deployment workflow.

## Mission development

The default story is **Open Shore**, an optional waterfront investigation across
fourteen continuously advancing days. Its typed authored content lives in
[`src/campaign/content.ts`](src/campaign/content.ts); player instructions are in
[HOW_TO.md](HOW_TO.md#open-shore-texts-and-your-notebook).
It compiles through the same immutable, DOM-free mission engine as the original
JSON catalogue in [`src/missions/catalogue.json`](src/missions/catalogue.json).
Stops and cast
metadata are in [`src/missions/stops.json`](src/missions/stops.json) and
[`src/narrative/characters.json`](src/narrative/characters.json). New chapters, side quests,
dialogue and characters need only config plus portrait assets — no game or view
code. [`CampaignDefinition`](src/campaign/model.ts) defines world keys,
materials, claims, operations, observations, scene layers and lifecycle handlers.
Ride dialogue lives in `src/campaign/content-rides.ts`; presentation lives in
`src/campaign/content-presentation.ts`. The independent Lantern Festival fixture
in [`src/campaign/engine.test.ts`](src/campaign/engine.test.ts) demonstrates a
campaign without Open Shore identities.

For missions, use stable stop, character and dialogue IDs; `requires` controls
availability, while `chapter` ranks offers. Declare repeat/retry policy and the
pickup or completion boundary for choices and effects. Schema and executable
examples are in [`src/missions/schema.ts`](src/missions/schema.ts),
[`catalogue.json`](src/missions/catalogue.json) and the adjacent tests. Campaign
content extends these with shared conditions/effects and chronological operations.
Add portraits to `src/assets/characters/`, declare filenames in
`src/narrative/portrait-manifest.json`, and metadata/attribution in `src/narrative/characters.json`.
The eager inline registry supports SVG, PNG and JPEG; catalogue tests validate
references and portrait framing without importing browser assets.

### Stateful scenario checks

```sh
node tools/scenario-run.mjs --scenario src/scenarios/fixtures/open-shore.json --json
npm run scenario:run -- --scenario src/scenarios/fixtures/open-shore.json
node tools/scenario-run.mjs --stdin --json < commands.jsonl
node tools/scenario-run.mjs --help
```

The same persistent game runs ordered commands headlessly or with actual-app
PNG checkpoints. `--list` shows valid IDs; `--help` describes command fields and
scenario format. Examples under `src/scenarios/fixtures/` cover the investigation,
missed events and hearing outcomes and are exercised by the runner tests.
`advance` skips calendar time without physics; `step` runs 120 Hz inputs.
`place`, `pickup` and `deliver` use explicit fixture placement and cannot establish
physical route clearance. Output goes to a new ignored `scenario-runs/` directory;
`--output` must not already exist. JSON-lines input replies once per command and
stops at the first failure. Run `npm run scenario:test` for CLI/browser parity.

### Dialogue PNG previews

Review copy in the actual app UI without driving to each job:

```sh
npx playwright install chromium # once, after npm install
npm run dialogue:preview -- --character bea --shift 8
npm run dialogue:preview -- --character bea --shift 8 --choice nico-trip=roster --flag contact-bea-lost
npm run dialogue:preview -- --character bea --shift 8 --width 390 --height 844 --touch --output dialogue-previews/bea-phone
```

The CLI renders **real PNG screenshots** of the text inbox and fully revealed
pickup dialogue, including portraits, styling and the game HUD. A fresh,
persistence-disabled game stages each message in an isolated headless Chromium
context. It reads the current source, so copy edits need no production rebuild.
No driving, normal saves or settings are involved.

Output includes `manifest.json` with simulated state, eligibility checks,
prerequisites, outcomes and screenshot bounds, plus `preview.md` for reviewing
the wording. All matching copy is shown by default, including locked jobs;
staging a locked message does **not** make its booking eligible. Use
`--available-only` to filter. Scrollable/cropped panels are recorded rather than
restyled, so the preview exposes real layout limitations.

Use `--mission bea-radio-repair --view pickup` for one PNG, `--panel-only` to
crop to the message panel, and `--list` for character/flag/choice IDs.
`--completed JOB`, `--failed JOB`, and `--job parcel` simulate other states.
`--catalogue legacy --character frankie --completed mia-meridian-lead` previews
the original story and side quest. `--help` lists all options.

The default directory is `dialogue-previews/CHARACTER-shift-N` (git-ignored).
Existing artifacts are never overwritten; select another `--output` directory
for a new review. For browser-free inspection, use `--markdown` or `--json`;
invoke `node tools/dialogue-preview.mjs --json ...` for clean machine-readable
stdout. Set `CHROMIUM_PATH` to use an existing Chromium executable.

## Deployment

```sh
npm run build
```

The complete game is emitted as **`dist/index.html`**: scripts, styles, icons, sound samples, and the font are embedded in this one file. It can be opened directly with `file://` or published to a static host; internet access is not required. Save data stays in browser storage when available, but storage restrictions do not prevent playing.

To serve the production build locally, run `npm run preview`.

### GitHub Pages

The game is published at **https://lbarasti.com/taxi-chaos/**. The **Deploy GitHub Pages** workflow in `.github/workflows/pages.yml` runs on pushes to `main` and can also be started manually from GitHub Actions. It installs dependencies, runs tests, builds the standalone HTML, and publishes `dist/`. The repository's **Settings → Pages → Source** is set to **GitHub Actions**.

## Project map

- `src/physics/physics.ts`: rigid bodies, tyre forces, collision detection, and impulses.
- `src/vehicles/vehicles.ts`: typed vehicle catalogue and handling/model definitions.
- `src/world/world.ts`: seeded city generation, structures, and road routing.
- `src/vehicles/ai.ts`: civilian traffic and police behavior.
- `src/vehicles/damage.ts`, `src/rendering/effects.ts`: damage, fires, destruction, and effects.
- `src/narrative/characters.json`, `src/narrative/characters.ts`, `src/narrative/portraits.ts`: authored character metadata and the build-time inlined portrait registry (WebP derivatives of the supplied PNG masters); `src/narrative/portrait-manifest.ts` is the DOM-free declared master list.
- `src/catalogue/`: shared DOM-free building/prop catalogue records, compiler, browser-free PNG measurement and the generated inline image manifest.
- `src/missions/`: versioned mission/dialogue/stop catalogue, DOM-free director, compiled stop registry and versioned story progress.
- `src/campaign/`: Open Shore content, continuous calendar, world-event scheduler, editorial workflow and notebook.
- `src/game/`: game orchestration, difficulty and wanted rules, browser storage helpers, and gameplay regression tests.
- `src/main.ts`: bootstrap, DOM wiring, input and mode routing.
- `src/audio/`: embedded sound manifest, DOM-free cue planning, playback, preferences and sound controls.
- `src/artwork/`: compiled artwork catalogue and decoded image registry shared by the game and authoring previews.
- `src/ui/`: splash, drawer menus, player/navigation HUD, touch controls, settings and fullscreen controls.
- `src/debug/`: layer inspector and panel, scenario loader, and test API.
- `src/scenarios/`: persistent scenario runner and its fixtures.
- `src/map/`: versioned authored map, compiler, validation, programmatic authoring workspace, and preview.
- `src/assets/`: embedded font, full-resolution character and map masters, their display-resolution WebP derivatives under `optimized/`, and sound samples with attribution and credits.
- `src/test-fixtures/`: retained historical Sunset Beach assertions; not imported by the game.
- `src/rendering/renderer.ts`: Canvas rendering and debug overlays.
- `vite.config.ts`: standalone single-file build; fails if external assets remain.

## Credits and licences

Driving and rigid-body fundamentals are adapted from **Pat Kerr's [Motion Lab v0.8.2](https://patkerr.co.uk/motion-lab/)**; attribution is included in the source and game welcome screen. The in-game **Credits** screen groups every attribution by craft — driving physics, sound FX, typography and art — and keeps each source link and licence.

The locally embedded **Space Grotesk** font is by Florian Karsten and distributed under the SIL Open Font License. Font attribution and licence are in [`src/assets/`](src/assets/).

Sound sample credits, source links, licences, and edit instructions are in [`src/assets/audio/CREDITS.md`](src/assets/audio/CREDITS.md). The audio preparation script, `tools/prepare-audio.py`, requires Python 3 and ffmpeg and is not needed to build or play the game.

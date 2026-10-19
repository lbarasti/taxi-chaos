# Taxi Chaos

A frontend-only TypeScript driving game with fixed-step vehicle physics, procedural Canvas visuals, and locally embedded sound. There is no backend or runtime network access. For controls and gameplay, see [HOW_TO.md](HOW_TO.md).

## Development

Requires Node.js 22.12+ (or 24+) and npm.

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
```

`npm run build` runs the strict TypeScript check and builds the standalone game. `npm test` runs the physics, collision, jobs, destruction, pursuit, economy, and map tests. The map check validates the authored default map. `npm run artwork:prep -- --check` verifies the generated inline image manifest and reports measured PNG padding; `npm run artwork:test` covers the prep CLI offline. `npm run authoring:preview -- --list --input tools/examples/map-authoring.json` lists stable catalogue IDs, and `npm run authoring:test` covers the DOM-free report, offline screenshot CLI and `__taxi.map` automation.

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

Automated browser tests should use an isolated browser context, especially when working with shared browser sessions or saved progress. The test API supports deterministic stepping without wall-clock waits. `loadScenario(game, name)` in `src/lab.ts` is also available to Node tests without a DOM.

After building, `node tools/text-messages-check.mjs` checks the inbox offline on desktop and three touch layouts, including date grouping, loading older texts, read tracking, live countdowns and expired pickups. Screenshots go to `scenario-runs/text-messages/`; pass a directory argument to choose another destination. Set `CHROMIUM_PATH` to use an existing Chromium installation.

Browser checks write generated captures to ignored `scenario-runs/` directories.
The splash, player HUD, mobile HUD and beach checks accept `SCREENSHOT_DIR` to
override their destination. Attach relevant captures to the PR. Historical
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
collections. Higher terrain priority wins; equal priorities use stable ID order.
The terrain renderer and tyre sampler use that same order. Materials never grant
access or create land, and adding land creates neither access nor a material.

Schema 5 puts **every** land boundary in `landRegions`, including the original
city, countryside, harbour and bridge decks. Each owned region has exactly one
boundary source: `outline: [{ x, y }, ...]` or `pointRefs: ["shore-00", ...]`.
The latter resolves the existing named points, so ownership, weighted Southern
Estates seams and pinned attachments keep their existing meaning. There is no
separate highland outline. The generic `src/land.ts` compiler accepts resolved
polygons with arbitrary IDs; its detached union supplies bounds, inclusive dry-land
queries, exposed segments, outward normals and all contributing source identities.
World and minimap drawing clip to that same polygon union, including overlaps.

Legacy generators receive explicit source references in `generation`: `cityLand`,
`countryLand`, `harbourLand` and `bridgeLands`. Their IDs have no engine meaning.
`translationPoints` identifies the rural stream's Southern Estates frame, and
`candidateBounds` preserves its seeded sampling lattice independently of envelope
edits. Existing city blocks, road graphs and harbour missions remain generators;
these references supply their land-dependent inputs rather than granting access.
Read-only ownership policy is separate: city/harbour land and bridge attachments
stay pinned in operations. Strict imports still allow inspection of invalid drafts,
but validation must pass before gameplay preview.

Coastal composition is explicit, bounded data:

- `landPresentation` references a land ID for ground colour and optional asphalt
  artwork. It changes neither collision nor tyre material.
- `surf` references a land ID and selected ring `edges` (zero-based indices).
  Only exposed portions draw foam; removing surf leaves land and collisions intact.
- `boundaryPlacements` references a land ID and a guardrail catalogue type. A run
  declares `maxLength`, inward `inset`, a `panels`/`period` repeat (open slots),
  `excludeLand`, and explicit `excludeRoads`/`clearance` openings. At most 20 runs
  and 2,000 candidate slots are accepted. Child IDs are
  `<rule-id>-edge-<index>-slot-<index>`; openings never renumber surviving children.
- `coastalPlacements` contains ordinary catalogue placements in the historical
  early spawn phase. The bridge's continuous panels are explicit records here;
  their clearances and runtime ordering are preserved.

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

For city buildings, edit reusable object records in
[`src/catalogue/content.ts`](src/catalogue/content.ts) and placements/campuses in
[`src/city-content.ts`](src/city-content.ts). A type declares its footprint, storeys,
fallback, sign and normalized artwork — a direct `image` path or shared `variants`; a
placement references it by stable ID and type. A matching placement ID replaces one
generated building; `replaceBlock` or campus ownership replaces whole blocks. Campus
bounds derive street closures; relocate affected parking/traffic descriptors in the map.
Declare resident homes and an exterior recovery entrance explicitly.
[`src/buildings.test.ts`](src/buildings.test.ts) contains examples.

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

### Authoring previews

```sh
npm run authoring:preview -- --list --input tools/examples/map-authoring.json
npm run authoring:preview -- --input tools/examples/map-authoring.json --entity authoring-bakery --json
npm run authoring:preview -- --input tools/examples/map-authoring.json --entity authoring-bakery --resize 24,16 --drive-from 240,450
```

Any stable entity ID in any version-5 map can be inspected; there is no per-image
command or script. `--input` accepts a full strict map or a small placement list (a JSON
array of country props) composed onto `--base`, so the fixture cannot drift when the
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
[`src/characters.json`](src/characters.json). New chapters, side quests,
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
`src/portrait-manifest.json`, and metadata/attribution in `src/characters.json`.
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

- `src/physics.ts`: rigid bodies, tyre forces, collision detection, and impulses.
- `src/vehicles.ts`: typed vehicle catalogue and handling/model definitions.
- `src/world.ts`: seeded city generation, structures, and road routing.
- `src/ai.ts`: civilian traffic and police behavior.
- `src/damage.ts`, `src/effects.ts`: damage, fires, destruction, and effects.
- `src/characters.json`, `src/characters.ts`, `src/portraits.ts`: authored character metadata and the build-time inlined portrait registry (SVG, PNG and JPEG); `src/portrait-manifest.ts` is the DOM-free declared file list.
- `src/catalogue/`: shared DOM-free building/prop catalogue records, compiler, browser-free PNG measurement and the generated inline image manifest.
- `src/missions/`: versioned mission/dialogue/stop catalogue, DOM-free director, compiled stop registry and versioned story progress.
- `src/campaign/`: Open Shore content, continuous calendar, world-event scheduler, editorial workflow and notebook.
- `src/game.ts`, `src/main.ts`: game orchestration, input, HUD, and persistence.
- `src/lab.ts`: scenario fixtures, inspector, and test API.
- `src/map/`: versioned authored map, compiler, validation, programmatic authoring workspace, and preview.
- `src/renderer.ts`: Canvas rendering and debug overlays.
- `vite.config.ts`: standalone single-file build; fails if external assets remain.

## Credits and licences

Driving and rigid-body fundamentals are adapted from **Pat Kerr's [Motion Lab v0.8.2](https://patkerr.co.uk/motion-lab/)**; attribution is included in the source and game welcome screen. The in-game **Credits** screen groups every attribution by craft — driving physics, sound FX, typography and art — and keeps each source link and licence.

The locally embedded **Space Grotesk** font is by Florian Karsten and distributed under the SIL Open Font License. Font attribution and licence are in [`src/assets/`](src/assets/).

Sound sample credits, source links, licences, and edit instructions are in [`src/assets/audio/CREDITS.md`](src/assets/audio/CREDITS.md). The audio preparation script, `tools/prepare-audio.py`, requires Python 3 and ffmpeg and is not needed to build or play the game.

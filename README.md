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

`npm run build` runs the strict TypeScript check and builds the standalone game. `npm test` runs the physics, collision, jobs, destruction, pursuit, economy, and map tests. The map check validates the authored default map.

For interactive testing, open **http://localhost:5173/?debug=1**, then press **F2** or choose **Test Lab**. The lab also works in the standalone HTML and includes deterministic 120 Hz stepping, scenario fixtures, debug views, traffic controls, and gameplay/audio cheats.

The opt-in browser automation harness is exposed as `window.__taxi` after opening the lab:

```js
__taxi.reset();
__taxi.scenario('alley');
__taxi.step(1.1, ['KeyW']);
__taxi.state();
__taxi.vehicles();
__taxi.realtime(); // restore interactive play after automation
```

Other useful harness methods include `step`, `scenario`, `spawnVehicle`, `contacts`, `configure`, `upgrades`, `traffic`, `damageVehicle`, `repair`, `props`, `people`, `audio`, `sound`, `dayNight`, and `resetSave`. Map authoring and its browser/CLI API are documented in the [Map studio guide](docs/map-editor.md).

Automated browser tests should use an isolated browser context, especially when working with shared browser sessions or saved progress. The test API supports deterministic stepping without wall-clock waits. `loadScenario(game, name)` in `src/lab.ts` is also available to Node tests without a DOM.

## Map development

[`src/map/default-map.json`](src/map/default-map.json) is the authored source for the shipped map. Validate it with `npm run map:check -- --input src/map/default-map.json --json`. Map studio drafts are in memory until exported; the [Map studio guide](docs/map-editor.md) covers editing, validation, preview, import/export, and CLI workflows.

To publish a reviewed map change, export the validated draft to `src/map/default-map.json`, run the map check, tests, and build, then open a pull request with any affected fixtures and documentation updated. Merging to `main` triggers the Pages deployment workflow.

## Mission development

The default story is **Open Shore**, an optional waterfront investigation across
fourteen continuously advancing days. Its typed authored content lives in
[`src/campaign/content.ts`](src/campaign/content.ts); see the
[campaign guide](docs/open-shore.md) for mixed dispatch, timed world events, safe sleep and the notebook/editor workflow.
It compiles through the same immutable, DOM-free mission engine as the original
JSON catalogue in [`src/missions/catalogue.json`](src/missions/catalogue.json).
Stops and cast
metadata are in [`src/missions/stops.json`](src/missions/stops.json) and
[`src/characters.json`](src/characters.json). New chapters, side quests,
dialogue and characters need only config plus portrait assets — no game or view
code. See the [mission authoring guide](docs/missions.md) for the schema,
conditions, effects, choices, repeat/retry policies, stop validation and
progress migration.

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
- `src/missions/`: versioned mission/dialogue/stop catalogue, DOM-free director, compiled stop registry and versioned story progress.
- `src/campaign/`: Open Shore content, continuous calendar, world-event scheduler, editorial workflow and notebook.
- `src/game.ts`, `src/main.ts`: game orchestration, input, HUD, and persistence.
- `src/lab.ts`: scenario fixtures, inspector, and test API.
- `src/map/`: versioned authored map, compiler, validation, editor, and preview.
- `src/renderer.ts`: Canvas rendering and debug overlays.
- `vite.config.ts`: standalone single-file build; fails if external assets remain.

## Credits and licences

Driving and rigid-body fundamentals are adapted from **Pat Kerr's [Motion Lab v0.8.2](https://patkerr.co.uk/motion-lab/)**; attribution is included in the source and game welcome screen.

The locally embedded **Space Grotesk** font is by Florian Karsten and distributed under the SIL Open Font License. Font attribution and licence are in [`src/assets/`](src/assets/).

Sound sample credits, source links, licences, and edit instructions are in [`src/assets/audio/CREDITS.md`](src/assets/audio/CREDITS.md). The audio preparation script, `tools/prepare-audio.py`, requires Python 3 and ffmpeg and is not needed to build or play the game.

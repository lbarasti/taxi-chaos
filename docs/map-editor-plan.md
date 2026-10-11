# Map editor — implementation plan and agent handoff

- **Date:** 2026-10-11
- **Status:** Proposed implementation; this document adds no editor code.
- **Baseline:** `main` after merged [PR #14](https://github.com/lbarasti/taxi-chaos/pull/14), commit `afffba2`; 410 tests across 29 files.

## 1. Goal and motivating workflow

Build a map-editing mode inside the existing F2 LAB, backed by a structured map
document that agents can inspect, edit, validate and commit directly.

The motivating task is: **“Give the beachfront more open sea and move the golf
course and villas farther south.”** PR #14 required coordinated edits to the
coastline, roads, villas, golf holes, cart route, decorative ridges, labels,
destinations and LAB fixtures. The editor should perform that operation as a
single district translation, with connected approach roads and shared shoreline
vertices handled explicitly.

The implementation should let a human or agent:

1. Open an overview and select `southern-estates`.
2. Inspect its contents, bounds, connections and beachfront clearance.
3. Translate it by a numeric offset or drag it on the canvas.
4. See regenerated roads, colliders, destinations and scenery immediately.
5. Inspect validation findings and preview actual gameplay.
6. Undo/redo, export the map, and make a reviewable repository change.

Read `AGENTS.md` and `CONTINUATION.md` before starting. Follow the repository's
test/build and PR workflow. Preserve unrelated working-tree changes.

## 2. First release scope

### Editable content

- Southern estate district: seven villas, gardens/pools, golf course, clubhouse,
  holes, cart patrol route, road loop, stops, labels and decorative ridges.
- Eastern approach roads, their anchors and connections to the estate loop.
- Highland shoreline vertices, including the southern edge and inlet seam.
- Sunset Beach shoreline, hotel/prop placements and promenade descriptors.
- Map envelope and named clearance constraints.

### Editor controls

- Independent overview camera: pan, zoom, fit map and fit selection.
- Select a district, an authored object, a shoreline vertex or road anchor.
- Translate a district; move an object; drag or numerically edit a geometry point.
- Optional grid snapping, with the snap size shown in metres.
- Inspector with stable IDs, ownership, coordinates, dimensions and connections.
- Layers for land/water, roads, objects, generated scenery, collision footprints,
  navigation and validation findings.
- Distance measurement, water-gap measurement, undo/redo, import/export and preview.

Expose the fixed city and harbour as visible, inspectable context. Their existing
generators can remain read-only in this first release, but they must participate
in collision, access and water validation. Show read-only selections explicitly.
Design the document so their authored content can become editable later.

District rotation/scaling, arbitrary new district creation, collaborative editing
and terrain painting are later milestones. Translation, useful geometry editing
and reproducible agent operations are the first release's completion target.

## 3. Current code and integration points

| File | Relevant responsibilities / work needed |
| --- | --- |
| `src/countryside.ts` | Land outline, indexed road nodes, curve anchors, villas, golf, stops, derived pools/drives, land tests and road navigation. Replace authored coordinates with document data and rebuild derived geometry. |
| `src/beach.ts` | Shore polygon, sand sampling, hotels, beach props, protected promenade and access logic. Keep rendering, surfaces and navigation on shared geometry. |
| `src/coast.ts` | City apron, bridge decks, ocean detection and generated coastal rails. Recompute rails and water geometry after edits. |
| `src/world.ts` | Static props, spatial hash, pools, parking, residents and seeded scenery. Build these from a compiled map. |
| `src/renderer.ts` | World ground, estate art, hard-coded ridges/labels/golf detail, radar and player-following camera. Extract remaining authored geometry and support an editor camera. |
| `src/beach-renderer.ts` | Beach visuals and hotel artwork; consume the same compiled data as colliders. |
| `src/harbour.ts`, `src/harbour-renderer.ts` | Fixed harbour context, security, exchange and freight paths. Keep these functional during migration. |
| `src/game.ts` | World creation/reset, vehicle/cart/freight spawns, dispatch and navigation. Introduce map-aware construction and isolated preview. |
| `src/lab.ts`, `src/lab.css` | Existing F2 UI, fixed-step clock and serializable `window.__taxi` API. Add a Map mode and editor API. |
| `src/main.ts` | Keyboard/touch dispatch, fixed-step loop and LAB hooks. Editor events must not start driving or restore the live clock. |
| `src/radar.ts`, `src/lighting-occlusion.ts` | Radar projection and live occluders. Use the preview world's geometry. |
| `vite.config.ts` | Embeds everything into one HTML file and rejects extra build assets. Imported map data must remain embedded. |

Current landmarks after PR #14:

- `SOUTH_COAST_OFFSET = 120`; southern woodland starts around y = 392 m.
- Woodland Estates stop: `(242, 450)`; Fairway Club stop: `(132, 458)`.
- Golf course centre: `(174, 487)`; nominal map width/height: `530 × 550`.
- At least 110 m of clear water is tested across the beachfront.
- Screen south is positive y. Coordinates and sizes are metres; angles are radians.
- Negative coordinates are valid: beach extends west to x = -42 and harbour lies
  north of the city. Do not interpret width/height as a zero-origin land rectangle.

## 4. Shared map document

Suggested files; adapt names to the implementation if necessary:

```text
src/map/schema.ts           Serializable types and structural validation
src/map/default-map.json    Versioned authored map data
src/map/compile.ts          DOM-free derivation into runtime map geometry
src/map/operations.ts       Transactions, ownership and undo/redo
src/map/validation.ts       Geometry/access/clearance validation
src/map/serialization.ts    Canonical import/export and revision calculation
src/map/editor.ts           LAB UI, selection, gestures and draft lifecycle
src/map/editor-renderer.ts  Overview overlays and hit testing
src/map/editor.css          Editor layout
tools/map-check.ts          Headless agent entry point
```

Use a JSON-serializable document with `schemaVersion`, explicit coordinate
conventions, a map envelope, stable entity IDs, district ownership, named points,
land polygons, road definitions, authored placements, destinations, procedural
generation settings and clearance constraints. Add the TypeScript types and
runtime validation needed to safely consume it.

Important modelling rules:

- IDs such as `southern-estates`, `villa-the-laurels`, `fairway-drive` and
  `fairway-club` identify authored entities. Runtime numeric prop/person/vehicle
  IDs remain separate; provide source-ID links where inspection needs them.
- Road endpoints refer to named nodes. Polygon rings and curve definitions can
  refer to named points. Changing a shared point changes all its consumers once.
- Represent villas and golf as composite descriptors. A villa's pool, guest wing,
  terrace and residents derive from local offsets; moving it carries those along.
- Keep authored anchors, dimensions and styling in the document. Derive curve
  samples, road lengths/bounds, rails, clearings, colliders and spatial hashes.
- Resolve current `southPoint()` offsets to their actual coordinates during
  migration. Do not serialize the 120 m translation and apply it a second time.
- Export deterministic formatting/order, preserve IDs and retain sufficient
  numeric precision. A no-op round trip must produce no geometry changes.
- Structural import errors must be reported before any runtime world is replaced.

### Ownership and district seams

The southern estates and eastern woods share one land polygon today. Moving the
entire `HIGHLAND_OUTLINE` would also move the bridges and northern villas. Model
ownership of its points explicitly: southern vertices move with the district;
northern/eastern attachment vertices remain fixed.

Likewise, the approach roads span two districts. Their shared southern endpoints
move exactly once; northern endpoints remain fixed. Give intermediate anchors an
explicit attachment/translation weight or equivalent deterministic rule. Describe
the policy in the inspector and operation result, then resample the curves and
validate them. Do not infer membership solely from a coordinate threshold.

## 5. Runtime architecture and preview lifecycle

`compileMap(document)` should produce a complete runtime map, with all dependent
geometry derived from one document revision. `World`, `Game`, rendering, terrain
sampling, navigation and validation must use that same map instance.

Existing modules eagerly compute exports such as `COUNTRY_ROADS`, `VILLA_DRIVES`,
`COAST_RAILS` and promenade barriers. Mutating exported arrays would leave cached
derived geometry stale. Introduce map-aware factories/context, with default-map
adapters as needed during migration. Avoid a globally mutable singleton: tests,
the active game and an editor preview need to coexist without contaminating each
other. Keep DOM-free map modules independent of LAB CSS and browser globals.

Editor lifecycle:

1. Enter Map mode: freeze simulation/audio, clear held driving/touch controls and
   copy the default map into an independent draft.
2. Edit draft: update selection and lightweight geometry overlays. Rebuild expensive
   scenery/validation on gesture completion or with throttling, not per physics tick.
3. Preview: compile the draft into an isolated game/world, starting at a selected
   valid road position. Refresh spawns, jobs, routes, hashes, pools and occluders.
4. Return to editing: keep the draft and history; discard preview damage/state.
5. Close editor: restore the original game, camera and prior clock/mode without
   leaking preview progress into normal saves.

Never replace a live world while retaining old body references, AI paths or
passenger IDs. Preview progress must not write to the player's normal save keys.
Reuse the game's existing renderer/physics/AI rather than a second gameplay engine.
The map camera must not be pulled back to the player by `Renderer.draw()`.

## 6. Agent interface and transaction semantics

Expose a serializable API beneath `window.__taxi.map`. These signatures are
proposed; document the final implementation and keep it usable without pointer
interaction:

```ts
const { revision } = __taxi.map.snapshot(); // schema version, revision, draft document
__taxi.map.describe('southern-estates'); // members, bounds, seams and constraints
__taxi.map.apply({
  baseRevision: revision,
  operations: [
    { type: 'translate', targetId: 'southern-estates', delta: { x: 0, y: 20 } },
  ],
});
__taxi.map.validate();                  // structured findings and measured values
__taxi.map.undo();
__taxi.map.redo();
__taxi.map.export();                    // canonical JSON string
__taxi.map.import(json);                // validated replacement draft
__taxi.map.preview({ spawnId: 'fairway-club' });
```

- Operations include district translation, object placement, point movement and
  map-envelope changes. Validate target kind and editable fields explicitly.
- An operation batch is atomic. Unknown IDs, non-finite values, malformed geometry
  or a stale revision leave the document and history unchanged.
- Structurally valid but geometrically problematic drafts may remain editable so
  an agent/human can fix them; report findings rather than silently repairing data.
- Return the new revision, changed IDs, affected connections and findings. Returned
  objects are detached copies, not mutable references to the live draft.
- A pointer drag is one history entry; undo restores the exact previous document.
- The current default already contains PR #14's move. Demo with a reversible extra
  translation; never apply another 120 m to the shipped default by accident.

Provide a small headless command wired through npm, e.g. `npm run map:check --
--input src/map/default-map.json --json`. Use a supported TypeScript execution path
and document setup; do not assume Node can resolve every existing TS import.
The CLI must compile/validate the same document as the browser, return machine-
readable findings, and exit non-zero for errors. Support applying an operation
batch to an explicit output file for agents, sharing the same operation engine.

The standalone browser can import a local file and download JSON or return export
text through the API. An agent can write that output into the repository. Loading
the shipped map must not require runtime fetches, a backend or filesystem access.

## 7. Validation contract

Return findings in a stable form, for example:

```ts
{
  code: 'road-enters-water',
  severity: 'error',
  entityIds: ['fairway-drive'],
  position: { x: 180, y: 450 },
  message: 'Driving lane footprint crosses the shoreline',
  measured: { clearance: -0.4 },
}
```

Implement the following checks using actual gameplay geometry:

| Check | Expected treatment |
| --- | --- |
| Schema, IDs, references, finite coordinates, positive dimensions | Import/transaction structural error |
| Degenerate/self-intersecting polygons or unusable road curves | Error with affected points/segments |
| Road body footprints in water or solid scenery | Error, with bridge/port/promenade semantics respected |
| Disconnected road graph and unreachable fare destinations | Error with unresolved access/connection |
| Blocked villa drives or required walking entrances | Error using appropriate vehicle/walker dimensions |
| Villa/golf/pool footprints outside their intended land | Error; distinguish pool water from ocean |
| Authored/generated objects beyond the map envelope | Error or explicitly classified decorative exception |
| Named beachfront water-gap constraint | Report measured gap and error below the configured minimum |
| Near-clearance cases and density/visual spacing | Advisory finding with measurable context |

Use `Body`/collision helpers and land/water rules shared with the game. Centre-
point checks alone miss long trucks, near-edge collisions and narrow passages.
Bridge and harbour decks are intentional land/access exceptions. Hotel/guest-wing
attachments and generated composite parts need explicit overlap semantics.
Existing scenery may expose baseline findings: investigate and classify intended
geometry, rather than suppressing all overlap checks or changing gameplay blindly.

For the current beach regression, retain the sampled 110 m clear-water strip and
report distances between facing shore segments for interactive measurement. A
validator result should state its sampling resolution/tolerance where applicable.

## 8. Implementation phases and completion gates

### Phase A — document and unchanged default-map compilation

1. Capture the current default geometry, source IDs and representative routes.
2. Define the schema, canonical serialization and ownership/seam rules.
3. Extract the editable authored data, including renderer-only details.
4. Compile descriptors and adapt world/render/navigation/surface consumers.
5. Preserve separate seeded RNG streams and deterministic generation. A moved
   district should not gratuitously reshuffle unrelated city/harbour scenery;
   use stable per-region seeds/local generation coordinates for editable districts.

**Gate:** The default build still looks and plays like current main. Existing
tests pass; rendering and collisions agree; no stale global geometry remains in
the editable path. Ship this separately if it makes review easier.

### Phase B — headless operations, validation and agent API

1. Implement transactional translation, point/object movement and envelope edits.
2. Implement undo/redo and ownership-aware seam updates.
3. Add structured validators, revision checking and detached snapshots.
4. Wire the browser API and CLI to the same DOM-free core.
5. Verify export/import, operation-batch export and deterministic compilation.

**Gate:** An agent can inspect the estate district, move it, discover an invalid
road/water edit, undo it, and export a valid result without using the visual UI.

### Phase C — visual LAB map mode

1. Add overview camera, layers, hit testing and selection/inspector controls.
2. Add drag/numeric editing, snapping, measurement and finding navigation.
3. Route input to the editor before normal game keyboard/touch handlers.
4. Add undo/redo and import/download controls with clear draft/revision status.

**Gate:** A human can perform the same district operation as the agent API;
gesture and numeric edits produce equivalent documents, with one undo per gesture.

### Phase D — gameplay preview and standalone verification

1. Add isolated preview construction and return-to-editor lifecycle.
2. Verify relocated colliders, residents, pools, carts, fares and AI roads physically.
3. Verify preview/save isolation, camera/clock restoration and input cleanup.
4. Run the production HTML offline, then capture overview/edit/validation/preview
   screenshots and update documentation plus `CONTINUATION.md`.

**Gate:** All first-release acceptance criteria below are satisfied and the PR
contains evidence of both browser and headless workflows.

## 9. Tests and verification

Add meaningful checks for the new behaviour:

- Canonical round trip, unsupported schema, duplicate/missing IDs and non-finite
  coordinates; snapshot mutation must not alter the draft.
- Atomic rejection of invalid/stale batches and exact undo/redo restoration.
- Whole-district translation carries composite parts once, preserves dimensions,
  keeps pinned bridge/highland attachments fixed and updates connector curves.
- Two compiled maps/worlds coexist; editing one leaves the other unchanged.
- Water/road/access validators detect deliberately broken geometry, including
  a long vehicle corner over water and a blocked walking entrance.
- Seeded generation is repeatable and unrelated regions retain their scenery.
- Navigation, fare stops, cart/pool behaviours and derived collision hashes follow
  edited data. Preserve independent coordinate/clearance assertions where they
  define the intended map; avoid rewriting all tests to echo the new descriptors.
- Preview does not persist progress and close restores original gameplay state.

Verification commands for the implementing agent:

```sh
npm test -- --maxWorkers=2 --testTimeout=20000
npm run build
git diff --check
# Also run the new map CLI against the default map and edited fixtures.
```

The long freight test already has an explicit 20-second timeout. Preserve its
five-minute simulation and assertions. Run the normal CI workflow as well.

Browser QA: use a new isolated context, 1440 × 900 desktop first. Verify F2 → Map,
fit/select/translate, numeric movement, undo/redo, point editing, validation
selection, import/export and gameplay preview. Drive relocated roads and complete
a fare; confirm pools/surf and protected promenade access still work. Check a
390 × 844 viewport for readable controls and no overflow. Reload the built
`dist/index.html` offline; confirm no external runtime requests or console errors.
Restore the appropriate clock on exit and leave the user's existing tabs alone.

## 10. Final acceptance checklist

- [ ] F2 Map mode has a useful whole-map overview and independent camera.
- [ ] District movement updates all owned authored geometry and derived content.
- [ ] Shared shoreline/road seams stay coherent, with fixed attachments preserved.
- [ ] Object, shoreline-point and road-anchor edits work by pointer and API.
- [ ] Inspector/measurements explain what moved and how much room remains.
- [ ] Validation reports actionable structured findings visible on the map.
- [ ] Transactions, revisions and undo/redo behave identically for UI and agents.
- [ ] Browser and CLI import/export the same versioned, canonical document.
- [ ] Edited maps preview through actual gameplay with isolated saves/state.
- [ ] The shipped default retains PR #14's open beachfront and working estates.
- [ ] The offline single-HTML build, tests and CI pass.
- [ ] Documentation includes API/CLI examples, extension guidance and screenshots.

## 11. Suggested first action for the next agent

Start Phase A with the current southern-estates data and its seam points. Prove
that compiling the extracted document reproduces the existing map before adding
drag controls. Then implement the translation/validation transaction in Phase B;
that is the core capability both agents and the visual editor will share.

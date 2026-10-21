# Engineering and product principles

Keep this file focused on current principles. Replace changed rules in place;
remove obsolete rules instead of recording history or supersessions.

## 1. Deliver one standalone, offline game

Ship a frontend-only HTML file with embedded scripts, styles, fonts, artwork and
sound. Preserve attribution and licences. Require neither runtime services nor
browser storage to play; check the build for stray assets.

## 2. Compile one authoritative, deterministic world

Compile the current versioned map into detached, recursively frozen geometry
shared by rendering, collisions, terrain, navigation, spawns, dispatch and recovery.
Use stable entity IDs, explicit ownership and shared named attachment points.
All land belongs to `landRegions`; boundaries use coordinates or named-point
references, never both. The DOM-free land compiler carries no generator, district,
object or presentation policy. World and minimap share polygon-union coverage and
exposed edges with source identities; countryside and coastal attachments derive
from the same canonical geometry.

Keep land coverage, terrain, access and presentation independent. Compose places
from bounded map collections without location-specific engine branches. Terrain
sampling and drawing share priority and stable-ID ordering. Adding land implies
neither guardrails nor surf. Seeded generation uses current land, placements and
reserved vehicle bodies; identical current documents reproduce identical results.
Historical runtime IDs, RNG sequences and compatibility formats are not contracts.
Audio and visual effects must not consume gameplay randomness.

## 3. Author through shared catalogues and validated operations

Separate building and vehicle definitions from placements and roles. Resolve all
props through typed `objectPlacements` and one DOM-free catalogue compiler. New
image types need only a type and placement; derive the inline image manifest from
measured sources. Normalize artwork, collision sections, shadows and light blockers
to the resolved footprint so resizing and rotation transform them together. Only
explicit `artworkScale` changes drawing alone; collision never depends on decoding
or image padding. Allow at most eight rectangular solid sections per object.
Vehicle model identity is immutable; definitions drive bodies, dynamics, artwork,
AI clearance and access. Commercial vans and trucks remain NPC-only.

Keep placement rules bounded: bridge and shoreline panels share explicit geometry
references, openings, insets and stable edge/slot children. Avoid a general prefab
language. Compose small authoring fixtures onto the current default map.
Accept only the current schema, with no implicit migration. Keep imports lossless,
operations atomic, stale batches rejected and undo/redo exact. City, harbour and
bridges stay read-only; whole-district translation is limited to Southern Estates.
Use the shared DOM-free engine through CLI tools and `__taxi.map`; do not restore
a visual Map studio.

Validate full bodies, walking entrances, occupied and empty bays, water clearance,
route sweeps and workload bounds. Findings identify stable entities and probe
sizes; sampled checks state their resolution. Directed inlet gaps must cross
water to their target; unobservable gaps block preview. Invalid drafts remain
editable but cannot enter gameplay preview.

## 4. Preserve physical access, damage and vehicle ownership

Keep at least 110 m of open water across the beachfront and retain the southern
estates and golf course at their original scale. Condo podiums occupy frontage
while preserving a physical walking route to the city street. Sunset Beach and
Ocean Walk admit vehicles and pursuing police; buildings, furniture, traction and
shoreline hazards govern movement. Other pedestrian areas keep their own access
rules. Validate actual bodies and routes when changing placements.

Moving exits and significant bike crashes separate riders and vehicles while
preserving momentum, exit clearance and once-only landing injury. Keep low-speed
dismounts simple. Wrecks remain physical, fire fuses survive abandonment and each
vehicle detonates once; recovery cannot skip a pending blast. AI recovery uses
feasible body-based movement with bounded work. Damage tuning is arcade physics.
Upgrades belong to individual chassis and the wallet is shared. Repair preserves
surviving upgrades; destruction loses them. Persist invested surviving vehicles
with stable spawn identity. Harbour exchange supplies a stock replacement; any
future custody return must restore the original chassis without duplicating parts.

## 5. Separate world events, knowledge and publication

Compile missions and campaigns from validated content and shared conditions,
effects and handlers; display names and story IDs select no special mechanics.
Author service entrances and campus street closures explicitly. Use one continuous
calendar and bounded chronological scheduler for driving and skipped time.
Track occurrences, player-held records, authentication, editorial approval,
publication and public responses separately. Resolved events are irreversible.
Pickup commits transport branches; delivery grants completion effects exactly
once, including across reloads. Collection and newsroom actions require deliberate
physical interaction; submission retains originals. Do not expose undiscovered
evidence as a checklist or collapse progress into a truth score.

## 6. Isolate previews and automation from player state

Keep the original game while previews use fresh persistence-disabled instances;
laboratory copies may stage existing state without saving it. Restore the original
game, camera, mode and clock on exit. Collapsing laboratory controls does not exit
the session. Map `edit()` restores the prior game and camera with drafting frozen;
`close()` also restores the prior live/frozen clock. Browser automation uses
disposable contexts and leaves player tabs, saves and settings untouched.

## 7. Keep rendering readable, cached and independent of physics

Use reduced-resolution Canvas lighting with cached lights, readable cool night
shadows and warm local pools. Directed headlights use convex shadow extrusion and
receiver masking over raised structures in both darkness and glow passes. Cull
occluders, range-check lights and stop destroyed structures occluding; retain soft
radial lights. Decode embedded artwork once, rasterize SVG ground tiles before
play and cache patterns per canvas context. Never use live SVG pattern sources.
Keep procedural fallbacks playable when images fail. Measure performance in fresh,
GPU-enabled contexts.

## 8. Keep verification and documentation focused

Maintain deterministic laboratory scenarios, detached snapshots, fixed-step
automation and real UI playtests. Run appropriate tests, strict TypeScript checks,
map validation and the production build; verify standalone offline behavior,
console errors, external requests and desktop/touch layouts. Keep maintained
browser suites and CLI tool checks local with case results and failure captures.
CI runs core tests, build and map validation without browser provisioning. Keep
asset generators and optional performance benchmarks separate under `tools/`.

Keep this as the only file under `docs/`. Contributor workflows belong in README,
player instructions in HOW_TO and provenance in asset attribution files. Put
implementation details and validation results in the PR, generated captures in
ignored `scenario-runs/`, and executable fixtures beside their tools or tests.
Do not create replacement feature notes, plans or changelogs elsewhere.

## 9. Author physical footprints independently of artwork

Use rectangles for box-shaped props, bounded convex polygons for rounded or
irregular solids, and compound sections where recesses or holes must remain open.
Catalogue polygons use normalized coordinates and at most 32 vertices. Keep them
separate from canopy and roof silhouettes. Compile collision shapes into the map;
contacts, clearance, sight rays and inspection consume that geometry. Directed
light uses authored art blockers where present, otherwise the solid footprint of
raised occluding props. Preserve compound openings and stop destroyed props
occluding.

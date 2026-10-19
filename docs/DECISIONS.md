# Decision log

Consolidated on 2026-10-19 from the former feature notes and plans. This date
records the consolidation, not when each original decision was made. Historical
implementation reports, screenshots and exact generation prompts remain in Git.
Record a new consequential decision or supersession as a new entry; routine
implementation changes do not update this log. Contributor rules are in
[`AGENTS.md`](../AGENTS.md); workflows are in [`README.md`](../README.md).

## D01 — Deliver one offline game

**Decision:** Keep the game frontend-only and ship one HTML file containing its
scripts, styles, fonts, portraits and sound. Retain asset attribution and licences.

**Reason:** Opening a local file or using a static host should provide the complete
game without a backend or runtime asset service.

**Consequences:** New assets must be embedded at build time. Browser storage may
preserve progress but cannot be required to play. The build checks for stray assets.

## D02 — Compile one independent map per world

**Decision:** Compile versioned authored geometry into detached, recursively frozen
maps shared by rendering, collisions, terrain, navigation, spawns and dispatch.
Use stable IDs, explicit district ownership and shared attachment points.

**Reason:** Earlier district moves required coordinated coordinate edits; mutable
global geometry could leave routes and collision caches describing another map.

**Consequences:** Worlds and previews can coexist. Composite parts derive from
their owner once; weighted seams keep fixed bridge attachments connected. Preserve
seeded generation and keep presentation randomness out of the simulation stream.

## D03 — Make map edits atomic and validation physical

**Decision:** Reject malformed documents and stale operation batches atomically.
Allow geometrically invalid drafts to remain editable, but block gameplay preview.
Keep the browser and CLI on the same DOM-free operations and validation engine.

**Reason:** An editor must support repairing a bad intermediate layout without
silently relocating authored objects or presenting unsafe geometry as playable.

**Consequences:** Imports are bounded and current-schema only; export is lossless
and undo restores exact documents. Findings identify stable entities and probe
dimensions. Validate full vehicle bodies, walking entrances, empty and occupied
bays, route sweeps and water clearance. Sampled checks report their resolution;
they are not continuous geometric proofs. City, harbour and bridges remain pinned;
whole-district translation is limited to Southern Estates.

## D04 — Isolate previews from player state

**Decision:** Retain the original game while a map preview or laboratory session
uses a separate persistence-disabled instance. Restore the original instance,
camera, mode and clock on return.

**Reason:** Inspection, scripted time changes and destructive playtests must not
overwrite a player's progress or settings.

**Consequences:** Map previews start fresh; laboratory copies may stage existing
state without persisting it. Browser automation uses disposable contexts. A
collapsed laboratory panel does not imply a return to the saved game.

## D05 — Author content through stable definitions

**Decision:** Separate building and vehicle definitions from placements and roles;
compile missions and campaigns from validated content. Display names select no
mechanics or artwork. Keep model identity immutable on an existing vehicle.

**Reason:** Renaming a hospital or adding a story should not require special cases
throughout gameplay, rendering and save code.

**Consequences:** Derive bodies, dynamics, art and AI clearance from definitions.
Service entrances and campus street closures are explicit authored data. Campaign
runtime interprets shared conditions, effects and handlers rather than story IDs.
Commercial vans and trucks remain NPC-only until their access policy changes.

## D06 — Keep world events, knowledge and publication separate

**Decision:** Use a continuous calendar and one bounded chronological scheduler
for driving and skipped time. Track occurrences, player-held records, source
authentication, editorial approval, publication and public responses separately.

**Reason:** The world should change without the player's attendance. An event
occurring does not mean the player knows it, and possessing a source does not
make an allegation publishable.

**Consequences:** Resolved events are irreversible; a late intervention cannot
rewrite a hearing. Pickup commits transport branches, delivery grants completion
effects, and reload must not replay them. Collection and newsroom actions are
deliberate physical interactions; submission retains originals. Do not expose
undiscovered evidence as a checklist or combine progress into a truth score.
Richer next-step explanations and a clearer nearby newsroom visit were proposed
as follow-up work, not recorded as completed features.

## D07 — Attach upgrades to the physical chassis

**Decision:** Upgrades belong to each individual vehicle; the wallet is shared.
Repair preserves surviving upgrades, while destruction loses them. Harbour
exchange supplies a stock replacement.

**Reason:** Work installed on one car must not transfer to every car of that model
or be recreated by recovery and save loading.

**Consequences:** Persist invested surviving vehicles with stable spawn identity.
Earlier harbour notes claiming upgrades transfer are superseded by this policy.
Retrieving an exchanged original with its upgrades remains deferred; a future
custody interaction must return that chassis without duplicating it or its parts.

## D08 — Keep departures and damage physical

**Decision:** Separate riders and bikes into physical actors during moving exits
and significant crashes. Preserve momentum, physical wrecks and continuing fire
fuses; each vehicle detonates once.

**Reason:** A seat change or abandonment should not freeze a rider, cancel an
explosion or turn a damaged bike into a repaired replacement.

**Consequences:** Resolve exit clearance, once-only landing injury and riderless
mass. Low-speed dismounts remain simple. Roll, impulse attenuation and damage are
arcade tuning rather than accident predictions. Recovery cannot skip a pending
blast, and AI recovery uses feasible body-based movement with bounded work.

## D09 — Keep lighting readable and separate from physics

**Decision:** Use a reduced-resolution Canvas lighting compositor with cached
lights, readable cool night shadows and warm local pools. Directed headlights
use convex shadow extrusion and receiver masking over raised structures.

**Reason:** A dark full-frame mask obscured streets; unmasked light cones also
illuminated roofs through buildings. Full visibility polygons or per-pixel
lighting were unnecessary for this top-down game.

**Consequences:** Cull occluders and range-check per light. Apply clipping to both
darkness and glow passes. Destroyed structures stop occluding; soft radial lights
retain their intended treatment. Light and sound effects consume no gameplay RNG.

## D10 — Rasterize SVG patterns before their first draw

**Decision:** Decode embedded artwork once, rasterize the SVG ground tile before
the first playable frame, and cache patterns per canvas context. Keep procedural
fallbacks and physical footprints independent of image pixels and padding.

**Reason:** A live SVG passed to `createPattern` moved Chrome's world canvas onto
a persistent software path. Profiling misleadingly attributed the stalls to
the lighting compositor; fresh-context rasterization restored baseline timings.

**Consequences:** Do not use the live SVG as a pattern source or compare timing
on a canvas already affected by it. Performance checks need fresh GPU-enabled
contexts. Artwork bounds, collision bounds and light outlines remain explicit;
missing images must leave the game playable.

## D11 — Preserve open sea and physical public access

**Decision:** Move the southern estates and golf course south at their original
scale to retain at least 110 m of clear water across the beachfront. Let the
luxury condo podiums visibly occupy former public frontage while keeping a real
pedestrian route between buildings and the city street open.

**Reason:** The earlier inlet felt cramped; beachfront appropriation should be
visible in the world rather than conveyed only through dialogue.

**Consequences:** Shared map geometry drives shoreline, routes, scenery and water
hazards. Promenade gaps admit walking bodies while physical bollards exclude
vehicles. Check clearance and real walking routes when changing these placements.

## D12 — Keep documentation focused on decisions

**Decision:** Keep this file as the only content under `docs/`. Use the existing
README for contributor workflows, HOW_TO for player instructions and asset
attribution files for provenance. Store generated QA artifacts outside Git.

**Reason:** Feature notes became overlapping descriptions of current code, completed
plans and test reports, causing routine PR churn and contradictory instructions.

**Consequences:** Append only consequential decisions and explicit supersessions.
Put implementation details and validation results in the PR. Browser checks write
to ignored `scenario-runs/`; executable fixtures live beside their tools or tests.
Do not create replacement feature documents elsewhere.

## D13 — Resolve all building and prop artwork through one shared catalogue

**Decision:** Compile every building and prop from readable catalogue records with one
DOM-free compiler. An ordinary new image type is two records — an object type and a
placement — with no separate artwork record, renderer branch, asset union or import
list. Artwork geometry is stored as normalized fractions of the resolved footprint,
and the inline image manifest is generated by measuring the referenced sources.

**Reason:** Independently maintained metre geometry for artwork, collision and light
outlines drifted from the physical bodies whenever a type default or placement was
resized, and each new image required coordinated hand edits across several registries.

**Consequences:** Resizing a type default or a placement moves collision, artwork,
shadow silhouette and light blocker together; only an explicit `artworkScale` changes
the drawing alone. This supersedes the part of D10 that kept artwork bounds independent
of collision bounds; procedural fallbacks, one-time SVG rasterization and cached
patterns still hold. The padding prep CLI (`npm run artwork:prep -- --write`) measures
sources, regenerates the manifest and reports trimmed padding. The map schema is strict
version 3: typed catalogue references are validated structurally on import and in
operations, and older documents are rejected rather than upgraded. Authoring fixtures
are small placement lists composed onto the current default map, so they do not drift
when the baseline map changes.

## D14 — Remove the visual Map studio and keep authoring programmatic

**Decision:** Delete the in-game Map studio overlay, its canvas renderer and editor
styles. Keep the strict map engine, validation, operations, map/authoring CLIs and the
`__taxi.map` browser automation, including isolated gameplay previews.

**Reason:** The overlay duplicated the checked CLI workflow, hid the actual game and
added a large maintenance surface for a tool that authors and reviewers already drive
through commands and automation.

**Consequences:** F2 no longer exposes a map editor. Map changes go through
`map:check`, the authoring-preview CLI or `__taxi.map`; previews still use a fresh
persistence-disabled game. `edit()` restores the prior game and camera and freezes
drafting; `close()` additionally restores the prior live/frozen clock. The DOM-free
map engine, validation operations and CLI remain the only authoring paths.

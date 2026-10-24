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

## 10. Make editions and campaign completion durable

Campaign content owns its start, end, last printing deadline and publication hour.
Calendar dates label the HUD and newspapers; overnight working shifts retain their
07:00 boundary so existing booking windows do not change. Print daily coverage only
after all investigations at that timestamp settle, and save the selected article
and brief IDs with read status. Later reactions do not rewrite past editions.
Migrate older version-2 saves into a historical archive without replaying gameplay
effects or using future world facts in earlier coverage.

Campaign completion is independent of investigation success. Keep a pending recap
across saves and open it at a safe stop after any on-board fare. An explicit arcade
continuation acknowledges it without resetting cash, vehicles, upgrades or city
outcomes. Story scheduling ends; ordinary dispatch and the visual clock continue.
Keep authored coverage and outcome copy with campaign content, and bundle any
supplied illustrations offline. Articles without artwork use a text front page
until their distinct image is authored.


## 11. Bound newspaper briefs to reconstructible history

Refine decision 10: brief conditions may use clock/shift bounds, recorded operations,
publications, reactions and world keys written only by timed operations or reactions.
Reject mutable player progress and editorial submission/approval states: saves do
not preserve their ordering relative to printing at the same timestamp. Recorded
operation outcomes retain their chosen branch without reevaluating old prerequisites.
Initialize new campaigns through the chronological scheduler so opening operations
settle before the first edition. Loading reconstructs history without replaying
gameplay effects.

## 12. Stack notifications by visible display time

Use the edition invitation's corner beneath the radar for transient notification
cards. New arrivals appear immediately above older cards; only the exposed card
spends its automatic dismissal time. Menus, hidden tabs and portrait conversations
that cover this corner pause that time. Keep longer newsroom instructions, service
and recovery summaries, and fare/delivery receipts until explicit dismissal; driving
and danger alerts retain their four-second lifetime. Label categories independently
of success/danger accents. The unread-edition invitation returns when cards clear.
Notification state is transient and belongs to each game instance, never its save.

## 13. Keep morning checkpoints separate from Continue

Continue follows the latest rolling autosave. Archive one detached Save snapshot per
playable campaign morning at 07:00 in a separate, versioned localStorage collection
scoped to the campaign. New game replaces Day 1 after opening initialization; loading
a morning replaces the rolling session through a fresh Game instance. Both retain
other archived days, which are replaced individually when their mornings are reached
again. Sleep captures only after wake-up reconciliation; live crossings preserve
the current ride and shift totals. The campaign endpoint is not a playable morning.

## 14. Generate display-resolution artwork during preparation

Keep full-resolution PNG masters for measurement, crops and future edits, but do
not commit their derived WebPs or the generated TypeScript manifest. An automatic
`assets:prepare` stage runs before builds, tests, dev sessions and authoring tools.
It uses content-addressed inputs and the encoded output fingerprint to reuse valid
local results and regenerate changed or missing derivatives. The encoder is provided
by `cwebp`; CI installs the package in advance. The derived resolution budget
accounts for the largest compiled authored placement, crop fractions, a 10.5 px/m
closest gameplay camera at 2x DPR, and a 256-pixel portrait width. The PNG
measurements remain authoritative for authored geometry.

Vector ground tiles stay as authored. The final product is still one standalone
offline HTML file, with no runtime external requests or lazy chunks.

## 15. Let neighbourhood stories resolve independently of the investigation

Compose optional local stories alongside Open Shore using their own named world
facts, encounter prerequisites and scheduled outcomes. They do not grant evidence
or alter the campaign's claims, publication gates or ending. Their events still
happen without the driver, and late deliveries do not rewrite recorded history.
Treat local fares as ordinary work for dispatch cadence. Avoid creating a second
pickup for a character who is already aboard.

Bind ordinary conversations to complete authored journeys: pickup, destination,
in-car conversation and arrival belong to the same booking. Repeatable fares may
cycle through everyday situations, but fare counts do not imply offscreen life
milestones. Save an accepted journey by its stable content ID so a reload retains
its route and voice.

Optional stopovers use the same physical driving loop. Routing is reversible;
waiting requires an explicit action at a stopped, usable cab. World time continues,
progress pauses when the cab leaves or moves, and a completed stop earns its route
and wait allowance once. Preserve partial progress in the active-ride snapshot.
New characters can use explicit initial cards until portrait artwork is authored.

## 16. Adjust fares for both good and poor service

Reduce distance-based passenger and parcel base fares to one tenth of their
previous scale, rounded to whole dollars. Keep early-arrival speed bonuses at
their existing rate, cross zero at the existing trip time target and continue
deducting money for lateness. Centre comfort adjustments at 50%, ranging from
−$30 to +$30. Clamp the final payout at $0; completing a poor trip still advances
delivery and mission progress and never debits the existing wallet.

Use one shared calculation for settlement and completion receipts. Show speed and
comfort meters only on the completed-fare card, with a visible zero in the centre,
green bonuses and red deductions. Bound the visual meter without capping the
lateness deduction, and identify the minimum payout when raw adjustments exceed
the fare.

## 17. Bound service bonuses by the base fare

Supersede section 16's fixed-dollar service adjustment rates. Speed now earns or
loses 25% of the base fare multiplied by the fraction of the target time remaining;
comfort earns or loses 25% multiplied by its signed score around 50% comfort.
Round adjustments to whole dollars and cap each positive bonus at one quarter of
the base fare rounded down, so combined bonuses never exceed 50% of base.
Lateness deductions continue beyond the visual meter's minimum. Retain the neutral
thresholds, zero payout floor and shared settlement/receipt calculation from section 16.

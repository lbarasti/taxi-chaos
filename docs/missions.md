# Missions and story authoring

Taxi Chaos story content is authored as versioned JSON and compiled into an
immutable, DOM-free mission engine. New chapters, side quests, dialogue and cast
members are **config + assets**, not game or view code: no new TypeScript is
required to ship a mission.

## Where things live

Normal play now uses the [Open Shore campaign](open-shore.md), whose frozen typed
content in `src/campaign/content.ts` compiles through this same engine. The JSON
Mia/Frankie catalogue remains the legacy authoring/regression example. Campaign
date, player-held notebook material and newsroom publication are separate saved
domains, not mission flags or a relationship score.

| File | Purpose |
| --- | --- |
| `src/missions/catalogue.json` | Versioned dialogue beats and missions. |
| `src/missions/stops.json` | Authored city and beach stop identities and positions. |
| `src/characters.json` | Cast metadata: stable id, display name, portrait framing, attribution. |
| `src/portrait-manifest.json` | Declared portrait file names (DOM-free). |
| `src/assets/characters/` | Portrait art. |
| `src/missions/schema.ts` | Strict, bounded shape checking before anything is resolved. |
| `src/missions/compile.ts` | Resolves references against the map/characters, detects cycles, freezes. |
| `src/missions/stops.ts` | Stop registry compiled from the authoritative map. |
| `src/missions/director.ts` | DOM-free runtime: prerequisites, choices, repeat/retry, events. |
| `src/missions/progress.ts` | Versioned saved progress and current-schema validation. |

The engine never imports the browser portrait registry (`src/portraits.ts`), so
schema, character, stop and mission validation run in Node without an image
loader or any runtime asset request.

## Adding a mission

Add a dialogue beat and a mission to `src/missions/catalogue.json`:

```json
{
  "dialogue": {
    "jules-harbour-tip": {
      "character": "jules",
      "category": "side-quest",
      "channel": "passenger",
      "text": "A container went missing from C-76 last night. Ask no questions, get a big tip."
    }
  },
  "missions": {
    "jules-harbour-tip": {
      "title": "Harbour gossip",
      "chapter": 2,
      "category": "side-quest",
      "repeat": "once",
      "abandon": { "retry": "cooldown", "cooldownSeconds": 60 },
      "passenger": "jules",
      "requires": { "all": [ { "missionCompleted": "mia-meridian-lead" }, { "minDeliveries": 3 } ] },
      "allowed": { "jobs": ["fare"], "models": ["car", "pickup"] },
      "stops": { "pickup": "dockside-deli", "dropoff": "the-docks" },
      "beats": { "pickup": "jules-harbour-tip" },
      "effects": [ { "setFlag": "harbour-gossip" }, { "setChapter": 3 } ]
    }
  }
}
```

- `stops.pickup` / `stops.dropoff` are stable **stop ids**, not coordinates.
- `beats.pickup` names the dialogue beat; the passenger name comes from
  `passenger`. An optional `beats.pickupSender` plays instead when the pickup is
  a parcel run (for example on a courier bike).
- `effects` run once on delivery. `requires` gates availability.
- Optional `offer: { "character": "mia", "text": "Meet me at Garden Café?" }`
  introduces a mission through the Texts inbox. Eligible texts coexist regardless
  of dispatch radius, with physical passengers at their authored pickups. Routing
  a text only changes navigation; it does not accept, abandon or commit a mission.
  Without `offer`, the existing local automatic dispatch remains supported.
- Optional `dispatchRadius` (10–1000 m; default 160) bounds how far from the actor
  dispatch assigns an authored pickup. Out-of-range stories remain available in
  the director and are never relocated. Mia uses 120 m so hospital dispatch stays local.

### Conditions

Conditions nest and are bounded (maximum depth 8, 64 nodes).

| Condition | Meaning |
| --- | --- |
| `{ "all": [ ... ] }` / `{ "any": [ ... ] }` | every / at least one child holds |
| `{ "not": { ... } }` | negation |
| `{ "missionCompleted": "id" }` | that mission has been delivered |
| `{ "flag": "id" }` | the named flag is set |
| `{ "choiceEquals": { "group": "id", "choice": "id" } }` | a choice group is committed to an option |
| `{ "choiceUnset": "id" }` | a choice group has not been committed |
| `{ "minDeliveries": 3 }` | completed deliveries in this campaign (story reset clears this count) |
| `{ "minCareerDeliveries": 3 }` | lifetime career deliveries (story reset preserves this count) |
| `{ "shiftAtLeast": 3 }` / `{ "shiftAtMost": 8 }` | explicit campaign shift window (1–14), supplied by the runtime context |
| `{ "chapter": 2 }` | story chapter reached |

### Effects

Effects are bounded (maximum 16 per list) and applied **atomically**: a
conflicting `setChoice` rejects the whole batch.

| Effect | Meaning |
| --- | --- |
| `{ "setFlag": "id" }` / `{ "clearFlag": "id" }` | set or clear a story flag |
| `{ "setChoice": { "group": "id", "choice": "id" } }` | commit a choice directly |
| `{ "setChapter": 2 }` | raise the story chapter (never lowers it) |
| `{ "relationship": { "character": "jules", "delta": 2 } }` | adjust a bounded (−100…100 per edit) relationship score |

## Choices

A mission may declare choice groups that lock in at the pickup stop or on
delivery. Options are mutually exclusive: committing a second option for the
same group is rejected, while re-committing the same option is an idempotent
no-op. An option may be marked `"default": true` for automatic commitment.

```json
"choices": [
  {
    "id": "jules-gift", "commit": "completion",
    "options": [
      { "id": "keep", "default": true, "effects": [ { "relationship": { "character": "jules", "delta": -1 } } ] },
      { "id": "give", "effects": [ { "relationship": { "character": "jules", "delta": 2 } }, { "setFlag": "jules-favoured" } ] }
    ]
  }
]
```

Group ids must be unique across the whole catalogue; option ids are unique
within their group. Competing missions can reference the same pickup-bound group
using `pickupChoice: { "group": "meridian-trail", "choice": "cafe" }`.
Declare the group once, on one participating mission, and reference its options
from each branch. The compiler checks the group, option, pickup boundary and
unconditional conflicts. Driving into a pickup ring and stopping for 0.8 seconds
accepts the physically visited offer and commits its choice atomically, even if
another text was routed. The other branch becomes unavailable immediately.
Abandonment preserves that choice and the selected mission's retry policy;
pickup effects do not run again on retry. Delivery effects wait for delivery.
Independent texts stay available and can be delivered before or after the plot
branch. A loaded fare cannot be replaced by a text; finish or abandon it first.

The default content demonstrates this after `mia-meridian-lead`: Mia's café trail,
Frankie's competing dock-ledger trail, and an independent arcade lift. The inbox
shows sender portraits, full messages, named pickups and explicit branch cues;
other available pickups receive cyan world and radar markers. Its scrollable layout and
44px buttons support desktop, compact portrait and landscape screens.

### Received texts are player knowledge

`Save.playerRecords` is a separate versioned record, independent of mission flags
and opportunity eligibility. Each delivered offer records a stable
`messageId` (`<mission-id>-text`), `receivedAt`, nullable `readAt`, and a snapshot
of its sender, title, text and named pickup. Receipt happens once when the game
introduces an eligible offer. Read time is recorded only when its complete text
body is actually shown inside the open inbox's scroll viewport. Off-screen texts
remain unread. Both operations persist immediately; invalid records default to
empty rather than fabricating historical knowledge.

The inbox renders received records, including closed branches, delivered missions
and missed opportunities. Only action buttons and physical markers use current
availability. Routing is disabled on historical messages, and the Texts badge
counts unread receipts. Records survive reloads and shifts; explicit story reset
clears them. Records are bounded to 400 stable messages without evicting knowledge.

### Waiting contact loss and co-located pickups

An unselected or routed text-offer contact who dies (or goes missing) permanently
misses that opportunity: the director records a `missed` event and saved `failed`
mission ID, then applies optional authored `contactLost.effects` atomically once.
The default leads author dedicated missed-opportunity flags. No identical contact
is recreated on the next update, on a shift reset or after loading. Other offers
and received information remain intact; this mission outcome does not introduce
the future world-character condition system.

Offers may share pickup stops. When pickup rings overlap, the already-routed offer
wins if it is inside its ring; otherwise the first eligible nearby offer is used.
Physical offer reconciliation runs at discrete dispatch, routing, vehicle-change,
pickup and contact-loss events, plus a bounded 0.5-second narrative checkpoint
for cooldown expiry and prerequisite changes, rather than every 120 Hz tick.

The director emits a bounded lifecycle event log (`accepted`, `pickup`,
`completed`, `abandoned`, `choice`). Offers are keyed by stable mission IDs,
bounded by the validated catalogue limit, and reuse their waiting passengers
when the player changes routes. Their initial pose is deterministic and does
not consume the procedural RNG stream. Lab snapshots include detached offers.

`commitChoice(group, option, context)` selects an option only for the active
mission, before its authored boundary: before pickup for pickup groups, and
after pickup for completion groups. Selection is transient and has no effects.
Only `pickup()` or `complete()` commits the outcome atomically, rechecking option
prerequisites at that boundary. Abandonment discards selections. Inactive/future
mission selections and selections at the wrong stage return false.

## Chapter semantics

`mission.chapter` ranks offers; it does **not** gate availability. Use an explicit
`{ "chapter": 2 }` prerequisite to require chapter 2. This allows optional quests
to appear independently of plot progression. Dispatch and `nextOffer()` share
the same chapter-then-catalogue ranking, with pickup-radius filtering preserving
that order. Compilation exposes immutable `warnings` with affected mission IDs
for higher-chapter missions whose empty `all` prerequisites would expose them
immediately; intentional early opportunities may retain that warning.

## Repeat and abandonment

- `repeat`: `"once"` (default narrative missions) or `"repeatable"`.
- `abandon.retry`:
  - `"always"` — remains available after any abandonment (progress is preserved).
  - `"cooldown"` — unavailable for `cooldownSeconds` of campaign gameplay after abandonment.
  - `"never"` — marked failed and locked out.

Abandonment never silently wipes story progress. A new shift, hospital stay or
arrest keeps `Save.story`; only the explicit `game.resetStory()` clears it.

Cooldown deadlines are absolute saved `campaignSeconds` timestamps, unaffected
by shifts or reloads. This monotonic elapsed-gameplay clock advances only while
playing; it pauses in menus and does not advance while the game is closed. It is
separate from resettable `Game.time` and the day/night presentation clock. The
game saves it every five seconds, on leaving gameplay and on page exit, as well
as immediately when a mission is abandoned. Calendar scheduling can build on
this primitive; campaign events, world conditions, encountered information,
newsroom verification and publication remain separate state domains.

## Vehicle policy

`allowed.jobs` (and optional `allowed.models` / `allowed.kinds`) declare which
rides may run a mission. Switching to a ride the mission does not allow abandons
it instead of silently rewriting it as a different story. The opening mission
allows both `fare` and `parcel`, so taking a courier bike plays the authored
sender variant.

## Stops

Stops are resolved from the shared compiled map. Authored stops are validated at
compile time and rejected — never relocated — when they are malformed: unknown
ids, duplicate ids, positions outside the map envelope, points in open water,
points overlapping existing static props, or points more than 6 m from a
drivable road. Every mission's pickup→dropoff pair must have a real vehicle
route. Highland stop identities are merged from the authoritative map document.

## Adding a character

1. Add the portrait file under `src/assets/characters/`.
2. Add its file name to `src/portrait-manifest.json`.
3. Add metadata to `src/characters.json`.

```json
"jules": {
  "id": "jules",
  "name": "Jules",
  "portrait": { "sources": ["jules.png"], "objectPosition": "50% 50%" },
  "attribution": "Portrait art created for Taxi Chaos (jules.png raster)."
}
```

`validatePortraitRegistry` fails the suite if the manifest and the folder drift
apart, and `validateCharacterCatalogue` rejects unknown portraits, mismatched
ids, empty names/attribution and out-of-range framing. Everything is inlined as
a data URL at build time, so no runtime asset request is ever made.

## Saved progress

`Save.story` is a versioned `MissionProgress` saved beside the economy:

```json
{ "version": 1, "chapter": 1, "completed": [], "failed": [], "flags": [], "choices": {}, "relationships": {}, "campaignSeconds": 0, "deliveries": 0, "retryAt": {} }
```

Save loading requires current story, player-record and campaign versions;
invalid fields are sanitised. Obsolete formats start fresh. The transient
active mission, routed offer and dialogue are **not** saved. Eligible text offers
are reconstructed from saved prerequisites, completed missions and choices on
reload, recovery and new shifts. Games constructed
with persistence disabled (map previews, the test lab) use fresh progress and
never read the save.

Lifetime deliveries stay separate from mission-specific counters.
Each paid delivery increments both counters
exactly once, whether it is authored or procedural. Authored outcome references
continue to use stable mission IDs via `missionCompleted`, rather than totals.

## Verification

- `npm test` covers schema errors, missing references, prerequisite cycles,
  prerequisites, choice exclusivity, pickup vs completion commitment,
  abandonment/retry, repeat rules, current-schema validation, reset/recovery, snapshot
  isolation, RNG isolation and game integration.
- `npm run build` runs the strict TypeScript check and the standalone build.

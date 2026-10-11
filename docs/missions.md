# Missions and story authoring

Taxi Chaos story content is authored as versioned JSON and compiled into an
immutable, DOM-free mission engine. New chapters, side quests, dialogue and cast
members are **config + assets**, not game or view code: no new TypeScript is
required to ship a mission.

## Where things live

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
| `src/missions/progress.ts` | Versioned saved progress and legacy migration. |

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
| `{ "minDeliveries": 3 }` | the save's lifetime delivery count |
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
no-op. An option may be marked `"default": true` so the current single-offer
flow can commit it without the upcoming choice UI.

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
within their group. The third PR adds simultaneous offers and the pickup choice
UI; the director already emits a bounded lifecycle event log
(`accepted`, `pickup`, `completed`, `abandoned`, `choice`) for it.

## Repeat and abandonment

- `repeat`: `"once"` (default narrative missions) or `"repeatable"`.
- `abandon.retry`:
  - `"always"` — remains available after any abandonment (progress is preserved).
  - `"cooldown"` — unavailable for `cooldownSeconds` after abandonment.
  - `"never"` — marked failed and locked out.

Abandonment never silently wipes story progress. A new shift, hospital stay or
arrest keeps `Save.story`; only the explicit `game.resetStory()` clears it.

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
{ "version": 1, "chapter": 1, "completed": [], "failed": [], "flags": [], "choices": {}, "relationships": {} }
```

Legacy saves without a `story` field default to a fresh chapter 1; unknown
future versions also fall back rather than corrupting progress. The transient
active mission, current offer and dialogue are **not** saved. Games constructed
with persistence disabled (map previews, the test lab) use fresh progress and
never read the save.

## Verification

- `npm test` covers schema errors, missing references, prerequisite cycles,
  prerequisites, choice exclusivity, pickup vs completion commitment,
  abandonment/retry, repeat rules, migration, reset/recovery, snapshot
  isolation, RNG isolation and game integration.
- `npm run build` runs the strict TypeScript check and the standalone build.

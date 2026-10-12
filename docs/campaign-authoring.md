# Campaign authoring

The selected campaign is `campaignDefinition` in `src/campaign/content.ts`. Its Open Shore facts, missions, scheduled operations, editorial dependencies, observation rules, vehicles and copy are authored there. Travel dialogue lives in `content-rides.ts`; conditional coverage and scene art live in `content-presentation.ts`. The scheduler, save parser, mission director, Game, renderer and notebook view do not branch on Open Shore identities.

`CampaignDefinition` in `src/campaign/model.ts` is the content contract. A thread extends the selected definition with stable world keys, missions, materials, claims, operations and handlers. An entirely different definition can also be supplied as Game's fifth constructor argument. The independent Lantern Festival fixture in `src/campaign/engine.test.ts` exercises this path without Open Shore data or runtime adapters.

## Conditions

Mission prerequisites, choice prerequisites, operation outcomes, claim gates, event handlers, observations, vehicles, bulletins and scene layers use the same `Condition` interpreter.

| Operator | Meaning |
| --- | --- |
| `all`, `any`, `not` | Compose predicates |
| `worldEquals: { key, value }` | Compare a declared string, boolean or numeric world value |
| `worldAtLeast: { key, value }` | Compare a numeric world value against a threshold |
| `knows: recordId` | The player acquired that notebook material |
| `materialState: { id, state }` | The newsroom received or verified that material |
| `caseState: { id, state }` | A claim was verified or editorially approved |
| `published: claimId` | A claim actually reached an edition |
| `reacted: claimId` | The later public response occurred |
| `occurred: operationId` | An authored scheduled operation was resolved |
| `relationshipAtLeast: { character, value }` | A relationship meets a threshold |
| Existing time, flag, choice, completion, chapter and delivery operators | Continue to work |

Knowledge, newsroom authentication, editorial approval, publication and world consequences remain separate domains. A world value changing does not automatically acquire evidence or print a claim.

## Effects and events

All effect lists use the same reducer. Existing flags, choices, chapters and relationship effects are joined by `setWorld: { key, value }` and `acquireMaterial: recordId`. World keys and their scalar types must be declared in `initialWorld`; materials must be declared in `materials`.

An operation has `id`, `at`, `effects` and optional ordered `outcomes`. Each outcome has its own `id`, `requires` and `effects`; the final outcome must omit `requires` and acts as the fallback. The first matching outcome is recorded once. A later intervention cannot rewrite an occurrence.

Claims declare independent corroboration `routes`, optional `verifyRequires`, `approveRequires` and `publishRequires`, and `reactionEffects`. Claim dependencies are validated for cycles and determine a stable processing order, rather than using claim names in the scheduler. Verification and responses retain their existing three-hour and two-hour delays; editions retain the 06:00 cutoff.

Handlers declare `on`, optional `id`, optional `requires` and `effects`. Events include mission acceptance, pickup, completion, abandonment, missed opportunities and choices, plus observations, newsroom submission, verification, editorial requests, editions, reactions, operations and completed rides. Handlers run after the event's built-in state transition, in authored order. Eligible checked cases are reevaluated immediately after every domain transition. They do not contain callbacks or executable authored code. A `clock` handler runs at claim-condition time boundaries; use a scheduled operation for a specific authored time.

Mission completion stages mission effects, lifecycle handlers, acquired materials and the signed delivery record in one transaction. A conflict rolls back world state, story progress, knowledge and the lifecycle log. Repeated completion, material acquisition and occurrence resolution remain idempotent. Ordinary ride bookkeeping also enters through the typed `ride-completed` event.

Skipping and driving use the same bounded chronological scheduler. Its budget derives from content counts, and claim time predicates contribute their own boundaries so a large skip cannot postpone a case that became ready earlier. Reload validates source chronology and publication dependencies, including a case unlocked by an edition at the same timestamp. Verified cases are durable milestones: changing a mutable admission predicate later does not revoke them, and reload does not rerun gameplay handlers or grant materials.

## Physical presentation and validation

- `sites` resolve stable stop IDs to nearby building bodies.
- `observations` declare their stop, radius, predicate, acquired material and UI copy. The menu and scenario `photo` command use these definitions; `photo` optionally accepts an `observation` ID.
- `vehicles` declare model, spawn offsets, predicate and departure destination. Game performs the shared footprint/obstacle checks and lifecycle projection.
- `scenes` declare conditional rectangles and labels, attached to a site or vehicle. The renderer interprets those primitives without narrative identities.
- Bulletins and ordinary responses select the first matching authored entry. Headline, editor, newsroom and campaign labels come from the definition.

`assertCampaignDefinition` checks bounded collections, expression shapes, references, world value types, outcome fallbacks, claim dependency cycles, mission windows and physical presentation data before Game compiles the campaign. `engine.test.ts` also guards the generic runtime against the known Open Shore identifiers. Existing Open Shore tests and scenarios remain behavior regression coverage.

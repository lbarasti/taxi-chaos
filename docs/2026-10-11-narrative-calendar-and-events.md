# Recommendation: modelling a two-week narrative calendar and conditional events

Date: 2026-10-11  
Status: design recommendation; no runtime changes in this PR

## Decision in brief

Build a **small, deterministic campaign clock + narrative event scheduler + condition-gated storylets**. Keep the scheduler authoritative for *when the world changes*, and use a separate delivery/presentation layer for *how the player discovers those changes*. Make state explicitly five-part: **Campaign**, **world and characters**, **player records**, **newsroom**, and **public consequences**.

The non-negotiable rule is:

> An event occurring must not imply that the player witnessed or learned it. Possessing evidence must not imply that the newsroom has verified it. Verification must not imply publication, and publication must not imply a particular reaction.

Use data-authored, bounded events with stable IDs, explicit deadlines, typed effects and idempotent resolution. Start with a TypeScript catalogue rather than importing a new narrative engine or a full event-sourcing framework. Dialogue tooling can be reconsidered later if branching conversation authoring becomes the bottleneck.

This document proposes mechanics and architecture; it does not claim the campaign, sleep, newsroom or publishing UI are implemented.

## 1. What Taxi Chaos already has

Repository review on 2026-10-11:

| Existing code | Present behaviour | Implication |
| --- | --- | --- |
| `src/day-night.ts` | `DayNight` starts at 07:00, tracks `day`, advances at 1 in-game minute per simulated second by default, and exposes time/lighting snapshots | Reuse the clock's concepts, but add an absolute campaign timeline and fast-forward API |
| `src/game.ts` | The fixed 120 Hz `Game.update` advances `this.time` and `dayNight` only in `playing`; `newJob` and `jobs` manage pickup/drop-off | Emit explicit domain events from completed operations, not from HUD or dialogue |
| `src/story.ts` | Stable `storyBeat` IDs refer to immutable pickup dialogue with passenger/sender variants; `Dialogue` is run-only presentation state | Preserve this as a presentation adapter, not the quest database |
| `src/game.ts` / `src/storage.ts` | `Save` currently keeps cash, lifetime deliveries, upgrades and best earnings under `taxi-chaos-v1`; runtime world clock and narrative dialogue are not saved | Add a versioned **campaign save** with migrations; avoid confusing career totals with campaign quest progress |
| `src/main.ts` / `src/lab.ts` | HUD consumes the day/night snapshot; Test Lab can set/freeze the lighting clock and fixed-step gameplay | Add separate campaign inspection and controlled fast-forward, keeping lab/preview isolated |

Relevant existing design notes: [day/night cycle](2026-10-09-day-night-cycle.md), [pickup dialogue](pickup-dialogue.md), and the repository [workflow rules](../AGENTS.md).

Two traps to avoid: `DayNight.configure({ hour })` changes only the time of day (not the elapsed-day count), so it is **not** a sleep implementation; and `jobsDone` / `save.deliveries` are counters, **not** evidence that a specific authored delivery or quest was completed. Give authored operations stable IDs and emit completion events using those IDs. A recurring customer's display name (such as Mia) is not a mission identity.

## 2. Research and design alternatives

Three complementary, established ideas apply:

1. **Quality-based narrative / storylets.** Failbetter describes small narrative units whose availability depends on world-state “qualities”, deliberately avoiding an ever-growing choice tree. Its “Carousel” also uses a progression/timing quality to open and close content. This is a close fit for optional taxi jobs, interviews, missed appointments and conditional encounters. [Failbetter: QBN](https://www.failbettergames.com/news/storynexus-developer-diary-2-fewer-spreadsheets-less-swearing), [narrative timing structures](https://www.failbettergames.com/news/new-narrative-structures).
2. **Conditional dialogue and saliency.** Yarn Spinner's node groups use `when` conditions (including “once”), and its saliency rules select an eligible variant. ink similarly supports conditional choices, variables, visited-content checks and game integration. These are useful *authoring patterns* for which conversation or scene to show, but neither needs to own the actual campaign calendar. [Yarn node groups](https://docs.yarnspinner.dev/write-yarn-scripts/advanced-scripting/node-groups), [Yarn saliency](https://docs.yarnspinner.dev/write-yarn-scripts/advanced-scripting/saliency), [ink authoring](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md).
3. **Domain events and materialized views.** Event-sourcing guidance distinguishes a recorded occurrence from the state projected for different uses, emphasizes stable ordering and idempotency, and warns that a complete event-sourcing system adds substantial complexity. We should borrow the **explicit event record and projection boundaries**, not introduce a distributed event bus or rebuild the entire game around replay. [Microsoft: event sourcing pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing).

Avoid a single giant branching quest FSM: two weeks of deadlines, side quests and reactive characters create too many combinations. Also avoid checking arbitrary narrative predicates on every 120 Hz physics tick. Use **scheduled milestones for irreversible happenings**, **condition-gated opportunities for player agency**, and **brief local FSMs only for individual multi-step quests**.

Failbetter also warns about “quality” proliferation and combinatorial content growth: most routes should reconnect to shared story milestones, with branches altering evidence, characters and outcomes rather than multiplying entire campaign scripts. [Narrative parsimony](https://www.failbettergames.com/news/narrative-snippets-parsimony-2).

## 3. The two-week time contract

### Canonical time

Use **one monotonic campaign timestamp**, expressed as integer **in-game minutes** plus an optional sub-minute fraction for smooth lighting. Derive day, hour and minute from it. Define all authored deadlines in campaign time; never use wall-clock timestamps, `Date.now()` or frame counts.

**Recommended product contract:** 14 full 24-hour intervals, beginning Day 1 at 07:00 and ending at **Day 15, 07:00** (20,160 in-game minutes later). The last overnight period belongs narratively to the *fourteenth night*; Day 15 at 07:00 is the ending/epilogue boundary, not a fifteenth playable shift. Do not allow new campaign jobs beyond this boundary. If design instead intends “calendar days 1–14, ending at Day 15 00:00”, explicitly shorten the duration to 13 days 17 hours; do not leave this as an off-by-one ambiguity.

Today's default rate (1 in-game minute per simulated second) implies **24 real-time minutes per unskipped in-game day**, or **5 h 36 min for two full weeks** of continuous simulation. Sleep is therefore an essential pacing tool. Make the calendar visible as “Day X / 14” alongside the current HH:MM and show an explicit upcoming deadline when the player knows of one. Do not show undiscovered secrets on the player HUD.

Separate three kinds of time:

| Clock | Advances by | Used for |
| --- | --- | --- |
| Campaign / narrative | Playing time and deliberate sleep/time skips | Appointment windows, character whereabouts, redevelopment milestones, newspaper deadlines, final act |
| Simulation seconds (existing `Game.time`) | Active 120 Hz gameplay only | Physics, police pursuit, fires, fare-tip timer, typewriter text, short effects |
| Real-world time | **Never** controls story progress | Rendering and input only |

The lighting system should ultimately **derive from campaign time** rather than maintain an independently mutable day/hour. Lab-only hour/rate/freeze controls must not quietly mutate story state; support an explicit “visual preview” clock override or a clearly labelled “advance campaign time” test action.

### Sleeping and fast-forward

Provide sleep at a plausible safe location, initially Pit Stop/home. Default “Sleep until 07:00 tomorrow” (with optional later wake choices only if supported by the story). Preview: wake day/time, hours skipped, **known** opportunities expiring, and a warning that the world will advance. Require an explicit player action.

Disallow sleeping while carrying a passenger or parcel, in an active chase, in danger, during a choice/dialogue that cannot safely be dismissed, or after the finale. Resolve or explicitly abandon the current job first. Do not silently retain a passenger across multiple days.

**Never simulate N hours of vehicle physics at 120 Hz during sleep.** Use a narrative fast-forward transaction that traverses due milestones and expiry boundaries in chronological order, resolves condition changes, then sets the final clock. Reset/relocate transient traffic and effects according to explicit safe-world policies; do not fast-forward burning fuses, fare-tip timers or police AI as if the world had been physically simulated. Define recovery rules for fuel, damage, heat and the parked car separately.

A sleep can skip many occurrences, but should show a short *morning recap* of what the protagonist was reasonably told or what is now publicly visible. Backstage facts must stay backstage.

## 4. Model the five state domains independently

The engine may own one `NarrativeState` object, but **ownership and permissions must stay distinct**:

| Domain | Authoritative contents | Typical writes | UI exposure |
| --- | --- | --- | --- |
| **Campaign** | Monotonic clock, phase, resolved/scheduled operation IDs, quest lifecycle, historic occurrence ledger | Scheduler, delivery completion | Calendar, **known** mission deadlines; developer log |
| **World and characters** | Café status, employer/role, character location/availability, faction decisions, current conditions | World-operation effects; player-world interactions | Observable environment and conversations |
| **Player records** | Seen dialogue lines, personally witnessed scenes, collected photos, receipts and other material; acquisition provenance | Presentation/interaction/evidence pickup | Journal and evidence inventory |
| **Newsroom** | Material submitted/received, verification status, interviews, credibility and draft readiness | Deliberate submission, investigation and editor actions | Caseboard and publishing workspace |
| **Public consequences** | Published article IDs and claims, release times, audience reach, institutional reactions | Explicit publication; scheduled responses | Headlines, radio, changed behaviours |

Recommended invariants:

- `campaign.occurred('meeting')` **does not imply** `records.knows('meeting')`.
- `records.has('receipt')` **does not imply** `newsroom.received('receipt')` or `newsroom.verified('receipt')`.
- `newsroom.verified('receipt')` **does not imply** `public.published('misconduct')`.
- `public.published('misconduct')` **does not imply** `world.policeReform = true`; that is a separate, possibly delayed/rejected response.
- Material and knowledge have **provenance** (how/when learned, from whom, reliability). An eyewitness account, rumour and authenticated document must not become equivalent booleans.
- An event can change the world even when every journal/newsroom/public state remains unchanged.

Do not implement these as five copies of one generic “flags” dictionary. Use typed, domain-scoped commands and selectors. Reusable status values are fine, but enforce a **single writer/authority** per fact. Derived statuses (e.g. “can publish” from verified sources and approved draft) should be computed, not independently toggled.

### Proposed minimal persisted shape (illustrative TypeScript)

```ts
type NarrativeSaveV1 = {
  version: 1;
  campaign: {
    minute: number;              // monotonic; initial wall minute = 7 * 60
    resolved: Record<string, { at: number; outcome: string }>;
    quests: Record<string, 'locked' | 'available' | 'active' | 'done' | 'missed'>;
    occurrences: Array<{ id: string; at: number; type: string; detail?: string }>;
  };
  world: {
    locationStatus: Record<string, string>;
    characters: Record<string, { role: string; locationId: string; available: boolean }>;
    flags: Record<string, boolean | number | string>;
  };
  records: {
    observations: Record<string, { at: number; source: string }>;
    evidence: Record<string, { acquiredAt: number; source: string }>;
  };
  newsroom: {
    received: Record<string, { at: number }>;
    verification: Record<string, 'pending' | 'authenticated' | 'rejected'>;
    interviews: Record<string, { at: number; completed: boolean }>;
  };
  public: {
    publications: Record<string, { at: number; claims: string[] }>;
    reactions: Record<string, { at: number; status: string }>;
  };
};
```

This is a **conceptual schema**, not a commitment to unlimited arbitrary string flags. Implement the first authored slice with an explicit set of typed fact keys, authored validators and stable character/location/evidence IDs. Store the occurrence ledger for debugging, provenance and once-only resolution, with a size policy (14 days of authored events should be modest). It is **not** a demand to event-source every traffic car, collision or coin.

## 5. Two distinct narrative objects: happenings and opportunities

**A. Happenings / operations** change the world at a specified time or when a condition becomes true. They may happen off-screen and should resolve once. Example: a redevelopment hearing takes place on Day 5 at 10:00 unless formally cancelled; after it, the café's lease changes. Record the actual outcome, even when the player is sleeping.

**B. Opportunities / storylets** are things the player *may encounter or do* while eligible. Example: speak with the cleaner on Days 3–6 if she still works at the café, or intercept an evidence-carrying delivery before the vans leave. Eligibility can change without “firing” a story; encountering it is a separate event.

Trigger vocabulary for MVP:

- **At time:** first crossing of a particular campaign minute, even if sleeping.
- **After / window:** available from a minute and expires at a minute, with explicit inclusive/exclusive boundary rules.
- **On gameplay event:** named domain signal, e.g. `DeliveryCompleted({ jobId, routeId, at })`, `EvidencePickedUp`, `InterviewFinished` or `PublicationReleased`.
- **When condition:** predicate becomes true following a relevant state change; subscribe by dependency keys or rescan at safe narrative checkpoints. Do not rely only on a one-time false evaluation.

Events may combine these conditions. A due operation must specify what happens if prerequisites are absent: **cancel with recorded outcome**, **choose an authored fallback**, or **reschedule once with a bounded deadline**. Never leave an overdue event invisibly pending forever.

Illustrative event definition:

```ts
const hearing = {
  id: 'meridian.hearing.day-05',       // stable, unique, author-owned
  kind: 'operation',
  at: dayMinute(5, 10, 0),
  if: { not: { worldFlag: 'hearingCancelled' } },
  blockedOutcome: 'cancelled',
  outcome: {
    occurred: 'hearingHeld',
    changes: [{ domain: 'world', action: 'setLocationStatus',
                id: 'garden-cafe', value: 'closure-pending' }],
  },
};

const cleanerInterview = {
  id: 'cleaner.interview',
  kind: 'opportunity',
  window: { from: dayMinute(3, 7, 0), until: dayMinute(7, 7, 0) },
  when: { and: [
    { characterAvailable: 'cleaner' },
    { recordKnown: 'meridian-van-rumour' }
  ] },
  onAccept: 'begin-cleaner-interview',
  onExpire: 'cleaner-left-town',       // authored missed/alternative route
};
```

Here, `dayMinute(day, hour, minute)` is a helper mapping story-local calendar labels to the **single absolute timeline**. The hearing changes world state, **not** records/newsroom/public state. The interview becomes visible only when its requirements pass; “not available” is not the same as “missed”. A later documentary clue can cover the same core truth when the interview is missed.

For delivery triggers, attach a stable authored `jobId` / `operationId`, not the fare number, `name`, `offer` or arbitrary destination text. Existing random/repeating dispatch can remain; narrative jobs can be selected from an eligible pool with authored priority and optional fallback ordinary fares.

### Explicit lifecycle

For a once-only operation: `pending -> resolved(outcome, at)`. For an opportunity: `locked -> available -> active -> done`, with a parallel `missed` endpoint; “locked” can return to “available” if its condition is reversible **until it is accepted/expired**. Expired never silently reopens unless an explicitly new opportunity ID is authored.

Distinguish:
- `occurredAt`: when the underlying happening happened.
- `observedAt`: when the player saw/was told about it (possibly days later).
- `acquiredAt`, `receivedAt`, `verifiedAt`, `publishedAt`: distinct transitions with distinct causes.

## 6. Scheduler semantics (including sleeping past multiple beats)

Keep scheduler logic **DOM-free, pure where possible, deterministic and separate from physics**:

1. Receive a domain command (delivery, pickup, submit evidence, publish) or advance the campaign clock to target minute `T`.
2. Visit all due *time boundaries* in ascending order from the previous minute to `T`. At each boundary, resolve scheduled world operations (including authored blocked/fallback outcomes); update availability and expire opportunities using the declared window semantics.
3. Apply each resolution as an **atomic typed effect batch** to the authoritative narrative state. Record the unique operation/outcome before another subscriber can resolve it again. Enqueue resulting domain signals.
4. Re-evaluate condition-based rules affected by each batch until quiescent, with a strict maximum work count and a validation error for cycles. Resolve simultaneous items by **timestamp, phase, author priority, stable ID** (not object iteration order or rendering RNG).
5. Produce **presentation intents**, separately: a safe popup, future NPC encounter, journal entry, morning recap or newspaper headline. Showing/reading an intent may later record a player observation; merely scheduling it cannot.
6. Persist the resulting coherent state, then update HUD and renderers from selectors.

Boundary policy to decide and test: a world happening set for 10:00 resolves **as 10:00 begins**; an opportunity with `until: 10:00` is available before 10:00 and expired when 10:00 begins (**half-open window** `[from, until)`). A player action must be timestamped before that boundary to count. Display this deadline clearly (e.g. “before 10:00”), not “by 10:00”. A sleeping player gets exactly the same outcomes as an awake player who took no story action.

Avoid double-firing from midnight, re-entry into an area, opening the menu, reloading a save or updating a typewriter animation. Event conditions must read **authoritative facts**, never presentation UI state. For large time skips, advance between *interesting boundaries* rather than rendering or stepping every minute; a simple minute loop is acceptable for the first 14-day version if bounded and well-tested.

### Delivery and dialogue ordering

On successful drop-off: pay the fare as today; emit a typed `DeliveryCompleted` signal with stable job ID and campaign minute; resolve resulting world/record/quest changes **before** offering the next authored job. A new delivery's eligibility must see all effects of the previous one. Preserve normal job economics and vehicle RNG behaviour.

On successful pickup: existing `Dialogue.start` may show Mia's beat. But a line entering a presentation queue is **not** proof the player encountered it. Emit `DialoguePresented` / `InformationDisclosed` only when the full authored line is actually offered visibly/accessibly (e.g. when “Read all” reveals it, or at completion of the typewriter reveal); persist its stable line ID and source in **player records**. If dismissal can erase unread material, either preserve it in an inbox for later consumption or avoid granting the fact. Test the distinction.

### Presentation priority

Do not open blocking cutscenes while the car is moving, an emergency is on screen, or an active delivery is in progress. World events can resolve silently; queue notifications for a safe idle point or the next morning. Coalesce several unattended happenings into one digest without exposing hidden facts. Emergency fire/wreck feedback remains higher priority than narrative dialogue, consistent with [pickup dialogue](pickup-dialogue.md).

## 7. Example: the same story, three different knowledge levels

| Time / action | Campaign + world | Player records | Newsroom | Public consequences |
| --- | --- | --- | --- | --- |
| Day 2: two Meridian vans arrive | Van movement occurred | Nothing if no witness; rumour only if Mia actually discloses it | Nothing | Nothing |
| Day 5 10:00: hearing takes place while player sleeps | Hearing recorded; café closure pending | No automatic knowledge | Nothing | No publication |
| Day 6: player completes a receipt-carrying courier job | Courier operation completed | Receipt with acquisition provenance | Nothing until submitted | Nothing |
| Day 7: player submits receipt and verifies signature | Unchanged | Still owns receipt | Receipt received, then authenticated | Nothing |
| Day 9: editor publishes misconduct investigation | Unchanged | May learn of publication | Draft marked published | Article ID and claims published |
| Day 10: endorsement withdrawn in response | Endorsement withdrawal recorded; character availability may change | Learned only if player sees news/hears NPC | Unchanged | Reaction recorded |

Alternative branch: the player never intercepts the courier, but later gains testimony or archive evidence. The hearing still happened. The newsroom may publish a narrower story, publish late, or publish nothing; downstream reactions read **published claims**, not invisible world truth or mere receipt ownership.

This lets side quests matter without forcing every optional clue to be mandatory. Major world beats continue when missed, and the main arc can route through several sources to reach an ending. Give each essential act a minimum viable path and at least one recovery route for important missed windows.

## 8. Save, loading, reset, and test lab policy

Persist the **campaign snapshot plus resolution ledger** as a versioned, validated object. Prefer one atomic campaign-envelope write containing all mutually dependent narrative domains, and coordinate it with economy/job progress so a save cannot say “delivery completed” without its evidence effects. The browser's localStorage supports synchronous single-key writes, **not a multi-key transaction**. If economy and campaign remain in different keys, design recovery/commit markers or move campaign-relevant progress into one authoritative envelope. Avoid wiping existing `taxi-chaos-v1` career progression; add an explicit migration/default and a “New campaign” action distinct from car recovery.

Define carefully what resumes from a save: current campaign minute, active story job, quest windows/outcomes, locations/character roles, records, newsroom and public state. The existing `Game.resetRun()` returns the world clock to Day 1; do **not** call it for sleep or ordinary respawn. Preview and Test Lab must use **persistence-disabled narrative state** and never mutate regular saves. Versioned content IDs need migrations, and deleted authored rules need explicit retired-ID handling.

Keep physical world state separate: ordinary transient traffic, pedestrians and wreck cleanup need not be permanently serialized to tell the story. Persist only named/persistent narrative consequences; map them onto spawned world actors via stable map/character IDs. On load, reconstruct the expected observable world without replaying destructive gameplay or consuming gameplay RNG.

## 9. Suggested implementation slices

1. **Clock and state core.** Add `src/campaign/clock.ts`, `state.ts` and `save.ts`, migrate `DayNight` to read the canonical clock, add schema validation/migrations and snapshot selectors. Lock down finale cutoff/sleep policy.
2. **Events and authoring.** Add `src/campaign/events.ts`, `conditions.ts`, `scheduler.ts` and a typed `content.ts` catalogue with stable IDs, dependency keys, bounded effects and authoring checks (unknown references, impossible windows, duplicate IDs, cyclic instant triggers, missing fallbacks).
3. **Gameplay hooks and sleep.** Emit typed gameplay operations in `src/game.ts`; add a safe-place sleep command and time-skip UI in `src/main.ts`; keep ordinary fare and physics timers unchanged. Instrument lab snapshots and direct `advanceCampaignTo` in `src/lab.ts`.
4. **Information workflow.** Add record-acquisition, newsroom submission/verification and explicit publication commands. Bind dialogue “shown” callbacks and evidence pickup to records. Add simple journal/newsroom selectors, not a fully featured editor UI at first.
5. **Vertical slice and validation.** Author one 3–5 day Meridian thread (Mia -> vans -> hearing -> receipt/interview -> article -> reaction) with one missed-deadline branch; only then scale to 14 days and more side quests.

No new runtime dependency is needed for this slice. Stay compatible with the standalone offline HTML, deterministic simulation and frozen authored map from [AGENTS.md](../AGENTS.md).

### Acceptance scenarios worth automating

- Advancing from Day 3 to Day 7 through sleep resolves Day 5 operations exactly once; the player's records stay empty unless information was disclosed or acquired.
- A missed Day 5 hearing cannot be prevented retroactively; testimony discovered on Day 8 can still change the later reporting.
- A condition can become true *after* its initial evaluation; the opportunity appears if the window is still open. At its exact `until` minute it expires deterministically.
- A delivery completion, a timed happening and a conditional consequence occurring close together have a reproducible order and do not double-fire on reload.
- Repeating a customer name or ordinary fare does not re-trigger an authored mission.
- Receipt acquisition -> submission -> verification -> publication -> reaction are independently testable steps; skipping any step does not imply the following one.
- Pausing, inspecting a menu, selecting a lab lighting preset, or running a map preview does not advance campaign time or mutate a normal save.
- Sleeping is rejected during an active passenger/parcel job or unsafe state; no fire timer, police AI or full-city physics is simulated during the skip.
- Day 14/night 14 and the Day 15 07:00 cutoff produce one stable ending; large skips stop there and cannot enqueue post-finale side quests.
- Save/load and migrations preserve all five domains; records remain detached from snapshots; content errors are caught in tests. Narrative evaluation and UI effects do **not** consume the seeded world RNG.

## 10. Open content decisions (not engineering blockers)

Choose whether players can sleep more than one night, whether missed interviews can always be recovered through alternate leads, whether publication has a daily deadline or can happen any day, and whether an ending is automatic at the hard cutoff or requires a final playable scene. The engine should support these as **authored policies**, not hard-coded assumptions. For the first prototype, recommend **one-night sleep**, **at least one recovery clue per essential act**, **publication only through an explicit player/editor action**, and **an ending that triggers at the fixed campaign cutoff with a final digest based on public outcomes**.

## Sources and scope

Primary design references: [Failbetter QBN](https://www.failbettergames.com/news/storynexus-developer-diary-2-fewer-spreadsheets-less-swearing), [Failbetter timing/carousels](https://www.failbettergames.com/news/new-narrative-structures), [Failbetter parsimony](https://www.failbettergames.com/news/narrative-snippets-parsimony-2), [Yarn node groups](https://docs.yarnspinner.dev/write-yarn-scripts/advanced-scripting/node-groups), [Yarn saliency](https://docs.yarnspinner.dev/write-yarn-scripts/advanced-scripting/saliency), [ink variables/conditional choices](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md), and [Microsoft event sourcing](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing). These support the patterns and trade-offs, **not** the particular API, sleep rules or story beats proposed here; those are Taxi Chaos-specific design recommendations based on the existing repository.

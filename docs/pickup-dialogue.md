# Pickup dialogue / first story mission

Picking up **Mia on the first fare** opens a portrait dialogue in the top-right
corner. She mentions two **Meridian vans** outside the café and a missing police
car: the opening plot hook. Taking a courier bike before that pickup instead
shows Mia's **sender note** when her parcel is loaded.

Text types out while you drive; **Read all** reveals it immediately, **Replay**
starts it again, and **×** minimizes it to a replay button. It stays available
until the delivery ends or is abandoned. Pausing freezes the text as well as the
game. Reduced-motion users see the full message immediately; screen readers
receive the whole message once rather than individual letters. Touch layouts
keep the radar and driving controls accessible. Emergency instructions take
priority over dialogue.

## Authoring

`src/story.ts` contains the immutable beat catalogue with **plot**, **side-quest**
and **lore** categories and passenger/sender variants. A message names its
**speaker** with a typed character ID; the display name and portrait are resolved
from `src/characters.ts` at render time. Attach an optional `storyBeat` ID to a
job to play it at successful pickup. Recurring names such as Mia are not treated
as story identifiers.

Characters live in the immutable catalogue in `src/characters.ts`. Each entry has
a stable `id`, a display `name`, portrait metadata and attribution. Portrait
files live in `src/assets/characters/` and are discovered at build time by the
eager `import.meta.glob` registry in `src/portraits.ts`, which supports **SVG**,
**PNG** and **JPEG** side by side. Every file is imported with `?inline`, so it is
embedded as a data URL in the standalone HTML and never becomes a runtime request;
the single-file build does not depend on the generic asset inline threshold.
`portraitSourceIds` lists the authored files; the test suite runs
`validatePortraitRegistry`, which throws if that listing and the folder drift
apart, before the build runs.

Portrait metadata is configurable per character:

- `sources`: ordered authored files; the first one found in the registry is used,
  so a character can ship a raster primary with a vector alternate.
- `objectPosition`: CSS `object-position` for the `object-fit: cover` frame.
- `crop`: optional normalised `{ x, y, width, height }` rectangle (0..1) applied
  by scaling and offsetting the image inside an overflow-hidden frame.

`validateCharacterCatalogue` rejects unknown portrait files, mismatched IDs, empty
names or attribution, malformed `objectPosition` values and out-of-range crops.
The display name sits beside the portrait, so the image keeps a decorative empty
`alt`.

Dialogue is run-only, is exposed in detached lab snapshots, and does not alter
physics, random generation, fares or stored progress. Resetting a run restores
the opening mission; completing or abandoning a job clears its conversation.
There are no voice samples or external image requests. The portrait art created
for Taxi Chaos is embedded in the standalone HTML; provenance is recorded in
[`src/assets/ATTRIBUTION.md`](../src/assets/ATTRIBUTION.md).

## Screenshots

![Mia's opening clue on desktop](screenshots/story-desktop.png)
![Portrait touch layout](screenshots/story-mobile.png)
![Landscape touch layout](screenshots/story-landscape.png)
![Mia's sender note on a small phone](screenshots/story-small-mobile.png)

## Verification

- `npm test`: 32 test files, 485 tests passing. Story integration covers stopped
  pickups, sender variants, pause/game-over clocks, replay, detached snapshots,
  completion/abandonment/reset, recurring names and unchanged simulation/RNG.
- `npm run build`: strict TypeScript and standalone production build passing.
- Isolated browser QA of the production HTML via `file://` with networking
  disabled: no console errors and only embedded image/font assets requested.
- Physical first-fare pickup and road-route delivery, plus walking to a parked
  courier bike, mounting it and physically driving to the parcel pickup.
- 1440×900 desktop, 390×844 portrait, 320×568 small phone and 844×390 landscape;
  message, mission, radar, vehicle action and driving controls do not overlap.
- UI read-all, minimize/replay, whole-message accessible text, reduced-motion
  preference handling and emergency fire-instruction priority checked.
- Restored realtime play after fixed-step browser automation.

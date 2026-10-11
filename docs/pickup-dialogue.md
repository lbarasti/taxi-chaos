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
and **lore** categories and passenger/sender variants. Attach an optional
`storyBeat` ID to a job to play it at successful pickup. Recurring names such as
Mia are not treated as story identifiers. Add portraits to `src/assets/` and map
them in `src/story-view.ts` as the character roster grows.

Dialogue is run-only, is exposed in detached lab snapshots, and does not alter
physics, random generation, fares or stored progress. Resetting a run restores
the opening mission; completing or abandoning a job clears its conversation.
There are no voice samples or external image requests. The original vector
portrait is embedded in the standalone HTML.

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

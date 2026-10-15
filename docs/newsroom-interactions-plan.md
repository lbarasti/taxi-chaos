# Newsroom interactions and observation gathering

## Goal and scope

Make it clear what the player has collected, what can be left at the newsroom,
and whether a story is ready for editorial review. A useful source is not
necessarily a publishable story.

Keep deliberate observation collection, physical newsroom visits, the
three-game-hour source checks, independent corroboration, editorial approval,
edition timing and campaign deadlines. Do not add truth percentages, reveal
undiscovered sources as a checklist, or change the wider input/binding system.

## 1. Restore deliberate observation gathering

- Add an observation/camera icon to the existing quick-action panel, outside the
  minimap. Show it near an authored observation site whose scene is eligible.
- Use the same authored location, radius, speed, mode and campaign predicates
  for the button and the collection command. Follow the active actor on foot
  as well as in a vehicle; opening the UI must never collect automatically.
- Explain when the player must slow down. An available action is visually
  highlighted and has an accessible name describing the scene.
- Confirm collection with the observation title and where to find it in the
  Dispatch notebook. Explain that a copy can be brought to the newsroom, not
  that the observation alone makes a story publishable.
- Once collected, show a checked, disabled “Already recorded” state near the
  site. Repeated collection must not create extra records or success notices.
- Keep the icon usable with mouse, keyboard focus/activation and touch. Preserve
  safe areas, minimum 44 px targets and the other quick actions on small screens.

Implemented as the first slice: the camera appears near eligible scenes, highlights
when recordable and keeps a checked state once saved. The other quick actions and
newsroom routing retain their existing behaviour. Steps 2–5 remain follow-up work.

## 2. Give newsroom records a direct entry point

Make the existing newsroom icon open a Newsroom panel instead of only toggling
guidance. Keep “Route to newsroom” inside that panel. Show a concise summary:

> 2 sources to submit · 1 source being checked · No stories ready for the editor

The panel must be accessible directly from the HUD without finding the pause
notebook. Do not implement this replacement as part of observation gathering.

## 3. Separate useful sources from general notes

Organize the panel into:

| Section | Meaning |
| --- | --- |
| To submit | Collected sources not yet left at the newsroom |
| Being checked | Submitted sources, with the actual completion time |
| Checked sources | Verified material, not necessarily a complete story |
| Stories | Editorial readiness, scheduled editions and published stories |
| Other notes | General conversations, ordinary fare history and other records |

Not every authored material contributes to a publication route. Keep those
records readable without advertising them as evidence for a publishable story.

## 4. Explain each story's next step

For stories connected to discovered material, derive plain-language status from
the authoritative campaign state and conditions:

- More corroboration needed.
- Sources collected — bring them to the newsroom.
- Source checks underway — ready Day 5, 10:30.
- Ready for editorial review — visit Ruth.
- Waiting for another story's editorial approval.
- Scheduled — Day 6, 06:00 edition.
- Published.
- Publication deadline passed.

Handle verification, approval and publication dependencies separately. Do not
label an incomplete source collection as a ready story, or expose future
missions and documents that the player has not discovered.

## 5. Make the physical newsroom visit obvious

When stopped nearby, offer “Visit newsroom”. Put actionable work first:

- Submit collected sources with a clear confirmation.
- Request publication of ready stories.
- Explain disabled actions instead of only greying them out.

Give one-time feedback for meaningful transitions: source collected, checks
complete, story ready and story published. Keep records after submission.

## Verification

- Unit-test observation availability and collection against the same rules,
  duplicate handling, on-foot visits, source retention and save reconstruction.
- Cover multiple authored observations without assuming the first is nearby.
- Browser-check real icon activation, checked state, notebook entry and rejected
  stale actions in isolated, persistence-disabled scenarios.
- Check 1440×900 desktop first, then compact portrait and landscape layouts,
  touch activation, keyboard activation, safe areas and HUD overlap.
- Run appropriate tests, strict TypeScript checking and the production build;
  exercise the self-contained HTML offline without runtime network requests.
- Later slices should cover every editorial state, dependency, deadline and
  the physical submit → verify → request → edition flow without changing rules.

### Observation slice checks

- `npm test -- --testTimeout=30000` gives long physical simulations an appropriate
  per-test budget without shortening their driving sequences.
- `npm run build` includes strict TypeScript checking.
- `node tools/observations-check.mjs` checks the standalone game offline across
  eight desktop/touch layouts, physical approach and speed gating, native keyboard
  and touch activation, duplicate/stale clicks, notebook visibility, save
  reconstruction, on-foot state, minimum target sizes and asymmetric safe areas.
- `node tools/navigation-hud-check.mjs` retains the existing navigation and
  physical driving/riding regression checks in isolated offline browser contexts.

Screenshots from the actual quick-action flow:

| Ready to record | Recorded |
| --- | --- |
| ![Highlighted camera beside the desktop quick actions](screenshots/observations/desktop-ready.png) | ![Checked camera and saved-observation confirmation](screenshots/observations/desktop-recorded.png) |

[Portrait touch](screenshots/observations/portrait-recorded.png) ·
[Compact landscape touch](screenshots/observations/landscape-480-recorded.png)

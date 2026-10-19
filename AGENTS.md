# Taxi Chaos workflow

The user gave standing authorization on 2026-10-10 to raise pull requests for requested work in `lbarasti/taxi-chaos`, without asking for confirmation again. This includes committing completed changes and publishing a feature branch to make the PR concrete and reviewable.

Complete the requested implementation, run appropriate tests and the production build, and open a PR with a clear description and relevant screenshots. Follow the user's current instructions for any subsequent merge or deployment.

## Documentation policy

`docs/DECISIONS.md` is the only file under `docs/`. Treat it as a historical
decision log: append an entry only when a task introduces or supersedes a
consequential architectural, product or operational decision. Preserve previous
entries and identify superseded decisions explicitly. Routine fixes, refactors,
implementation details and test results do not require a log update.

Do not create feature notes, plans, changelogs or replacement documentation files
elsewhere unless the user explicitly requests them. Update existing README
workflows, HOW_TO player instructions or asset attribution only when the task
changes that information. Keep validation results and review screenshots in the
PR or ignored artifact directories; browser captures default to `scenario-runs/`.
Keep executable examples and fixtures beside their tools or tests.

## Current principles

1. **Keep delivery standalone and offline.** Taxi Chaos is a frontend-only TypeScript and Canvas game, built as one self-contained HTML artifact with embedded scripts, styles, fonts and sound. Avoid external runtime requests and preserve asset attribution and licences.
2. **Prioritize physical gameplay.** Build on the Motion Lab foundation with fixed 120 Hz physics. Favor convincing collisions, destruction, detailed geometry and a fun taxi-delivery loop over decorative textures; keep routes simple and readable.
3. **Playtest desktop first, then touch.** Use 1440×900 for primary browser QA, then check compact portrait and landscape layouts for overflow, accessible controls and clear contextual instructions.
4. **Keep presentation targeted and deterministic.** Use readable fire, explosions, damage and boost feedback without camera shake or fullscreen flashes. Gore stays opt-in; sample-based FX are supported, sirens remain subdued and separately adjustable, and music and voices remain deferred.
5. **Share one authoritative map.** Rendering, navigation, terrain, collisions, spawns, dispatch and effects must consume the same independently compiled, recursively frozen geometry. Preserve seeded procedural generation and its RNG stream; audio and visual effects must not change simulation results.
6. **Make authored content stable and bounded.** Use versioned map documents, stable entity IDs, explicit ownership and bounded prop, parking and traffic-spawn collections. Accept only the current map schema and keep imports lossless, operations atomic, stale batches rejected and undo/redo consistent. City, harbour and bridges remain read-only; whole-district translation is limited to Southern Estates.
7. **Validate real bodies and routes.** Check water, pools, static clearance, full vehicle footprints, occupied and empty bays, overlap, route sweeps, map envelopes and workload budgets. Findings must identify the affected stable entity; invalid drafts may remain editable but must block gameplay preview. Browser and command-line tooling share the DOM-free map engine.
8. **Isolate previews and user state.** Map previews use a fresh, persistence-disabled game without reading normal saves or settings. Restore the original game, mode, camera and clock on exit. Run browser automation in an isolated context, leave the user's tabs and saves untouched, and restore realtime before handing back a playable page.
9. **Centralize vehicle definitions.** Keep model geometry, dynamics, tyres, cargo, artwork, audio, damage, AI and access rules in a typed catalogue with immutable model identity. Derive upgrades, sensing, recovery and collision behavior from actual bodies and dynamics; commercial trucks remain NPC-only.
10. **Keep AI recovery physical and bounded.** Detect stuck vehicles by actual movement, preview feasible reversing arcs and budget expensive work per physics frame. Respect intentional police containment stops; impossible traps back off and recycle only off-screen, without visible teleports.
11. **Preserve gameplay lifecycles and preferences.** Burning fuses continue after abandonment and each vehicle detonates once; wrecks remain physical, emergency exits remain usable and recovery cannot skip the blast. Follow the active actor when walking or switching vehicles. Keep explicit saved preferences separate from scenario cheats and keep transient preview or laboratory state out of normal persistence.
12. **Verify through shared tools and real play.** Maintain deterministic laboratory scenarios, detached snapshots and fixed-step automation alongside the actual UI. Run appropriate tests, strict TypeScript checking and the production build; check the standalone game offline for console errors and external requests, and use physical driving for integration QA without mid-drive teleports or upgrades. Keep long simulations intact with realistic test budgets, and repeat broad checks only when changes, failures or new concerns justify them.

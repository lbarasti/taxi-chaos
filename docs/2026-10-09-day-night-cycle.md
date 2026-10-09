# Day/night cycle implementation plan

Date: 2026-10-09

## Goal

Add an accelerated, deterministic 24-hour cycle with a persistent HUD clock, clearly different morning/afternoon/evening/night atmospheres, moving sun shadows and dynamic local lighting. Preserve the procedural Canvas 2D renderer and standalone/offline build.

## Defaults and behavior

- New runs begin at 07:00. One simulated second advances one in-game minute: a full day takes 24 minutes at normal simulation speed.
- Morning: 05:00–12:00; afternoon: 12:00–17:00; evening: 17:00–21:00; night: 21:00–05:00. Labels change at these boundaries, but lighting interpolates smoothly, including midnight.
- World time advances only while the world advances (playing and wrecked), freezes in intro/pause/garage/arrest and follows fixed lab stepping. Changing the hour never changes existing elapsed-time timers or consumes gameplay RNG.
- Keep roads, cars, pedestrians, route indicators and HUD readable at night. Light sources illuminate local surfaces, and artificial lighting fades in/out at dusk/dawn.
- Lab hour/rate/freeze controls affect only the day/night cycle. Existing simulation speed/step controls retain their behavior.

## Shared integration contract

`src/day-night.ts` exports:

- `DayPeriod = 'morning' | 'afternoon' | 'evening' | 'night'`.
- `DayNightOptions = { hour?: number; rate?: number; frozen?: boolean }`, with rate expressed as in-game minutes per simulated second (default 1).
- `LightingState = { tint: [number, number, number]; tintStrength: number; darkness: number; artificialLight: number; sunDirection: { x: number; y: number }; shadowLength: number; shadowOpacity: number }`. RGB channels are 0–255; strength/darkness/opacity are 0–1; shadow length is a world-space multiplier.
- `DayNightSnapshot = { hour: number; minutes: number; day: number; time: string; period: DayPeriod; rate: number; frozen: boolean }`. `hour` is fractional 0–24, `minutes` is fractional 0–1440, `day` starts at 1, and `time` is zero-padded HH:MM.
- `class DayNight` with `update(dt: number): void`, `reset(): void`, `configure(options: DayNightOptions): void`, `snapshot(): DayNightSnapshot`, and `get lighting(): LightingState`.

`Game` owns `dayNight = new DayNight()`, resets it on resetRun, updates it in playing/wrecked simulation, and exposes `dayNight: this.dayNight.snapshot()` in Game.snapshot(). Renderer and HUD consume this object. The lab exposes `__taxi.dayNight(options)` returning a refreshed LabSnapshot.

## Step 1 — World clock and lighting model

Owner: coder subagent A. Files: `src/day-night.ts`, `src/day-night.test.ts`, `src/game.ts` only.

1. Implement bounded/validated clock configuration, rollover, clock formatting, period labels and continuously interpolated lighting keyframes.
2. Integrate world-clock lifecycle in Game without changing gameplay timers.
3. Add meaningful deterministic tests for rollover, boundaries, continuity, invalid configuration, rate/freeze behavior, reset and game modal/wrecked integration.

Acceptance: fixed stepping produces reproducible clock values; midnight and all period transitions have continuous lighting; all existing game behavior remains test-compatible.

## Step 2 — Dynamic lighting and sun shadows

Owner: coder subagent B. Files: `src/renderer.ts`, new `src/lighting.ts` and optional focused `src/lighting.test.ts` only.

1. Replace fixed directional building/tree/car shadows with sun-driven offsets/lengths/opacities, keeping subtle nighttime contact shadows.
2. Add a reusable reduced-resolution offscreen lighting/compositing pass with cached gradient sprites and viewport culling. Blend ambient tint/darkness smoothly; local sources reduce darkness and contribute colored glow.
3. Add intact streetlamp pools, moving headlight cones for active vehicles (no headlights for unoccupied parked cars or wrecks), storefront/window lighting, fire flicker, local explosion glow, red/blue police flashes and active nitro glow.
4. Ensure destroyed lamps/structures stop emitting light and render navigation/debug/feedback above the lighting pass. Preserve minimap readability.

Acceptance: each period has a distinctive look; beams rotate with cars; burning sources illuminate surrounding ground; transitions stay smooth; local lights do not indiscriminately wash out the entire scene. Accurate per-light occlusion is outside this first version's scope.

## Step 3 — HUD, lab and user-facing documentation

Owner: coder subagent C. Files: `src/main.ts`, `src/style.css`, `src/lab.ts`, `src/lab.css`, `README.md` only.

1. Add an accessible HH:MM + period HUD clock with sun/moon indicator, readable on desktop/tablet/mobile. Update hard-coded night-shift copy to suit the cycle.
2. Add lab hour slider, four presets, rate control and cycle-only freeze toggle. Wire them to the shared API, refreshing the renderer immediately and respecting focused control edits.
3. Expose `__taxi.dayNight(options)` and document defaults, controls and automation usage in README.

Acceptance: clock stays visible at small widths, controls do not change fare/fire timers, presets instantly show the intended lighting, and API is consistent with the established lab snapshot conventions.

## Step 4 — Integration and verification

Owner: coordinating agent, with coder follow-up delegation for any defects.

1. Review all changes against the shared contract and resolve integration issues.
2. Run `npm test` and `npm run build`.
3. Check the game in an isolated browser context at morning/afternoon/evening/night, plus mobile HUD, a police/fire fixture, clock pause/freeze and lab controls. Inspect console errors and verify the standalone build remains self-contained.
4. Record implementation status and verification outcomes below.

## Status

- Step 1 complete: deterministic clock, continuous lighting keyframes, Game lifecycle/snapshot integration and 16 clock/model/integration tests.
- Step 2 complete: sun-driven shadows, reusable half-resolution lighting mask/glow, cached light sprites, viewport culling, all planned local light sources and 15 focused lighting tests.
- Step 3 complete: responsive accessible HUD clock, period-aware copy, lab presets/hour/rate/freeze controls, automation API and README documentation.
- Step 4 complete: integration review, tests, standalone build and browser smoke checks. Four coder subagents implemented/reviewed the four steps.

## Verification results

- `npm test`: 14 test files, 192 tests passed. Integration agent also confirmed consecutive successful full-suite runs.
- `npm run build`: strict TypeScript check and Vite standalone build succeeded; `dist/index.html` approximately 1.125 MB before gzip.
- `git diff --check`: clean.
- Isolated dev-browser checks: 07:00 morning, 14:00 afternoon, 19:00 evening and 23:00 night produced distinct lighting and matching HUD labels. Night screenshots confirmed local streetlamp/storefront pools, vehicle headlight beams, police glow and burning-cab illumination.
- Actual lab controls checked: hour/rate sliders, freeze checkbox and night preset updated clock/model/HUD correctly. At rate 4, stepping 0.5 seconds advanced two in-game minutes; cycle freeze prevented clock advancement. Changing the hour preserved world elapsed time and fire fuse. Pausing froze both world and day/night time.
- HUD clock checked at a 320 × 680 mobile viewport: fully visible, with no overlap between clock, brand and top-bar actions.
- Standalone file opened directly via `file://`: game, canvas, clock and lab API functioned, with embedded font and no HTTP asset requests. Chrome emitted a file-origin security diagnostic for a same-file request; it did not prevent the game or day/night controls from functioning. Dev-browser checks had no application errors.

## Implementation notes

- A test timeout was resolved by isolating clock integration tests from unnecessary full-city traffic simulation, rather than increasing the timeout. Production code needed no integration fixes.
- Reset run restores 07:00/day 1 and preserves the lab's configured cycle rate/freeze. The lab slider exposes 0–8 minutes per second; the API supports rates up to 240.
- Per-light building occlusion remains outside the planned first-version scope.

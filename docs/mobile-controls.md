# Mobile HUD and thumb controls

The taxi icon opens **How to play** and **Test lab**. The bottom menu is removed on phones/tablets, and closing the lab removes its collapsed toolbar on those screens. The far-right header button enters/exits fullscreen, using standard or prefixed WebKit APIs. Browsers without element fullscreen show a short explanation; the game does not claim to be fullscreen.

A 124 px translucent stack sits in the bottom-left safe-area corner, with police pursuit/stars above speed, health/chassis and boost. MPH sits below the speed, and meter percentages are visually hidden while remaining available to screen readers. On narrow phones the centre action buttons stack vertically to keep all controls separate. The bottom-right joystick has circular travel, a centre dead zone and proportional input: up accelerates, down brakes/reverses, sideways steers; on foot, its direction and deflection control walking. BOOST and DRIFT accept a second finger independently in the bottom centre. Release, cancellation, capture loss, focus loss, pause, death and viewport changes clear held touch input.

The generic on-foot card is removed. Get in / Ride motorbike appears beside an accessible parked ride, Get out / Dismount appears at safe speeds, and Bail out appears during a fire. Burning-vehicle warnings remain. The mobile mission shows the current objective, distance, and a short pickup/delivery instruction. Find a ride is one row with no fare or keyboard instructions.

The HUD suppresses text selection and native touch callouts/context menus. The radar remains collapsible. Layout accounts for safe-area insets and portrait/landscape dimensions.

## Screenshots

| State | Screenshot |
| --- | --- |
| Portrait · 390 × 844 | [Portrait](screenshots/mobile-controls/portrait.png) |
| Small phone · 320 × 568 | [Small phone](screenshots/mobile-controls/small.png) |
| Landscape · 844 × 390 | [Landscape](screenshots/mobile-controls/landscape.png) |
| Tablet · 768 × 1024 | [Tablet](screenshots/mobile-controls/tablet.png) |
| On foot · 390 × 844 | [Find a ride / Get in](screenshots/mobile-controls/on-foot.png) |
| Taxi menu · 390 × 844 | [Menu](screenshots/mobile-controls/menu.png) |
| Police pursuit · 390 × 844 | [Pursuit](screenshots/mobile-controls/pursuit.png) |
| Desktop · 1440 × 900 | [Desktop](screenshots/mobile-controls/desktop.png) |

## Verification

- All 343 tests pass with `npm test -- --maxWorkers=2 --testTimeout=20000`. Default parallel runs exceeded the existing 5-second timeout in simulation tests on this environment; no timeout settings were changed in the repository.
- Vitest covers joystick dead zone/circular clamping, proportional driving/reverse/walking, boost gating, input reset, standard/WebKit fullscreen, browser-driven fullscreen exits, unsupported APIs and rejected requests.
- `npm run build` checks strict TypeScript and produces the single standalone HTML.
- `node tools/mobile-hud-check.cjs` checks that HTML with Playwright Chromium. Install Playwright/Chromium beforehand; optionally set `PLAYWRIGHT_PATH` and `CHROMIUM_PATH` to existing installations. The script regenerates the screenshots above.
- Browser QA uses native Chromium touch events for simultaneous steering/boost and steering/handbrake, independent finger release, cancellation, focus-loss reset and on-foot movement. It also checks menu/help/lab actions, contextual enter/exit buttons, native long press selection, fullscreen enter/exit, Space/touch recovery after arrest/death, radar collapse, panel bounds/overlap across five viewport sizes, and uncaught page errors.

Chromium mobile emulation is covered. Physical iPhone/WebKit long-press behavior and element fullscreen availability still depend on the host browser; WebKit API routing is covered with unit tests.

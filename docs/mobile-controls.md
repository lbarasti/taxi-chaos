# Mobile HUD and thumb controls

The top bar and taxi menu are removed. The mission and other top-aligned panels use the freed space, retaining safe-area insets. Pause (**P / Escape**), mute (**M**) and Test Lab (**F2**) still work with a keyboard. Help, audio settings and the Dispatch notebook remain in the pause menu. Fullscreen and **Bookmark café frontage** have no in-game UI entry point; new touch access to header actions is deferred.

A 124 px translucent stack sits in the bottom-left safe-area corner, with police pursuit/stars above speed, health/chassis and boost. MPH sits below the speed, and meter percentages are visually hidden while remaining available to screen readers. On narrow phones the centre action buttons stack vertically to keep all controls separate. The bottom-right joystick has circular travel, a centre dead zone and proportional input: up accelerates, down brakes/reverses, sideways steers; on foot, its direction and deflection control walking. BOOST and DRIFT accept a second finger independently in the bottom centre. Release, cancellation, capture loss, focus loss, pause, death and viewport changes clear held touch input.

The generic on-foot card and shared fire/wreck/stalled-bike/harbour warning banner are removed. Contextual action buttons appear only in the mobile/touch HUD: Get in / Ride motorbike beside an accessible parked ride, Get out / Dismount while riding, and Bail out during a fire. Harbour payment uses the same mobile-only button. Desktop players use **E** for these actions; the separate roadside tow/repair panel remains available on all layouts. The mobile mission shows the current objective, distance, and a short pickup/delivery instruction. Find a ride is one row with no fare or keyboard instructions.

The HUD suppresses text selection and native touch callouts/context menus. The radar remains collapsible. Layout accounts for safe-area insets and portrait/landscape dimensions.

## Screenshots

Mobile-only contextual actions: [Desktop · keyboard only](screenshots/mobile-only-actions/desktop-ride.png), [Mobile · Ride motorbike](screenshots/mobile-only-actions/mobile-ride.png).

Current header-free HUD: [Desktop](screenshots/hud-no-topbar/desktop.png), [Portrait](screenshots/hud-no-topbar/portrait.png), [Landscape](screenshots/hud-no-topbar/landscape.png), [Fire without a warning banner](screenshots/hud-no-topbar/fire-no-banner.png).

The screenshots below document the earlier touch-controls implementation, before the top bar was removed.

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

- All 625 tests pass with `npm test -- --testTimeout=20000`. The package script limits workers to two; the larger timeout accommodates long simulation tests without changing repository timeout settings.
- Vitest covers joystick dead zone/circular clamping, proportional driving/reverse/walking, boost gating, input reset, standard/WebKit fullscreen, browser-driven fullscreen exits, unsupported APIs and rejected requests.
- `npm run build` checks strict TypeScript and produces the single standalone HTML.
- `node tools/mobile-hud-check.cjs` checks that HTML with Playwright Chromium. Install Playwright/Chromium beforehand; optionally set `PLAYWRIGHT_PATH` and `CHROMIUM_PATH` to existing installations. Set `SCREENSHOT_DIR` to choose an output directory.
- Browser QA uses native Chromium touch events for simultaneous steering/boost and steering/handbrake, independent finger release, cancellation, focus-loss reset and on-foot movement. It also checks absent header controls, keyboard pause/help/lab alternatives, keyboard-only desktop actions, mobile contextual enter/exit/payment/fire buttons, hidden actions while paused, native long press selection, Space/touch recovery after arrest/death, radar collapse, panel bounds/overlap across five viewport sizes, reclaimed header space, uncaught page errors and external requests. Radar collapse uses keyboard activation because the existing mobile Texts button overlaps its pointer target; that layout issue is outside the action-button cleanup.

Chromium mobile emulation is covered. Physical iPhone/WebKit long-press behavior and element fullscreen availability still depend on the host browser; WebKit API routing is covered with unit tests.

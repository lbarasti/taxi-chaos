# Mobile HUD and thumb controls

The top bar and taxi menu are removed. The mission and other top-aligned panels use the freed space, retaining safe-area insets. Pause (**P / Escape**), mute (**M**) and Test Lab (**F2**) still work with a keyboard. Help, audio settings and the Dispatch notebook remain in the pause menu. Fullscreen and **Bookmark café frontage** have no in-game UI entry point; new touch access to header actions is deferred.

The navigation/map HUD sits at the top left; time, wallet, personal health and police stars sit at the top right. BOOST and DRIFT are stacked vertically at the bottom-left safe-area corner, BOOST above DRIFT, with 64 × 52 px touch targets and an 8 px gap. They accept a second finger independently of the bottom-right joystick. Short landscape layouts limit the navigation HUD's height to keep it clear of the buttons, including device cutouts and home-indicator insets. Release, cancellation, capture loss, focus loss, pause, death and viewport changes clear held touch input.

The joystick retains circular travel and a 12% radial centre dead zone. Up accelerates and down brakes/reverses proportionally. Driving additionally ignores horizontal output within ±20%; beyond that, the remaining range is rescaled and squared to ease into steering while still reaching full lock. This horizontal dead zone applies even while accelerating or reversing, so small sideways thumb movements do not change course. The knob follows the original vector, and walking still uses its original direction and proportional deflection. Keyboard steering is unchanged.

The BOOST button doubles as the boost tank: a gold fill drains downwards during actual boost use and rises as the reserve recharges. Its label remains visible above the fill, and its accessible label includes the remaining percentage. Fill updates use the game's actual reserve, so upgrades and infinite boost are reflected automatically. Reduced-motion preferences remove the interpolation while keeping the level indicator.

The generic on-foot card and shared fire/wreck/stalled-bike/harbour warning banner are removed. Contextual action buttons appear only in the mobile/touch HUD: Get in / Ride motorbike beside an accessible parked ride, Get out / Dismount while riding, and Bail out during a fire. Harbour payment uses the same mobile-only button. Desktop players use **E** for these actions; the separate roadside tow/repair panel remains available on all layouts. The mobile mission shows the current objective, distance, and a short pickup/delivery instruction. Find a ride is one row with no fare or keyboard instructions.

The HUD suppresses text selection and native touch callouts/context menus. The radar remains collapsible. Layout accounts for safe-area insets and portrait/landscape dimensions.

## Screenshots

Current controls: [Portrait](screenshots/mobile-steering/portrait.png), [Small phone](screenshots/mobile-steering/small.png), [Landscape](screenshots/mobile-steering/landscape.png), [Desktop](screenshots/mobile-steering/desktop.png).

BOOST tank: [Full](screenshots/mobile-steering/tank-full.png), [Empty](screenshots/mobile-steering/tank-empty.png), [Refilling](screenshots/mobile-steering/tank-refilling.png).

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

- `node tools/mobile-controls-check.mjs` checks the standalone HTML offline: eight desktop/mobile viewport sizes, action-button order/position and minimum target sizes, bounds/overlap, simulated asymmetric safe areas, native touch acceleration through centre jitter, intentional turning, simultaneous steering/boost and steering/drift, independent finger release and cancellation, actual and rendered boost fill through depletion/recharge, accessible tank percentage and reduced motion. Set `CHROMIUM_PATH` for an existing browser and `SCREENSHOT_DIR` for captures.

- All 652 tests pass with `npm test -- --testTimeout=20000`. The package script limits workers to two; the larger timeout accommodates long simulation tests without changing repository timeout settings.
- Vitest covers joystick dead zone/circular clamping, proportional driving/reverse/walking, boost gating, input reset, standard/WebKit fullscreen, browser-driven fullscreen exits, unsupported APIs and rejected requests.
- `npm run build` checks strict TypeScript and produces the single standalone HTML.
- `node tools/mobile-hud-check.cjs` checks that HTML with Playwright Chromium. Install Playwright/Chromium beforehand; optionally set `PLAYWRIGHT_PATH` and `CHROMIUM_PATH` to existing installations. Set `SCREENSHOT_DIR` to choose an output directory.
- Browser QA uses native Chromium touch events for simultaneous steering/boost and steering/handbrake, independent finger release, cancellation, focus-loss reset and on-foot movement. It also checks absent header controls, keyboard pause/help/lab alternatives, keyboard-only desktop actions, mobile contextual enter/exit/payment/fire buttons, hidden actions while paused, native long press selection, Space/touch recovery after arrest/death, radar collapse, panel bounds/overlap across five viewport sizes, reclaimed header space, uncaught page errors and external requests. Radar collapse uses keyboard activation because the existing mobile Texts button overlaps its pointer target; that layout issue is outside the action-button cleanup.

Chromium mobile emulation is covered. Physical iPhone/WebKit long-press behavior and element fullscreen availability still depend on the host browser; WebKit API routing is covered with unit tests.

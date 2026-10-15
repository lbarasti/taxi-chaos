# Mobile HUD and thumb controls

The top bar and taxi menu are removed. The mission and other top-aligned panels use the freed space, retaining safe-area insets. Pause (**P / Escape**), mute (**M**) and Test Lab (**F2**) still work with a keyboard. Help, audio settings and the Dispatch notebook remain in the pause menu. Fullscreen and **Bookmark café frontage** have no in-game UI entry point; new touch access to the removed header actions is provided by the map shortcut menu instead.

The circular navigation map sits at the top left, with no caption chip below it, no distance counter, district banner or on-board badge drawn on the wheel (a passenger or parcel aboard is shown by a green aura on the cab roof or the courier bike body); time, wallet, personal health and police stars sit at the top right. The dispatcher, bookings and newsroom shortcuts are a separate real-DOM menu: a vertical column on the right edge on desktop (dropping just below the personal status corner in a short window, and shifting beside the map in a narrow 701–1100 px desktop window), a vertical column on the left edge above the thumb buttons on portrait touch, and a horizontal row across the top centre in landscape touch, where the map shrinks so the row and the wheel never overlap. Every shortcut is a named 44 px-or-larger button; the map itself holds no hotspots. BOOST and DRIFT are stacked vertically at the bottom-left safe-area corner, BOOST above DRIFT, with 64 × 52 px touch targets and an 8 px gap. They accept a second finger independently of the bottom-right joystick. Short landscape layouts move dialogue and the navigation shadow out of the shortcut row, including device cutouts and home-indicator insets. Release, cancellation, capture loss, focus loss, pause, death and viewport changes clear held touch input.

The joystick retains circular travel and a 12% radial centre dead zone. Up accelerates and down brakes/reverses proportionally. Driving additionally ignores horizontal output within ±20%; beyond that, the remaining range is rescaled and squared to ease into steering while still reaching full lock. This horizontal dead zone applies even while accelerating or reversing, so small sideways thumb movements do not change course. The knob follows the original vector, and walking still uses its original direction and proportional deflection. Keyboard steering is unchanged.

The BOOST button doubles as the boost tank: a gold fill drains downwards during actual boost use and rises as the reserve recharges. Its label remains visible above the fill, and its accessible label includes the remaining percentage. Fill updates use the game's actual reserve, so upgrades and infinite boost are reflected automatically. Reduced-motion preferences remove the interpolation while keeping the level indicator.

The generic on-foot card and shared fire/wreck/stalled-bike/harbour warning banner are removed. Contextual action buttons appear only in the mobile/touch HUD: Get in / Ride motorbike beside an accessible parked ride, Get out / Dismount while riding, and Bail out during a fire. Harbour payment uses the same mobile-only button. Desktop players use **E** for these actions; the separate roadside tow/repair panel remains available on all layouts. The mobile mission shows the current objective, distance, and a short pickup/delivery instruction. Find a ride is one row with no fare or keyboard instructions.

The HUD suppresses text selection and native touch callouts/context menus. The map has no collapse button and stays visible. Layout accounts for safe-area insets and portrait/landscape dimensions.

## Screenshots

Nav map and shortcut menu: [Desktop · engaged](screenshots/navigation-actions/desktop-engaged.png), [Desktop · vacant](screenshots/navigation-actions/desktop-vacant.png), [Desktop · on board (roof aura)](screenshots/navigation-actions/desktop-on-board.png), [Desktop · courier bike (body aura)](screenshots/navigation-actions/desktop-bike-on-board.png), [Portrait · on board](screenshots/navigation-actions/portrait-on-board.png), [Portrait · on foot](screenshots/navigation-actions/portrait-on-foot.png), [Landscape · engaged](screenshots/navigation-actions/landscape-engaged.png).

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

- `node tools/navigation-hud-check.mjs` checks the standalone HTML offline on desktop (including short 1440×420 / 1280×400 windows and a narrow 1024×768 window) and touch layouts (portrait, compact, landscape 844×390, and the tight 480×320 / 500×400 landscape sizes): the header above the minimap is gone, the circular radar is 170 px on desktop and stays circular and in range on touch (shrinking so it never reaches the landscape shortcut row), the map keeps no caption panel, district banner, distance readout or on-board badge while the world on-board cue tracks the engaged/vacant/on-board/on-foot states and detours, the shortcuts land on the right edge (desktop, dropping below the status corner in a short window or beside the map in a narrow one), the left edge above the thumb buttons (portrait/compact) or the top centre (landscape), the whole shortcut menu is hidden (not merely disabled) behind the intro and pause splashes, every shortcut is a named 44 px-or-larger button that responds to the keyboard, nothing collides with the other HUD controls, the on-board aura is verified as real green canvas pixels (not just the `data-cue` predicate), and the fixed-step simulation stays deterministic. Physical 120 Hz pickup and driving integration is included, for both the cab roof aura and, by physically mounting the courier bike and collecting a parcel, the bike body aura. Pass a directory to choose the screenshot destination.
- `node tools/mobile-controls-check.mjs` checks the standalone HTML offline: eight desktop/mobile viewport sizes, action-button order/position and minimum target sizes, bounds/overlap across the navigation map, shortcut menu, personal status, joystick and contextual actions, simulated asymmetric safe areas, native touch acceleration through centre jitter, intentional turning, simultaneous steering/boost and steering/drift, independent finger release and cancellation, actual and rendered boost fill through depletion/recharge, accessible tank percentage and reduced motion. Set `CHROMIUM_PATH` for an existing browser and `SCREENSHOT_DIR` for captures.

- Vitest covers joystick dead zone/circular clamping, proportional driving/reverse/walking, boost gating, input reset, standard/WebKit fullscreen, browser-driven fullscreen exits, unsupported APIs and rejected requests.
- `npm run build` checks strict TypeScript and produces the single standalone HTML.
- `node tools/mobile-hud-check.cjs` checks that HTML with Playwright Chromium. Install Playwright/Chromium beforehand; optionally set `PLAYWRIGHT_PATH` and `CHROMIUM_PATH` to existing installations. Set `SCREENSHOT_DIR` to choose an output directory.
- Browser QA uses native Chromium touch events for simultaneous steering/boost and steering/handbrake, independent finger release, cancellation, focus-loss reset and on-foot movement. It also checks absent header controls, keyboard pause/help/lab alternatives, keyboard-only desktop actions, mobile contextual enter/exit/payment/fire buttons, hidden actions while paused, native long press selection, Space/touch recovery after arrest/death, panel bounds/overlap across five viewport sizes, reclaimed header space, uncaught page errors and external requests.

Chromium mobile emulation is covered. Physical iPhone/WebKit long-press behavior and element fullscreen availability still depend on the host browser; WebKit API routing is covered with unit tests.

# Title and pause drawer

The drawer has four small boundaries:

| Area | Entry point | Responsibility |
| --- | --- | --- |
| Selection | `DrawerMenu` in `src/drawer-menu.ts` | One highlighted item, arrows/Tab, activation, and two-tap touch confirmation. Its enabled callback comes from the drawer; it knows no game modes or CSS layout classes. |
| Pages and actions | `GameDrawer` in `src/game-drawer.ts` | The current page, Back, animation cancellation, remembered selection, and existing menu actions. `main.ts` supplies the current game, audio, save availability, and the play/resume callback. |
| Presentation | `drawerMarkup` in `src/drawer-view.ts`, `menuItem` in `src/drawer-markup.ts`, `src/drawer.css` | The fixed page list, page bodies, consistent rows, and drawer styles. Markup declares its classes directly. |
| Browser checks | `tools/helpers/drawer.mjs` | Open the standalone game offline, wait for a drawer page and its animation, and assert select-then-confirm touch behavior. Scenario assertions stay in the checks themselves. |

To add a menu entry, use `menuItem(label, { id, page, disabled })`. Labels and IDs are escaped; `page` is a `DrawerPage`. A navigation entry needs no event binding. Existing gameplay actions are handled explicitly in the drawer's click handler.

To add a page, extend `DrawerPage`, add its title and parent in `drawer-view.ts`, and add its body to the switch there. This is a fixed menu, with no route registration or plugin system.

`GameDrawer.refresh()` keeps settings controls mounted during edits. Other pages restore selection by stable element ID and keep their scroll position during refresh. `open(page)` animates navigation; `back()` follows the declared parent. `reset()` cancels pending transitions and clears menu state when gameplay or another modal takes over. Capture previews use `open(page, { animate: false })`.

Run `npm test`, `npm run build`, then `CHROMIUM_PATH=/path/to/chromium SCREENSHOT_DIR=scenario-runs/menu-check node tools/splash-check.mjs`. Browser checks cover desktop, compact portrait, landscape, native settings editing, controller input, and physical touch driving in disposable contexts.

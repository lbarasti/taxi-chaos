import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchBrowser, newContext, closeBrowser, captureFailure } from '../runtime.mjs';
import { checkDetailFade, tapToConfirm, waitForDrawer } from '../helpers/drawer.mjs';

const output = process.env.SCREENSHOT_DIR ?? 'scenario-runs/notebook';
await mkdir(output, { recursive: true });
const html = await readFile('dist/index.html', 'utf8');
// Build a save through real pickup/payment lifecycles, before any browser QA.
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
let save;
try {
  const { Game } = await server.ssrLoadModule('/src/game/game.ts');
  const { recordNote } = await server.ssrLoadModule('/src/campaign/effects.ts');
  const game = new Game(undefined, false);
  game.vehicles = [game.player]; game.trafficTarget = 0; game.settings.noPolice = true; game.start();
  const arrive = point => {
    game.player.body.position = { ...point }; game.player.body.velocity = { x: 0, y: 0 };
    for (let tick = 0; tick < 108; tick++) game.update(1 / 120);
  };
  const complete = () => {
    game.answerDispatch(); game.dialogue.readAll(); game.recordDialogue();
    arrive(game.job.pickup); assert.equal(game.job.stage, 'dropoff');
    game.dialogue.readAll(); game.recordDialogue();
    arrive(game.job.dropoff); game.dialogue.readAll(); game.recordDialogue();
  };
  complete();
  assert(game.routeMissionOffer('celia-barriers')); complete();
  game.player = game.vehicle('taxi', game.player.body.position.x, game.player.body.position.y, 0, '#ed9b63', 'motorcycle');
  for (let run = 0; run < 2; run++) {
    const regular = game.campaignContent.everydayJobs.find(job => job.character === 'cleo');
    const journeys = regular.parcelJourneys;
    const journey = journeys[(game.save.campaign.regularRides[regular.name] ?? 0) % journeys.length];
    game.player.body.position = { ...game.missions.catalogue.stops.byId[journey.pickup].position };
    for (let attempt = 0; attempt < 30; attempt++) {
      game.newJob(false, 'replaced', true);
      if (game.job.everyday?.character === 'cleo') break;
    }
    assert.equal(game.job.everyday?.character, 'cleo'); assert.equal(game.job.type, 'parcel');
    complete();
  }
  recordNote(game.campaignContext, { id: 'driver-observation', kind: 'observation', title: 'A quiet corner', text: 'The market shutters are down.' });
  save = game.saveSnapshot();
} finally { await server.close(); }

const browser = await launchBrowser();
try {
  for (const [name, width, height, touch] of [
    ['desktop', 1440, 900, false], ['portrait', 390, 844, true],
    ['compact', 320, 568, true], ['landscape', 844, 390, true],
  ]) {
    const context = await newContext(browser, { viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: touch ? 'reduce' : 'no-preference' });
    await context.route('http://localhost:4173/**', route => route.fulfill({ contentType: 'text/html', body: html }));
    await context.addInitScript(save => {
      if (location.origin === 'http://localhost:4173') localStorage.setItem('taxi-chaos-v1', JSON.stringify(save));
    }, save);
    const page = await context.newPage(); await page.goto('http://localhost:4173/');
    if (touch) await tapToConfirm(page, '#start'); else await page.locator('#start').click();
    await page.locator('#overlay').waitFor({ state: 'hidden' });
    if (touch) await page.locator('#shift').tap(); else await page.keyboard.press('Tab');
    await waitForDrawer(page, 'shift');
    assert.equal(await page.locator('#shift-detail').count(), 0, 'no detail column before activation');
    const menuBounds = await page.locator('.drawer-menu-panel').boundingBox();
    const collapsedWidth = await page.locator('#modal').evaluate(modal => modal.getBoundingClientRect().width);
    assert(collapsedWidth <= 540, 'shift opens with just the menu column');
    assert.deepEqual(await page.locator('[aria-label="Shift actions"] button').evaluateAll(buttons => buttons.map(button => button.id)), ['ordinary-fare', 'sleep', 'open-notebook', 'start']);
    assert.equal(await page.locator('#open-notebook').innerText(), 'Past trips');
    assert.equal(await page.locator('#start').innerText(), 'Resume shift');
    assert.equal(await page.locator('#sleep-route').count(), 0);
    assert.equal(await page.locator('#sleep').innerText(), 'Route to Pit Stop to sleep');
    assert.equal(await page.locator('#sleep').isEnabled(), true);
    assert.equal(await page.locator('[data-page="notebook"]').count(), 0, 'no standalone notebook entry');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${output}/${name}-shift.png` });
    if (!touch) {
      await page.locator('#open-notebook').hover();
      assert.equal(await page.locator('#shift-detail').count(), 0, 'hover selects without opening');
    }
    if (touch) await tapToConfirm(page, '#open-notebook'); else await page.locator('#open-notebook').click();
    if (!touch) await checkDetailFade(page, '#shift-detail', true);
    await waitForDrawer(page, 'shift'); await page.locator('#shift-menu').waitFor();
    const notebook = page.locator('#shift-detail');
    assert.equal(await page.locator('#modal-title').innerText(), 'Your shift.');
    assert.equal(await page.locator('#modal-title').count(), 1);
    assert.equal(await page.locator('#open-notebook').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'shift-menu');
    if (width >= 1000) {
      assert.deepEqual(await page.locator('.drawer-menu-panel').boundingBox(), menuBounds, 'opening detail keeps the menu steady');
      const layout = await page.locator('.drawer-columns').evaluate(columns => {
        const menu = columns.querySelector('.drawer-menu-panel').getBoundingClientRect();
        const detail = columns.querySelector('.drawer-detail').getBoundingClientRect();
        return { columns: getComputedStyle(columns).gridTemplateColumns.split(' ').length, menuRight: menu.right, detailLeft: detail.left, menuTop: menu.top, detailTop: detail.top };
      });
      assert.equal(layout.columns, 2);
      assert(layout.menuRight < layout.detailLeft, 'detail is beside the shift menu');
      assert.equal(layout.menuTop, layout.detailTop);
    }
    assert.equal(await notebook.locator('#notebook-search, #notebook-route, #notebook-back, #menu-notebook-guide').count(), 0);
    assert.equal(await notebook.locator('[data-run]').count(), 4);
    assert.equal(await notebook.locator('.notebook-run h3').filter({ hasText: 'Cleo' }).count(), 2, 'repeat bookings remain separate');
    assert.equal(await notebook.locator('[aria-label="Parcel delivery"]').count(), 2);
    assert.equal(await notebook.locator('[aria-label="Passenger fare"]').count(), 2);
    assert.equal(await notebook.locator('[data-record="barrier-receipt"]').count(), 1);
    const text = await notebook.innerText();
    assert.doesNotMatch(text, /DISPATCH NOTEBOOK|Your working day|Signed slips, things people said|LOCAL COVERAGE/);
    assert.doesNotMatch(text, /Find a record|Pickup marked|Pickup \(|Base \$|Speed [−+]|Comfort [−+]|signed (?:fare|delivery) receipt|ride conversation/);
    for (const group of await notebook.locator('[data-run]').all()) {
      assert.equal(await group.locator('.notebook-run-heading small').count(), 1);
      assert.equal(await group.locator('.notebook-run-summary').count(), 1);
      assert.equal(await group.locator('.notebook-run-total').count(), 1);
      const portrait = group.locator('img');
      await portrait.evaluate(image => image.decode());
      assert.match(await portrait.getAttribute('src'), /^data:image\/webp;base64,/);
      assert.equal(await portrait.evaluate(image => image.naturalWidth > 0), true);
    }
    const layout = await notebook.evaluate(modal => ({
      overflow: modal.scrollWidth > modal.clientWidth || document.documentElement.scrollWidth > innerWidth,
      widths: [...modal.querySelectorAll('.notebook-run-header')].map(header => header.getBoundingClientRect().width),
    }));
    assert.equal(layout.overflow, false, `${name}: no horizontal overflow`);
    assert(layout.widths.every(value => value > 0 && value <= width));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${output}/${name}.png` });
    await notebook.locator('[data-record="barrier-receipt"]').scrollIntoViewIfNeeded();
    if (width >= 1000) {
      assert.equal(await page.locator('.drawer-menu-panel').evaluate(panel => panel.scrollTop), 0, 'notebook scroll leaves the menu in place');
      assert(await notebook.evaluate(detail => detail.scrollTop > 0));
    }
    await page.screenshot({ path: `${output}/${name}-story-record.png` });
    // Arrow navigation must reach records, including runs with no enabled actions.
    await page.locator('#shift-menu').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'notebook-driver-observation', 'standalone observations are navigable');
    const runIds = await notebook.locator('[data-run]').evaluateAll(runs => runs.map(run => run.id));
    let visibleSelections = 0;
    for (const id of runIds) {
      const before = await page.locator(`#${id}`).evaluate(item => {
        const pane = item.closest('.drawer-detail'), modal = item.closest('#modal');
        const bounds = item.getBoundingClientRect(), paneBounds = pane.getBoundingClientRect(), modalBounds = modal.getBoundingClientRect();
        return {
          visible: bounds.top >= Math.max(0, paneBounds.top, modalBounds.top) && bounds.bottom <= Math.min(innerHeight, paneBounds.bottom, modalBounds.bottom),
          scroll: [pane.scrollTop, modal.scrollTop, document.scrollingElement.scrollTop],
        };
      });
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.id), id, 'Down reaches each run in reading order');
      const selected = page.locator(`#${id}`);
      assert.equal(await selected.getAttribute('data-selected'), 'true');
      assert.notEqual(await selected.evaluate(item => getComputedStyle(item).boxShadow), 'none', 'selected records are visibly highlighted');
      if (before.visible) {
        visibleSelections++;
        assert.deepEqual(await selected.evaluate(item => [item.closest('.drawer-detail').scrollTop, item.closest('#modal').scrollTop, document.scrollingElement.scrollTop]), before.scroll, 'selecting a record already in view keeps the page still');
      }
      if (width >= 1000) {
        const headerVisible = await selected.evaluate(item => {
          const pane = item.closest('.drawer-detail').getBoundingClientRect();
          const header = item.querySelector('header').getBoundingClientRect();
          return header.top >= pane.top && header.bottom <= pane.bottom;
        });
        assert(headerVisible, 'arrows scroll the selected run into view');
        assert.equal(await page.locator('.drawer-menu-panel').evaluate(panel => panel.scrollTop), 0);
      }
    }
    if (width >= 1000) assert(visibleSelections >= 2, 'desktop exercises multiple selections without scrolling');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'shift-menu', 'Down wraps to Back, skipping unavailable source controls');
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement.id), runIds.at(-1), 'Up returns to the previous dispatch');
    if (!touch) {
      await notebook.locator('[data-run] h3').first().click();
      assert.equal(await page.evaluate(() => document.activeElement.id), runIds[0], 'clicking a record selects it for arrow navigation');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.id), runIds[1]);
    }
    await page.screenshot({ path: `${output}/${name}-selected-record.png` });
    // Returning from detail restores its menu item, then Escape resumes play.
    const menuPanel = await page.locator('.drawer-menu-panel').elementHandle();
    if (touch) await tapToConfirm(page, '#shift-menu'); else await page.keyboard.press('Escape');
    if (!touch) await checkDetailFade(page, '#shift-detail', false);
    await notebook.waitFor({ state: 'detached' });
    assert(await menuPanel.evaluate(panel => panel.isConnected), 'Back preserves the mounted menu instead of repainting it');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'open-notebook');
    assert.equal(await page.locator('#open-notebook').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#modal').evaluate(modal => modal.getBoundingClientRect().width), collapsedWidth);
    if (width >= 1000) assert.deepEqual(await page.locator('.drawer-menu-panel').boundingBox(), menuBounds, 'closing detail keeps the menu steady');
    await page.screenshot({ path: `${output}/${name}-back.png` });
    // Reopening after Back repopulates the column; its own Back action clears it too.
    if (touch) await tapToConfirm(page, '#open-notebook'); else await page.locator('#open-notebook').click();
    await waitForDrawer(page, 'shift');
    assert.equal(await notebook.locator('[data-run]').count(), 4);
    const reopenedMenu = await page.locator('.drawer-menu-panel').elementHandle();
    if (touch) await tapToConfirm(page, '#shift-menu'); else await page.locator('#shift-menu').click();
    await notebook.waitFor({ state: 'detached' });
    assert(await reopenedMenu.evaluate(panel => panel.isConnected), 'the Back button also preserves the mounted menu');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('.drawer-menu-panel [data-selected]').count(), 1, 'keyboard navigation returns to the menu scope');
    await page.keyboard.press('Escape'); await page.locator('#overlay').waitFor({ state: 'hidden' });
    if (touch) await page.locator('#shift').tap(); else await page.keyboard.press('Tab');
    await waitForDrawer(page, 'shift');
    assert.equal(await notebook.count(), 0, 'a new shift visit starts without detail');
    // Routing resumes the same shift; choosing it again must keep the destination.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (touch) await tapToConfirm(page, '#sleep'); else await page.locator('#sleep').click();
      await page.locator('#overlay').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.querySelector('#map').getAttribute('aria-label').includes('GARAGE'));
      if (attempt === 0) {
        if (touch) await page.locator('#shift').tap(); else await page.keyboard.press('Tab');
        await waitForDrawer(page, 'shift');
      }
    }
    await context.close();
    console.log(`${name}: grouped runs, portraits, icons, arrow navigation, record selection, scrolling, source retention, totals and overflow passed`);
  }
} catch (error) { await captureFailure(); throw error; } finally { await closeBrowser(browser); }

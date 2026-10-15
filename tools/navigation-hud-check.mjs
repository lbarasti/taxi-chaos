import { waitForDrawer } from './helpers/drawer.mjs';
// Production-only, offline browser regression checks in disposable contexts.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const output = resolve(process.argv[2] ?? 'scenario-runs/navigation-hud');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [], requests = [];
try {
  // Renderer-level aura check: paint a world frame through the harness, then confirm the
  // recorded glow lands as green pixels on the real canvas (not just the data-cue predicate).
  const auraPixels = (page, api) => page.evaluate(api => {
    const aura = window[api].aura();
    if (!aura) return null;
    const canvas = document.querySelector('#city'), ctx = canvas.getContext('2d');
    const dpr = canvas.width / canvas.clientWidth, r = Math.ceil(aura.radius);
    const x = Math.max(0, Math.floor((aura.x - r) * dpr)), y = Math.max(0, Math.floor((aura.y - r) * dpr));
    const w = Math.min(canvas.width - x, Math.ceil(2 * r * dpr)), h = Math.min(canvas.height - y, Math.ceil(2 * r * dpr));
    const data = ctx.getImageData(x, y, w, h).data;
    let green = 0, spill = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 1] > data[i] + 25 && data[i + 1] > data[i + 2] + 25) {
      green++;
      const px = x + (i / 4) % w, py = y + Math.floor(i / 4 / w);
      const distance = Math.hypot(px / dpr - aura.x, py / dpr - aura.y) / aura.radius;
      // Outside the actual vehicle: reject the old tiny roof outline, even if it is green.
      if (distance > 0.4 && distance < 0.65) spill++;
    }
    return { cue: aura.cue, green, spill };
  }, api);
  for (const { name, width, height, touch } of [
    { name: 'desktop', width: 1440, height: 900, touch: false },
    { name: 'desktop-short', width: 1440, height: 420, touch: false },
    { name: 'desktop-short-1280', width: 1280, height: 400, touch: false },
    { name: 'desktop-narrow', width: 1024, height: 768, touch: false },
    { name: 'portrait', width: 390, height: 844, touch: true },
    { name: 'compact', width: 320, height: 568, touch: true },
    { name: 'landscape', width: 844, height: 390, touch: true },
    { name: 'landscape-480', width: 480, height: 320, touch: true },
    { name: 'landscape-500', width: 500, height: 400, touch: true },
  ]) {
    const landscape = touch && width > height, desktop = !touch;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    await context.setOffline(true);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
    await page.waitForFunction(() => !!window.__scenario);
    // The intro splash hides the whole HUD, including the new shortcut menu.
    assert.equal(await page.locator('body').evaluate(b => b.classList.contains('splash-active')), true, `${name}: the intro splash must be active`);
    for (const selector of ['.navigation-actions', '#dispatch', '#texts', '#newsroom']) {
      assert.equal(await page.locator(selector).evaluate(e => getComputedStyle(e).visibility), 'hidden', `${name}: ${selector} must be hidden, not merely disabled, on the intro splash`);
    }
    await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    assert.equal(await page.locator('.navigation-actions').evaluate(e => getComputedStyle(e).visibility), 'visible', `${name}: shortcuts return while playing`);
    const command = async command => {
      const result = await page.evaluate(command => window.__scenario.execute(command), command);
      assert.equal(result.status, 'passed', result.error);
      return result.state;
    };
    if (name === 'desktop') {
      // HUD drawing must never perturb the fixed-step simulation.
      const drive = async () => {
        await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
        await command({ op: 'place', at: { x: 4, y: 80 }, angle: Math.PI / 2 });
        return (await command({ op: 'step', seconds: 1.5, keys: ['KeyW'] })).position;
      };
      assert.deepEqual(await drive(), await drive(), 'fixed-step simulation must stay deterministic');
      await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
      // Drive the first straight pickup physically at 120 Hz. No place/pickup
      // command, upgrades, or actor-state mutations are used in this sequence.
      let state = await page.evaluate(() => window.__scenario.render('world'));
      for (let step = 0; step < 800 && state.job.stage === 'pickup'; step++) {
        const dx = state.job.pickup.x - state.position.x, dy = state.job.pickup.y - state.position.y;
        const distance = Math.hypot(dx, dy), heading = Math.atan2(dy, dx);
        const turn = Math.atan2(Math.sin(heading - state.angle), Math.cos(heading - state.angle));
        const keys = [];
        if (distance > 2.5) {
          if (state.speed < 2.4) keys.push('KeyW');
          if (Math.abs(turn) > 0.15) keys.push(turn > 0 ? 'KeyD' : 'KeyA');
        } else if (state.speed > 0.8) keys.push('KeyS');
        state = await command({ op: 'step', seconds: 0.05, keys });
      }
      assert.equal(state.job.stage, 'dropoff', 'Physical driving must collect the first passenger');
      assert.equal(state.driverHealth, 100);
      assert.equal(await page.locator('.navigation-hud').getAttribute('data-state'), 'on-board');
      assert.match(await page.locator('#map').getAttribute('aria-label'), /DELIVER · /);
      // The on-board cue is a world aura, not a badge in the wheel.
      assert.equal(await page.locator('.navigation-hud').getAttribute('data-cue'), 'roof');
      assert.equal(await page.locator('#map-badge, .navigation-badge').count(), 0);
      // The renderer must actually paint the roof aura, not just set the predicate.
      const roof = await auraPixels(page, '__scenario');
      assert(roof?.cue === 'roof', 'the renderer must paint the cab roof aura');
      assert(roof.green > 0, 'the roof aura must put green pixels on the canvas');
      assert(roof.spill > 50, `the roof aura must visibly spill beyond the cab, got ${roof.spill} pixels`);
      state = await command({ op: 'step', seconds: 1, keys: ['KeyW', 'ShiftLeft'] });
      assert(state.speed > 0);
      await page.locator('#city').focus();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: resolve(output, 'desktop-driving.png') });
      console.log('Physical desktop pickup and driving integration passed');
      // Start a separate fixture for layout captures; never teleport mid-drive.
      await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    }
    if (name === 'portrait') {
      const stick = await page.locator('#joystick').boundingBox();
      const before = await page.evaluate(() => window.__scenario.render('world'));
      await page.mouse.move(stick.x + stick.width / 2, stick.y + 8);
      await page.mouse.down();
      assert.equal(await page.locator('#joystick.pressed').count(), 1);
      const after = await command({ op: 'step', seconds: 1 });
      await page.mouse.up();
      assert(Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y) > 1, 'Mobile joystick must physically move the taxi');
      assert(after.speed > 0);
      assert.equal(await page.locator('#joystick.pressed').count(), 0);
      console.log('Mobile joystick pointer/driving integration passed');
      await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    }
    const render = () => page.evaluate(() => window.__scenario.render('world'));
    const panel = () => page.locator('.navigation-hud');
    const state = () => panel().getAttribute('data-state');
    const target = () => panel().getAttribute('data-target');
    const mapLabel = () => page.locator('#map').getAttribute('aria-label');
    const layout = () => page.evaluate(() => {
      const box = selector => { const element = document.querySelector(selector); const b = element.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
      const chart = document.querySelector('.navigation-chart'), map = document.querySelector('#map');
      const actions = document.querySelector('.navigation-actions');
      return {
        panel: box('.navigation-hud'), chart: box('.navigation-chart'), map: box('#map'), actions: box('.navigation-actions'), player: box('.player-hud'),
        chartRadius: getComputedStyle(chart).borderRadius, panelRadius: getComputedStyle(document.querySelector('.navigation-hud')).borderRadius,
        canvasRole: map.getAttribute('role'), canvasTabIndex: map.getAttribute('tabindex'), canvasLabel: map.getAttribute('aria-label'),
        header: document.querySelector('.navigation-header') !== null,
        caption: document.querySelector('#map-caption') !== null,
        overflow: document.querySelector('.navigation-hud').scrollWidth > document.querySelector('.navigation-hud').clientWidth,
        buttons: [...actions.querySelectorAll('button')].map(button => ({ id: button.id, label: button.getAttribute('aria-label'), disabled: button.disabled, className: button.className, ...box(`#${button.id}`) })),
        collisions: ['.player-hud', '.navigation-hud', '.controls', '#joystick', '[data-key=boost]', '[data-key=handbrake]', '.context-actions']
          .filter(selector => [...document.querySelectorAll(selector)].some(element => {
            if (!element.getClientRects().length) return false;
            const b = element.getBoundingClientRect();
            return actions.getBoundingClientRect().left < b.right && actions.getBoundingClientRect().right > b.left && actions.getBoundingClientRect().top < b.bottom && actions.getBoundingClientRect().bottom > b.top;
          })),
      };
    });
    // The header above the minimap is gone and the circular map carries the guidance.
    const check = async () => {
      const l = await layout();
      assert.equal(l.header, false, `${name}: the navigation header must be removed`);
      assert(Math.abs(l.chart.width - l.chart.height) <= 1, `${name}: radar must stay circular`);
      assert.equal(l.chartRadius, '50%');
      assert(Math.abs(l.map.width - l.chart.width) <= 7 && Math.abs(l.map.height - l.chart.height) <= 7, `${name}: minimap must fill the circle`);
      assert(Math.abs(l.panel.height - l.chart.height) <= 1, `${name}: the widget must end at the map with no reserved space`);
      assert.equal(l.caption, false, `${name}: the map must keep no bottom caption or text panel`);
      assert(Math.abs(l.panel.width - l.chart.width) <= 1, `${name}: the widget must stay as wide as the map`);
      assert(!/\d+\s*m\b|to the target|metre/i.test(l.canvasLabel), `${name}: the minimap must carry no distance readout`);
      assert.equal(l.overflow, false, `${name}: no horizontal overflow`);
      assert(l.panel.left >= 0 && l.panel.top >= 0 && l.panel.right <= width && l.panel.bottom <= height, JSON.stringify(l.panel));
      assert(l.chart.width <= 170.5 && l.chart.width >= 130, `${name}: radar size must stay in range`);
      if (name === 'desktop') assert(Math.abs(l.chart.width - 170) <= 1.1, `${name}: desktop radar must be about 170 px`);
      assert.equal(l.canvasRole, 'img');
      assert.equal(l.canvasTabIndex, null, `${name}: the canvas must not be a hotspot`);
      assert.equal(await page.locator('.navigation-hud button').count(), 0, `${name}: the map itself must hold no controls`);
      // Every shortcut is a real, named, touch-sized button.
      assert.deepEqual(l.buttons.map(button => button.id), ['dispatch', 'texts', 'newsroom']);
      for (const button of l.buttons) {
        assert(button.label && button.label.length > 4, `${name}: ${button.id} needs an accessible name`);
        assert(button.width >= 44 && button.height >= 44, `${name}: ${button.id} needs a 44 px target, got ${button.width}x${button.height}`);
        assert(button.left >= 0 && button.top >= 0 && button.right <= width && button.bottom <= height, `${name}: ${button.id} exceeds the viewport`);
      }
      const centresX = l.buttons.map(button => (button.left + button.right) / 2), centresY = l.buttons.map(button => (button.top + button.bottom) / 2);
      if (landscape) {
        // Landscape touch keeps the user-mandated horizontal row across the top centre.
        for (const y of centresY) assert(Math.abs(y - centresY[0]) <= 1, `${name}: shortcuts must share one horizontal row`);
        assert(centresX[0] < centresX[1] && centresX[1] < centresX[2], `${name}: shortcuts must read left to right`);
        assert(Math.abs((centresX[0] + centresX[2]) / 2 - width / 2) <= 1.5, `${name}: the row must sit at the top centre`);
        assert(Math.abs(l.actions.top - 8) <= 1.5, `${name}: the row must sit on the top edge`);
        assert(l.actions.left >= l.panel.right, `${name}: the row must clear the radar`);
        assert(l.actions.right <= l.player.left, `${name}: the row must clear the personal status corner`);
      } else if (touch) {
        for (const x of centresX) assert(Math.abs(x - centresX[0]) <= 1, `${name}: shortcuts must stack vertically`);
        assert(centresY[0] < centresY[1] && centresY[1] < centresY[2], `${name}: shortcuts must read top to bottom`);
        assert(Math.abs(l.actions.left - 10) <= 1.5, `${name}: portrait shortcuts must sit on the left edge`);
        assert(l.actions.bottom <= height - 100, `${name}: shortcuts must clear the thumb buttons`);
        assert(l.actions.left >= l.panel.left && l.actions.top >= l.panel.bottom, `${name}: shortcuts must stay clear of the map`);
      } else {
        for (const x of centresX) assert(Math.abs(x - centresX[0]) <= 1, `${name}: shortcuts must stack vertically`);
        assert(centresY[0] < centresY[1] && centresY[1] < centresY[2], `${name}: shortcuts must read top to bottom`);
        if (width >= 701 && width <= 1100 && height >= 501) {
          // Narrow desktop fallback: beside the map instead of over the right-hand dialogue.
          assert(Math.abs(l.actions.left - (l.panel.right + 8)) <= 1.5, `${name}: narrow-desktop shortcuts must sit beside the map`);
          assert(Math.abs(l.actions.top - 28) <= 1.5, `${name}: narrow-desktop shortcuts must be top-aligned`);
        } else {
          assert(Math.abs(l.actions.right - (width - 28)) <= 1.5, `${name}: the column must sit on the right edge`);
          if (height <= 500) {
            // Short desktop: pinned below the personal HUD rather than centred into it.
            assert(Math.abs(l.actions.top - 155) <= 1.5, `${name}: short-desktop shortcuts must sit below the status corner`);
            assert(l.actions.top >= l.player.bottom + 4, `${name}: the column must clear the personal HUD`);
          } else {
            assert(Math.abs((l.actions.top + l.actions.bottom) / 2 - height / 2) <= 1.5, `${name}: the column must be vertically centred`);
          }
        }
      }
      assert.deepEqual(l.collisions, [], `${name}: shortcuts must not collide with other HUD controls`);
      assert.equal(await page.locator('#map').count(), 1);
      assert.equal(await page.locator('.navigation-header, .taxi-state, #mission-title, #distance, #job-status, #navigation-destination, #navigation-contacts, #map-caption, #map-badge, .navigation-badge').count(), 0);
      assert.equal(await page.locator('#map').isVisible(), true);
      assert.equal(await page.locator('#player-time').count(), 1);
    };
    const shot = async state => {
      await page.locator('#city').focus();
      // Park the pointer away from the shortcuts so hover styling never leaks into a capture.
      await page.mouse.move(width / 2, height / 2);
      await page.evaluate(() => document.fonts.ready);
      await check();
      await page.screenshot({ path: resolve(output, `${name}-${state}.png`) });
    };
    // On touch the ride conversation can cover the cab, so minimise it before capturing
    // the world aura (the pickup itself stays a real state change).
    const closeStory = async () => { if (await page.locator('#story').isVisible()) { await page.locator('#story-close').click(); await render(); } };
    assert.equal(await state(), 'engaged');
    assert.match(await mapLabel(), /PICK UP · /);
    assert.equal(await target(), 'pickup');
    assert.equal(await page.locator('#dispatch').getAttribute('aria-pressed'), 'true');
    // Collecting the first fare shows no on-board cue yet.
    assert.equal(await page.locator('.navigation-hud').getAttribute('data-cue'), '');
    assert.equal(await page.locator('#map-badge, .navigation-badge').count(), 0, `${name}: the wheel must carry no on-board badge`);
    await shot('engaged');
    await page.locator('#dispatch').click(); await render();
    assert.equal(await state(), 'vacant');
    assert.match(await mapLabel(), /DISPATCH · /);
    assert.equal(await page.locator('#dispatch').getAttribute('aria-pressed'), 'false');
    await shot('vacant');
    // Keyboard activation routes the fare again, without any canvas hotspot.
    await page.locator('#dispatch').focus();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'dispatch');
    await page.keyboard.press('Enter'); await render();
    assert.equal(await state(), 'engaged');
    assert.match(await mapLabel(), /PICK UP · /);
    await page.locator('#texts').click();
    assert.equal(await page.locator('#mission-inbox').isVisible(), true);
    await page.locator('#texts-close').click();
    await page.locator('#city').focus(); await page.keyboard.press('KeyP');
    // The pause splash hides the whole HUD too, so no shortcut floats over the menu.
    assert.equal(await page.locator('body').evaluate(b => b.classList.contains('splash-active')), true, `${name}: pause opens the shared splash`);
    for (const selector of ['.navigation-actions', '#dispatch', '#texts', '#newsroom']) {
      assert.equal(await page.locator(selector).evaluate(e => getComputedStyle(e).visibility), 'hidden', `${name}: ${selector} must be hidden, not merely disabled, while paused`);
    }
    await page.locator('#open-notebook').click();
    await waitForDrawer(page, 'notebook');
    assert.equal(await page.locator('#modal.notebook-modal').isVisible(), true);
    await command({ op: 'mode', mode: 'playing' });
    // Booking newsroom guidance clears through the same toggle and keeps the booking.
    const booking = (await render()).job;
    await page.locator('#newsroom').click(); await render();
    assert.match(await mapLabel(), /NEWSROOM · /);
    assert.equal(await target(), 'newsroom');
    assert.equal(await page.locator('#dispatch').isEnabled(), true);
    await page.locator('#dispatch').click(); await render();
    assert.equal(await state(), 'vacant');
    assert.match(await mapLabel(), /DISPATCH · /);
    assert.deepEqual((await render()).job, booking, 'Cancelling newsroom guidance must preserve the booking');
    await page.locator('#dispatch').click(); await render();
    assert.equal(await state(), 'engaged');
    assert.match(await mapLabel(), /PICK UP · /);
    await page.locator('#city').focus(); await page.keyboard.press('KeyG'); await render();
    assert.equal(await page.locator('.garage-modal').isVisible(), true);
    await command({ op: 'mode', mode: 'playing' });
    await page.locator('#city').focus(); await page.keyboard.press('KeyH'); await render();
    assert.match(await mapLabel(), /HARBOUR · /);
    assert.equal(await target(), 'harbour');
    // Cancel the detour via H, then route the fare from the vacant toggle.
    await page.keyboard.press('KeyH'); await render();
    if (await state() !== 'vacant') { await page.locator('#dispatch').click(); await render(); }
    assert.equal(await state(), 'vacant');
    await page.locator('#dispatch').click(); await render();
    assert.equal(await state(), 'engaged');
    await check();
    // Fixture capture only; physical integration driving is checked separately.
    await command({ op: 'pickup' });
    assert.equal(await state(), 'on-board');
    assert.match(await mapLabel(), /DELIVER · /);
    assert.equal(await page.locator('.navigation-hud').getAttribute('data-cue'), 'roof');
    if (touch) await closeStory();
    await shot('on-board');
    const driving = await command({ op: 'step', seconds: 1, keys: ['KeyW', 'ShiftLeft'] });
    assert(driving.speed > 0);
    await command({ op: 'deliver' });
    assert.equal(await state(), 'vacant');
    assert.match(await mapLabel(), /DISPATCH · /);
    assert.equal(await page.locator('.navigation-hud').getAttribute('data-cue'), '');
    // Walking keeps the map free of a permanent status bar and shows parked rides.
    await page.locator('#city').focus(); await page.keyboard.press('KeyE'); await render();
    assert.equal(await state(), 'on-foot');
    assert.equal(await target(), 'walk');
    assert(!/PICK UP|DELIVER|Find a ride/.test(await mapLabel()), 'no permanent Find a ride or ON FOOT bar');
    assert.equal(await page.locator('.navigation-hud').getAttribute('data-cue'), '');
    assert.equal(await page.locator('#dispatch').isDisabled(), true);
    await check();
    if (touch) await closeStory();
    await shot('on-foot');
    await context.close();
    console.log(`${name}: header-free radar, shortcut placement, state transitions and offline layout passed`);
  }
  // The courier bike's on-board cue is verified through real play, not a fixture: exit the
  // cab, mount the parked bike and physically collect a parcel at 120 Hz in the debug lab.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.setOffline(true);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`bike: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`bike: ${message.text()}`); });
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?debug=1`);
    await page.waitForFunction(() => !!window.__taxi);
    const step = (seconds, keys = []) => page.evaluate(({ seconds, keys }) => window.__taxi.step(seconds, keys), { seconds, keys });
    await page.evaluate(() => window.__taxi.scenario('motorcycle'));
    await page.locator('#city').focus();
    await page.keyboard.press('KeyE'); // leave the cab
    await step(0.35, ['KeyS']);
    await page.keyboard.press('KeyE'); // mount the courier bike
    let bike = await page.evaluate(() => window.__taxi.state());
    assert.equal(bike.vehicleModel, 'motorcycle', 'the parked courier bike must be enterable');
    assert.equal(bike.job.type, 'parcel');
    assert.equal(await page.locator('.navigation-hud').getAttribute('data-cue'), '', 'no cue before the parcel is aboard');
    assert.equal(await page.evaluate(() => window.__taxi.aura()), null, 'the renderer must paint no aura before the parcel is aboard');
    for (let attempt = 0; attempt < 1600 && bike.job.stage === 'pickup'; attempt++) {
      const dx = bike.job.pickup.x - bike.position.x, dy = bike.job.pickup.y - bike.position.y;
      const distance = Math.hypot(dx, dy), heading = Math.atan2(dy, dx);
      const turn = Math.atan2(Math.sin(heading - bike.angle), Math.cos(heading - bike.angle));
      const keys = distance > 2.5
        ? [...bike.speed < 2.2 ? ['KeyW'] : [], ...Math.abs(turn) > 0.12 ? [turn > 0 ? 'KeyD' : 'KeyA'] : []]
        : bike.speed > 0.8 ? ['KeyS'] : [];
      bike = await step(0.05, keys);
    }
    assert.equal(bike.job.stage, 'dropoff', 'physical riding must collect the parcel');
    await page.evaluate(() => window.__taxi.toggle(false)); // collapse the lab panel for a clean capture
    await step(2.4, []); // let the pickup feedback fade so the aura reads clearly
    await page.locator('#city').focus();
    await page.evaluate(() => document.fonts.ready);
    await step(0.02, []);
    assert.equal(await page.locator('.navigation-hud').getAttribute('data-cue'), 'body');
    // The renderer must actually paint the body aura, not just set the predicate.
    const body = await auraPixels(page, '__taxi');
    assert(body?.cue === 'body', 'the renderer must paint the bike body aura');
    assert(body.green > 0, 'the body aura must put green pixels on the canvas');
    assert(body.spill > 50, `the bike aura must visibly spill beyond the body, got ${body.spill} pixels`);
    await page.screenshot({ path: resolve(output, 'desktop-bike-on-board.png') });
    await context.close();
    console.log('Courier bike on-board aura through physical riding passed');
  }
  assert.deepEqual(errors, [], 'Browser errors');
  assert.deepEqual(requests, [], 'External runtime requests');
  console.log(`Offline production checks passed; screenshots: ${output}`);
} finally { await browser.close(); }

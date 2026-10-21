// Optional offline browser QA: run after npm run build.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, newContext, closeBrowser, captureFailure, viewportTuples } from '../runtime.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = process.env.SCREENSHOT_DIR ?? path.join(root, 'scenario-runs/minimal-player-hud');
const browser = await launchBrowser();
async function screenshot(page, name, prefix = '') {
  if (['desktop', 'portrait', 'small', 'landscape'].includes(name)) {
    await page.screenshot({ path: path.join(output, `${prefix}${name}.png`) });
  }
}
async function checkLayout(page, name, width, height, touch, insets = {}, allowOverlap = () => false) {
  const rects = await page.evaluate(() => {
    const out = {};
    for (const selector of ['.player-hud', '.navigation-hud', '.navigation-actions', '#story', '#roadside', '#toast', '#joystick', '.thumb-actions', '#interact']) {
      const element = document.querySelector(selector);
      if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') continue;
      if (selector === '#toast' && !element.classList.contains('visible')) continue;
      const { x, y, width, height } = element.getBoundingClientRect();
      out[selector] = { x, y, width, height };
    }
    return out;
  });
  const status = await page.locator('.player-hud').evaluate(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  });
  assert.equal(status.y, insets.top ?? (touch ? 8 : 28), `${name}: status must stay at the top edge`);
  assert.equal(width - status.x - status.width, insets.right ?? (touch ? 10 : 28), `${name}: status must stay at the right edge`);
  for (const [selector, rect] of Object.entries(rects)) {
    assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1, `${name}: ${selector} exceeds viewport`);
  }
  const entries = Object.entries(rects);
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const [a, one] = entries[i], [b, two] = entries[j];
    assert(allowOverlap(a, b) || !(one.x < two.x + two.width && one.x + one.width > two.x && one.y < two.y + two.height && one.y + one.height > two.y), `${name}: ${a} overlaps ${b}`);
  }
}
try {
  await mkdir(output, { recursive: true });
  for (const [name, width, height, touch] of [
    ...viewportTuples('desktop', 'portrait', 'small', 'landscape', 'compact-landscape'),
    ['tablet', 768, 1024, true], ['narrow-desktop', 900, 650, false], ['short-desktop', 701, 501, false],
  ]) {
    const context = await newContext(browser, { viewport: { width, height }, hasTouch: touch, isMobile: touch, offline: true });
    const page = await context.newPage();
    // Disable persistence before entering the Lab; never read normal settings/saves.
    await page.goto(`file://${path.join(root, 'dist/index.html')}?dialogue-preview=1&debug=1`);
    await page.evaluate(() => {
      __taxi.scenario('first-fare');
      document.querySelector('#debug-panel').hidden = true;
    });
    assert.equal(await page.locator('.player-hud > *').count(), 4);
    assert.equal(await page.locator('#player-heat svg').count(), 3);
    if (name === 'desktop') {
      assert.equal(await page.locator('#player-time').textContent(), '07:00');
      await page.evaluate(() => __taxi.step(1));
      assert.equal(await page.locator('#player-time').textContent(), '07:01', 'clock is HH:MM, not elapsed MM:SS');
      await page.evaluate(() => __taxi.campaign(1439));
      assert.equal(await page.locator('#player-time').textContent(), '23:59');
      await page.evaluate(() => __taxi.step(1));
      assert.equal(await page.locator('#player-time').textContent(), '00:00');
      await page.evaluate(() => {
        __taxi.damageVehicle(__taxi.state().playerId, { health: 12 });
        __taxi.cash(1122 - __taxi.state().cash);
      });
      assert.equal(await page.locator('#player-health').getAttribute('aria-valuenow'), '100', 'damaged car must not change personal health');
      assert.equal(await page.locator('#player-cash').textContent(), '$1,122');
      await page.evaluate(() => __taxi.interact());
      assert(await page.evaluate(() => __taxi.state().onFoot));
      assert.equal(await page.locator('#player-health').getAttribute('aria-valuenow'), '100');
      await page.evaluate(() => __taxi.interact());
      assert(!(await page.evaluate(() => __taxi.state().onFoot)));
      assert.equal(await page.locator('#player-health').getAttribute('aria-valuenow'), '100');
    }
    await page.evaluate(() => {
      __taxi.scenario('first-fare');
      __taxi.step(1, ['KeyW']);
      __taxi.step(2, ['KeyS']);
      __taxi.step(6);
      __taxi.dayNight({ hour: 12 + 37 / 60 });
      __taxi.cash(1122 - __taxi.state().cash);
    });
    assert.equal(await page.locator('#player-time').textContent(), '12:37');
    assert(await page.evaluate(() => {
      const time = getComputedStyle(document.querySelector('#player-time'));
      const cash = getComputedStyle(document.querySelector('#player-cash'));
      return time.fontSize === cash.fontSize && time.fontWeight === cash.fontWeight;
    }), 'time and cash must have equal prominence');
    await page.evaluate(() => document.fonts.ready);
    await checkLayout(page, name, width, height, touch);
    const bounds = await page.locator('.player-hud').boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
    await screenshot(page, name);
    for (const balance of [0, 10000000, 99999999999]) {
      await page.evaluate(value => __taxi.cash(value - __taxi.state().cash), balance);
      assert.equal(await page.locator('#player-cash').textContent(), `$${balance.toLocaleString('en-US')}`);
      assert.equal(await page.locator('#player-time').evaluate(element => getComputedStyle(element).fontSize), await page.locator('#player-cash').evaluate(element => getComputedStyle(element).fontSize));
      assert(await page.locator('#player-cash').evaluate(element => {
        const parent = element.parentElement.getBoundingClientRect(), cash = element.getBoundingClientRect();
        return cash.left >= parent.left - 1 && cash.right <= parent.right + 1;
      }), `${name}: complete cash balance must fit`);
    }
    if (name === 'desktop') {
      // A real moving bailout/landing must change this same meter.
      await page.evaluate(() => { __taxi.scenario('moving-car-exit'); __taxi.interact(); __taxi.step(3); });
      const health = await page.evaluate(() => __taxi.state().driverHealth);
      assert(health > 0 && health < 100);
      assert.equal(await page.locator('#player-health').getAttribute('aria-valuenow'), String(health));
      assert(Math.abs(await page.locator('#player-health i').evaluate(element => parseFloat(element.style.width)) - health) < 0.001);
    }
    await page.evaluate(() => {
      __taxi.scenario('first-fare');
      __taxi.cash(1122 - __taxi.state().cash);
      __taxi.dayNight({ hour: 7 });
      __taxi.damageVehicle(__taxi.state().playerId, { health: 0 });
      __taxi.interact();
      __taxi.step(2);
    });
    await page.locator('#roadside').waitFor({ state: 'visible' });
    await checkLayout(page, `${name} wreck recovery`, width, height, touch);
    if (name === 'compact-landscape') await page.screenshot({ path: path.join(output, 'wreck-compact-landscape.png') });
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    await page.evaluate(() => __taxi.realtime());
    // Scenario facts exercise fractional heat through the actual HUD, without
    // adding gameplay cheats or coupling screenshots to elapsed wall time.
    const heatPage = await context.newPage();
    await heatPage.goto(`file://${path.join(root, 'dist/index.html')}?scenario-preview=1`);
    await heatPage.evaluate(() => window.__scenario.start({ noPolice: false }));
    for (const [heat, fills, stars] of (name === 'desktop' ? [
      [0, [0, 0, 0], 0], [10, [0.5, 0, 0], 0], [20, [1, 0, 0], 1],
      [34, [1, 0.5, 0], 1], [48, [1, 1, 0], 2], [62, [1, 1, 0.5], 2],
      [76, [1, 1, 1], 3], [100, [1, 1, 1], 3], [10, [0.5, 0, 0], 0], [0, [0, 0, 0], 0],
    ] : [[34, [1, 0.5, 0], 1]])) {
      await heatPage.evaluate(value => window.__scenario.execute({ op: 'facts', facts: { heat: value } }), heat);
      assert.deepEqual(await heatPage.locator('#player-heat clipPath rect').evaluateAll(rects => rects.map(rect => Number(rect.getAttribute('width')) / 20)), fills);
      assert.equal(await heatPage.locator('#player-heat').getAttribute('aria-valuenow'), String(heat));
      assert.equal(await heatPage.locator('#player-heat').getAttribute('aria-valuetext'), `${stars} of 3 wanted stars; ${heat}% police attention`);
      const state = await heatPage.evaluate(() => window.__scenario.render());
      assert.equal(state.heat, heat);
      assert.equal(state.stars, stars);
    }
    await heatPage.evaluate(() => {
      window.__scenario.execute({ op: 'facts', facts: { heat: 34, cash: 1122 } });
      window.__scenario.execute({ op: 'advance', to: { day: 1, hour: 12, minute: 37 } });
    });
    await heatPage.evaluate(() => document.fonts.ready);
    await checkLayout(heatPage, name, width, height, touch);
    await screenshot(heatPage, name, 'heat-');
    const heatBounds = await heatPage.locator('.player-hud').boundingBox();
    assert(heatBounds.x >= 0 && heatBounds.y >= 0 && heatBounds.x + heatBounds.width <= width && heatBounds.y + heatBounds.height <= height);
    assert.deepEqual(await heatPage.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    // Expanded conversations replace status; minimizing restores it and centres replay.
    await page.bringToFront();
    await page.evaluate(() => window.__dialoguePreview({ character: 'bea' }, 'bea-first-shift', 'pickup'));
    await page.locator('#story').waitFor({ state: 'visible' });
    await page.locator('#story img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    assert.equal(await page.locator('.player-hud').isVisible(), false, 'expanded dialogue hides the underlying status');
    const storyBounds = await page.locator('#story').boundingBox();
    assert.equal(storyBounds.y, touch ? 8 : 28, 'expanded dialogue shares the status top edge');
    assert.equal(width - storyBounds.x - storyBounds.width, touch ? 10 : 28, 'expanded dialogue shares the status right edge');
    const portraitTouch = touch && height > width;
    if (portraitTouch) {
      assert.equal(storyBounds.x, 10, 'portrait conversation must reach the left edge');
      assert.equal(storyBounds.width, width - 20, 'portrait conversation must span the full width over the radar');
    }
    const coverRadar = (a, b) => portraitTouch && [a, b].includes('.navigation-hud') && [a, b].includes('#story');
    await checkLayout(page, `${name} story`, width, height, touch, {}, coverRadar);
    await screenshot(page, name, 'story-');
    await page.locator('#story-close').click();
    assert.equal(await page.locator('.player-hud').isVisible(), true, 'minimizing restores status');
    const replayBounds = await page.locator('#story').boundingBox();
    if (touch && height > width) {
      const statusBounds = await page.locator('.player-hud').boundingBox();
      assert.equal(width - replayBounds.x - replayBounds.width, 10, 'portrait replay stays at the right edge');
      assert(replayBounds.y >= statusBounds.y + statusBounds.height, 'portrait replay must sit below the status and heat meter');
    } else {
      assert.equal(replayBounds.x + replayBounds.width / 2, width / 2, 'replay is centred');
    }
    await checkLayout(page, `${name} minimized story`, width, height, touch, {}, coverRadar);
    await screenshot(page, name, 'collapsed-story-');
    await page.locator('#story-read').click();
    assert.equal(await page.locator('.player-hud').isVisible(), false, 'replay returns to the status corner');
    await checkLayout(page, `${name} replayed story`, width, height, touch, {}, coverRadar);
    await page.locator('#story-close').click();
    if (touch) {
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--top-height', '24px');
        document.documentElement.style.setProperty('--edge-right', '26px');
      });
      await checkLayout(page, `${name} safe area`, width, height, touch, { top: 32, right: 26 }, coverRadar);
      await page.evaluate(() => {
        document.documentElement.style.removeProperty('--top-height');
        document.documentElement.style.removeProperty('--edge-right');
      });
    }
    await context.close();
    console.log(`PASS ${name}: status layout, large balances, heat, recovery and story${name === 'desktop' ? ', clock and physical driver-health transitions' : ''}`);
  }
  console.log('PASS: standalone offline; no console errors, external requests or persistence writes');
} catch (error) { await captureFailure(); throw error; } finally {
  await closeBrowser(browser);
}

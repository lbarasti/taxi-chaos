// Optional offline browser QA: run after npm run build.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.env.SCREENSHOT_DIR ?? path.join(root, 'docs/screenshots/minimal-player-hud');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [], externalRequests = [];
try {
  await mkdir(output, { recursive: true });
  for (const [name, width, height, touch] of [
    ['desktop', 1440, 900, false], ['portrait', 390, 844, true],
    ['small', 320, 568, true], ['landscape', 844, 390, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, offline: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
    // Disable persistence before entering the Lab; never read normal settings/saves.
    await page.goto(`file://${path.join(root, 'dist/index.html')}?dialogue-preview=1&debug=1`);
    await page.evaluate(() => {
      __taxi.scenario('first-fare');
      document.querySelector('#debug-panel').hidden = true;
    });
    assert.equal(await page.locator('.player-hud > *').count(), 4);
    assert.equal(await page.locator('#player-heat svg').count(), 3);
    assert.equal(await page.locator('.dashboard,#speed,#gear,#boost,#health,#stars,#heat-panel,#earnings,#deliveries,#texts-toggle').count(), 0);
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
    const bounds = await page.locator('.player-hud').boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    for (const balance of [0, 10000000, 99999999999]) {
      await page.evaluate(value => __taxi.cash(value - __taxi.state().cash), balance);
      assert.equal(await page.locator('#player-cash').textContent(), `$${balance.toLocaleString('en-US')}`);
      assert.equal(await page.locator('#player-time').evaluate(element => getComputedStyle(element).fontSize), await page.locator('#player-cash').evaluate(element => getComputedStyle(element).fontSize));
      assert(await page.locator('#player-cash').evaluate(element => {
        const parent = element.parentElement.getBoundingClientRect(), cash = element.getBoundingClientRect();
        return cash.left >= parent.left - 1 && cash.right <= parent.right + 1;
      }), `${name}: complete cash balance must fit`);
    }
    // A real moving bailout/landing must change this same meter.
    await page.evaluate(() => { __taxi.scenario('moving-car-exit'); __taxi.interact(); __taxi.step(3); });
    const health = await page.evaluate(() => __taxi.state().driverHealth);
    assert(health > 0 && health < 100);
    assert.equal(await page.locator('#player-health').getAttribute('aria-valuenow'), String(health));
    assert(Math.abs(await page.locator('#player-health i').evaluate(element => parseFloat(element.style.width)) - health) < 0.001);
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    await page.evaluate(() => __taxi.realtime());
    // Scenario facts exercise fractional heat through the actual HUD, without
    // adding gameplay cheats or coupling screenshots to elapsed wall time.
    const heatPage = await context.newPage();
    heatPage.on('pageerror', error => errors.push(error.message));
    heatPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    heatPage.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
    await heatPage.goto(`file://${path.join(root, 'dist/index.html')}?scenario-preview=1`);
    await heatPage.evaluate(() => window.__scenario.start({ noPolice: false }));
    for (const [heat, fills, stars] of [
      [0, [0, 0, 0], 0], [10, [0.5, 0, 0], 0], [20, [1, 0, 0], 1],
      [34, [1, 0.5, 0], 1], [48, [1, 1, 0], 2], [62, [1, 1, 0.5], 2],
      [76, [1, 1, 1], 3], [100, [1, 1, 1], 3], [10, [0.5, 0, 0], 0], [0, [0, 0, 0], 0],
    ]) {
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
    await heatPage.screenshot({ path: path.join(output, `heat-${name}.png`) });
    const heatBounds = await heatPage.locator('.player-hud').boundingBox();
    assert(heatBounds.x >= 0 && heatBounds.y >= 0 && heatBounds.x + heatBounds.width <= width && heatBounds.y + heatBounds.height <= height);
    assert.deepEqual(await heatPage.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    await context.close();
    console.log(`PASS ${name}: HH:MM clock, wallet, driver health, vehicle exit/entry, physical bailout, large balances, progressive heat stars and reset`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log('PASS: standalone offline; no console errors, external requests or persistence writes');
} finally {
  await browser.close();
}

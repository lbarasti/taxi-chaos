import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { launchBrowser, closeBrowser, captureFailure } from '../runtime.mjs';
import { openGame, waitForDrawer, tapToConfirm } from '../helpers/drawer.mjs';

const output = process.env.SCREENSHOT_DIR || 'scenario-runs/return-to-title';
await mkdir(output, { recursive: true });
const browser = await launchBrowser(), html = await readFile('dist/index.html', 'utf8');
const saveKey = 'taxi-chaos-v1', morningKey = 'taxi-chaos-mornings-v1:open-shore';
const stored = (page, key = saveKey) => page.evaluate(key => localStorage.getItem(key), key);
const selected = page => page.locator('[data-selected]').getAttribute('id');
async function pause(page) { await page.keyboard.press('p'); await waitForDrawer(page, 'home'); }
async function title(page) {
  await page.locator('#return-to-title').click(); await waitForDrawer(page, 'home');
  assert.equal(await selected(page), 'start');
  assert.equal(await page.locator('#start').innerText(), 'Continue');
}
async function play(page) { await page.locator('#start').click(); await page.locator('#overlay').waitFor({ state: 'hidden' }); }
async function pad(page, button) {
  await page.evaluate(button => { window.testPad.buttons[button].pressed = true; }, button); await page.waitForTimeout(90);
  await page.evaluate(button => { window.testPad.buttons[button].pressed = false; }, button); await page.waitForTimeout(90);
}
try {
  const page = await openGame(browser, html, { viewport: { width: 1440, height: 900 } });
  await waitForDrawer(page, 'home'); assert.equal(await page.locator('#start').count(), 0);
  await page.locator('#new-game').click(); await page.locator('#overlay').waitFor({ state: 'hidden' });
  const initial = JSON.parse(await stored(page));
  await page.keyboard.down('w'); await page.waitForTimeout(450); await page.keyboard.up('w');
  await pause(page);
  const driven = JSON.parse(await stored(page));
  assert(Math.hypot(driven.garage.current.position.x - initial.garage.current.position.x, driven.garage.current.position.y - initial.garage.current.position.y) > 0.1);
  await page.screenshot({ path: `${output}/pause-desktop.png` });
  const archive = await stored(page, morningKey);
  await page.evaluate(() => {
    window.saveWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { window.saveWrites.push(key); return original.call(this, key, value); };
  });
  await title(page);
  assert.deepEqual(await page.evaluate(() => window.saveWrites), [saveKey], 'explicit rolling save from an already paused game');
  const suspended = await stored(page);
  assert.equal(await stored(page, morningKey), archive);
  assert.equal(await page.locator('#notifications').isHidden(), true);
  assert.equal(await page.locator('#story').isHidden(), true);
  assert.equal(await page.locator('#mission-inbox').isHidden(), true);
  await page.screenshot({ path: `${output}/suspended-title-desktop.png` });
  await page.waitForTimeout(1200);
  assert.equal(await stored(page), suspended); assert.equal(await stored(page, morningKey), archive);
  assert.deepEqual(await page.evaluate(() => window.saveWrites), [saveKey], 'no timer-driven title autosaves');
  await page.locator('#new-game').click(); await waitForDrawer(page, 'new-game');
  assert.equal(await selected(page), 'cancel-new-game', 'a live session requires confirmation even with no startup save');
  await page.keyboard.press('Enter'); await waitForDrawer(page, 'home');
  assert.equal(await stored(page), suspended);
  await page.locator('#menu-load-game').click(); await waitForDrawer(page, 'load-game');
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home');
  await page.locator('#start').click();
  assert.equal(await page.locator('#overlay').evaluate(el => el.inert), true, 'suspended Continue retains the camera/fade transition');
  await page.locator('#overlay').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#city').evaluate(el => el === document.activeElement), true);
  // No opening notification is replayed after the original card expires.
  await page.waitForTimeout(6500);
  for (let round = 0; round < 3; round++) {
    await pause(page); await title(page); await play(page);
    assert.equal(await page.locator('#notifications').isHidden(), true, 'Continue does not announce the first fare again');
  }
  assert.equal(await stored(page, morningKey), archive, 'round trips never rewrite Day 1');
  await pause(page); await title(page);
  await page.locator('#start').click(); await pause(page); await title(page);
  await page.waitForTimeout(250); await page.locator('#start').click();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#overlay').evaluate(el => el.inert), true, 'cancelled exit timers cannot finish a later Continue transition');
  await page.locator('#overlay').waitFor({ state: 'hidden' });

  // A failing rolling save must preserve Continue, and Load must leave the live session alone on failure.
  await pause(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    window.restoreWrites = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (name, value) { if (name === key) throw Error('quota'); return original.call(this, name, value); };
  }, saveKey);
  await title(page);
  assert.match(await page.locator('[role="alert"]').innerText(), /could not be saved to the browser.*Continue.*page stays open/);
  const failedSave = await stored(page);
  await page.screenshot({ path: `${output}/save-failure-desktop.png` });
  await page.locator('#menu-load-game').click(); await waitForDrawer(page, 'load-game');
  await page.locator('#load-day-1').click();
  assert.match(await page.locator('[role="alert"]').innerText(), /could not be loaded/);
  assert.equal(await stored(page), failedSave);
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home'); await play(page);
  await page.evaluate(() => window.restoreWrites());
  await pause(page); await title(page); assert.equal(await page.locator('[role="alert"]').count(), 0);

  // Replacement preferences and bindings must follow the new current game on every round trip.
  await page.locator('#menu-settings').click(); await waitForDrawer(page, 'settings');
  await page.locator('#gore-option').check(); await page.keyboard.press('Escape'); await waitForDrawer(page, 'home');
  await page.locator('#new-game').click(); await waitForDrawer(page, 'new-game');
  await page.locator('#confirm-new-game').click(); await page.locator('#overlay').waitFor({ state: 'hidden' });
  await pause(page); await title(page);
  assert.equal(JSON.parse(await stored(page)).cash, 80);
  const freshPosition = JSON.parse(await stored(page)).garage.current.position;
  await page.keyboard.down('w'); await play(page);
  await page.keyboard.down('w'); // Browser autorepeat from the held title-screen key.
  await page.waitForTimeout(400); await page.keyboard.up('w');
  await pause(page); await title(page);
  assert.deepEqual(JSON.parse(await stored(page)).garage.current.position, freshPosition, 'held keyboard input stays cleared until a new press');
  await page.evaluate(() => {
    window.testPad = { connected: true, mapping: 'standard', id: 'Xbox', axes: [0, -1], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.testPad];
  });
  await page.waitForTimeout(90);
  await page.evaluate(() => { window.testPad.buttons[0].pressed = true; });
  await page.locator('#overlay').waitFor({ state: 'hidden' }); await page.waitForTimeout(400);
  await page.keyboard.press('p'); await waitForDrawer(page, 'home');
  assert.deepEqual(JSON.parse(await stored(page)).garage.current.position, freshPosition, 'held controller axes and confirm/boost do not carry into gameplay');
  assert.equal(JSON.parse(await stored(page)).garage.boost, 100);
  await page.evaluate(() => { navigator.getGamepads = () => []; });
  await title(page);
  await page.evaluate(key => {
    const collection = JSON.parse(localStorage.getItem(key));
    collection.days['2'] = structuredClone(collection.days['1']);
    collection.days['2'].cash = 4321; collection.days['2'].campaign.minute = 1860; collection.days['2'].campaign.shift = 2;
    localStorage.setItem(key, JSON.stringify(collection));
  }, morningKey);
  await page.locator('#menu-load-game').click(); await waitForDrawer(page, 'load-game');
  await page.locator('#load-day-2').click(); await page.locator('#overlay').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#player-cash').innerText(), '$4,321');
  await pause(page); await title(page);
  assert.match(await page.locator('.splash-snapshot').innerText(), /4,321/);
  await page.locator('#menu-settings').click(); await waitForDrawer(page, 'settings');
  assert.equal(await page.locator('#gore-option').isChecked(), true);
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home'); await play(page);
  await page.keyboard.down('w'); await page.waitForTimeout(300); await page.keyboard.up('w');
  await pause(page); await title(page); assert.equal(JSON.parse(await stored(page)).cash, 4321);

  await page.evaluate(() => {
    window.testPad = { connected: true, mapping: 'standard', id: 'Xbox', axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.testPad];
  });
  await pad(page, 0); await page.locator('#overlay').waitFor({ state: 'hidden' });
  await pad(page, 9); await waitForDrawer(page, 'home');
  await pad(page, 13); assert.equal(await selected(page), 'return-to-title');
  await pad(page, 0); assert.equal(await page.locator('#start').innerText(), 'Continue');
  await pad(page, 0); await page.locator('#overlay').waitFor({ state: 'hidden' });
  // F2 must resume rather than repeat initialization before entering the isolated laboratory.
  await pause(page); await title(page); await page.keyboard.press('F2');
  await page.keyboard.press('p'); await waitForDrawer(page, 'home');
  assert.equal(await page.locator('#return-to-title').count(), 0, 'isolated laboratory cannot return into normal saves');
  await page.locator('[data-lab="leave"]').click();
  await page.context().close();

  for (const [name, width, height] of [['portrait', 390, 844], ['compact', 320, 568], ['landscape', 844, 390], ['compact-landscape', 568, 320]]) {
    const touch = await openGame(browser, html, { viewport: { width, height }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    await waitForDrawer(touch, 'home'); await tapToConfirm(touch, '#new-game');
    await touch.locator('#overlay').waitFor({ state: 'hidden' });
    await touch.locator('#shift').tap(); await waitForDrawer(touch, 'shift');
    await touch.locator('#return-to-title').scrollIntoViewIfNeeded();
    await touch.screenshot({ path: `${output}/shift-${name}.png` });
    await tapToConfirm(touch, '#return-to-title'); await waitForDrawer(touch, 'home');
    assert.equal(await selected(touch), 'start');
    assert(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('#modal').scrollWidth <= document.querySelector('#modal').clientWidth), 'title has no horizontal overflow');
    await touch.screenshot({ path: `${output}/title-${name}.png` });
    await tapToConfirm(touch, '#new-game'); await waitForDrawer(touch, 'new-game');
    await tapToConfirm(touch, '#cancel-new-game'); await waitForDrawer(touch, 'home');
    await tapToConfirm(touch, '#start');
    assert.equal(await touch.locator('#overlay').isHidden(), true, 'reduced motion resumes immediately');
    await touch.context().close();
  }

  // Storage denied from first page load still produces a resumable live session.
  const denied = await openGame(browser, html, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await denied.addInitScript(() => {
    Storage.prototype.getItem = () => { throw Error('denied'); };
    Storage.prototype.setItem = () => { throw Error('denied'); };
  });
  await denied.reload(); await waitForDrawer(denied, 'home');
  await denied.locator('#new-game').click(); await pause(denied); await title(denied);
  assert.match(await denied.locator('[role="alert"]').innerText(), /Continue is still available/);
  await denied.locator('#new-game').click(); await waitForDrawer(denied, 'new-game');
  await denied.keyboard.press('Escape'); await waitForDrawer(denied, 'home'); await play(denied);
  await denied.context().close();
  console.log('Return to title offline QA passed: desktop, touch HUD and compact layouts, keyboard/controller/two-tap touch, reduced motion, frozen title and morning archive, repeated Continue without startup notifications, cancellation, save/load failure, New game/Load replacement, preferences and laboratory isolation.');
} catch (error) { await captureFailure(); throw error; } finally { await closeBrowser(browser); }

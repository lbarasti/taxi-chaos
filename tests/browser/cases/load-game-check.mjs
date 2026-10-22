import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { launchBrowser, closeBrowser, captureFailure } from '../runtime.mjs';
import { openGame, waitForDrawer, tapToConfirm } from '../helpers/drawer.mjs';

const output = process.env.SCREENSHOT_DIR || 'scenario-runs/load-game';
await mkdir(output, { recursive: true });
const browser = await launchBrowser(), html = await readFile('dist/index.html', 'utf8');
const saveKey = 'taxi-chaos-v1', checkpointKey = 'taxi-chaos-mornings-v1:open-shore';
const settingsKey = 'taxi-chaos-settings', audioKey = 'taxi-chaos-audio';
const settings = { difficulty: 'cruise', gore: true }, audio = { muted: true, volume: 0.3, playerEngine: 0.2, ambient: 0.4, sirens: 0.1 };
const stored = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const selected = page => page.locator('[data-selected]').getAttribute('id');
async function seed(page, entries) {
  await page.addInitScript(() => {
    const raw = sessionStorage.getItem('load-game-seed');
    if (!raw) return;
    sessionStorage.removeItem('load-game-seed');
    for (const [key, value] of Object.entries(JSON.parse(raw))) localStorage.setItem(key, JSON.stringify(value));
  });
  await page.evaluate(entries => sessionStorage.setItem('load-game-seed', JSON.stringify(entries)), entries);
  await page.reload(); await waitForDrawer(page, 'home');
}
async function pad(page, button) {
  await page.evaluate(button => { window.testPad.buttons[button].pressed = true; }, button); await page.waitForTimeout(90);
  await page.evaluate(button => { window.testPad.buttons[button].pressed = false; }, button); await page.waitForTimeout(90);
}
try {
  const page = await openGame(browser, html, { viewport: { width: 1440, height: 900 } });
  await waitForDrawer(page, 'home');
  assert.equal(await stored(page, checkpointKey), null);
  await page.keyboard.press('ArrowDown'); assert.equal(await selected(page), 'menu-load-game');
  await page.keyboard.press('Enter'); await waitForDrawer(page, 'load-game');
  assert.match(await page.locator('.intro-copy').innerText(), /No mornings saved yet.*automatically at 07:00/s);
  assert.equal(await page.locator('[id^="load-day-"]').count(), 0);
  await page.screenshot({ path: `${output}/empty-desktop.png` });
  assert.equal(await stored(page, checkpointKey), null); assert.equal(await stored(page, saveKey), null);
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home'); assert.equal(await selected(page), 'menu-load-game');
  await page.locator('#new-game').click(); await page.locator('#overlay').waitFor({ state: 'hidden' });
  const initial = (await stored(page, checkpointKey)).days['1'];
  assert(initial.playerRecords.texts.length > 0); assert(initial.campaign.editions.length > 0);
  assert.equal(initial.campaign.minute, 420);

  const collection = { version: 1, campaignId: 'open-shore', days: {} };
  for (let day = 1; day <= 14; day++) {
    const save = structuredClone(initial); save.cash = day * 100; save.campaign.minute = 420 + (day - 1) * 1440; save.campaign.shift = day;
    save.garage.current.position = { x: 84, y: 80 }; save.garage.current.upgrades.engine = 2;
    save.shiftStats = { earnings: day * 10, jobs: day, smashed: day, kills: 0 };
    collection.days[String(day)] = save;
  }
  collection.days['2'] = { campaign: { version: 999 } }; // One bad slot cannot hide the rest.
  const latest = structuredClone(collection.days['8']); latest.cash = 9999; latest.campaign.minute += 600;
  await seed(page, { [saveKey]: latest, [checkpointKey]: collection, [settingsKey]: settings, [audioKey]: audio });
  const before = await stored(page, saveKey);
  await page.locator('#menu-load-game').click(); await waitForDrawer(page, 'load-game');
  assert.deepEqual(await page.locator('[id^="load-day-"]').allTextContents(), [1, ...Array.from({ length: 12 }, (_, i) => i + 3)].map(day => `Day ${day} · 07:00`));
  assert.deepEqual(await stored(page, saveKey), before); assert.deepEqual(await stored(page, checkpointKey), collection);
  await page.screenshot({ path: `${output}/mornings-desktop.png` });
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home');
  assert.equal(await selected(page), 'menu-load-game');
  await page.evaluate(() => {
    window.testPad = { connected: true, mapping: 'standard', id: 'Xbox', axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.testPad];
  });
  await pad(page, 0); await waitForDrawer(page, 'load-game');
  await pad(page, 13); assert.equal(await selected(page), 'load-day-1');
  await pad(page, 1); await waitForDrawer(page, 'home');
  await page.evaluate(() => { navigator.getGamepads = () => []; });
  await page.locator('#menu-load-game').click(); await waitForDrawer(page, 'load-game');
  // A failed rolling write must keep the old session and expose a useful error.
  await page.evaluate(key => {
    window.restoreStorageWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === key) throw Error('quota'); return window.restoreStorageWrite.call(this, k, v); };
  }, saveKey);
  await page.locator('#load-day-3').click();
  assert.match(await page.locator('[role="alert"]').innerText(), /could not be loaded/);
  assert.deepEqual(await stored(page, saveKey), before);
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorageWrite; });
  await page.locator('#load-day-3').click();
  assert(await page.locator('#overlay.splash-exiting[inert]').count(), 'restoration uses the opening transition');
  const restored = await stored(page, saveKey);
  assert.equal(restored.campaign.minute, collection.days['3'].campaign.minute); assert.equal(restored.cash, 300);
  assert.deepEqual(restored.garage.current.position, { x: 84, y: 80 }); assert.equal(restored.garage.current.upgrades.engine, 2);
  assert.deepEqual(await stored(page, checkpointKey), collection);
  assert.deepEqual(await stored(page, settingsKey), settings); assert.deepEqual(await stored(page, audioKey), audio);
  await page.reload(); await waitForDrawer(page, 'home');
  assert.match(await page.locator('.splash-snapshot').innerText(), /\$300/);
  await page.screenshot({ path: `${output}/loaded-continue-desktop.png` });
  await page.locator('#start').click(); await page.locator('#overlay').waitFor({ state: 'hidden' });
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  await page.keyboard.press('p'); await waitForDrawer(page, 'home');
  const driven = await stored(page, saveKey);
  assert(Math.hypot(driven.garage.current.position.x - 84, driven.garage.current.position.y - 80) > 0.1, 'physical input follows the restored instance');
  assert.equal(await page.locator('#menu-load-game').count(), 0, 'pause has no Load game');
  await page.locator('#start').click(); await page.locator('#overlay').waitFor({ state: 'hidden' });
  await page.context().close();

  for (const [name, width, height] of [['portrait', 390, 844], ['compact', 320, 568], ['landscape', 844, 390], ['compact-landscape', 568, 320]]) {
    const touch = await openGame(browser, html, { viewport: { width, height }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    await waitForDrawer(touch, 'home');
    await seed(touch, { [saveKey]: latest, [checkpointKey]: collection, [settingsKey]: settings, [audioKey]: audio });
    await tapToConfirm(touch, '#menu-load-game'); await waitForDrawer(touch, 'load-game');
    assert(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('#modal').scrollWidth <= document.querySelector('#modal').clientWidth), 'no horizontal overflow');
    await touch.screenshot({ path: `${output}/mornings-${name}.png` });
    const current = await stored(touch, saveKey); // Startup normalizes the legacy-style fixture before browsing.
    await touch.locator('#load-day-14').scrollIntoViewIfNeeded();
    await touch.locator('#load-day-14').tap(); assert.deepEqual(await stored(touch, saveKey), current, 'first touch selects only');
    await touch.screenshot({ path: `${output}/last-morning-${name}.png` });
    await touch.locator('#load-day-14').tap(); await touch.locator('#overlay').waitFor({ state: 'hidden' });
    assert.equal((await stored(touch, saveKey)).cash, 1400); assert.deepEqual(await stored(touch, checkpointKey), collection);
    await touch.reload(); await waitForDrawer(touch, 'home');
    await tapToConfirm(touch, '#menu-load-game'); await waitForDrawer(touch, 'load-game');
    await tapToConfirm(touch, '#drawer-back'); await waitForDrawer(touch, 'home');
    assert.equal(await selected(touch), 'menu-load-game');
    await tapToConfirm(touch, '#start'); await touch.locator('#overlay').waitFor({ state: 'hidden' });
    await touch.context().close();
  }
  console.log('Load game offline QA passed: empty and valid-only ordered lists, Back/focus/keyboard/controller/touch, write failure, fresh instance and opening transition, immediate Continue/reload, preferences, retained later mornings, physical driving, desktop/compact portrait/landscape; no console errors or external requests.');
} catch (error) { await captureFailure(); throw error; } finally { await closeBrowser(browser); }

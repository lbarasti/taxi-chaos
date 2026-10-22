import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { launchBrowser, closeBrowser, captureFailure } from '../runtime.mjs';
import { openGame, waitForDrawer, tapToConfirm } from '../helpers/drawer.mjs';

const output = process.env.SCREENSHOT_DIR || 'scenario-runs/new-game';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const html = await readFile('dist/index.html', 'utf8');
const saveKey = 'taxi-chaos-v1', settingsKey = 'taxi-chaos-settings', audioKey = 'taxi-chaos-audio';
const readSave = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
const settings = { difficulty: 'cruise', gore: true };
const audio = { muted: true, volume: 0.31, playerEngine: 0.23, ambient: 0.44, sirens: 0.08 };
const menu = page => page.locator('.game-menu button').evaluateAll(buttons => buttons.map(button => button.id));
const selected = page => page.locator('[data-selected]').getAttribute('id');

async function seed(page, save) {
  if (await page.locator('#overlay').isHidden()) { await page.keyboard.press('p'); await waitForDrawer(page, 'home'); }
  // The old page persists on pagehide. Seed on the new document, before startup.
  await page.addInitScript(() => {
    const seed = sessionStorage.getItem('new-game-test-seed');
    if (!seed) return;
    sessionStorage.removeItem('new-game-test-seed');
    for (const [key, value] of Object.entries(JSON.parse(seed))) localStorage.setItem(key, JSON.stringify(value));
  });
  await page.evaluate(entries => sessionStorage.setItem('new-game-test-seed', JSON.stringify(entries)), {
    [saveKey]: save, [settingsKey]: settings, [audioKey]: audio,
  });
  await page.reload(); await waitForDrawer(page, 'home');
}
function assertFreshSave(actual, expected, message) {
  // Reload can blur the old page and save the few live frames before navigation.
  assert(actual.story.campaignSeconds >= 0 && actual.story.campaignSeconds < 5, message);
  assert(actual.campaign.minute >= expected.campaign.minute && actual.campaign.minute < expected.campaign.minute + 5, message);
  const normalized = structuredClone(actual);
  normalized.story.campaignSeconds = expected.story.campaignSeconds;
  normalized.campaign.minute = expected.campaign.minute;
  assert.deepEqual(normalized, expected, message);
}
async function checkPreferences(page) {
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), settingsKey), settings);
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), audioKey), audio);
}
async function pressPad(page, button) {
  await page.evaluate(button => { window.testPad.buttons[button].pressed = true; }, button);
  await page.waitForTimeout(80);
  await page.evaluate(button => { window.testPad.buttons[button].pressed = false; }, button);
  await page.waitForTimeout(80);
}
try {
  const page = await openGame(browser, html, { viewport: { width: 1440, height: 900 } });
  await waitForDrawer(page, 'home');
  assert.deepEqual(await menu(page), ['new-game', 'menu-settings', 'menu-credits']);
  assert.equal(await selected(page), 'new-game');
  assert.equal(await readSave(page), null);
  await page.screenshot({ path: `${output}/title-fresh-desktop.png` });
  await page.keyboard.press('Enter');
  // Persist before the splash finishes and before the first periodic autosave.
  const initial = await readSave(page);
  assert(initial?.garage, 'the initial scene is saved immediately');
  assert(initial.playerRecords.texts.length > 0, 'opening texts are initialized');
  assert(initial.campaign.editions.length > 0, 'opening newspaper is initialized');
  assert(await page.locator('#overlay.splash-exiting[inert]').count(), 'uses the normal splash transition');
  await page.reload(); await waitForDrawer(page, 'home');
  assertFreshSave(await readSave(page), initial, 'immediate reload keeps new progress');
  assert.deepEqual(await menu(page), ['start', 'new-game', 'menu-settings', 'menu-credits']);
  assert.equal(await selected(page), 'start');

  const progressed = structuredClone(initial);
  progressed.cash += 2000; progressed.deliveries = 14; progressed.best = 1200;
  progressed.shiftStats = { earnings: 400, jobs: 4, smashed: 12, kills: 1 };
  progressed.story.flags.push('old-progress'); progressed.story.choices.old = 'choice';
  progressed.story.relationships.old = 7; progressed.story.retryAt.old = 100;
  progressed.story.campaignSeconds = 200; progressed.story.deliveries = 14;
  progressed.campaign.minute += 1440; progressed.campaign.shift = 2;
  progressed.playerRecords.notebook.push({ id: 'old-note', title: 'Old shift', text: 'Previous progress', kind: 'receipt', shift: 1, at: 10 });
  progressed.garage.current.position = { x: 84, y: 80 };
  progressed.garage.current.upgrades.engine = 3; progressed.garage.current.damage.health = 55;
  progressed.garage.boost = 25;
  await seed(page, progressed);
  const stored = await readSave(page);
  assert.deepEqual(stored, progressed, 'the progressed fixture is present before confirmation');
  assert.match(await page.locator('.splash-snapshot').innerText(), /2,080/);
  await page.screenshot({ path: `${output}/title-saved-desktop.png` });
  await page.keyboard.press('ArrowDown'); assert.equal(await selected(page), 'new-game');
  await page.keyboard.press('Enter'); await waitForDrawer(page, 'new-game');
  assert.equal(await selected(page), 'cancel-new-game');
  assert.equal(await page.locator('#modal-title').innerText(), 'Start a new game?');
  assert.match(await page.locator('.intro-copy').innerText(), /Your current progress will be replaced\. Your settings will be kept\./);
  assert.deepEqual(await readSave(page), stored, 'opening confirmation does not write progress');
  await page.screenshot({ path: `${output}/confirmation-desktop.png` });
  await page.keyboard.press('Enter'); await waitForDrawer(page, 'home');
  assert.deepEqual(await readSave(page), stored, 'Cancel does not write progress');
  assert.equal(await selected(page), 'new-game');
  await page.keyboard.press('Enter'); await waitForDrawer(page, 'new-game');
  assert.equal(await selected(page), 'cancel-new-game', 'every opening defaults to Cancel');
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home');
  assert.deepEqual(await readSave(page), stored, 'Escape does not write progress');
  await page.locator('#start').click(); await page.locator('#overlay').waitFor({ state: 'hidden' });
  await page.keyboard.press('p'); await waitForDrawer(page, 'home');
  const continued = await readSave(page);
  assert.equal(continued.cash, progressed.cash); assert.equal(continued.deliveries, progressed.deliveries);
  assert.equal(continued.garage.current.upgrades.engine, 3);
  assert.equal(continued.garage.current.damage.health, 55);
  assert.deepEqual(continued.garage.current.position, progressed.garage.current.position, 'Cancel keeps the active scene');
  assert.deepEqual(await menu(page), ['start', 'menu-settings', 'menu-credits'], 'pause menu stays unchanged');

  await seed(page, progressed);
  await page.evaluate(() => {
    window.testPad = { connected: true, mapping: 'standard', id: 'Xbox', axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.testPad];
  });
  await pressPad(page, 13); assert.equal(await selected(page), 'new-game');
  await pressPad(page, 0); await waitForDrawer(page, 'new-game');
  assert.equal(await selected(page), 'cancel-new-game');
  await pressPad(page, 1); await waitForDrawer(page, 'home');
  assert.deepEqual(await readSave(page), progressed, 'controller Back cancels');
  await pressPad(page, 0); await waitForDrawer(page, 'new-game');
  await pressPad(page, 13); assert.equal(await selected(page), 'confirm-new-game');
  await page.evaluate(() => { navigator.getGamepads = () => []; });
  await page.keyboard.press('Enter');
  assert.deepEqual(await readSave(page), initial, 'confirmation immediately persists exactly normal fresh initialization');
  await checkPreferences(page);
  await page.reload(); await waitForDrawer(page, 'home');
  assertFreshSave(await readSave(page), initial, 'the old save cannot return on immediate reload');
  assert.equal(await selected(page), 'start');
  await page.locator('#menu-settings').click(); await waitForDrawer(page, 'settings');
  assert.equal(await page.locator('#gore-option').isChecked(), true);
  assert.equal(await page.locator('#difficulty-option').inputValue(), '0');
  for (const [key, value] of Object.entries(audio)) {
    if (key === 'muted') assert.equal(await page.locator(`#${key}-option`).isChecked(), value);
    else assert.equal(await page.locator(`#${key}-option`).inputValue(), String(Math.round(value * 100)));
  }
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home');
  await seed(page, progressed);
  await page.locator('#new-game').click(); await waitForDrawer(page, 'new-game');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.locator('#overlay').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#player-cash').innerText(), `$${initial.cash}`);
  // Physical driving verifies that input, camera and renderer follow the replacement.
  await page.keyboard.down('w'); await page.waitForTimeout(450); await page.keyboard.up('w');
  await page.keyboard.press('p'); await waitForDrawer(page, 'home');
  const driven = await readSave(page);
  assert(Math.hypot(driven.garage.current.position.x - initial.garage.current.position.x, driven.garage.current.position.y - initial.garage.current.position.y) > 0.1);
  await page.locator('#start').click(); await page.locator('#overlay').waitFor({ state: 'hidden' });
  await page.context().close();

  for (const [name, width, height] of [['portrait', 390, 844], ['compact', 320, 568], ['landscape', 844, 390], ['compact-landscape', 568, 320]]) {
    const touch = await openGame(browser, html, { viewport: { width, height }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    await waitForDrawer(touch, 'home');
    await touch.locator('#new-game').tap(); assert.equal(await readSave(touch), null, 'first tap only selects fresh start');
    await touch.locator('#new-game').tap(); await touch.locator('#overlay').waitFor({ state: 'hidden' });
    await seed(touch, progressed);
    await tapToConfirm(touch, '#new-game'); await waitForDrawer(touch, 'new-game');
    assert.equal(await selected(touch), 'cancel-new-game');
    assert(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('#modal').scrollWidth <= document.querySelector('#modal').clientWidth), 'no horizontal overflow');
    await touch.screenshot({ path: `${output}/confirmation-${name}.png` });
    await touch.locator('#cancel-new-game').tap(); assert.deepEqual(await readSave(touch), progressed);
    await touch.locator('#cancel-new-game').tap(); await waitForDrawer(touch, 'home');
    await touch.screenshot({ path: `${output}/title-saved-${name}.png` });
    await tapToConfirm(touch, '#new-game'); await waitForDrawer(touch, 'new-game');
    await touch.locator('#confirm-new-game').tap();
    assert.deepEqual(await readSave(touch), progressed, 'first confirm tap does not replace the save');
    await touch.locator('#confirm-new-game').tap(); await touch.locator('#overlay').waitFor({ state: 'hidden' });
    await touch.reload(); await waitForDrawer(touch, 'home');
    assertFreshSave(await readSave(touch), initial, 'touch reload keeps fresh progress');
    await checkPreferences(touch);
    await tapToConfirm(touch, '#start'); await touch.locator('#overlay').waitFor({ state: 'hidden' });
    await touch.context().close();
  }
  console.log('New game offline QA passed: title variants, Continue, Cancel/Escape/controller Back, confirmation defaults, immediate persistence/reload, settings/audio, physical driving, keyboard/controller/touch, unchanged pause menu, desktop and compact touch layouts.');
} catch (error) { await captureFailure(); throw error; } finally { await closeBrowser(browser); }

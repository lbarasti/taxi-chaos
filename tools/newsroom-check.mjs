// Real HUD entry and shared pause widgets in isolated, offline standalone games.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { tapToConfirm, waitForDrawer } from './helpers/drawer.mjs';

const output = resolve(process.argv[2] ?? 'scenario-runs/newsroom');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [], requests = [];
try {
  for (const { name, width, height, touch } of [
    { name: 'desktop', width: 1440, height: 900, touch: false },
    { name: 'desktop-short', width: 1280, height: 400, touch: false },
    { name: 'portrait', width: 390, height: 844, touch: true },
    { name: 'compact', width: 320, height: 568, touch: true },
    { name: 'landscape', width: 844, height: 390, touch: true },
    { name: 'landscape-480', width: 480, height: 320, touch: true },
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    await context.setOffline(true);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
    await page.waitForFunction(() => !!window.__scenario);
    await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    const command = async command => {
      const result = await page.evaluate(command => window.__scenario.execute(command), command);
      assert.equal(result.status, 'passed', result.error);
      return result.state;
    };
    const state = () => page.evaluate(() => window.__scenario.render('world'));
    const open = async expected => {
      const icon = page.locator('#newsroom');
      if (touch) await icon.tap();
      else { await icon.focus(); await page.keyboard.press('Enter'); }
      await waitForDrawer(page, 'newsroom');
      assert.equal(await page.locator('#modal-title').textContent(), 'Newsroom.');
      assert.equal(await page.locator('#newsroom-summary').textContent(), expected);
      assert.equal(await page.locator('#overlay').getAttribute('hidden'), null);
      assert.equal(await page.locator('#modal.splash-modal .game-menu').count(), 1);
      assert.equal(await page.locator('#modal [data-submit], #modal [data-publish]').count(), 0);
      assert.equal(await page.locator('#newsroom').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'notebook-route');
    };
    const activate = async selector => {
      if (touch) await tapToConfirm(page, selector);
      else { await page.locator(selector).focus(); await page.keyboard.press('Space'); }
    };
    const close = async () => {
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#overlay').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'city');
    };
    const layout = async () => {
      const result = await page.evaluate(() => {
        const modal = document.querySelector('#modal');
        return { overflow: modal.scrollWidth > modal.clientWidth || document.documentElement.scrollWidth > innerWidth,
          width: modal.getBoundingClientRect().width,
          buttons: [...modal.querySelectorAll('button')].map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })) };
      });
      assert.equal(result.overflow, false, `${name}: no horizontal overflow`);
      assert(result.width <= 540, `${name}: keep the single-column pause drawer`);
      assert(result.buttons.every(b => b.width >= 44 && b.height >= 44), `${name}: shared actions stay touch-sized`);
      for (const id of ['notebook-route', 'newsroom-notebook', 'start']) {
        await page.locator(`#${id}`).scrollIntoViewIfNeeded();
        const b = await page.locator(`#${id}`).boundingBox();
        assert(b.x >= -1 && b.y >= -1 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1, `${name}: ${id} remains reachable: ${JSON.stringify(b)}`);
      }
      await page.locator('#modal').evaluate(modal => { modal.scrollTop = 0; });
    };

    const original = await state();
    await open('0 sources to submit · 0 sources being checked · No stories ready for the editor');
    // Opening or rejecting a stale HUD click must not set a route or collect anything.
    await page.locator('#newsroom').dispatchEvent('click');
    await layout();
    await close();
    const after = await state();
    assert.deepEqual(after.campaign, original.campaign);
    assert.deepEqual(after.job, original.job);
    assert.deepEqual(after.notebookIds, original.notebookIds);
    assert.equal(after.navigation, original.navigation);
    // Route selection is now explicit, inside the panel; reading it never toggles guidance.
    await open('0 sources to submit · 0 sources being checked · No stories ready for the editor');
    await activate('#notebook-route');
    assert.equal((await state()).navigation, 'newsroom');
    await open('0 sources to submit · 0 sources being checked · No stories ready for the editor');
    assert.equal(await page.locator('#notebook-route').textContent(), 'Cancel newsroom route');
    await close();
    assert.equal((await state()).navigation, 'newsroom');
    await open('0 sources to submit · 0 sources being checked · No stories ready for the editor');
    await activate('#notebook-route');
    assert.equal((await state()).navigation, 'fare');

    // Existing deterministic fixture commands gather three genuine authored sources.
    await command({ op: 'route', mission: 'celia-barriers' });
    await command({ op: 'pickup' }); await command({ op: 'deliver' });
    await command({ op: 'advance', to: { day: 3 } });
    await command({ op: 'place', at: 'garden-cafe' });
    await page.locator('#observe').click();
    await command({ op: 'route', mission: 'nico-safe-ride' });
    await command({ op: 'pickup' }); await command({ op: 'deliver' });
    await command({ op: 'place', at: 'newsroom' });
    await command({ op: 'submit', material: 'cleaner-note' });
    const summary = '2 sources to submit · 1 source being checked · No stories ready for the editor';
    await open(summary);
    await layout();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(output, `${name}-summary.png`) });
    if (name === 'portrait' || name === 'landscape') {
      const cdp = await context.newCDPSession(page);
      const insets = { top: 32, left: 54, bottom: 34, right: 44 };
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
      const padding = await page.locator('#modal').evaluate(element => {
        const style = getComputedStyle(element);
        return { top: parseFloat(style.paddingTop), left: parseFloat(style.paddingLeft), bottom: parseFloat(style.paddingBottom), right: parseFloat(style.paddingRight) };
      });
      for (const edge of Object.keys(insets)) assert(padding[edge] >= insets[edge], `${name}: drawer respects the ${edge} safe area`);
      await layout();
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, bottom: 0, right: 0 } });
      await cdp.detach();
    }
    // Notebook and its guide retain the HUD entry as their back destination.
    await activate('#newsroom-notebook'); await waitForDrawer(page, 'notebook');
    assert.equal(await page.locator('[data-record="cafe-photo"]').count(), 1);
    assert.match(await page.locator('#notebook-back').textContent(), /Back to newsroom/);
    await activate('#menu-notebook-guide'); await waitForDrawer(page, 'notebook-guide');
    await page.keyboard.press('Escape'); await waitForDrawer(page, 'notebook');
    await page.keyboard.press('Escape'); await waitForDrawer(page, 'newsroom');
    // Tab/shift-tab and directional selection all stay in the shared drawer.
    await page.locator('#notebook-route').focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'start');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'notebook-route');
    await activate('#start');
    assert.equal(await page.locator('#overlay').isVisible(), false);

    // Source checks alone are not enough; only the complete route makes a story ready.
    await command({ op: 'advance', minutes: 180 });
    await open('2 sources to submit · 0 sources being checked · No stories ready for the editor');
    await close();
    await command({ op: 'submit', material: 'barrier-receipt' });
    await command({ op: 'submit', material: 'cafe-photo' });
    await command({ op: 'advance', minutes: 180 });
    await open('0 sources to submit · 0 sources being checked · 1 story ready for the editor');
    await page.screenshot({ path: resolve(output, `${name}-ready.png`) });
    await close();
    await command({ op: 'reload' });
    await open('0 sources to submit · 0 sources being checked · 1 story ready for the editor');
    await close();
    // The same HUD entry follows a walking player; no physical-visit shortcut is added.
    await page.locator('#city').focus(); await page.keyboard.press('KeyE');
    assert.equal((await state()).onFoot, true);
    await open('0 sources to submit · 0 sources being checked · 1 story ready for the editor');
    await close();
    // A regular pause still goes to the original home and notebook back target.
    await page.keyboard.press('KeyP');
    await activate('#open-notebook'); await waitForDrawer(page, 'notebook');
    assert.equal(await page.locator('#notebook-back').textContent(), 'Back to pause menu');
    await command({ op: 'mode', mode: 'playing' });
    assert.equal(await page.evaluate(() => localStorage.getItem('taxi-chaos-v1')), null);
    await context.close();
    console.log(`${name}: HUD entry, summary, shared widgets, routing, retention and layout passed`);
  }
  // Exercise real RAF pause/resume and controller navigation outside the fixed-clock
  // scenario harness. Both the normal game and lab still have persistence disabled.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.setOffline(true);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`realtime: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`realtime: ${message.text()}`); });
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?debug=1&dialogue-preview=1`);
    await page.waitForFunction(() => !!window.__taxi);
    await page.evaluate(() => { window.__taxi.toggle(false); window.__taxi.realtime(); });
    await page.locator('#newsroom').click(); await waitForDrawer(page, 'newsroom');
    const frozen = await page.evaluate(() => window.__taxi.state());
    assert.equal(frozen.mode, 'paused');
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => window.__taxi.state()), frozen, 'newsroom freezes physics, campaign and fare clocks');
    await page.evaluate(() => {
      window.testPad = { connected: true, mapping: 'standard', id: 'DualSense', axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      navigator.getGamepads = () => [window.testPad];
      window.testPad.buttons[13].pressed = true;
    });
    await page.waitForFunction(() => document.activeElement.id === 'newsroom-notebook');
    assert.match(await page.locator('#menu-hint').textContent(), /D-pad Select · × Confirm/);
    await page.evaluate(() => { window.testPad.buttons[13].pressed = false; });
    await page.waitForTimeout(50);
    await page.evaluate(() => { window.testPad.buttons[0].pressed = true; });
    await waitForDrawer(page, 'notebook');
    await page.evaluate(() => { window.testPad.buttons[0].pressed = false; window.testPad.buttons[1].pressed = true; });
    await waitForDrawer(page, 'newsroom');
    await page.evaluate(() => { window.testPad.buttons[1].pressed = false; });
    await page.waitForTimeout(50);
    await page.evaluate(() => { window.testPad.buttons[1].pressed = true; });
    await page.locator('#overlay').waitFor({ state: 'hidden' });
    await page.evaluate(() => { navigator.getGamepads = () => []; });
    await page.waitForTimeout(150);
    const resumed = await page.evaluate(() => window.__taxi.state());
    assert.equal(resumed.mode, 'playing');
    assert(resumed.time > frozen.time, 'closing the drawer restores realtime');
    assert.equal(resumed.playerId, frozen.playerId);
    assert.equal(resumed.job.customerId, frozen.job.customerId);
    assert.equal(await page.evaluate(() => localStorage.getItem('taxi-chaos-v1')), null);
    await context.close();
    console.log('Realtime: pause/freeze, controller selection/confirm/back and clock restoration passed');
  }
  assert.deepEqual(errors, [], 'Browser errors');
  assert.deepEqual(requests, [], 'External runtime requests');
  console.log(`Offline newsroom checks passed; screenshots: ${output}`);
} finally { await browser.close(); }

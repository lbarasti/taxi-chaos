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
const watch = (page, name) => {
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
};
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
    const page = await context.newPage(); watch(page, name);
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
    await page.waitForFunction(() => !!window.__scenario);
    await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    const command = async command => {
      const result = await page.evaluate(command => window.__scenario.execute(command), command);
      assert.equal(result.status, 'passed', result.error);
      return result.state;
    };
    const state = () => page.evaluate(() => window.__scenario.render('world'));
    const activate = async selector => {
      if (touch) await tapToConfirm(page, selector);
      else { await page.locator(selector).focus(); await page.keyboard.press('Space'); }
    };
    const open = async expected => {
      if (touch) await page.locator('#newsroom').tap();
      else { await page.locator('#newsroom').focus(); await page.keyboard.press('Enter'); }
      await waitForDrawer(page, 'newsroom');
      assert.equal(await page.locator('#modal-title').textContent(), 'Newsroom.');
      assert.equal(await page.locator('#newsroom-summary').textContent(), expected);
      assert.equal(await page.locator('#modal.splash-modal .game-menu').count(), 1);
      assert.equal(await page.locator('#newsroom').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'notebook-route');
      assert.equal(await page.locator('#modal [data-record], #modal [data-story]').count(), 0, 'no section opened automatically');
      assert.equal(await page.locator('#newsroom-notebook').count(), 0);
      assert.doesNotMatch(await page.locator('#modal').textContent(), /Other notes|Dispatch notebook/);
    };
    const select = async id => {
      await activate(`#newsroom-open-${id}`);
      assert.equal(await page.locator(`#newsroom-open-${id}`).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-newsroom-section][aria-pressed="true"]').count(), 1);
      if (width < 1000) assert.equal(await page.evaluate(() => document.activeElement.id), 'newsroom-detail');
    };
    const records = () => page.locator('#newsroom-detail [data-record]').evaluateAll(articles => articles.map(article => article.dataset.record));
    const close = async () => {
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#overlay').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'city');
    };
    const shot = async suffix => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: resolve(output, `${name}-${suffix}.png`) });
    };
    const layout = async () => {
      const result = await page.evaluate(() => {
        const modal = document.querySelector('#modal');
        const menu = modal.querySelector('.newsroom-menu-panel').getBoundingClientRect();
        const detail = modal.querySelector('#newsroom-detail').getBoundingClientRect();
        return { overflow: modal.scrollWidth > modal.clientWidth || document.documentElement.scrollWidth > innerWidth,
          columns: getComputedStyle(modal.querySelector('.newsroom-columns')).gridTemplateColumns.split(' ').length,
          sideBySide: detail.left >= menu.right, stacked: detail.top >= menu.bottom,
          width: modal.getBoundingClientRect().width,
          buttons: [...modal.querySelectorAll('button')].filter(button => button.getClientRects().length).map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })) };
      });
      assert.equal(result.overflow, false, `${name}: no horizontal overflow`);
      assert.equal(result.columns, width >= 1000 ? 2 : 1);
      assert(width >= 1000 ? result.sideBySide : result.stacked, `${name}: menu/detail placement`);
      assert(result.width <= (width >= 1000 ? 1080 : 540));
      assert(result.buttons.every(b => b.width >= 44 && b.height >= 44), `${name}: shared actions stay touch-sized`);
      for (const id of ['notebook-route', 'newsroom-open-to-submit', 'newsroom-open-checking', 'newsroom-open-checked', 'newsroom-open-stories', 'start']) {
        await page.locator(`#${id}`).scrollIntoViewIfNeeded();
        const b = await page.locator(`#${id}`).boundingBox();
        assert(b.x >= -1 && b.y >= -1 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1, `${name}: ${id} remains reachable`);
      }
      await page.locator('#modal').evaluate(modal => { modal.scrollTop = 0; });
    };

    const original = await state();
    const empty = '0 sources to submit · 0 sources being checked · No stories ready for the editor';
    await open(empty);
    await page.locator('#newsroom').dispatchEvent('click');
    await layout();
    // Merely selecting/focusing a row must not populate its detail panel.
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'newsroom-open-to-submit');
    assert.match(await page.locator('#newsroom-detail').textContent(), /Choose a section/);
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#newsroom-detail').textContent(), /No collected sources awaiting submission/);
    await close();
    const after = await state();
    assert.deepEqual(after.campaign, original.campaign); assert.deepEqual(after.job, original.job);
    assert.deepEqual(after.notebookIds, original.notebookIds); assert.equal(after.navigation, original.navigation);
    // Reading never changes guidance. Routing remains an explicit physical-world action.
    await open(empty); await activate('#notebook-route');
    assert.equal((await state()).navigation, 'newsroom');
    await open(empty); assert.equal(await page.locator('#notebook-route').textContent(), 'Cancel newsroom route');
    await activate('#notebook-route'); assert.equal((await state()).navigation, 'fare');

    await command({ op: 'ordinary' });
    await command({ op: 'pickup' }); await command({ op: 'read' }); await command({ op: 'deliver' });
    await command({ op: 'route', mission: 'celia-barriers' });
    await command({ op: 'pickup' }); await command({ op: 'deliver' });
    await command({ op: 'advance', to: { day: 3 } });
    await command({ op: 'place', at: 'garden-cafe' }); await page.locator('#observe').click();
    await command({ op: 'route', mission: 'nico-safe-ride' });
    await command({ op: 'pickup' }); await command({ op: 'deliver' });
    await open('3 sources to submit · 0 sources being checked · No stories ready for the editor');
    await select('to-submit');
    assert.equal(await page.locator('[data-submit]:not(:disabled)').count(), 0, 'sources still require a physical newsroom visit');
    await close();
    await command({ op: 'place', at: 'newsroom' }); await command({ op: 'submit', material: 'cleaner-note' });
    const retained = (await state()).notebookIds;
    const summary = '2 sources to submit · 1 source being checked · No stories ready for the editor';
    await open(summary); await select('to-submit');
    assert.deepEqual(await records(), ['cafe-photo', 'barrier-receipt']);
    await layout(); await shot('summary');
    await select('checking');
    assert.deepEqual(await records(), ['cleaner-note']);
    assert.match(await page.locator('[data-record="cleaner-note"]').textContent(), /source check due Day 3 · 10:/);
    await shot('checking');
    await select('checked'); assert.deepEqual(await records(), []);
    await select('stories'); assert.equal(await page.locator('[data-story]').count(), 0);
    assert.equal(await page.locator('[data-record="contractor-register"]').count(), 0);
    if (touch) {
      await activate('#newsroom-menu');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'newsroom-open-stories');
    }
    if (name === 'portrait' || name === 'landscape') {
      const cdp = await context.newCDPSession(page), insets = { top: 32, left: 54, bottom: 34, right: 44 };
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
      const padding = await page.locator('#modal').evaluate(element => {
        const style = getComputedStyle(element);
        return { top: parseFloat(style.paddingTop), left: parseFloat(style.paddingLeft), bottom: parseFloat(style.paddingBottom), right: parseFloat(style.paddingRight) };
      });
      for (const edge of Object.keys(insets)) assert(padding[edge] >= insets[edge]);
      await layout(); await select('to-submit'); await layout();
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, bottom: 0, right: 0 } }); await cdp.detach();
    }
    await page.locator('#notebook-route').focus(); await page.keyboard.press('Shift+Tab');
    const last = width >= 1000 ? (await records()).length ? 'submit-barrier-receipt' : 'start' : 'newsroom-menu';
    assert.equal(await page.evaluate(() => document.activeElement.id), last);
    await page.keyboard.press('ArrowDown'); assert.equal(await page.evaluate(() => document.activeElement.id), 'notebook-route');
    await activate('#start');

    await command({ op: 'advance', minutes: 180 });
    await open('2 sources to submit · 0 sources being checked · No stories ready for the editor');
    await select('checked'); assert.deepEqual(await records(), ['cleaner-note']);
    await select('stories'); assert.equal(await page.locator('[data-story]').count(), 0, 'a checked source is not a story');
    await select('to-submit'); await activate('#submit-barrier-receipt');
    assert.deepEqual(await records(), ['cafe-photo']);
    await activate('#submit-cafe-photo'); assert.deepEqual(await records(), []);
    await select('checking'); assert.deepEqual(await records(), ['cafe-photo', 'barrier-receipt']);
    await close(); assert.deepEqual((await state()).notebookIds, retained, 'all originals and general notes retained');
    await command({ op: 'advance', minutes: 180 });
    const ready = '0 sources to submit · 0 sources being checked · 1 story ready for the editor';
    await open(ready); await select('checked'); assert.equal((await records()).length, 3); await shot('checked');
    await select('stories'); assert.match(await page.locator('[data-story="coordination"]').textContent(), /Ready for editorial review/);
    await shot('ready'); await close();
    await command({ op: 'reload' });
    await open(ready); await select('checked'); assert.equal((await records()).length, 3);
    await select('stories'); await activate('#publish-coordination');
    assert.match(await page.locator('[data-story="coordination"]').textContent(), /Editor accepted · Day 4 · 06:00 edition/);
    assert.equal(await page.locator('[data-publish]').count(), 0);
    await shot('scheduled'); await close();
    await command({ op: 'advance', to: { day: 4, hour: 6 } });
    await open(empty); await select('stories');
    assert.match(await page.locator('[data-story="coordination"]').textContent(), /Published · Day 4 · 06:00 edition/);
    await shot('published'); await close();
    await page.locator('#city').focus(); await page.keyboard.press('KeyE'); assert.equal((await state()).onFoot, true);
    await open(empty); await select('checked'); assert.equal((await records()).length, 3); await close();
    // The notebook remains available from the ordinary pause menu, not the newsroom.
    await page.keyboard.press('KeyP'); await activate('#open-notebook'); await waitForDrawer(page, 'notebook');
    assert.equal(await page.locator('#notebook-back').textContent(), 'Back to pause menu');
    assert.equal(await page.locator('[data-record="cafe-photo"]').count(), 1);
    await command({ op: 'mode', mode: 'playing' });
    assert.equal(await page.evaluate(() => localStorage.getItem('taxi-chaos-v1')), null);
    await context.close();
    console.log(`${name}: activation-only menu/detail, source lifecycle, stories, retention, routing and layout passed`);
  }
  // Real RAF pause/resume and controller activation outside the fixed-clock harness.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.setOffline(true);
    const page = await context.newPage(); watch(page, 'realtime');
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?debug=1&dialogue-preview=1`);
    await page.waitForFunction(() => !!window.__taxi);
    await page.evaluate(() => { window.__taxi.toggle(false); window.__taxi.realtime(); });
    await page.locator('#newsroom').click(); await waitForDrawer(page, 'newsroom');
    const frozen = await page.evaluate(() => window.__taxi.state()); assert.equal(frozen.mode, 'paused');
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => window.__taxi.state()), frozen);
    await page.evaluate(() => {
      window.testPad = { connected: true, mapping: 'standard', id: 'DualSense', axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      navigator.getGamepads = () => [window.testPad]; window.testPad.buttons[13].pressed = true;
    });
    await page.waitForFunction(() => document.activeElement.id === 'newsroom-open-to-submit');
    assert.match(await page.locator('#menu-hint').textContent(), /D-pad Select · × Confirm/);
    assert.match(await page.locator('#newsroom-detail').textContent(), /Choose a section/);
    await page.evaluate(() => { window.testPad.buttons[13].pressed = false; }); await page.waitForTimeout(50);
    await page.evaluate(() => { window.testPad.buttons[0].pressed = true; });
    await page.waitForFunction(() => document.querySelector('#newsroom-open-to-submit').getAttribute('aria-pressed') === 'true');
    assert.match(await page.locator('#newsroom-detail').textContent(), /No collected sources awaiting submission/);
    await page.evaluate(() => { window.testPad.buttons[0].pressed = false; window.testPad.buttons[1].pressed = true; });
    await page.locator('#overlay').waitFor({ state: 'hidden' });
    await page.evaluate(() => { navigator.getGamepads = () => []; }); await page.waitForTimeout(150);
    const resumed = await page.evaluate(() => window.__taxi.state());
    assert.equal(resumed.mode, 'playing'); assert(resumed.time > frozen.time);
    assert.equal(resumed.playerId, frozen.playerId); assert.equal(resumed.job.customerId, frozen.job.customerId);
    assert.equal(await page.evaluate(() => localStorage.getItem('taxi-chaos-v1')), null);
    await context.close();
    console.log('Realtime: frozen physics/clocks, controller select/confirm and realtime restoration passed');
  }
  assert.deepEqual(errors, [], 'Browser errors'); assert.deepEqual(requests, [], 'External runtime requests');
  console.log(`Offline newsroom checks passed; screenshots: ${output}`);
} finally { await browser.close(); }

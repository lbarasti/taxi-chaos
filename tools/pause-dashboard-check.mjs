// Exercise the real pause flow in disposable, offline production contexts.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const output = resolve(process.argv[2] ?? 'scenario-runs/pause-dashboard');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--disable-gpu', '--use-gl=disabled'] });
const errors = [], requests = [];
try {
  for (const [name, width, height, touch] of [['desktop', 1440, 900, false], ['portrait', 390, 844, true], ['compact', 320, 568, true], ['landscape', 844, 390, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, offline: true });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
    const command = async command => {
      const result = await page.evaluate(c => window.__scenario.execute(c), command);
      assert.equal(result.status, 'passed', result.error); return result.state;
    };
    const state = () => page.evaluate(() => window.__scenario.render('world'));
    const start = () => page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    await start();
    // Physically accelerate, then pause the moving vehicle. No placement cheats.
    const moving = await command({ op: 'step', seconds: 0.7, keys: ['KeyW'] });
    assert(moving.speed > 0);
    if (touch) await page.locator('#pause-toggle').tap();
    else { await page.locator('#city').focus(); await page.keyboard.press('KeyP'); }
    assert.equal(await page.locator('.pause-dashboard').isVisible(), true);
    const frozen = await state();
    assert.equal(frozen.mode, 'paused');
    const after = await command({ op: 'step', seconds: 1, keys: ['KeyW', 'ShiftLeft'] });
    for (const key of ['time', 'position', 'speed', 'job', 'dayNight', 'boost']) assert.deepEqual(after[key], frozen[key], `${name}: ${key} must freeze`);
    assert.equal(await page.locator('#map').count(), 1);
    assert.equal(await page.locator('#pause-map-slot #map').count(), 1);
    assert.equal(await page.locator('.pause-dashboard .audio-settings').count(), 0);
    assert.equal(await page.locator(touch ? '.pause-touch' : '.pause-keyboard').isVisible(), true);
    const layout = await page.locator('.pause-dashboard').evaluate(el => {
      const b = el.getBoundingClientRect();
      const children = [...el.querySelectorAll('button, h3, dl, footer, .navigation-chart')].filter(c => c.getClientRects().length).filter(c => {
        const r = c.getBoundingClientRect(); return r.left < b.left || r.right > b.right;
      }).map(c => c.id || c.className);
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, overflow: el.scrollWidth > el.clientWidth, children };
    });
    assert(layout.left >= 0 && layout.right <= width && layout.top >= 0 && layout.bottom <= height, JSON.stringify(layout));
    assert.equal(layout.overflow, false, `${name}: horizontal overflow`);
    assert.deepEqual(layout.children, [], `${name}: overflowing elements`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(output, `${name}.png`) });
    await page.screenshot({ path: resolve(output, `${name}.jpg`), type: 'jpeg', quality: 80 });
    if (touch) { await page.locator('#pause-controls-title').scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(output, `${name}-reference.png`) }); }
    await page.locator('#show-settings').click();
    assert.equal(await page.locator('.audio-settings').isVisible(), true);
    await page.locator('[data-audio="volume"]').focus();
    await page.keyboard.press('Escape');
    assert.equal((await state()).mode, 'playing', 'Escape resumes even with a setting focused');
    assert.equal(await page.locator('#pause-map-slot').count(), 0);
    assert.equal(await page.locator('.navigation-hud #map').count(), 1);
    await page.keyboard.press('Escape');
    await page.locator('#ordinary-fare').click();
    const original = (await state()).job;
    assert.equal(await page.locator('.pause-confirmation').isVisible(), true);
    assert.equal(await page.locator('#cancel-action').evaluate(el => el === document.activeElement), true);
    await page.locator('#cancel-action').click();
    assert.deepEqual((await state()).job, original, 'Cancel must preserve the booking');
    await page.locator('#ordinary-fare').click(); await page.keyboard.press('KeyP');
    assert.equal((await state()).mode, 'playing');
    assert.deepEqual((await state()).job, original, 'Pause-key dismissal must not confirm replacement');
    await page.keyboard.press('KeyP');
    const pausedJob = (await state()).job;
    await page.locator('#show-messages').click();
    assert.equal(await page.locator('.pause-inbox').isVisible(), true);
    const route = page.locator('#mission-inbox article button:not(:disabled)').first();
    if (await route.count()) {
      await route.click();
      assert.equal((await state()).mode, 'paused', 'Routing messages keeps the world paused');
      assert.equal(await page.locator('#mission-inbox').isVisible(), false);
    } else { await page.locator('#texts-close').click(); assert.deepEqual((await state()).job, pausedJob); }
    await page.locator('#show-messages').click(); await page.keyboard.press('Escape');
    assert.equal((await state()).mode, 'playing', 'Escape from paused messages resumes');
    // The existing background safety mechanism must reach the new dashboard.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await state()).mode, 'paused');
    await page.locator('#resume').click();
    await start();
    await command({ op: 'place', at: 'pickup' }); await command({ op: 'pickup' });
    await page.keyboard.press('Escape');
    const ride = (await state()).job;
    assert.equal(ride.stage, 'dropoff');
    assert.match(await page.locator('.pause-job-data').textContent(), /FAST TIP WINDOW/);
    await page.locator('#abandon-ride').click(); await page.locator('#cancel-action').click();
    assert.deepEqual((await state()).job, ride);
    await page.locator('#abandon-ride').click(); await page.locator('#confirm-action').click();
    assert.equal((await state()).job.stage, 'pickup');
    assert.equal((await state()).mode, 'paused');
    await page.screenshot({ path: resolve(output, `${name}-after-abandon.png`) });
    await start(); await page.keyboard.press('Escape');
    const beforeSleep = (await state()).campaign.minute;
    await page.locator('#sleep').click(); await page.locator('#cancel-action').click();
    assert.equal((await state()).campaign.minute, beforeSleep, 'Cancel sleep must preserve campaign time');
    await page.locator('#sleep').click(); await page.locator('#confirm-action').click();
    assert((await state()).campaign.minute > beforeSleep);
    assert.equal((await state()).mode, 'playing');
    if (name === 'desktop') {
      // Exercise actual RAFs, camera freeze and the actor-specific controls in
      // a separate, persistence-disabled laboratory page.
      const live = await context.newPage();
      live.on('pageerror', e => errors.push(e.message));
      await live.goto(`${pathToFileURL(resolve('dist/index.html'))}?dialogue-preview=1&debug=1`);
      await live.evaluate(() => { window.__taxi.scenario('first-fare'); document.querySelector('#debug-panel').hidden = true; window.__taxi.realtime(); });
      await live.evaluate(() => document.fonts.ready);
      await live.locator('#city').focus(); await live.keyboard.down('KeyW'); await live.waitForTimeout(200); await live.keyboard.up('KeyW');
      await live.keyboard.press('KeyP');
      const liveFrozen = await live.evaluate(() => ({ state: window.__taxi.state(), image: document.querySelector('#city').toDataURL() }));
      await live.waitForTimeout(200);
      const liveAfter = await live.evaluate(() => ({ state: window.__taxi.state(), image: document.querySelector('#city').toDataURL() }));
      assert.equal(liveAfter.state.time, liveFrozen.state.time); assert.deepEqual(liveAfter.state.position, liveFrozen.state.position);
      assert.equal(liveAfter.image, liveFrozen.image, 'The paused viewport must not drift or animate');
      await live.keyboard.press('KeyP');
      await live.evaluate(() => window.__taxi.scenario('first-fare'));
      await live.keyboard.press('KeyE'); await live.evaluate(() => window.__taxi.step(1));
      assert.equal(await live.evaluate(() => window.__taxi.state().onFoot), true);
      await live.keyboard.press('KeyP');
      assert.equal(await live.locator('#pause-controls-title').textContent(), 'On foot.');
      assert.equal(await live.locator('.pause-keyboard').getByText('Boost', { exact: true }).count(), 0);
      await live.screenshot({ path: resolve(output, 'desktop-on-foot.jpg'), type: 'jpeg', quality: 80 });
      await live.keyboard.press('KeyP');
      await live.evaluate(() => window.__taxi.scenario('coastal-bike'));
      await live.keyboard.press('KeyP');
      assert.equal(await live.locator('#pause-controls-title').textContent(), 'On the bike.');
      assert.match(await live.locator('.pause-keyboard').textContent(), /Rear brake/);
      await live.screenshot({ path: resolve(output, 'desktop-motorbike.jpg'), type: 'jpeg', quality: 80 });
      await live.close();
    }
    await context.close();
    console.log(`${name}: pause, frozen clocks, settings, safe confirmations and messages passed`);
  }
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  console.log('Offline pause dashboard checks passed without console errors or external requests');
} finally { await browser.close(); }

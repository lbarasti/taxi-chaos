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
  for (const [name, width, height, touch] of [['desktop', 1440, 900, false], ['portrait', 390, 844, true], ['compact', 320, 568, true], ['landscape', 844, 390, true]]) {
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
    if (name === 'desktop') {
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
      assert.equal(await page.locator('#job-status').textContent(), 'ON BOARD');
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
    const check = async () => {
      const layout = await page.locator('.navigation-hud').evaluate(el => {
        const bounds = el.getBoundingClientRect();
        const overflow = [...el.querySelectorAll('h1, button')].filter(child => {
          if (!child.getClientRects().length) return false;
          const b = child.getBoundingClientRect();
          return b.left < bounds.left - 1 || b.right > bounds.right + 1;
        }).map(child => child.id || child.className);
        const chart = el.querySelector('.navigation-chart').getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom, chartBottom: chart.bottom, horizontalOverflow: el.scrollWidth > el.clientWidth, overflow };
      });
      assert(layout.x >= 0 && layout.y >= 0 && layout.right <= width && layout.bottom <= height, JSON.stringify(layout));
      assert.equal(layout.horizontalOverflow, false, `${name}: horizontal overflow`);
      assert.deepEqual(layout.overflow, [], `${name}: overflowing children`);
      assert(Math.abs(layout.bottom - layout.chartBottom) <= 1, `${name}: widget must end at the map`);
      assert.equal(await page.locator('.navigation-footer, .navigation-instruction, .navigation-services, #job-progress, #speed, #boost-meter, #map-status, #map-toggle').count(), 0);
      assert.equal(await page.locator('#map').isVisible(), true);
      const nav = await page.locator('.navigation-hud').boundingBox();
      const personal = await page.locator('.player-hud').boundingBox();
      assert(personal.x >= nav.x + nav.width, `${name}: personal status must stay distinct on the right`);
      assert.equal(await page.locator('.navigation-hud .player-hud').count(), 0);
      const smallTargets = await page.locator('.navigation-hud button:visible').evaluateAll(buttons => buttons.filter(button => {
        const b = button.getBoundingClientRect(); return b.width < 43.9 || b.height < 43.9;
      }).map(button => button.id));
      assert.deepEqual(smallTargets, [], `${name}: touch targets must be at least 44px`);
      assert.equal(await page.locator('#player-time').count(), 1);
      assert.equal(await page.locator('#map').count(), 1);
    };
    const shot = async state => {
      await page.locator('#city').focus();
      await page.evaluate(() => document.fonts.ready);
      await check();
      await page.screenshot({ path: resolve(output, `${name}-${state}.png`) });
    };
    assert.equal(await page.locator('#job-status').textContent(), 'ENGAGED');
    await shot('engaged');
    await page.locator('#job-status').click(); await render();
    assert.equal(await page.locator('#job-status').textContent(), 'VACANT');
    assert.equal(await page.locator('#navigation-contacts').isVisible(), true);
    await shot('vacant');
    await page.locator('#texts').click();
    assert.equal(await page.locator('#mission-inbox').isVisible(), true);
    await page.locator('#texts-close').click();
    await page.locator('#city').focus(); await page.keyboard.press('KeyP');
    await page.locator('#open-notebook').click();
    assert.equal(await page.locator('#modal.notebook-modal').isVisible(), true);
    await command({ op: 'mode', mode: 'playing' });
    await page.locator('#newsroom').click(); await render();
    assert.match(await page.locator('#mission-title').textContent(), /Newsroom/);
    await page.locator('#city').focus(); await page.keyboard.press('KeyG'); await render();
    assert.equal(await page.locator('.garage-modal').isVisible(), true);
    await command({ op: 'mode', mode: 'playing' });
    await page.locator('#city').focus(); await page.keyboard.press('KeyH'); await render();
    assert.equal(await page.locator('#mission-title').textContent(), 'Northstar Harbour.');
    // Cancel the detour via H, then use the vacant/dispatch affordance.
    await page.keyboard.press('KeyH'); await render();
    if (await page.locator('#job-status').textContent() !== 'VACANT') { await page.locator('#job-status').click(); await render(); }
    await page.locator('#dispatch').click(); await render();
    assert.equal(await page.locator('#job-status').textContent(), 'ENGAGED');
    await check();
    // Fixture capture only; physical integration driving is checked separately.
    await command({ op: 'pickup' });
    assert.equal(await page.locator('#job-status').textContent(), 'ON BOARD');
    await shot('on-board');
    const driving = await command({ op: 'step', seconds: 1, keys: ['KeyW', 'ShiftLeft'] });
    assert(driving.speed > 0);
    await command({ op: 'deliver' });
    assert.equal(await page.locator('#job-status').textContent(), 'VACANT');
    assert.equal(await page.locator('#navigation-contacts').isVisible(), true);
    await page.locator('#city').focus(); await page.keyboard.press('KeyE'); await render();
    assert.equal(await page.locator('#job-status').textContent(), 'ON FOOT');
    await check();
    await context.close();
    console.log(`${name}: state transitions, shortcuts, always-visible minimap and layout passed`);
  }
  assert.deepEqual(errors, [], 'Browser errors');
  assert.deepEqual(requests, [], 'External runtime requests');
  console.log(`Offline production checks passed; screenshots: ${output}`);
} finally { await browser.close(); }

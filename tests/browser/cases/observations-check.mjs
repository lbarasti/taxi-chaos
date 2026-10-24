// Real quick-action activation against the standalone HTML, offline and without saves.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openGame, launchBrowser, newContext, closeBrowser, captureFailure } from '../runtime.mjs';
import { waitForDrawer, tapToConfirm } from '../helpers/drawer.mjs';

const output = resolve(process.env.SCREENSHOT_DIR ?? process.argv[2] ?? 'scenario-runs/observations');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
try {
  for (const { name, width, height, touch } of [
    { name: 'desktop', width: 1440, height: 900, touch: false },
    { name: 'desktop-short', width: 1280, height: 400, touch: false },
    { name: 'desktop-narrow', width: 1024, height: 768, touch: false },
    { name: 'portrait', width: 390, height: 844, touch: true },
    { name: 'compact', width: 320, height: 568, touch: true },
    { name: 'landscape', width: 844, height: 390, touch: true },
    { name: 'landscape-480', width: 480, height: 320, touch: true },
    { name: 'landscape-500', width: 500, height: 400, touch: true },
  ]) {
    const context = await newContext(browser, { viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await openGame(page, `${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
    await page.waitForFunction(() => !!window.__scenario);
    const command = async command => {
      const result = await page.evaluate(command => window.__scenario.execute(command), command);
      assert.equal(result.status, 'passed', result.error);
      return result.state;
    };
    const render = () => page.evaluate(() => window.__scenario.render('world'));
    const camera = page.locator('#observe');
    await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    assert.equal(await camera.isVisible(), false, 'no camera before discovering an eligible nearby scene');
    await command({ op: 'place', at: 'garden-cafe' });
    assert.equal(await camera.isVisible(), false, 'the unboarded cafe cannot be recorded');
    await command({ op: 'advance', to: { day: 3 } });
    assert.equal(await camera.isVisible(), true);
    assert.equal(await camera.isEnabled(), true);
    assert.equal((await render()).notebookIds.includes('cafe-photo'), false, 'showing the action must not collect');

    // Fresh fixture: physically approach from beyond the authored radius. No mid-drive
    // placement, pickups, teleports, upgrades or direct observation commands.
    await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    await command({ op: 'advance', to: { day: 3 } });
    await command({ op: 'place', at: { x: 84, y: 80 }, angle: -Math.PI / 2 });
    assert.equal(await camera.isVisible(), false);
    let state = await render(), sawSpeedGate = false;
    for (let i = 0; i < 200; i++) {
      const distance = Math.hypot(state.position.x - 84, state.position.y - 58);
      if (distance < 14 && state.speed < 0.5) break;
      state = await command({ op: 'step', seconds: 0.05, keys: distance > 14 ? ['KeyW'] : state.speed > 0.5 ? ['KeyS'] : [] });
      if (await camera.isVisible() && state.speed > 2.8) {
        sawSpeedGate = true;
        assert.equal(await camera.isDisabled(), true);
        assert.match(await camera.getAttribute('aria-label'), /Slow down/);
        // A programmatic stale click still goes through the authoritative gates.
        await camera.dispatchEvent('click');
        assert.equal((await render()).notebookIds.includes('cafe-photo'), false);
      }
    }
    assert(sawSpeedGate, `${name}: physical approach must exercise the speed gate`);
    assert(state.speed < 0.5 && Math.hypot(state.position.x - 84, state.position.y - 58) < 16, `${name}: taxi must physically stop near the cafe`);
    assert.equal(await camera.isEnabled(), true);
    assert.equal(await camera.getAttribute('aria-label'), 'Record café frontage');

    const checkLayout = async () => {
      const layout = await page.evaluate(() => {
        const box = element => { const b = element.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
        const actions = document.querySelector('.navigation-actions');
        const buttons = [...actions.querySelectorAll('button')].filter(button => button.getClientRects().length);
        const a = box(actions);
        return { buttons: buttons.map(button => ({ id: button.id, ...box(button) })), collisions: ['.navigation-hud', '.player-hud', '.controls', '#joystick', '[data-key=boost]', '[data-key=handbrake]', '.context-actions'].filter(selector => {
          const element = document.querySelector(selector);
          if (!element?.getClientRects().length) return false;
          const b = box(element);
          return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        }) };
      });
      assert.deepEqual(layout.buttons.map(button => button.id), ['dispatch', 'texts', 'shift', 'newsroom', 'observe']);
      for (const b of layout.buttons) {
        assert(b.width >= 44 && b.height >= 44, `${name}: ${b.id} must remain touch-sized`);
        assert(b.left >= 0 && b.top >= 0 && b.right <= width && b.bottom <= height, `${name}: ${b.id} must fit in viewport`);
      }
      assert.deepEqual(layout.collisions, [], `${name}: quick actions must clear other HUD controls`);
      if (touch && width > height) {
        assert(layout.buttons.filter(button => button.id !== 'shift').every(button => button.top === layout.buttons[0].top), 'landscape quick actions stay in one row');
      }
    };
    const shot = async suffix => {
      await page.mouse.move(width / 2, height / 2);
      await page.evaluate(() => document.fonts.ready);
      await checkLayout();
      await page.screenshot({ path: resolve(output, `${name}-${suffix}.png`) });
    };
    await shot('ready');
    if (touch) await camera.tap();
    else { await camera.focus(); await page.keyboard.press('Enter'); }
    state = await render();
    assert.equal(state.notebookIds.filter(id => id === 'cafe-photo').length, 1);
    assert.equal(await camera.isDisabled(), true);
    assert.equal(await camera.getAttribute('data-state'), 'recorded');
    assert.match(await camera.getAttribute('aria-label'), /Already recorded: Garden Café frontage/);
    assert.match(await page.locator('#toast').textContent(), /Observation saved: Garden Café frontage.*Past trips.*newsroom/);
    assert.equal(await page.locator('.observation-recorded').isVisible(), true);
    if (touch) {
      const overlaps = await page.evaluate(() => {
        const toast = document.querySelector('#toast').getBoundingClientRect();
        return ['.navigation-actions', '.navigation-hud', '.player-hud', '#joystick', '[data-key=boost]', '[data-key=handbrake]', '.context-actions'].filter(selector => {
          const element = document.querySelector(selector);
          if (!element.getClientRects().length) return false;
          const b = element.getBoundingClientRect();
          return toast.left < b.right && toast.right > b.left && toast.top < b.bottom && toast.bottom > b.top;
        });
      });
      assert.deepEqual(overlaps, [], `${name}: collection feedback must not cover HUD controls`);
    }
    await shot('recorded');
    if (name === 'portrait' || name === 'landscape') {
      const safeArea = await page.addStyleTag({ content: ':root{--edge-left:34px;--edge-right:26px;--edge-bottom:34px;--top-height:32px}' });
      await checkLayout();
      const bounds = await page.locator('.navigation-actions').boundingBox();
      assert(bounds.x >= 34 && bounds.x + bounds.width <= width - 26 && bounds.y >= 32 && bounds.y + bounds.height <= height - 34, `${name}: actions must respect asymmetric safe areas`);
      await safeArea.evaluate(element => element.remove());
    }
    await camera.dispatchEvent('click');
    assert.equal((await render()).notebookIds.filter(id => id === 'cafe-photo').length, 1);
    await command({ op: 'reload' });
    assert.equal(await camera.getAttribute('data-state'), 'recorded', 'recorded state survives save reconstruction');
    assert.equal(await page.evaluate(() => localStorage.getItem('taxi-chaos-v1')), null, 'scenario never writes a normal save');
    await page.locator('#city').focus();
    await page.locator('#newsroom').click();
    await waitForDrawer(page, 'newsroom');
    if (touch) await tapToConfirm(page, '#newsroom-open-sources');
    else { await page.locator('#newsroom-open-sources').focus(); await page.keyboard.press('Enter'); }
    assert.equal(await page.locator('[data-record="cafe-photo"]').count(), 1);
    assert.match(await page.locator('[data-record="cafe-photo"]').textContent(), /Garden Café frontage/);
    await command({ op: 'mode', mode: 'playing' });
    // Same stationary fixture: the icon works on foot and keeps the checked status.
    await page.locator('#city').focus();
    await page.keyboard.press('KeyE');
    assert.equal((await render()).onFoot, true);
    assert.equal(await camera.getAttribute('data-state'), 'recorded');
    await context.close();
    console.log(`${name}: physical approach, observation activation, notebook, retention and layout passed`);
  }
  console.log(`Offline observation checks passed; screenshots: ${output}`);
} catch (error) { await captureFailure(); throw error; } finally { await closeBrowser(browser); }

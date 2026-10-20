// Standalone, offline inspection QA. Reuse the browser verified during provisioning.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser, newContext, closeBrowser, captureFailure, viewportTuples } from '../runtime.mjs';

const output = resolve(process.env.SCREENSHOT_DIR ?? process.argv[2] ?? 'scenario-runs/layers');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
try {
  for (const [name, width, height, touch] of viewportTuples('desktop', 'portrait', 'compact', 'landscape')) {
    const context = await newContext(browser, { viewport: { width, height }, hasTouch: touch, isMobile: touch, offline: true });
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?debug=1`);
    await page.waitForFunction(() => !!window.__taxi?.layers);
    await page.evaluate(() => { window.__taxi.scenario('first-fare'); });
    const saved = await page.evaluate(() => JSON.stringify(localStorage));
    await page.locator('[data-lab="layers"]').click();
    await page.selectOption('[data-control="preset"]', 'terrain');
    await page.evaluate(() => {
      window.__taxi.layers.camera({ x: 185, y: 256 }, 7);
      window.__taxi.layers.inspect({ x: 200, y: 259 });
    });
    const layout = await page.locator('#layers-panel').evaluate(element => {
      const r = element.getBoundingClientRect();
      const body = element.querySelector('.layers-body');
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: body.clientWidth, scrollWidth: body.scrollWidth, pageWidth: document.documentElement.scrollWidth };
    });
    assert(layout.x >= 0 && layout.y >= 0 && layout.right <= width && layout.bottom <= height, `${name}: panel bounds`);
    assert(layout.scrollWidth <= layout.width && layout.pageWidth <= width, `${name}: horizontal overflow`);
    assert.equal(await page.locator('[data-control="preset"]').inputValue(), 'terrain');
    await page.screenshot({ path: resolve(output, `${name}-terrain.png`) });

    // Real pointer gestures and wheel zoom, with no vehicle controls leaking through.
    await page.locator('[data-action="collapse"]').click();
    const prior = await page.evaluate(() => ({ view: window.__taxi.layers.state(), game: window.__taxi.state() }));
    const x = Math.round(width * 0.4), y = Math.round(height * 0.48);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 50, y + 25, { steps: 5 }); await page.mouse.up();
    await page.mouse.wheel(0, -100);
    await page.locator('#city').focus(); await page.keyboard.press('ArrowLeft');
    const after = await page.evaluate(() => ({ view: window.__taxi.layers.state(), game: window.__taxi.state() }));
    assert.notDeepEqual(after.view.camera, prior.view.camera, `${name}: camera pans`);
    assert(after.view.zoom > prior.view.zoom, `${name}: camera zooms`);
    assert.deepEqual(after.game, prior.game, `${name}: camera input leaves physics untouched`);
    if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    assert(await page.evaluate(() => !!window.__taxi.layers.state().report), `${name}: pointer selection`);
    await page.locator('#layers-badge').click();
    await page.locator('[data-control="selection"]').scrollIntoViewIfNeeded();
    assert(await page.locator('[data-detail]').isVisible(), `${name}: selection reachable`);
    await page.screenshot({ path: resolve(output, `${name}-selection.png`) });

    if (name === 'desktop') {
      // Detached inspection reports, terrain winner, overlapping selection and stable IDs.
      const report = await page.evaluate(() => window.__taxi.layers.inspect({ x: 200, y: 259 }));
      assert(report.hits.some(hit => hit.kind === 'land'));
      assert(report.hits.some(hit => hit.kind === 'terrain'));
      const terrain = report.hits.find(hit => hit.kind === 'terrain');
      await page.selectOption('[data-control="selection"]', terrain.key);
      assert.equal(await page.evaluate(() => window.__taxi.layers.state().selected), terrain.key);
      const before = await page.evaluate(() => JSON.stringify(window.__taxi.state()));
      await page.evaluate(() => {
        for (const preset of ['land', 'terrain', 'collision', 'lighting', 'normal']) window.__taxi.layers.preset(preset);
        window.__taxi.layers.solo('shadows');
      });
      assert.equal(await page.evaluate(() => JSON.stringify(window.__taxi.state())), before);
      await page.screenshot({ path: resolve(output, 'desktop-shadows.png') });
      await page.evaluate(() => { window.__taxi.layers.preset('collision'); window.__taxi.layers.camera({ x: 185, y: 256 }, 10); });
      await page.screenshot({ path: resolve(output, 'desktop-collision.png') });

      // Physical driving with the inspector active, no mid-drive relocation or upgrades.
      const drive = await page.evaluate(() => {
        window.__taxi.layers.reset(); window.__taxi.scenario('first-fare'); window.__taxi.layers.preset('terrain');
        const a = window.__taxi.state(); window.__taxi.step(2, ['KeyW']); const b = window.__taxi.state();
        return { a, b };
      });
      assert(Math.hypot(drive.b.position.x - drive.a.position.x, drive.b.position.y - drive.a.position.y) > 1, 'actual driving with layers');

      // Explicit inspection pause sits on top of the current clock and releases cleanly.
      await page.evaluate(() => { window.__taxi.realtime(); window.__taxi.layers.configure({ paused: true }); });
      const paused = await page.evaluate(() => window.__taxi.state().time);
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => window.__taxi.state().time), paused, 'inspection pause');
      await page.evaluate(() => window.__taxi.layers.configure({ paused: false }));
      await page.waitForFunction(time => window.__taxi.state().time > time, paused);
      await page.evaluate(() => window.__taxi.step(0));

      // Preview UI remains usable while Lab is inert; closing restores original clock and game.
      const original = await page.evaluate(() => window.__taxi.state());
      await page.evaluate(() => { window.__taxi.map.open(); window.__taxi.map.preview(); window.__taxi.map.step(0); });
      assert.equal(await page.locator('#debug-panel').evaluate(element => element.inert), true);
      await page.locator('#layers-badge').click();
      await page.selectOption('[data-control="preset"]', 'land');
      await page.evaluate(() => window.__taxi.layers.camera({ x: 130, y: 350 }, 4));
      await page.screenshot({ path: resolve(output, 'desktop-map-preview.png') });
      await page.evaluate(() => window.__taxi.map.close());
      assert.deepEqual(await page.evaluate(() => window.__taxi.state()), original, 'preview restoration');
      assert.equal(await page.evaluate(() => window.__taxi.layers.state().active), false);
      assert.equal(await page.locator('#debug-panel').evaluate(element => element.inert), false);
    }
    await page.evaluate(() => { window.__taxi.layers.close(); window.__taxi.realtime(); });
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), saved, `${name}: saved preferences/progress untouched`);
    assert.equal(await page.evaluate(() => window.__taxi.layers.state().freeCamera), false);
    assert.equal(await page.evaluate(() => window.__taxi.state().lab.frozen), false);
    await context.close();
  }
  console.log('Layers: desktop, portrait, compact and landscape passed offline; selection, camera, pause, driving and preview restoration passed.');
} catch (error) { await captureFailure(); throw error; } finally { await closeBrowser(browser); }

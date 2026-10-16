// Production-only offline QA. All contexts and saves are disposable.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const output = resolve(process.argv[2] ?? 'scenario-runs/city-scale');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [], external = [];
try {
  for (const [name, width, height, touch] of [
    ['desktop', 1440, 900, false], ['portrait', 390, 844, true], ['landscape', 844, 390, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    await context.setOffline(true);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    page.on('request', r => { if (/^https?:/.test(r.url())) external.push(r.url()); });
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
    await page.waitForFunction(() => !!window.__scenario);
    const command = async c => {
      const result = await page.evaluate(command => window.__scenario.execute(command), c);
      assert.equal(result.status, 'passed', result.error); return result.state;
    };
    const start = async () => {
      await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
      await command({ op: 'advance', to: { day: 1, hour: 12 } });
    };
    await start();
    await command({ op: 'place', at: { x: 120, y: 65 }, angle: Math.PI / 2 });
    await page.screenshot({ path: resolve(output, `${name}-midtown.png`) });
    if (name === 'desktop') {
      await page.evaluate(() => window.__scenario.render('world', { zoom: 14 }));
      await page.screenshot({ path: resolve(output, 'desktop-hospital-detail.png') });
      await page.evaluate(() => window.__scenario.render('world'));
      await command({ op: 'advance', to: { day: 1, hour: 23 } });
      await page.screenshot({ path: resolve(output, 'desktop-night.png') });
      // Each drive begins with one setup pose, then only real throttle/brake inputs.
      for (const [axis, position, angle] of [['x', { x: 4, y: 80 }, 0], ['y', { x: 120, y: 4 }, Math.PI / 2]]) {
        await start();
        let state = await command({ op: 'place', at: position, angle });
        for (let i = 0; i < 80 && state.position[axis] < 210; i++) {
          state = await command({ op: 'step', seconds: 0.25, keys: ['KeyW'] });
          assert.equal(state.health, 100, `Unobstructed ${axis} street drive must remain clear`);
          assert.equal(state.mode, 'playing');
        }
        assert(state.position[axis] > 210, `Must physically cross the city on ${axis}`);
        await command({ op: 'step', seconds: 0.6, keys: ['KeyS'] });
        console.log(`${axis} drive: ${state.position[axis].toFixed(1)} m, health ${state.health}`);
      }
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), `${name}: overflow`);
    // Hand back any surviving page in realtime before disposing its isolated context.
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?debug=1`);
    await page.waitForFunction(() => !!window.__taxi);
    await page.evaluate(() => window.__taxi.realtime());
    await context.close();
    console.log(`${name}: offline city scale and layout passed`);
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
} finally { await browser.close(); }

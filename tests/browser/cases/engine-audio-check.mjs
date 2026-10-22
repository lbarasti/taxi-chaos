import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { launchBrowser, closeBrowser, captureFailure } from '../runtime.mjs';
import { openGame, waitForDrawer } from '../helpers/drawer.mjs';

const output = process.env.SCREENSHOT_DIR || 'scenario-runs/engine-audio';
await mkdir(output, { recursive: true });
const html = await readFile('dist/index.html', 'utf8');
const browser = await launchBrowser();
try {
  for (const [upgrade, count] of [[0, 5], [2, 6]]) {
    const page = await openGame(browser, html, { viewport: { width: 1440, height: 900 } }, '/?debug=1');
    await page.evaluate(upgrade => {
      // Inspect real Web Audio responses without replacing the game mixer.
      window.engineFilters = [];
      const createFilter = AudioContext.prototype.createBiquadFilter;
      AudioContext.prototype.createBiquadFilter = function () {
        const filter = createFilter.call(this); engineFilters.push(filter); return filter;
      };
      __taxi.scenario('first-fare'); __taxi.traffic(0);
      __taxi.configure({ noPolice: true, invincible: true });
      // Set up once, then drive physically without teleports or mid-run upgrades.
      __taxi.teleport(20, 80, 0, 0); __taxi.upgrades({ engine: upgrade });
      document.querySelector('#debug-panel').hidden = true;
      __taxi.realtime();
      window.engineTrace = [];
      window.engineTimer = setInterval(() => {
        const audio = __taxi.audio(), game = __taxi.state();
        if (audio.engine) engineTrace.push({ time: game.time, speed: game.speed, ...audio.engine, peak: audio.peak });
      }, 20);
    }, upgrade);
    await page.locator('#city').click({ position: { x: 500, y: 300 } });
    await page.waitForFunction(() => __taxi.audio()?.engine?.gear === 1);
    const idle = await page.evaluate(() => __taxi.audio().engine);
    assert(idle.rate < 0.7, 'occupied idle uses a lower engine pitch');
    await page.keyboard.down('w');
    await page.waitForFunction(count => engineTrace.some(sample => sample.gear === count), count, { timeout: 25000 });
    await page.keyboard.up('w');
    const trace = await page.evaluate(() => { clearInterval(engineTimer); return engineTrace; });
    assert.deepEqual([...new Set(trace.map(sample => sample.gear))], Array.from({ length: count }, (_, i) => i + 1));
    assert(trace.some(sample => sample.shifting), 'live shifts reach the mixer');
    assert(trace.some(sample => sample.peak > 0.001), 'decoded recordings produce real Web Audio output');
    const state = await page.evaluate(() => __taxi.audio());
    assert.equal(state.status, 'ready'); assert.deepEqual(state.failures, []);
    assert(state.loops.includes('engine') && state.loops.includes('engine-load'));
    assert(trace.every(sample => sample.rate <= 1.56), 'road-car revs stay lower across all gears');
    const eq = await page.evaluate(() => {
      const bass = engineFilters.find(filter => filter.type === 'lowshelf');
      const magnitude = new Float32Array(2), phase = new Float32Array(2);
      bass.getFrequencyResponse(new Float32Array([80, 4000]), magnitude, phase);
      return [...magnitude];
    });
    assert(eq[0] > 1.6 && eq[1] < 1.01, 'real engine EQ boosts bass without boosting treble');
    await writeFile(`${output}/engine-${count}-gears.json`, JSON.stringify(trace, null, 2) + '\n');
    await page.screenshot({ path: `${output}/driving-gear-${count}.png` });

    await page.keyboard.press('p');
    await page.locator('#menu-settings').click(); await waitForDrawer(page, 'settings');
    await page.locator('#playerEngine-option').fill('0');
    assert.equal(await page.locator('[data-setting="playerEngine"] output').innerText(), '0%');
    assert.equal(await page.evaluate(() => __taxi.audio().playerEngine), 0);
    // Other FX remain audible even with the player engine silenced.
    assert(await page.evaluate(() => __taxi.sound('horn')));
    await page.waitForFunction(() => __taxi.audio().peak > 0.001);
    await page.evaluate(() => __taxi.stopSound());
    await page.locator('#ambient-option').fill('0');
    assert.equal(await page.evaluate(() => __taxi.audio().ambient), 0);
    assert(await page.evaluate(() => __taxi.sound('horn')));
    await page.waitForTimeout(350);
    assert((await page.evaluate(() => __taxi.audio().peak)) < 0.0001, 'ambient zero silences real horn output');
    await page.evaluate(() => __taxi.stopSound());
    // Player previews remain audible even with ambient sounds at zero.
    await page.locator('#playerEngine-option').fill('70');
    assert(await page.evaluate(() => __taxi.sound('engine')));
    await page.waitForFunction(() => __taxi.audio().peak > 0.001);
    await page.evaluate(() => __taxi.stopSound());
    await page.locator('#ambient-option').fill('100');
    await page.screenshot({ path: `${output}/player-engine-settings.png` });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.evaluate(() => __taxi.realtime());
    await page.waitForFunction(() => __taxi.audio().engine !== null);
    await page.context().close();
  }
  console.log('Offline engine audio passed: physical 1–5/1–6 acceleration, live shifts, real decoded output, bass EQ, lower revs, independent player/ambient levels, muted horn output, other FX and realtime restoration; no console errors or external requests.');
} catch (error) { await captureFailure(); throw error; }
finally { await closeBrowser(browser); }

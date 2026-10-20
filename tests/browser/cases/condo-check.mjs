// Offline production rendering checks for the three distinct beachfront roofs.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser, newContext, closeBrowser, captureFailure } from '../runtime.mjs';

const output = resolve(process.env.SCREENSHOT_DIR ?? process.argv[2] ?? 'scenario-runs/luxury-condos');
await mkdir(output, { recursive: true });
// Identify actual source bytes rather than image dimensions: the two condos can
// have the same export size while still needing independent draw assertions.
const sources = Object.fromEntries(await Promise.all([
  ['azure', 'luxury-condo.png'], ['ocean-crest', 'ocean-crest-condo.png'], ['pacific-palm', 'pacific-palm-hotel.png'],
].map(async ([id, file]) => [id, (await readFile(resolve('src/assets/map', file))).toString('base64').slice(-128)])));
assert.equal(new Set(Object.values(sources)).size, 3);
const browser = await launchBrowser();
try {
  for (const [name, width, height, center, zoom, required, failImages] of [
    ['desktop', 1440, 900, { x: 200, y: 245 }, 11, ['azure', 'pacific-palm', 'ocean-crest'], false],
    ['portrait-azure', 390, 844, { x: 162, y: 245 }, 12, ['azure'], false],
    ['portrait-ocean-crest', 390, 844, { x: 237, y: 245 }, 12, ['ocean-crest'], false],
    ['portrait-hotel', 390, 844, { x: 200, y: 251 }, 10, ['pacific-palm'], false],
    ['landscape', 844, 390, { x: 200, y: 251 }, 9, ['azure', 'pacific-palm', 'ocean-crest'], false],
    ['fallback', 1440, 900, { x: 200, y: 245 }, 11, [], true],
  ]) {
    const touch = name.startsWith('portrait') || name === 'landscape';
    const context = await newContext(browser, { viewport: { width, height }, isMobile: touch, hasTouch: touch, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(({ failImages, sources }) => {
      window.roofDraws = {};
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      const identities = new WeakMap();
      CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
        if (this.canvas.id === 'city' && image instanceof HTMLImageElement) {
          if (!identities.has(image)) identities.set(image, Object.keys(sources).find(id => image.src.endsWith(sources[id])) ?? null);
          const id = identities.get(image);
          if (id) window.roofDraws[id] = (window.roofDraws[id] ?? 0) + 1;
        }
        return draw.call(this, image, ...args);
      };
      if (failImages) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value) {
          descriptor.set.call(this, value.startsWith('data:image/png') ? 'data:image/png;base64,invalid' : value);
        } });
      }
    }, { failImages, sources });
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
    await page.waitForFunction(() => !!window.__scenario);
    await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    const command = async operation => {
      const result = await page.evaluate(value => window.__scenario.execute(value), operation);
      assert.equal(result.status, 'passed', result.error);
    };
    await command({ op: 'advance', to: { day: 1, hour: 12 } });
    await command({ op: 'place', at: center, angle: 0 });
    await page.evaluate(zoom => { window.roofDraws = {}; window.__scenario.render('world', { zoom }); }, zoom);
    const draws = await page.evaluate(() => window.roofDraws);
    for (const id of required) assert(draws[id] > 0, `${name}: ${id} artwork was not drawn`);
    if (failImages) assert.deepEqual(draws, {}, 'failed PNGs must use procedural fallbacks');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), `${name}: overflow`);
    await page.screenshot({ path: resolve(output, `${name}.png`) });
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?debug=1`);
    await page.waitForFunction(() => !!window.__taxi);
    await page.evaluate(() => window.__taxi.realtime());
    await context.close();
    console.log(`${name}: offline beachfront rendering passed ${JSON.stringify(draws)}`);
  }
} catch (error) { await captureFailure(); throw error; } finally {
  await closeBrowser(browser);
}

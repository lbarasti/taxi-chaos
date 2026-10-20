// Offline production rendering check for the two beachfront condo sprites.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const output = resolve(process.argv[2] ?? 'scenario-runs/luxury-condos');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [], external = [];
try {
  for (const [name, width, height, center, zoom, failImages] of [
    ['desktop', 1440, 900, { x: 200, y: 245 }, 11, false],
    ['portrait', 390, 844, { x: 162, y: 245 }, 12, false],
    ['landscape', 844, 390, { x: 162, y: 251 }, 9, false],
    ['fallback', 1440, 900, { x: 200, y: 245 }, 11, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: name === 'portrait', hasTouch: name === 'portrait', reducedMotion: 'reduce' });
    await context.setOffline(true);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
    page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
    await page.addInitScript(failImages => {
      window.condoDraws = 0;
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
        if (this.canvas.id === 'city' && image instanceof HTMLImageElement && image.naturalWidth === 1254) window.condoDraws++;
        return draw.call(this, image, ...args);
      };
      if (failImages) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value) {
          descriptor.set.call(this, value.startsWith('data:image/png') ? 'data:image/png;base64,invalid' : value);
        } });
      }
    }, failImages);
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
    await page.waitForFunction(() => !!window.__scenario);
    await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    const command = async operation => {
      const result = await page.evaluate(value => window.__scenario.execute(value), operation);
      assert.equal(result.status, 'passed', result.error);
    };
    await command({ op: 'advance', to: { day: 1, hour: 12 } });
    await command({ op: 'place', at: center, angle: 0 });
    await page.evaluate(zoom => window.__scenario.render('world', { zoom }), zoom);
    const draws = await page.evaluate(() => window.condoDraws);
    assert(failImages ? draws === 0 : draws > 0, `${name}: unexpected condo artwork draw count ${draws}`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), `${name}: overflow`);
    await page.screenshot({ path: resolve(output, `${name}.png`) });
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?debug=1`);
    await page.waitForFunction(() => !!window.__taxi);
    await page.evaluate(() => window.__taxi.realtime());
    await context.close();
    console.log(`${name}: offline condo rendering passed (${draws} draws)`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
} finally {
  await browser.close();
}

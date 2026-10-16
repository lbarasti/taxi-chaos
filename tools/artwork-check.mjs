// Offline production rendering checks; all pages use disposable contexts and saves.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve(process.argv[2] ?? 'scenario-runs/artwork');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [], external = [];
// Route the actual standalone artifact in memory: works offline even when managed
// Chromium disables file:// navigation. No server or external service is needed.
const artifact = await readFile(resolve('dist/index.html'));
const url = 'http://taxi-chaos.test/';
try {
  for (const [name, width, height, touch, failImages] of [
    ['desktop', 1440, 900, false, false],
    ['portrait', 390, 844, true, false],
    ['landscape', 844, 390, true, false],
    ['fallback', 1440, 900, false, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    await context.route(`${url}**`, route => route.fulfill({ contentType: 'text/html', body: artifact }));
    await context.setOffline(true);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(url)) external.push(r.url()); });
    await page.addInitScript(failImages => {
      window.artDraws = { shop: 0, tree: 0, roof: 0, asphalt: 0, asphaltRasterizations: 0 };
      window.artVariants = new Set();
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
        if (image instanceof HTMLImageElement && image.naturalWidth === 768) window.artDraws.asphaltRasterizations++;
        if (this.canvas.id === 'city' && image instanceof HTMLImageElement) {
          const key = { 256: 'shop', 192: 'tree', 320: 'roof' }[image.naturalWidth];
          if (key) window.artDraws[key]++;
          if (key === 'shop' || key === 'roof') window.artVariants.add(image.src);
        }
        return draw.call(this, image, ...args);
      };
      const create = CanvasRenderingContext2D.prototype.createPattern;
      CanvasRenderingContext2D.prototype.createPattern = function(image, repeat) {
        if (this.canvas.id === 'city') {
          if (image instanceof HTMLImageElement) throw new Error('Live SVG patterns stall the world canvas; use the cached raster tile');
          if (image instanceof HTMLCanvasElement && image.width === 768) window.artDraws.asphalt++;
        }
        return create.call(this, image, repeat);
      };
      if (failImages) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value) {
          descriptor.set.call(this, /^data:image\/(svg\+xml|png)/.test(value) ? 'data:image/png;base64,invalid' : value);
        } });
      }
    }, failImages);
    await page.goto(`${url}?scenario-preview=1`);
    await page.waitForFunction(() => !!window.__scenario);
    await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    const command = async command => {
      const result = await page.evaluate(c => window.__scenario.execute(c), command);
      assert.equal(result.status, 'passed', result.error);
      return result.state;
    };
    await command({ op: 'advance', to: { day: 1, hour: 12 } });
    await command({ op: 'place', at: { x: 80, y: 100 }, angle: 0 });
    await page.screenshot({ path: resolve(output, `${name}-day.png`) });
    if (name === 'desktop') {
      await page.evaluate(() => window.__scenario.render('world', { zoom: 18 }));
      await page.screenshot({ path: resolve(output, 'desktop-detail.png') });
      await page.evaluate(() => window.__scenario.render('world'));
      for (const [district, x, y] of [['foundry', 40, 40], ['market', 120, 140], ['east-gardens', 200, 120]]) {
        await command({ op: 'place', at: { x, y }, angle: 0 });
        await page.evaluate(() => window.__scenario.render('world', { zoom: 18 }));
        await page.screenshot({ path: resolve(output, `${district}-day.png`) });
      }
      await command({ op: 'place', at: { x: 120, y: 120 }, angle: 0 });
      await page.evaluate(() => window.__scenario.render('world', { zoom: 2.6 }));
      await page.screenshot({ path: resolve(output, 'city-overview.png') });
      assert.equal(await page.evaluate(() => window.artVariants.size), 9, 'all six new roofs and three original roofs decode and draw');
      await command({ op: 'place', at: { x: 80, y: 100 }, angle: 0 });
      await page.evaluate(() => window.__scenario.render('world'));
    }
    const draws = await page.evaluate(() => window.artDraws);
    if (failImages) assert.deepEqual(draws, { shop: 0, tree: 0, roof: 0, asphalt: 0, asphaltRasterizations: 0 });
    else {
      assert(draws.shop > 0, `${name}: decoded shop PNG must be drawn`);
      assert(draws.tree > 0, `${name}: decoded tree PNG must be drawn`);
      assert(draws.roof > 0, `${name}: shaped roof PNG must be drawn`);
      assert.equal(draws.asphalt, 1, `${name}: asphalt pattern is cached across frames`);
      assert.equal(draws.asphaltRasterizations, 1, `${name}: SVG is rasterized once at load, never per frame`);
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
    await command({ op: 'advance', to: { day: 1, hour: 23 } });
    await page.screenshot({ path: resolve(output, `${name}-night.png`) });
    // Repeated artwork rendering cannot perturb the fixed-step drive.
    const drive = async extraFrames => {
      await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
      await command({ op: 'place', at: { x: 4, y: 80 }, angle: Math.PI / 2 });
      for (let i = 0; i < extraFrames; i++) await page.evaluate(() => window.__scenario.render('world'));
      return command({ op: 'step', seconds: 1.5, keys: ['KeyW'] });
    };
    const a = await drive(0), b = await drive(8);
    assert.deepEqual(a.position, b.position);
    assert.equal(b.health, 100);
    assert(Math.hypot(b.position.x - 4, b.position.y - 80) > 2, 'car must physically drive');
    // Enter a real U-shaped residence from the street, brake inside its recess,
    // then reverse out. Missing-image mode must retain exactly the same clearance.
    await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    await command({ op: 'advance', to: { day: 1, hour: 12 } });
    await command({ op: 'place', at: { x: 214.5, y: 84 }, angle: Math.PI / 2 });
    await command({ op: 'step', seconds: 1.05, keys: ['KeyW'] });
    const courtyard = await command({ op: 'step', seconds: 0.5, keys: ['KeyS'] });
    assert.equal(courtyard.health, 100, `${name}: entering a courtyard must not hit an invisible wall: ${JSON.stringify({ position: courtyard.position, health: courtyard.health })}`);
    assert(courtyard.position.y > 91.1 && courtyard.position.y < 92.9, `${name}: full taxi must fit inside the U recess: ${JSON.stringify(courtyard.position)}`);
    if (name === 'desktop') {
      await page.evaluate(() => window.__scenario.render('world', { zoom: 22 }));
      await page.screenshot({ path: resolve(output, 'courtyard-drive.png') });
    }
    const exit = await command({ op: 'step', seconds: 1.8, keys: ['KeyS'] });
    assert.equal(exit.health, 100);
    assert(exit.position.y < 87, 'taxi must physically reverse back out');
    const afterDrive = await page.evaluate(() => window.artDraws);
    assert.equal(afterDrive.asphalt, draws.asphalt, 'new scenarios reuse the context pattern');
    assert.equal(afterDrive.asphaltRasterizations, draws.asphaltRasterizations, 'extra renders never rasterize SVG again');
    if (name === 'desktop') {
      // Real physical contact, using the isolated Lab's collision/damage pipeline.
      await page.goto(`${url}?debug=1`);
      await page.waitForFunction(() => !!window.__taxi);
      const destruction = await page.evaluate(() => {
        const lab = window.__taxi;
        lab.scenario('first-fare'); lab.dayNight({ hour: 12, frozen: true });
        const tree = lab.props().find(p => p.kind === 'tree' && p.position.x > 80 && p.position.x < 120 && p.position.y > 80 && p.position.y < 120);
        if (!tree) throw new Error('Missing pilot tree');
        // Set up the crash once, then use physical stepping without mid-drive mutations.
        lab.teleport(tree.position.x - 6, tree.position.y, 0, 25);
        for (let i = 0; i < 30 && lab.props().find(p => p.id === tree.id).alive; i++) lab.step(0.05, ['KeyW']);
        return lab.props().find(p => p.id === tree.id);
      });
      assert.equal(destruction.alive, false, 'artwork tree must still be destructible');
      await page.evaluate(() => window.__taxi.close());
      await page.screenshot({ path: resolve(output, 'desktop-destruction.png') });
      await page.evaluate(() => window.__taxi.realtime());
    }
    // Exercise real keyboard/native touch input with realtime physics and rendering.
    await page.goto(`${url}?debug=1`);
    await page.waitForFunction(() => !!window.__taxi);
    const before = await page.evaluate(() => {
      const lab = window.__taxi;
      lab.scenario('first-fare'); lab.configure({ noPolice: true }); lab.traffic(0);
      lab.dayNight({ hour: 12, frozen: true }); lab.teleport(120, 80, 0, 0);
      lab.close(); lab.realtime(); return lab.state();
    });
    let cdp;
    if (touch) {
      cdp = await context.newCDPSession(page);
      const box = await page.locator('#joystick').boundingBox();
      assert(box, 'touch joystick must be present');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 - 35, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
    } else await page.keyboard.down('KeyW');
    await page.waitForTimeout(1800);
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => window.__taxi.state());
    assert(Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y) > 3, `${name}: UI input must physically drive the taxi`);
    assert.equal(after.health, 100, `${name}: real input drive retains full health`);
    await page.evaluate(() => window.__taxi.realtime());
    await context.close();
    console.log(`${name}: offline artwork, lighting, layout and driving passed`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
} finally { await browser.close(); }

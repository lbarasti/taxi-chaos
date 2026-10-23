// Offline production rendering checks; all pages use disposable contexts and saves.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser, newContext, closeBrowser, captureFailure } from '../runtime.mjs';

const output = resolve(process.env.SCREENSHOT_DIR ?? process.argv[2] ?? 'scenario-runs/artwork');
await mkdir(output, { recursive: true });
const sources = Object.fromEntries(await Promise.all([
  ['shop-tar', 'shop-tar.png'], ['shop-rust', 'shop-rust.png'], ['shop-concrete', 'shop-concrete.png'],
  ['tree', 'tree-worn.png'], ['hospital', 'hospital-structure.png'],
].map(async ([id, file]) => [id, (await readFile(resolve('src/assets/optimized/map', file.replace(/\.png$/, '.webp')))).toString('base64').slice(-128)])));
const asphaltMarker = (await readFile(resolve('src/assets/map/asphalt.svg'), 'utf8')).match(/<path d="([^"]{24})/)?.[1];
assert(asphaltMarker);
const browser = await launchBrowser();
try {
  for (const [name, width, height, touch, failImages] of [
    ['desktop', 1440, 900, false, false],
    ['portrait', 390, 844, true, false],
    ['landscape', 844, 390, true, false],
    ['fallback', 1440, 900, false, true],
  ]) {
    const context = await newContext(browser, { viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(({ failImages, sources, asphaltMarker }) => {
      window.artDraws = { shop: 0, tree: 0, hospital: 0, asphalt: 0, asphaltRasterizations: 0 };
      window.artVariants = new Set();
      const identities = new WeakMap(), asphaltTiles = new WeakSet();
      const identity = image => {
        if (!identities.has(image)) {
          let id = Object.keys(sources).find(key => image.src.endsWith(sources[key])) ?? null;
          if (!id && image.src.startsWith('data:image/svg+xml')) {
            const payload = image.src.split(',')[1];
            const svg = image.src.includes(';base64,') ? atob(payload) : decodeURIComponent(payload);
            if (svg.includes(asphaltMarker)) id = 'asphalt';
          }
          identities.set(image, id);
        }
        return identities.get(image);
      };
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
        const id = image instanceof HTMLImageElement ? identity(image) : null;
        if (id === 'asphalt' && this.canvas.id !== 'city') {
          window.artDraws.asphaltRasterizations++;
          asphaltTiles.add(this.canvas);
        }
        if (this.canvas.id === 'city' && image instanceof HTMLImageElement) {
          const key = id?.startsWith('shop-') ? 'shop' : id;
          if (key) window.artDraws[key]++;
          if (key === 'shop') window.artVariants.add(image.src);
        }
        return draw.call(this, image, ...args);
      };
      const create = CanvasRenderingContext2D.prototype.createPattern;
      CanvasRenderingContext2D.prototype.createPattern = function(image, repeat) {
        if (this.canvas.id === 'city') {
          if (image instanceof HTMLImageElement) throw new Error('Live SVG patterns stall the world canvas; use the cached raster tile');
          if (image instanceof HTMLCanvasElement && asphaltTiles.has(image)) window.artDraws.asphalt++;
        }
        return create.call(this, image, repeat);
      };
      if (failImages) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value) {
          descriptor.set.call(this, /^data:image\/(svg\+xml|png|webp)/.test(value) ? 'data:image/png;base64,invalid' : value);
        } });
      }
    }, { failImages, sources, asphaltMarker });
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
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
    }
    const draws = await page.evaluate(() => window.artDraws);
    if (failImages) assert.deepEqual(draws, { shop: 0, tree: 0, hospital: 0, asphalt: 0, asphaltRasterizations: 0 });
    else {
      assert(draws.shop > 0, `${name}: decoded shop PNG must be drawn`);
      assert(draws.tree > 0, `${name}: decoded tree PNG must be drawn`);
      assert(draws.hospital > 0, `${name}: decoded hospital PNG must be drawn`);
      if (name === 'desktop') assert.equal(await page.evaluate(() => window.artVariants.size), 3, 'all three roof designs must be visible');
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
    const afterDrive = await page.evaluate(() => window.artDraws);
    assert.equal(afterDrive.asphalt, draws.asphalt, 'new scenarios reuse the context pattern');
    assert.equal(afterDrive.asphaltRasterizations, draws.asphaltRasterizations, 'extra renders never rasterize SVG again');
    if (name === 'desktop') {
      // Real physical contact, using the isolated Lab's collision/damage pipeline.
      await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?debug=1`);
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
    await context.close();
    console.log(`${name}: offline artwork, lighting, layout and driving passed`);
  }
} catch (error) { await captureFailure(); throw error; } finally { await closeBrowser(browser); }

// Run with a real GPU: headless Chrome's software canvas hides acceleration regressions.
// Each build/layout gets a fresh offline context; no normal tabs, settings or saves are used.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const output = resolve(option('--output') ?? 'scenario-runs/artwork-performance');
const samples = Number(option('--frames') ?? 180);
assert(Number.isInteger(samples) && samples >= 60, '--frames must be at least 60');
const builds = [
  ['baseline', option('--baseline')],
  ['regressed', option('--regressed')],
  ['fixed', option('--candidate') ?? 'dist/index.html'],
].filter(([, file]) => file);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: args.includes('--headless'), executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [], external = [], results = [];
try {
  const session = await browser.newBrowserCDPSession();
  const { gpu } = await session.send('SystemInfo.getInfo');
  const hardware = { devices: gpu.devices, features: gpu.featureStatus };
  console.log('Canvas acceleration:', gpu.featureStatus['2d_canvas']);
  if (gpu.featureStatus['2d_canvas'] !== 'enabled') console.warn('Software canvas: timings cannot validate GPU-path recovery. Re-run without --headless.');
  for (const [build, file] of builds) {
    for (const [layout, width, height, touch, hour] of [
      ['desktop-day', 1440, 900, false, 12],
      ['desktop-night', 1440, 900, false, 23],
      ['portrait', 390, 844, true, 12],
      ['landscape', 844, 390, true, 12],
    ]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
      await context.setOffline(true);
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(`${build}/${layout}: ${e.message}`));
      page.on('console', m => { if (m.type() === 'error') errors.push(`${build}/${layout}: ${m.text()}`); });
      page.on('request', r => { if (/^https?:/.test(r.url())) external.push(r.url()); });
      await page.goto(`${pathToFileURL(resolve(file))}?scenario-preview=1`);
      await page.waitForFunction(() => !!window.__scenario);
      await page.evaluate(({ hour }) => {
        window.__scenario.start({ traffic: 'quiet', noPolice: true });
        for (const command of [{ op: 'advance', to: { day: 1, hour } }, { op: 'place', at: { x: 80, y: 100 }, angle: 0 }]) {
          const result = window.__scenario.execute(command);
          if (result.status !== 'passed') throw new Error(result.error);
        }
      }, { hour });
      // Render the actual world/HUD/lighting on every RAF. Scenario mode deliberately has no
      // automatic render loop: sampling RAF alone would incorrectly report an idle 120 FPS.
      const timings = await page.evaluate(count => new Promise(resolve => {
        const frames = [], submissions = [];
        let last, warmup = 60;
        function frame(now) {
          const start = performance.now();
          window.__scenario.render('world');
          const elapsed = performance.now() - start;
          if (warmup > 0) warmup--;
          else if (last !== undefined) { frames.push(now - last); submissions.push(elapsed); }
          last = now;
          if (frames.length < count) requestAnimationFrame(frame);
          else {
            const stats = values => {
              const sorted = values.slice().sort((a, b) => a - b);
              const percentile = q => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] * 100) / 100;
              return { median: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: percentile(1), over33ms: sorted.filter(t => t > 33.4).length };
            };
            resolve({ frames: stats(frames), submissions: stats(submissions) });
          }
        }
        requestAnimationFrame(frame);
      }), samples);
      const result = { build, layout, samples, ...timings };
      results.push(result);
      console.log(JSON.stringify(result));
      await page.screenshot({ path: resolve(output, `${build}-${layout}.png`) });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${build}/${layout}: overflow`);
      await context.close();
    }
  }
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ browser: browser.version(), hardware, results }, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  // Explicit machine-specific budget, not a flaky universal timing gate. Structural regression
  // coverage in artwork-check.mjs and images.test.ts also works in software-only CI.
  const budget = Number(option('--max-p95') ?? Infinity);
  for (const result of results.filter(r => r.build === 'fixed')) assert(result.frames.p95 <= budget, `${result.layout}: p95 ${result.frames.p95}ms exceeds ${budget}ms`);
} finally { await browser.close(); }

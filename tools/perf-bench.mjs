// Deterministic end-to-end benchmark against the Vite dev server. `__taxi.step` runs
// fixed 120 Hz physics synchronously, so these numbers do not depend on display refresh
// or rAF scheduling; `__taxi.aura` paints one real world frame. Use it to compare a
// change against the same scenarios before and after.
//
//   node tools/perf-bench.mjs --label baseline
//   node tools/perf-bench.mjs --label pedestrian-early-exit
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const label = option('label', 'unlabelled');
const port = Number(option('port', 5210));
const rounds = Number(option('rounds', 5));
const driveSeconds = Number(option('seconds', 2));
const output = path.resolve(root, option('output', 'scenario-runs/perf/bench'));
await mkdir(output, { recursive: true });

// Each scenario is a comparable workload: same traffic, lighting and starting pose.
const scenarios = [
  { name: 'city-avenue-day-24', traffic: 24, hour: 14, place: [80, 232, 'north'] },
  { name: 'city-avenue-day-40', traffic: 40, hour: 14, place: [80, 232, 'north'] },
  { name: 'city-avenue-night-24', traffic: 24, hour: 23, place: [80, 232, 'north'] },
  { name: 'downtown-crossing-32', traffic: 32, hour: 14, place: [80, 80, 'north'] },
];

const server = await createServer({ root, server: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: args.includes('--headless'),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const stats = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = p => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 100) / 100;
  return { min: at(0), median: at(0.5), max: at(1), count: values.length };
};

try {
  await page.goto(`http://127.0.0.1:${port}/?debug=1`);
  await page.waitForFunction(() => !!window.__taxi, undefined, { timeout: 30000 });
  const results = [];
  for (const scenario of scenarios) {
    await page.evaluate(({ traffic, hour, place }) => {
      __taxi.reset();
      __taxi.traffic(traffic);
      __taxi.dayNight({ hour });
      const angles = { north: -Math.PI / 2, south: Math.PI / 2, east: 0, west: Math.PI };
      __taxi.teleport(place[0], place[1], angles[place[2]], 0);
    }, scenario);
    const [x, y, heading] = scenario.place;
    const angles = { north: -Math.PI / 2, south: Math.PI / 2, east: 0, west: Math.PI };
    // Warm up JIT and traffic flow before timing.
    await page.evaluate(({ x, y, angle, seconds }) => { __taxi.teleport(x, y, angle, 0); __taxi.step(seconds, ['KeyW']); }, { x, y, angle: angles[heading], seconds: driveSeconds });
    const sim = await page.evaluate(({ rounds, x, y, angle, seconds }) => {
      const samples = [];
      for (let round = 0; round < rounds; round++) {
        __taxi.teleport(x, y, angle, 0);
        const start = performance.now();
        __taxi.step(seconds, ['KeyW']);
        samples.push(performance.now() - start);
      }
      return samples;
    }, { rounds, x, y, angle: angles[heading], seconds: driveSeconds });
    // Painting: identical paused world, one full world pass per sample.
    const render = await page.evaluate(samples => {
      for (let i = 0; i < 5; i++) __taxi.aura();
      const values = [];
      for (let i = 0; i < samples; i++) { const start = performance.now(); __taxi.aura(); values.push(performance.now() - start); }
      return values;
    }, 30);
    const state = await page.evaluate(() => {
      const s = __taxi.state();
      return { vehicles: __taxi.vehicles().filter(v => v.alive).length, people: __taxi.people().length, speed: Math.round(s.speed * 10) / 10 };
    });
    const entry = {
      scenario: scenario.name,
      simMsPerSecond: stats(sim),
      simMsPerStep: Math.round(stats(sim).median / (driveSeconds * 120) * 1000) / 1000,
      renderMsPerFrame: stats(render),
      ...state,
    };
    results.push(entry);
    console.log(`${scenario.name}: sim ${entry.simMsPerSecond.median}ms/${driveSeconds}s (${entry.simMsPerStep}ms/step) · render ${entry.renderMsPerFrame.median}ms/frame · ${state.vehicles} vehicles, ${state.people} people`);
    await page.screenshot({ path: path.join(output, `${label}-${scenario.name}.png`) });
  }
  await writeFile(path.join(output, `${label}.json`), JSON.stringify({ label, rounds, driveSeconds, results }, null, 2) + '\n');
  if (errors.length) console.error('Page errors:', errors);
  console.log(`Wrote ${path.relative(root, output)}/${label}.json`);
} finally {
  await browser.close();
  await server.close();
}

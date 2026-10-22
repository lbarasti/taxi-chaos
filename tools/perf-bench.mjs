// Fresh, persistence-disabled games isolate fixed 120 Hz updates from UI refresh,
// snapshots and canvas painting. Render submission is measured separately.
//   node tools/perf-bench.mjs --label baseline --headless
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { perfOptions, stats, withPerf } from './perf-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = perfOptions({ label: 'unlabelled', port: 5210, rounds: 5, seconds: 2, output: 'scenario-runs/perf/bench' });
const { label, rounds, seconds: driveSeconds } = options;
if (driveSeconds > 120) throw new Error('--seconds must be at most 120');
const steps = Math.round(driveSeconds * 120);
if (!steps) throw new Error('--seconds must cover at least one 120 Hz step');
const output = path.resolve(root, options.output);
await mkdir(output, { recursive: true });

const scenarios = [
  { name: 'city-avenue-day-24', traffic: 24, hour: 14, place: [80, 232] },
  { name: 'city-avenue-day-40', traffic: 40, hour: 14, place: [80, 232] },
  { name: 'city-avenue-night-24', traffic: 24, hour: 23, place: [80, 232] },
  { name: 'downtown-crossing-32', traffic: 32, hour: 14, place: [80, 80] },
];

await withPerf({ root, ...options, blank: true }, async ({ page, metadata, errors }) => {
  await page.evaluate(async () => {
    const [{ Game }, { Renderer }, { artworkImages }] = await Promise.all([
      import('/src/game/game.ts'), import('/src/rendering/renderer.ts'), import('/src/artwork/images.ts'),
      import('/src/style.css'),
    ]);
    await artworkImages.load();
    await document.fonts.load('500 14px "Space Grotesk"');
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    // One renderer owns its resize listener for the entire benchmark.
    window.__perf = { Game, renderer: new Renderer(canvas, document.createElement('canvas'), new Game(undefined, false)) };
  });
  const results = [];
  for (const scenario of scenarios) {
    const measurements = await page.evaluate(({ scenario, rounds, steps }) => {
      const { Game, renderer } = window.__perf, sim = [], startTimes = [], endTimes = [];
      let game;
      for (let round = -3; round < rounds; round++) {
        game = new Game(undefined, false);
        game.resetRun(); game.setTrafficCount(scenario.traffic); game.dayNight.configure({ hour: scenario.hour });
        const body = game.player.body;
        body.position = { x: scenario.place[0], y: scenario.place[1] }; body.angle = -Math.PI / 2;
        game.previousTyres = game.player.dynamics.tyres.map(tyre => body.toWorld(tyre.position));
        game.keys = new Set(['KeyW']);
        const startTime = game.time, start = performance.now();
        for (let i = 0; i < steps; i++) game.update(1 / 120);
        const elapsed = performance.now() - start;
        if (Math.abs(game.time - startTime - steps / 120) > 1e-6) throw new Error(`Simulation stopped in ${game.mode} mode before completing ${steps} steps`);
        if (round >= 0) { sim.push(elapsed); startTimes.push(startTime); endTimes.push(game.time); }
      }
      game.keys.clear(); renderer.game = game; renderer.camera = { ...game.actor.position };
      for (let i = 0; i < 5; i++) renderer.draw(0);
      const render = [];
      for (let i = 0; i < 30; i++) { const start = performance.now(); renderer.draw(0); render.push(performance.now() - start); }
      return { sim, render, startTimes, endTimes, vehicles: game.vehicles.filter(v => v.alive).length,
        people: game.world.people.length, speed: Math.round(game.speed * 10) / 10 };
    }, { scenario, rounds, steps });
    const { sim, render, ...state } = measurements;
    const entry = { scenario: scenario.name, simMsPerRun: stats(sim), simMsPerSecond: stats(sim.map(ms => ms / (steps / 120))),
      simMsPerStep: stats(sim.map(ms => ms / steps), 3), renderMsPerFrame: stats(render), raw: { sim, render }, ...state };
    results.push(entry);
    console.log(`${scenario.name}: sim ${entry.simMsPerRun.median}ms/${steps / 120}s (${entry.simMsPerStep.median}ms/step) · render ${entry.renderMsPerFrame.median}ms/frame · ${state.vehicles} vehicles, ${state.people} people`);
    await page.screenshot({ path: path.join(output, `${label}-${scenario.name}.png`) });
  }
  await writeFile(path.join(output, `${label}.json`), JSON.stringify({ label, rounds, warmups: 3, driveSeconds, steps,
    simulatedSeconds: steps / 120, method: 'Fresh Game per run; simulation excludes setup, rendering and snapshots; render measures CPU submission only',
    ...metadata, results, errors }, null, 2) + '\n');
  console.log(`Wrote ${path.relative(root, output)}/${label}.json`);
});

// CPU-profile real gameplay in a headed Chromium against the Vite dev server, so function
// names stay intact. Drives with real key events, samples rAF frame times, and writes a
// Chrome .cpuprofile plus a self/inclusive-time report under scenario-runs/perf/.
//
//   node tools/perf-profile.mjs --scenario cruise              # downtown avenue, traffic 8
//   node tools/perf-profile.mjs --scenario boost-night --traffic 10 --hour 23
//   node tools/perf-profile.mjs --scenario effects --traffic 24  # fires and blasts
//   node tools/perf-profile.mjs --scenario idle --cpu 4        # throttled hotspot hunt
//
// Driving presets start on the Market Street avenue inside the city unless --place says
// otherwise, so a run cannot end in the sea a few seconds after it begins.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const flag = name => args.includes(`--${name}`);
const scenario = option('scenario', 'cruise');
const seconds = Number(option('seconds', 12));
const traffic = Number(option('traffic', 8));
const hour = Number(option('hour', 14));
const drivePresets = ['cruise', 'boost', 'boost-night', 'effects', 'boost-night-effects'];
const place = option('place', drivePresets.includes(scenario) ? '80,232,north' : null);
const turn = option('turn', null); // "atSeconds:Key:holdSeconds" (repeat with commas)
const width = Number(option('width', 1440));
const height = Number(option('height', 900));
const dpr = Number(option('dpr', 2));
const cpu = Number(option('cpu', 1));
const output = path.resolve(root, option('output', `scenario-runs/perf/${scenario}`));
const headless = flag('headless');
const port = Number(option('port', 5199));
await mkdir(output, { recursive: true });

const server = await createServer({ root, server: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const url = `http://127.0.0.1:${port}/?debug=1`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless,
  args: headless ? [] : ['--window-size=1500,1000'],
});
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

try {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__taxi, undefined, { timeout: 30000 });
  // Isolated lab game: keeps normal saved progress untouched.
  await page.evaluate(({ traffic, hour }) => {
    __taxi.reset();
    __taxi.traffic(traffic);
    __taxi.dayNight({ hour });
    __taxi.realtime();
  }, { traffic, hour });
  if (place) {
    const [rawX, rawY, heading = 'north'] = place.split(',');
    await page.evaluate(({ x, y, heading }) => {
      const angles = { north: -Math.PI / 2, south: Math.PI / 2, east: 0, west: Math.PI };
      __taxi.teleport(x, y, angles[heading] ?? Number(heading) * Math.PI / 180, 0);
      __taxi.realtime();
    }, { x: Number(rawX), y: Number(rawY), heading });
  }
  await page.mouse.click(width / 2, height / 2).catch(() => {});

  const session = await context.newCDPSession(page);
  await session.send('Performance.enable');
  await session.send('Profiler.enable');
  if (cpu > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await session.send('Profiler.setSamplingInterval', { interval: 200 });

  // Baseline metrics, then profile.
  const before = Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const profileStart = Date.now();
  await session.send('Profiler.start');

  const drive = {
    idle: [],
    cruise: ['KeyW'],
    boost: ['KeyW', 'ShiftLeft'],
    'boost-night': ['KeyW', 'ShiftLeft'],
    crash: ['KeyW'],
  }[scenario] ?? ['KeyW'];
  // Frame sampling lives in the page so it shares the real rAF cadence; start it before
  // any input so the sampled window matches the profiled window.
  await page.evaluate(() => {
    window.__perfFrames = [];
    window.__perfLong = [];
    window.__perfStart = performance.now();
    window.__perfObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__perfLong.push(entry.duration);
    });
    try { window.__perfObserver.observe({ entryTypes: ['longtask'] }); } catch { /* unsupported */ }
    let last;
    const tick = now => {
      if (last !== undefined) window.__perfFrames.push(now - last);
      last = now;
      if (now - window.__perfStart < 1000 * 60) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (const key of drive) await page.keyboard.down(key);
  // Stress scenarios seed hazards through the lab so fire, blasts and debris run under load.
  const stress = scenario === 'effects' || scenario === 'boost-night-effects';
  if (stress) {
    for (let i = 0; i < Math.ceil(seconds / 2); i++) {
      await page.waitForTimeout(2000);
      await page.evaluate(() => {
        const vehicles = __taxi.vehicles();
        const target = vehicles.filter(v => v.kind === 'traffic').sort((a, b) =>
          Math.hypot(a.position.x - 80, a.position.y - 110) - Math.hypot(b.position.x - 80, b.position.y - 110))[0];
        if (target) __taxi.damageVehicle(target.id, { ignite: true, fuse: 0.4, health: 4 });
      });
    }
  } else {
    const turns = turn ? turn.split(',').map(entry => {
      const [at, key, hold = 0.6] = entry.split(':');
      return { at: Number(at) * 1000, key, hold: Number(hold) * 1000 };
    }) : [];
    const start = Date.now();
    for (const entry of turns) {
      await page.waitForTimeout(Math.max(0, start + entry.at - Date.now()));
      await page.keyboard.down(entry.key);
      await page.waitForTimeout(entry.hold);
      await page.keyboard.up(entry.key);
    }
    await page.waitForTimeout(Math.max(0, seconds * 1000 - (Date.now() - start)));
  }
  for (const key of drive) await page.keyboard.up(key);
  for (const key of drive) await page.keyboard.up(key);

  const { profile } = await session.send('Profiler.stop');
  const profileWallMs = Date.now() - profileStart;
  const after = Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const frames = await page.evaluate(() => {
    window.__perfObserver?.disconnect();
    return { frames: window.__perfFrames.slice(), long: window.__perfLong.slice(), elapsed: performance.now() - window.__perfStart };
  });
  const endState = await page.evaluate(() => {
    const state = __taxi.state();
    return { mode: state.mode, sinking: state.sinking, water: state.water, position: state.position, speed: Math.round(state.speed * 10) / 10, condition: state.condition };
  });
  await page.screenshot({ path: path.join(output, 'frame.png') });

  const stats = values => {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const q = p => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 100) / 100;
    return { count: values.length, median: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1) };
  };
  const report = bottomUp(profile);
  const summary = {
    scenario, seconds, viewport: { width, height, dpr }, cpu, headless, traffic, hour, place, turn, endState,
    frames: stats(frames.frames),
    longTasks: { count: frames.long.length, totalMs: Math.round(frames.long.reduce((a, b) => a + b, 0)) },
    mainThread: {
      seconds: Math.round((after.TaskDuration - before.TaskDuration) * 100) / 100,
      script: Math.round((after.ScriptDuration - before.ScriptDuration) * 100) / 100,
      layout: Math.round((after.LayoutDuration - before.LayoutDuration) * 100) / 100,
      style: Math.round((after.RecalcStyleDuration - before.RecalcStyleDuration) * 100) / 100,
      nodes: after.Nodes,
    },
    totalSampledMs: Math.round(report.total),
    profileWallMs,
  };
  await writeFile(path.join(output, 'profile.cpuprofile'), JSON.stringify(profile));
  await writeFile(path.join(output, 'summary.json'), JSON.stringify({ summary, hot: report.hot, inclusive: report.inclusive, byFile: report.byFile, byPhase: report.byPhase }, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nInclusive time for top-level stages:');
  for (const entry of report.inclusive.slice(0, 24)) console.log(`${String(Math.round(entry.ms)).padStart(6)}ms ${String(Math.round(entry.pct)).padStart(4)}%  ${entry.name}  ${entry.file}:${entry.line}`);
  console.log('\nSelf time by function (top 30):');
  for (const entry of report.hot.slice(0, 30)) console.log(`${String(Math.round(entry.ms)).padStart(6)}ms ${String(Math.round(entry.pct)).padStart(4)}%  ${entry.name}  ${entry.file}:${entry.line}`);
  console.log('\nSelf time by source file (top 15):');
  for (const entry of report.byFile.slice(0, 15)) console.log(`${String(Math.round(entry.ms)).padStart(6)}ms ${String(Math.round(entry.pct)).padStart(4)}%  ${entry.file}`);
  console.log('\nSelf time by subsystem:');
  for (const entry of report.byPhase) console.log(`${String(Math.round(entry.ms)).padStart(6)}ms ${String(Math.round(entry.pct)).padStart(4)}%  ${entry.phase}`);
  if (errors.length) console.error('Page errors:', errors);
  console.log(`\nWrote ${path.relative(root, output)}/{profile.cpuprofile,summary.json,frame.png}`);
} finally {
  await browser.close();
  await server.close();
}

/** Chrome CPU profile -> self-time aggregation. Samples carry the leaf node id. */
function bottomUp(profile) {
  const byId = new Map(profile.nodes.map(node => [node.id, node]));
  const self = new Map();
  const deltas = profile.timeDeltas ?? [];
  let total = 0;
  profile.samples?.forEach((id, index) => {
    const ms = (deltas[index] ?? 0) / 1000;
    total += ms;
    self.set(id, (self.get(id) ?? 0) + ms);
  });
  const rows = [];
  for (const [id, ms] of self) {
    const node = byId.get(id);
    if (!node) continue;
    const frame = node.callFrame;
    rows.push({
      name: frame.functionName || '(anonymous)', url: frame.url, line: frame.lineNumber + 1,
      file: shortFile(frame.url), ms,
    });
  }
  // Merge identical frames (same function from inlined call sites).
  const merged = new Map();
  for (const row of rows) {
    const key = `${row.name}|${row.file}|${row.line}`;
    const entry = merged.get(key) ?? { ...row, ms: 0 };
    entry.ms += row.ms;
    merged.set(key, entry);
  }
  const hot = [...merged.values()].sort((a, b) => b.ms - a.ms).map(r => ({ ...r, pct: r.ms / total * 100 }));
  // Inclusive time: every sample charges its ancestors, so a stage shows the work it owns.
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const inclusive = new Map();
  for (const [id, ms] of self) {
    const seen = new Set();
    let cursor = id;
    while (cursor !== undefined && !seen.has(cursor)) {
      seen.add(cursor);
      const node = byId.get(cursor);
      if (node) {
        const key = `${node.callFrame.functionName || '(anonymous)'}|${shortFile(node.callFrame.url)}|${node.callFrame.lineNumber + 1}`;
        const entry = inclusive.get(key) ?? {
          name: node.callFrame.functionName || '(anonymous)', file: shortFile(node.callFrame.url),
          line: node.callFrame.lineNumber + 1, ms: 0,
        };
        entry.ms += ms; inclusive.set(key, entry);
      }
      cursor = parent.get(cursor);
    }
  }
  const inclusiveRows = [...inclusive.values()].sort((a, b) => b.ms - a.ms).map(r => ({ ...r, pct: r.ms / total * 100 }));
  const byFile = new Map();
  for (const row of hot) {
    const entry = byFile.get(row.file) ?? { file: row.file, ms: 0 };
    entry.ms += row.ms; byFile.set(row.file, entry);
  }
  const phaseFor = file => {
    if (file.includes('/rendering/')) return 'rendering';
    if (file.includes('/physics/')) return 'physics';
    if (file.includes('/vehicles/')) return 'vehicles';
    if (file.includes('/world/')) return 'world';
    if (file.includes('/debug/')) return 'debug lab';
    if (file.includes('/ui/') || file.includes('/narrative/') || file.includes('/campaign/') || file.includes('/missions/')) return 'ui + narrative';
    if (file.includes('/audio/')) return 'audio';
    if (file.includes('/artwork/')) return 'artwork';
    if (file.includes('/map/') || file.includes('/catalogue/')) return 'map + catalogue';
    if (file.includes('/game/')) return 'game loop';
    if (file === 'native') return 'native browser';
    return 'other';
  };
  const phases = new Map();
  for (const row of hot) {
    const phase = phaseFor(row.file);
    const entry = phases.get(phase) ?? { phase, ms: 0 };
    entry.ms += row.ms; phases.set(phase, entry);
  }
  return {
    total,
    hot,
    inclusive: inclusiveRows,
    byFile: [...byFile.values()].sort((a, b) => b.ms - a.ms).map(r => ({ ...r, pct: r.ms / total * 100 })),
    byPhase: [...phases.values()].sort((a, b) => b.ms - a.ms).map(r => ({ ...r, pct: r.ms / total * 100 })),
  };
}

function shortFile(url) {
  if (!url) return 'native';
  if (url.startsWith('native ')) return 'native';
  const match = url.match(/\/src\/(.*)$/);
  return match ? `src/${match[1]}` : url.replace(/^https?:\/\/[^/]+\//, '');
}

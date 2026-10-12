import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const help = `Run stateful gameplay scenarios and capture the actual app as PNGs.

Usage: npm run scenario:run -- --scenario docs/scenarios/open-shore.json [options]
       node tools/scenario-run.mjs --stdin [options] < commands.jsonl

  --scenario PATH  Version 1 JSON scenario (one persistent game, ordered steps)
  --stdin          JSON-lines commands; one JSON reply per command on stdout
  --json           Run the same harness without Chromium; captures become markers
  --list           List commands and valid facts, events, places, missions and material
  --output PATH    New artifact directory (default: scenario-runs/NAME-TIMESTAMP)
  --width N        Viewport width (default: 1440)
  --height N       Viewport height (default: 900)
  --touch          Touch/mobile media queries
  --help           Show this help

Commands: facts, advance, place, step, mode, route, pickup, deliver, read,
ordinary, abandon, reload, photo, sleep, submit, publish, expect, capture.
Use --list and docs/scenario-cli.md for the JSON format and complete examples.

PNG mode uses one isolated headless Chromium context with normal saves disabled.
Install once: npx playwright install chromium
Or set CHROMIUM_PATH to an existing executable. A new directory is required.
Reports include every command/state and an automatic failure PNG on runtime errors.
--stdin stops at the first failure. Both modes exit nonzero on failed assertions.
For clean JSON stdout, invoke node tools/scenario-run.mjs directly.
`;

let server, httpServer, browser, page, directory, runner, execute, render, manifest, inputLines, inputIterator, json = false, stream = false;
const errors = [], externalRequests = [];
const timed = async (promise, label) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded 30 seconds`)), 30000); })]); }
  finally { clearTimeout(timer); }
};
const selectors = { notebook: '#modal', pause: '#modal', texts: '#mission-inbox', story: '#story' };
async function capture(command, index) {
  const view = command.view ?? 'world';
  await timed(render(view, { focus: command.focus, zoom: command.zoom }), 'Capture render');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('img:visible').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  const selector = selectors[view], panel = selector ? page.locator(selector) : null;
  if (panel) await panel.waitFor({ state: 'visible' });
  const file = `${String(index).padStart(3, '0')}-${command.name}.png`;
  const bounds = panel ? await panel.boundingBox() : null;
  const scrolls = panel ? await panel.evaluate(el => ({ vertical: el.scrollHeight > el.clientHeight, horizontal: el.scrollWidth > el.clientWidth })) : null;
  await (command.panelOnly ? panel : page).screenshot({ path: path.join(directory, file), animations: 'disabled' });
  const viewport = manifest.viewport;
  const shot = { index, file, view, focus: command.focus ?? 'actor', zoom: command.zoom ?? null, panelOnly: !!command.panelOnly, bounds, scrolls,
    overflowsViewport: !!bounds && (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > viewport.width || bounds.y + bounds.height > viewport.height) };
  manifest.shots.push(shot);
  return shot;
}
async function runCommand(command) {
  let reply = await timed(execute(command), 'Scenario command');
  manifest.steps.push(reply);
  manifest.finalState = reply.state;
  if (reply.status === 'passed' && reply.command.op === 'capture' && page) {
    try { reply.shot = await capture(reply.command, reply.index); }
    catch (error) { reply.status = 'failed'; reply.error = `Capture: ${error.message}`; }
  }
  if (stream) process.stdout.write(JSON.stringify(reply) + '\n');
  if (reply.status === 'failed') throw new Error(`Step ${reply.index}${reply.command?.label ? ` (${reply.command.label})` : ''}: ${reply.error}`);
}

try {
  const { values } = parseArgs({ options: {
    scenario: { type: 'string' }, output: { type: 'string' }, width: { type: 'string' }, height: { type: 'string' },
    stdin: { type: 'boolean' }, json: { type: 'boolean' }, list: { type: 'boolean' }, help: { type: 'boolean' }, touch: { type: 'boolean' },
  }, allowPositionals: false });
  json = !!values.json; stream = !!values.stdin;
  // Attach the async iterator before Vite/browser startup. Short piped inputs
  // can reach EOF during startup and must still be replayed command by command.
  if (stream && !values.help) { inputLines = createInterface({ input: process.stdin, crlfDelay: Infinity }); inputIterator = inputLines[Symbol.asyncIterator](); }
  if (values.help) process.stdout.write(help);
  else {
    if (!values.list && !!values.scenario === stream) throw new Error('Choose exactly one of --scenario PATH or --stdin');
    if (values.list && (values.scenario || stream || values.output)) throw new Error('--list cannot be combined with a scenario, stdin or output');
    const dimension = (name, fallback) => {
      const n = values[name] === undefined ? fallback : Number(values[name]);
      if (!Number.isInteger(n) || n < 240 || n > 4096) throw new Error(`--${name} must be an integer in [240, 4096]`);
      return n;
    };
    const viewport = { width: dimension('width', 1440), height: dimension('height', 900) };
    const png = !json && !values.list;
    server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, logLevel: 'silent',
      server: { middlewareMode: true, hmr: false }, appType: png ? 'spa' : 'custom' });
    const { ScenarioRunner, parseScenario } = await server.ssrLoadModule('/src/scenarios/runner.ts');
    const scenario = values.scenario ? parseScenario(JSON.parse(await readFile(values.scenario, 'utf8'))) : { version: 1, name: 'stdin', options: {}, steps: [] };
    if (values.list) process.stdout.write(JSON.stringify(new ScenarioRunner().inputs(), null, 2) + '\n');
    else {
      if (png || values.output) {
        const stem = scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
        directory = path.resolve(values.output ?? `scenario-runs/${stem}-${Date.now()}`);
        await mkdir(path.dirname(directory), { recursive: true });
        // Exclusive directory reservation prevents all accidental artifact overwrites.
        await mkdir(directory);
      }
      manifest = { version: 1, name: scenario.name, engine: png ? 'actual-app-chromium' : 'headless-game',
        viewport: png ? viewport : null, touch: !!values.touch,
        note: 'Stateful Game with persistence disabled. place/pickup/deliver explicitly use fixture placement; step runs 120 Hz physics; advance runs the chronological campaign scheduler without physics. Facts are injected hypotheses, not discovered evidence.',
        options: scenario.options, inputs: null, initialState: null, finalState: null, steps: [], shots: [], status: 'running' };
      if (png) {
        // Own the listener: Vite's non-middleware server treats stdin EOF as a
        // signal to exit, which would discard short piped command streams.
        httpServer = createHttpServer(server.middlewares);
        await new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(0, '127.0.0.1', resolve); });
        const origin = `http://127.0.0.1:${httpServer.address().port}`;
        browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: !!values.touch, hasTouch: !!values.touch, reducedMotion: 'reduce' });
        page = await context.newPage(); page.setDefaultTimeout(10000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await context.route('**/*', route => {
          if (new URL(route.request().url()).origin === origin) return route.continue();
          externalRequests.push(route.request().url()); return route.abort();
        });
        await page.goto(`${origin}/?scenario-preview=1`);
        await page.waitForFunction(() => !!window.__scenario);
        const start = await page.evaluate(options => window.__scenario.start(options), scenario.options ?? {});
        manifest.inputs = start.inputs; manifest.options = start.inputs.options; manifest.initialState = start.state;
        execute = command => page.evaluate(command => window.__scenario.execute(command), command);
        render = (view, frame) => page.evaluate(({ view, frame }) => window.__scenario.render(view, frame), { view, frame });
      } else {
        runner = new ScenarioRunner(scenario.options);
        manifest.inputs = runner.inputs(); manifest.options = runner.options; manifest.initialState = runner.snapshot();
        execute = async command => runner.execute(command);
      }
      manifest.finalState = manifest.initialState;
      if (stream) {
        try {
          for await (const line of inputIterator) {
            if (!line.trim()) continue;
            let command;
            try { command = JSON.parse(line); } catch {
              const reply = { index: manifest.steps.length + 1, input: line, status: 'failed', error: 'Invalid JSON', state: manifest.finalState };
              manifest.steps.push(reply); process.stdout.write(JSON.stringify(reply) + '\n');
              throw new Error(`Invalid JSON on command line ${reply.index}`);
            }
            await runCommand(command);
          }
        } finally { inputLines.close(); }
      } else for (const command of scenario.steps) await runCommand(command);
      if (page) {
        manifest.storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
        if (errors.length || externalRequests.length || manifest.storage.local || manifest.storage.session) throw new Error(JSON.stringify({ errors, externalRequests, storage: manifest.storage }));
      }
      manifest.status = 'passed';
    }
  }
} catch (error) {
  process.exitCode = 1;
  if (manifest) {
    manifest.status = 'failed'; manifest.error = error.message;
    if (page && directory) {
      try { await capture({ name: 'failure', view: 'world' }, manifest.steps.length + 1); }
      catch (shotError) { manifest.failureCaptureError = shotError.message; }
    }
  }
  process.stderr.write(`Scenario runner: ${error.message}\n`);
} finally {
  inputLines?.close();
  if (manifest) {
    manifest.errors = errors; manifest.externalRequests = externalRequests;
    if (directory) {
      try { await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' }); }
      catch (error) { process.stderr.write(`Cannot save manifest: ${error.message}\n`); process.exitCode = 1; }
    }
    if (json && !stream) process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
    else process.stderr.write(`${manifest.status.toUpperCase()}: ${manifest.steps.length} commands, ${manifest.shots.length} PNGs${directory ? ` · ${directory}` : ''}\n`);
  }
  await browser?.close();
  if (httpServer?.listening) await new Promise(resolve => httpServer.close(resolve));
  await server?.close();
}

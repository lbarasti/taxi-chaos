import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const help = `Generate PNGs of dialogue in the actual app, with a simulated-state manifest.

Usage: npm run dialogue:preview -- [options]

  --character ID         Character selector (default: bea, or mia in legacy)
                        Use all for the full cast
  --catalogue NAME       campaign (default) or legacy
  --shift N              Simulated campaign shift, 1–15 (15 = campaign finished)
  --flag ID              Set a simulated flag (repeatable; comma-separated also accepted)
  --choice GROUP=OPTION  Commit a simulated choice (repeatable)
  --completed ID         Completed job (repeatable; comma-separated also accepted)
  --failed ID            Failed job (repeatable; comma-separated also accepted)
  --chapter N            Simulated story chapter (default: 1)
  --deliveries N         Campaign deliveries (default: 0)
  --career-deliveries N  Career deliveries (default: campaign deliveries)
  --time SECONDS         Elapsed campaign time (default: 0)
  --job TYPE             fare (default) or parcel
  --model ID             Vehicle model (default: car, or motorcycle for parcels)
  --kind ROLE            taxi (default), traffic or police
  --available-only       Show only currently eligible jobs (default: show all copy)
  --mission ID           Render just one matching job
  --view NAME            both (default), offer or pickup
  --width N              Viewport width (default: 1440)
  --height N             Viewport height (default: 900)
  --touch                Use touch/mobile media queries
  --panel-only           Capture only the actual inbox/dialogue panel
  --list                 List valid characters, flags, choices and job IDs
  --json                 Emit structured JSON instead of rendering PNGs
  --markdown             Emit readable copy/gates instead of rendering PNGs
  --output PATH          PNG directory (default: dialogue-previews/CHARACTER-shift-N)
                        For --json/--markdown/--list: a new text file
  --help                Show this help

PNG mode uses isolated headless Chromium and the real app's styles, portraits,
inbox and pickup panel. Install its browser once: npx playwright install chromium
Set CHROMIUM_PATH to use an existing Chromium executable instead.
All state starts fresh; no normal saves/settings are read or written. No driving
is required. Locked copy is deliberately staged; manifest.json explains its gates.
For clean JSON on stdout, use node tools/dialogue-preview.mjs --json ...
`;

let server, browser;
try {
  const strings = ['character', 'catalogue', 'shift', 'chapter', 'deliveries', 'career-deliveries', 'time', 'job', 'model', 'kind', 'output', 'mission', 'view', 'width', 'height'];
  const lists = ['flag', 'choice', 'completed', 'failed'];
  const booleans = ['available-only', 'list', 'json', 'markdown', 'help', 'touch', 'panel-only'];
  const { values } = parseArgs({ options: Object.fromEntries([
    ...strings.map(name => [name, { type: 'string' }]),
    ...lists.map(name => [name, { type: 'string', multiple: true }]),
    ...booleans.map(name => [name, { type: 'boolean' }]),
  ]), allowPositionals: false });
  if (values.help) process.stdout.write(help);
  else {
    const catalogueName = values.catalogue ?? 'campaign';
    if (!['campaign', 'legacy'].includes(catalogueName)) throw new Error('--catalogue must be campaign or legacy');
    if (values.json && values.markdown) throw new Error('Choose either --json or --markdown');
    const view = values.view ?? 'both';
    if (!['both', 'offer', 'pickup'].includes(view)) throw new Error('--view must be both, offer or pickup');
    const ids = name => (values[name] ?? []).flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean);
    const choices = {};
    for (const value of values.choice ?? []) {
      const match = /^([a-z][a-z0-9-]*)=([a-z][a-z0-9-]*)$/.exec(value);
      if (!match) throw new Error(`Expected --choice GROUP=OPTION, got: ${value}`);
      if (Object.hasOwn(choices, match[1]) && choices[match[1]] !== match[2]) throw new Error(`Conflicting choices for ${match[1]}`);
      choices[match[1]] = match[2];
    }
    const number = name => {
      if (values[name] === undefined) return undefined;
      if (!values[name].trim() || !Number.isFinite(Number(values[name]))) throw new Error(`--${name} must be numeric`);
      return Number(values[name]);
    };
    const state = { character: values.character, shift: number('shift'), chapter: number('chapter'),
      deliveries: number('deliveries'), careerDeliveries: number('career-deliveries'), time: number('time'),
      flags: ids('flag'), choices, completed: ids('completed'), failed: ids('failed'),
      jobType: values.job, model: values.model, kind: values.kind, availableOnly: values['available-only'] };
    const viewport = { width: number('width') ?? 1440, height: number('height') ?? 900 };
    for (const [name, value] of Object.entries(viewport)) if (!Number.isInteger(value) || value < 240 || value > 4096) throw new Error(`--${name} must be an integer in [240, 4096]`);
    const png = !values.list && !values.json && !values.markdown;
    // SSR loads the same TS/JSON graph for eligibility. PNG mode also serves the
    // real app locally, exclusively to a fresh Playwright browser context.
    server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
      logLevel: 'silent', server: { middlewareMode: !png, hmr: false, host: '127.0.0.1', port: 0 }, appType: png ? 'spa' : 'custom' });
    const { defaultCompiledMap } = await server.ssrLoadModule('/src/map/compile.ts');
    const { openShoreMissions, missionsFor } = await server.ssrLoadModule('/src/missions/compile.ts');
    const { generateDialoguePreview, dialoguePreviewMarkdown, previewInputs } = await server.ssrLoadModule('/src/missions/dialogue-preview.ts');
    const catalogue = catalogueName === 'campaign' ? openShoreMissions(defaultCompiledMap) : missionsFor(defaultCompiledMap);
    let output;
    if (values.list) {
      const inputs = previewInputs(catalogue);
      output = values.json ? JSON.stringify({ catalogue: catalogueName, ...inputs }, null, 2) + '\n' : [
        `Catalogue: ${catalogueName}`, 'Characters:', ...inputs.characters.map(c => `  ${c.id}: ${c.name} (${c.jobs} jobs)`),
        'Flags:', ...inputs.flags.map(flag => `  ${flag}`), 'Choices:', ...Object.entries(inputs.choices).map(([group, options]) => `  ${group}=${options.join(' | ')}`),
        'Jobs:', ...inputs.missions.map(id => `  ${id}`), '',
      ].join('\n');
    } else {
      const preview = generateDialoguePreview(catalogue, state);
      if (values.mission) {
        if (!catalogue.missions[values.mission]) throw new Error(`Unknown mission: ${values.mission}`);
        preview.jobs = preview.jobs.filter(job => job.id === values.mission);
        if (!preview.jobs.length) throw new Error('Mission does not match the character/state selection');
      }
      if (png) {
        const directory = path.resolve(values.output ?? `dialogue-previews/${preview.character}-shift-${preview.context.shift}`);
        const shots = preview.jobs.flatMap(job => [
          ...(view !== 'pickup' && job.messages.some(message => message.trigger === 'offer') ? [{ missionId: job.id, view: 'offer' }] : []),
          ...(view !== 'offer' && job.messages.some(message => message.selected && message.trigger !== 'offer') ? [{ missionId: job.id, view: 'pickup' }] : []),
        ]).map(shot => ({ ...shot, file: `${shot.missionId}-${shot.view}.png` }));
        if (!shots.length) throw new Error('No messages match this selection; try without --available-only or choose another view');
        // Refuse to replace any existing review artifact.
        for (const file of ['manifest.json', 'preview.md', ...shots.map(shot => shot.file)]) {
          try { await access(path.join(directory, file)); throw new Error(`Output already exists: ${path.join(directory, file)}`); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        await server.listen();
        const address = server.httpServer.address();
        const origin = `http://127.0.0.1:${address.port}`;
        browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: !!values.touch, hasTouch: !!values.touch });
        const page = await context.newPage();
        const errors = [], externalRequests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await context.route('**/*', route => {
          if (new URL(route.request().url()).origin === origin) return route.continue();
          externalRequests.push(route.request().url()); return route.abort();
        });
        await page.goto(`${origin}/?dialogue-preview=1`);
        await page.waitForFunction(() => typeof window.__dialoguePreview === 'function');
        await page.evaluate(() => document.fonts.ready);
        await mkdir(directory, { recursive: true });
        for (const shot of shots) {
          await page.evaluate(({ state, shot, legacy }) => window.__dialoguePreview(state, shot.missionId, shot.view, legacy), { state, shot, legacy: catalogueName === 'legacy' });
          const selector = shot.view === 'offer' ? '#mission-inbox' : '#story';
          const panel = page.locator(selector);
          await panel.waitFor({ state: 'visible' });
          await panel.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          shot.bounds = await panel.boundingBox();
          shot.scrolls = await panel.evaluate(element => ({ vertical: element.scrollHeight > element.clientHeight, horizontal: element.scrollWidth > element.clientWidth }));
          shot.overflowsViewport = shot.bounds.x < 0 || shot.bounds.y < 0 || shot.bounds.x + shot.bounds.width > viewport.width || shot.bounds.y + shot.bounds.height > viewport.height;
          await (values['panel-only'] ? panel : page).screenshot({ path: path.join(directory, shot.file) });
        }
        const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
        if (errors.length || externalRequests.length || storage.local || storage.session) throw new Error(JSON.stringify({ errors, externalRequests, storage }));
        const manifest = { catalogue: catalogueName, viewport, touch: !!values.touch, panelOnly: !!values['panel-only'],
          note: 'Actual app UI. Locked copy is staged for review, not made eligible. No normal persistence or driving.', ...preview, shots };
        await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
        await writeFile(path.join(directory, 'preview.md'), dialoguePreviewMarkdown(preview), { flag: 'wx' });
        process.stdout.write(`Generated ${shots.length} PNGs in ${directory}\nManifest: ${path.join(directory, 'manifest.json')}\n`);
        for (const shot of shots) process.stdout.write(`${shot.file}${shot.overflowsViewport ? ' — panel exceeds viewport (see manifest)' : shot.scrolls.vertical ? ' — panel scrolls (see manifest)' : ''}\n`);
      } else output = values.json ? JSON.stringify({ catalogue: catalogueName, ...preview }, null, 2) + '\n' : dialoguePreviewMarkdown(preview);
    }
    if (output !== undefined) {
      if (values.output) await writeFile(values.output, output, { flag: 'wx' });
      else process.stdout.write(output);
    }
  }
} catch (error) {
  process.stderr.write(`Dialogue preview: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}

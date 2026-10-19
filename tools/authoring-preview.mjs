import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const help = `Prepare and review catalogue artwork in the actual standalone game.

Usage: npm run authoring:preview -- --entity ID [options]

  --input PATH        Placement fixture (a JSON array of country props) or a full
                      strict version-3 map JSON (default: src/map/default-map.json)
  --base PATH         Base version-3 map for an array fixture (default: src/map/default-map.json)
  --entity ID         Stable entity ID to inspect (repeatable selection is not supported)
  --list              List catalogue types and stable placed entity IDs
  --json              DOM-free report (no Chromium)
  --output PATH       PNG directory (default: scenario-runs/authoring/ENTITY-TIMESTAMP)
                      For --json/--list: a new text file
  --layout LIST       all (default), or comma-separated desktop,touch-portrait,touch-landscape
  --width N           One custom viewport width (240–4096)
  --height N          One custom viewport height (240–4096)
  --touch             Treat a custom viewport as touch/mobile
  --resize W,H        Preview one instance resize through the atomic map operation
  --artwork-scale N   Preview a visual-only per-instance artwork scale (country prop/hotel)
  --type-size W,H     Preview a catalogue type default footprint without editing records
  --drive-from X,Y    Start the taxi here once, then drive into the entity (no mid-drive
                      teleport). The proof passes only when the selected entity's own body
                      is contacted: post-solve overlap, a swept path through it, its own hp
                      loss or its destruction. Damage dealt by any other prop never counts.
  --drive-angle RAD   Heading in radians (default: aim at the entity)
  --drive-seconds N   Maximum physical drive time (default: 3)
  --drive-keys LIST   Comma-separated key codes (default: KeyW)
  --standalone PATH   Use an existing standalone index.html instead of building a fresh one
  --help              Show this help

PNG mode uses an isolated headless Chromium context, clears storage before the app
starts and loads one self-contained offline HTML file. It reports console errors,
external requests, page/HUD overflow and the exact compiled geometry in manifest.json.
Invalid drafts stay inspectable with --json but never construct a gameplay preview.
A failed drive proof writes manifest.json with status "failed" before the command exits
nonzero, so the screenshots and checks stay inspectable.
For clean JSON stdout, invoke node tools/authoring-preview.mjs --json ... directly.
--list prints only IDs that resolve to an inspectable physical body; a nearby blocker
from a procedural prop is labelled "runtime-prop-N", which is not a stable entity ID.
`

let server, browser, tempDirectory;
class BlockedDraft extends Error {}
const externalRequests = [], consoleErrors = [], pageErrors = [];
const sanitize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
const layoutNames = ['desktop', 'touch-portrait', 'touch-landscape'];
const layouts = {
  desktop: { name: 'desktop', width: 1440, height: 900, touch: false },
  'touch-portrait': { name: 'touch-portrait', width: 390, height: 844, touch: true },
  'touch-landscape': { name: 'touch-landscape', width: 844, height: 390, touch: true },
};
const text = value => typeof value === 'string' && value.length > 0;
const fail = message => { throw new Error(message); };

try {
  const { values } = parseArgs({ options: {
    input: { type: 'string' }, base: { type: 'string' }, entity: { type: 'string' }, output: { type: 'string' },
    list: { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean' },
    layout: { type: 'string' }, width: { type: 'string' }, height: { type: 'string' }, touch: { type: 'boolean' },
    resize: { type: 'string' }, 'artwork-scale': { type: 'string' }, 'type-size': { type: 'string' },
    'drive-from': { type: 'string' }, 'drive-angle': { type: 'string' }, 'drive-seconds': { type: 'string' }, 'drive-keys': { type: 'string' },
    standalone: { type: 'string' },
  }, allowPositionals: false });
  if (values.help) process.stdout.write(help);
  else {
    if (values.list && values.entity) fail('--list lists every entity; do not combine it with --entity');
    if (values.list && values.resize) fail('--resize applies to one --entity, not --list');
    if (values.list && (values['artwork-scale'] !== undefined || values['type-size'] !== undefined)) fail('--artwork-scale and --type-size apply to one --entity, not --list');
    if (!values.list && !text(values.entity)) fail('--entity is required (use --list to find a stable ID)');
    let resize;
    if (values.resize) {
      const [width, height, extra] = values.resize.split(',').map(Number);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || extra !== undefined) fail('--resize needs positive W,H metres');
      resize = { width, height };
    }
    let artworkScale;
    if (values['artwork-scale'] !== undefined) {
      const value = Number(values['artwork-scale']);
      if (!Number.isFinite(value) || value <= 0 || value > 100) fail('--artwork-scale must be a finite number in (0, 100]');
      artworkScale = value;
    }
    let typeSize;
    if (values['type-size'] !== undefined) {
      const [width, height, extra] = values['type-size'].split(',').map(Number);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || extra !== undefined) fail('--type-size needs positive W,H metres');
      typeSize = { width, height };
    }
    if (values.width !== undefined || values.height !== undefined) {
      if (values.layout) fail('Choose --layout or an explicit --width/--height, not both');
      if (!values.width || !values.height) fail('Declare --width and --height together');
    }
    const integer = (name, fallback) => {
      const value = values[name] === undefined ? fallback : Number(values[name]);
      if (!Number.isInteger(value) || value < 240 || value > 4096) fail(`--${name} must be an integer in [240, 4096]`);
      return value;
    };
    let selected;
    if (values.layout) {
      if (values.layout === 'all') selected = layoutNames.map(name => layouts[name]);
      else {
        selected = values.layout.split(',').map(name => name.trim()).filter(Boolean).map(name => layouts[name] ?? fail(`Unknown layout: ${name}`));
        if (!selected.length) fail('--layout needs at least one layout');
      }
    } else if (values.width !== undefined || values.height !== undefined) {
      const width = integer('width'), height = integer('height');
      selected = [{ name: values.touch ? 'touch' : 'desktop', width, height, touch: !!values.touch }];
    } else selected = layoutNames.map(name => layouts[name]);

    const number = (name, fallback, min, max) => {
      if (values[name] === undefined) return fallback;
      const value = Number(values[name]);
      if (!Number.isFinite(value) || value < min || value > max) fail(`--${name} must be a finite number in [${min}, ${max}]`);
      return value;
    };
    let drive;
    if (values['drive-from']) {
      const [x, y, extra] = values['drive-from'].split(',').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y) || extra !== undefined) fail('--drive-from needs X,Y metres');
      const angle = values['drive-angle'] === undefined ? undefined : number('drive-angle', 0, -Math.PI * 2, Math.PI * 2);
      const seconds = number('drive-seconds', 3, 0.1, 30);
      const keys = (values['drive-keys'] ?? 'KeyW').split(',').map(key => key.trim()).filter(Boolean);
      if (!keys.length) fail('--drive-keys needs at least one key code');
      drive = { start: { x, y }, angle, seconds, keys };
    } else if (values['drive-angle'] !== undefined || values['drive-seconds'] !== undefined || values['drive-keys'] !== undefined) {
      fail('--drive-angle, --drive-seconds and --drive-keys require --drive-from');
    }

    const inputPath = path.resolve(values.input ?? 'src/map/default-map.json');
    server = await createServer({ root, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
    const { importMap, revision } = await server.ssrLoadModule('/src/map/serialization.ts');
    const { applyOperations } = await server.ssrLoadModule('/src/map/operations.ts');
    const { inspectAuthoring, listAuthoring } = await server.ssrLoadModule('/src/catalogue/authoring.ts');
    const { objectDefinitions } = await server.ssrLoadModule('/src/artwork/catalogue.ts');
    // `--input` accepts either a full strict map or a small authored placement fixture
    // (a JSON array of country props) composed onto the current default map. The fixture
    // never copies the 75 KB default map, so it cannot drift when the base map changes.
    const source = JSON.parse(await readFile(inputPath, 'utf8'));
    let document;
    if (Array.isArray(source)) {
      const basePath = path.resolve(values.base ?? 'src/map/default-map.json');
      const base = JSON.parse(await readFile(basePath, 'utf8'));
      document = importMap(JSON.stringify({ ...base, countryProps: [...base.countryProps, ...source] }));
    } else document = importMap(JSON.stringify(source));
    if (resize) {
      // Reuse the committed map operations, so an instance resize is the exact same
      // atomic edit the map CLI and `__taxi.map` automation apply rather than a
      // bespoke preview-only mutation.
      document = applyOperations(document, { baseRevision: revision(document), operations: [{ type: 'resize', targetId: values.entity, width: resize.width, height: resize.height }] }).document;
    }
    if (artworkScale !== undefined) {
      // A visual-only per-instance multiplier; collision stays untouched.
      const prop = document.countryProps.find(p => p.id === values.entity);
      const hotel = document.objectPlacements.find(h => h.id === values.entity);
      if (prop) prop.artworkScale = artworkScale;
      else if (hotel) hotel.artworkScale = artworkScale;
      else fail('--artwork-scale applies to a country prop or object placement');
    }
    // A type-default preview keeps the committed records untouched: only the in-memory
    // catalogue handed to the report and the browser preview is overridden.
    let catalogue = objectDefinitions;
    if (typeSize) {
      const type = document.countryProps.find(p => p.id === values.entity)?.type
        ?? document.objectPlacements.find(h => h.id === values.entity)?.type;
      if (!type || !objectDefinitions[type]) fail('--type-size needs an --entity with a catalogue type');
      catalogue = { ...objectDefinitions, [type]: { ...objectDefinitions[type], width: typeSize.width, height: typeSize.height } };
    }

    if (values.list) {
      const output = listAuthoring(document, catalogue);
      const body = values.json ? JSON.stringify(output, null, 2) + '\n' : [
        `Revision: ${output.revision}`,
        'Types:',
        ...output.types.map(type => `  ${type.id} · ${type.kind} · ${type.width}×${type.height} m${type.image ? ` · image:${type.image}` : ''}${type.variants.length ? ` · variants:${type.variants.join(',')}` : ''}`),
        'Entities:',
        ...output.entities.map(entity => `  ${entity.id} · ${entity.type ?? entity.kind} · ${entity.position.x},${entity.position.y} m${entity.bodies > 1 ? ` · ${entity.bodies} bodies` : ''}`),
        '',
      ].join('\n');
      if (values.output) {
        await mkdir(path.dirname(path.resolve(values.output)), { recursive: true });
        await writeFile(path.resolve(values.output), body, { flag: 'wx' });
        process.stderr.write(`Wrote ${path.resolve(values.output)}\n`);
      } else process.stdout.write(body);
    } else {
      const report = inspectAuthoring(document, values.entity, catalogue);
      const payload = { version: 1, input: path.relative(root, inputPath), entity: values.entity, resize: resize ?? null, artworkScale: artworkScale ?? null, typeSize: typeSize ?? null, report, preview: report.preview };
      if (values.json) {
        const body = JSON.stringify(payload, null, 2) + '\n';
        if (values.output) {
          await mkdir(path.dirname(path.resolve(values.output)), { recursive: true });
          await writeFile(path.resolve(values.output), body, { flag: 'wx' });
          process.stderr.write(`Wrote ${path.resolve(values.output)}\n`);
        } else process.stdout.write(body);
        if (!report.preview.allowed) {
          process.stderr.write(`Authoring preview: ${report.preview.reason}\n`);
          process.exitCode = 1;
        }
      } else {
        const directory = path.resolve(values.output ?? `scenario-runs/authoring/${sanitize(values.entity)}-${Date.now()}`);
        await mkdir(path.dirname(directory), { recursive: true });
        await mkdir(directory);
        if (!report.preview.allowed) {
          // Invalid drafts stay inspectable as artifacts, but no Game is built and no
          // gameplay PNG is written.
          const manifest = {
            version: 1, status: 'blocked', engine: 'dom-free-report', input: path.relative(root, inputPath),
            entity: values.entity, resize: resize ?? null, artworkScale: artworkScale ?? null, typeSize: typeSize ?? null, report, preview: report.preview,
            note: 'Validation errors block gameplay preview. Fix the named findings, then rerun.',
            layouts: [], shots: [], errors: [], externalRequests: [], storage: null,
          };
          await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
          process.stderr.write(`Authoring preview: gameplay preview blocked — ${report.preview.reason}\nReport: ${path.join(directory, 'manifest.json')}\n`);
          process.exitCode = 1;
          throw new BlockedDraft();
        }
        let standalonePath = values.standalone ? path.resolve(values.standalone) : undefined;
        let standaloneLabel = standalonePath ? path.relative(root, standalonePath) : 'fresh-standalone-build';
        if (!standalonePath) {
          tempDirectory = await mkdtemp(path.join(tmpdir(), 'taxi-authoring-'));
          await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'silent', build: { outDir: tempDirectory, emptyOutDir: true } });
          standalonePath = path.join(tempDirectory, 'index.html');
        }
        try { await access(standalonePath); } catch { fail(`Standalone HTML not found: ${standalonePath}`); }
        const origin = pathToFileURL(standalonePath).href;
        browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
        const manifest = {
          version: 1, status: 'running', engine: 'actual-standalone-html', input: path.relative(root, inputPath),
          entity: values.entity, resize: resize ?? null, artworkScale: artworkScale ?? null, typeSize: typeSize ?? null, standalone: standaloneLabel, report, drive: null,
          note: 'Fresh isolated context; storage cleared before app creation; one self-contained offline HTML file; no normal save/settings; deterministic driver starts once before physics.',
          layouts: [], shots: [], errors: [], externalRequests: [], storage: null, handoff: null,
        };
        for (const layout of selected) {
          const context = await browser.newContext({ viewport: { width: layout.width, height: layout.height }, deviceScaleFactor: 1, isMobile: layout.touch, hasTouch: layout.touch, reducedMotion: 'reduce' });
          await context.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* file:// may deny storage */ } });
          const page = await context.newPage(); page.setDefaultTimeout(20000);
          page.on('pageerror', error => pageErrors.push(`[${layout.name}] ${error.message}`));
          page.on('console', message => { if (message.type() === 'error') consoleErrors.push(`[${layout.name}] ${message.text()}`); });
          await context.route('**/*', route => {
            const url = route.request().url();
            if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
            externalRequests.push(url); return route.abort();
          });
          try {
            await page.goto(`${origin}?authoring-preview=1`);
            await page.waitForFunction(() => typeof window.__authoringPreview?.open === 'function');
            await page.evaluate(input => window.__authoringPreview.open(input), { document, entity: values.entity, ...(typeSize ? { catalogue } : {}), ...(drive ? { drive } : {}) });
            await page.evaluate(() => document.fonts.ready);
            const layoutState = await page.evaluate(() => window.__authoringPreview.layout());
            const shot = async name => {
              const file = `${sanitize(values.entity)}-${layout.name}${name === 'entity' ? '' : `-${name}`}.png`;
              await page.screenshot({ path: path.join(directory, file), animations: 'disabled' });
              const bounds = await page.evaluate(() => window.__authoringPreview.layout());
              // Prove the HUD's own overflow is reachable: a short panel scrolls to its
              // last line instead of hiding it, and it never covers the driving controls.
              const reveal = await page.evaluate(() => window.__authoringPreview.revealHud());
              manifest.shots.push({
                name, layout: layout.name, file,
                viewport: bounds.viewport, scroll: bounds.scroll, hud: bounds.hud, hudScroll: bounds.hudScroll,
                overflowsViewport: bounds.overflowsViewport, hudOverflowsViewport: bounds.hudOverflowsViewport,
                hudClipsContent: bounds.hudClipsContent, hudOverlapsControls: bounds.hudOverlapsControls, hudReveal: reveal,
              });
              return file;
            };
            await shot('entity');
            if (drive) {
              const proof = await page.evaluate(config => window.__authoringPreview.drive(config), drive);
              await shot('impact');
              manifest.drive = proof;
            }
            const storage = await page.evaluate(() => {
              try { return { local: localStorage.length, session: sessionStorage.length }; }
              catch (error) { return { unavailable: String(error.message) }; }
            });
            manifest.layouts.push({ ...layout, ...layoutState, storage, state: await page.evaluate(() => window.__authoringPreview.state()) });
            if (layoutState.overflowsViewport || layoutState.hudOverflowsViewport) throw new Error(`Layout ${layout.name} overflows the viewport`);
            if (layoutState.hudOverlapsControls) throw new Error(`Layout ${layout.name} covers the on-screen driving controls`);
            if ('local' in storage && (storage.local || storage.session)) throw new Error(`Layout ${layout.name} wrote storage`);
            manifest.storage = storage;
          } finally {
            try {
              // Prove the handoff with the live main game: after `realtime()` releases the
              // clock, real wall-clock frames must advance simulation time. A screenshot
              // difference alone could be ambient motion, and the restored flag alone would
              // not catch a dead animation loop.
              manifest.handoff = await page.evaluate(async () => {
                const api = window.__authoringPreview;
                api?.realtime();
                const before = api?.probe() ?? null;
                await new Promise(resolve => setTimeout(resolve, 400));
                const after = api?.probe() ?? null;
                return { ...(api?.handoff() ?? null), before, after };
              });
            } catch { /* page may have failed before opening */ }
            await context.close();
          }
        }
        if (consoleErrors.length || pageErrors.length || externalRequests.length) throw new Error(JSON.stringify({ consoleErrors, pageErrors, externalRequests }));
        if (manifest.drive && !manifest.drive.passed) {
          // A failed proof still writes its artifacts, so the run can be inspected before
          // the command exits nonzero.
          manifest.status = 'failed';
          manifest.errors = [...pageErrors, ...consoleErrors];
          manifest.externalRequests = externalRequests;
          await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
          process.stderr.write(`Authoring preview: failed manifest written to ${path.join(directory, 'manifest.json')}\n`);
          fail(`Drive proof did not collide physically: ${JSON.stringify(manifest.drive.checks)}`);
        }
        manifest.status = 'passed';
        manifest.errors = [...pageErrors, ...consoleErrors];
        manifest.externalRequests = externalRequests;
        await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
        process.stdout.write(`Generated ${manifest.shots.length} PNGs in ${directory}\nManifest: ${path.join(directory, 'manifest.json')}\n`);
        for (const item of manifest.shots) process.stdout.write(`${item.file}${item.overflowsViewport || item.hudOverflowsViewport ? ' — overflow (see manifest)' : ''}${item.hudClipsContent ? ' — HUD scrolls (see manifest)' : ''}\n`);
      }
    }
  }
} catch (error) {
  if (!(error instanceof BlockedDraft)) {
    process.stderr.write(`Authoring preview: ${error.message}\n`);
    process.exitCode = 1;
  }
} finally {
  await browser?.close();
  await server?.close();
  if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
}

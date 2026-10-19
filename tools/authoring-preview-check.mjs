// Offline checks for the reusable authoring preview CLI. Run with `npm run authoring:test`.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { build } from 'vite';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const example = 'tools/examples/map-authoring.json';
const conflict = 'tools/examples/map-authoring-conflict.json';
const run = (args, timeout = 60000) => {
  const result = spawnSync(process.execPath, ['tools/authoring-preview.mjs', ...args], { cwd, encoding: 'utf8', timeout, maxBuffer: 16e6 });
  if (result.error) throw result.error;
  return result;
};
const json = result => JSON.parse(result.stdout);
const chromiumReady = existsSync(chromium.executablePath());
const temporary = () => mkdtempSync(path.join(tmpdir(), 'taxi-authoring-'));
// One offline standalone build is shared by the browser cases below; the CLI accepts
// `--standalone`, so each run reuses the same real game instead of rebuilding it.
let standaloneDirectory;
const standaloneHtml = async () => {
  if (!standaloneDirectory) {
    standaloneDirectory = temporary();
    await build({ root: cwd, configFile: path.join(cwd, 'vite.config.ts'), logLevel: 'silent', build: { outDir: standaloneDirectory, emptyOutDir: true } });
  }
  return path.join(standaloneDirectory, 'index.html');
};
after(() => { if (standaloneDirectory) rmSync(standaloneDirectory, { recursive: true, force: true }); });

test('--list --json reports catalogue types and stable entity IDs', () => {
  const result = run(['--input', example, '--list', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const list = json(result);
  assert.ok(list.types.find(type => type.id === 'bakery' && type.image === 'bakery'));
  assert.ok(list.types.find(type => type.id === 'shipping-crate'));
  assert.ok(list.entities.find(entity => entity.id === 'authoring-bakery' && entity.type === 'bakery'));
  assert.ok(list.entities.find(entity => entity.id === 'authoring-crate' && entity.type === 'shipping-crate'));
  // The small fixture is composed onto the current default map, so base entities and the
  // two authored placements coexist without copying (or drifting from) the 75 KB map.
  assert.ok(list.entities.some(entity => entity.id === 'villa-cedar-house'));
  const raw = JSON.parse(readFileSync(path.join(cwd, example), 'utf8'));
  assert.ok(Array.isArray(raw) && raw.length === 3, 'the example fixture stays a small placement list');
});

test('--json inspects real compiled geometry and the generated inline manifest', () => {
  const result = run(['--input', example, '--entity', 'authoring-bakery', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const { report } = json(result);
  assert.equal(report.entity.type, 'bakery');
  assert.deepEqual([report.entity.bodies[0].width, report.entity.bodies[0].height], [12, 8]);
  assert.equal(report.artwork.image, 'bakery');
  assert.deepEqual(report.artwork.manifest, { inline: true, measured: true });
  assert.ok(Math.abs(report.artwork.bounds.width - 12.6) < 1e-9);
  assert.equal(report.shadow.casts, true);
  assert.equal(report.lightBlocker.silhouette.length, 4);
  assert.ok(report.cullingRadius > 6);
  assert.ok(report.nearbyRoutes.length > 0);
  assert.equal(report.preview.allowed, true);
});

test('--resize previews one instance through the atomic map operation', () => {
  const result = run(['--input', example, '--entity', 'authoring-bakery', '--resize', '24,16', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = json(result);
  assert.deepEqual(payload.resize, { width: 24, height: 16 });
  assert.deepEqual([payload.report.entity.bodies[0].width, payload.report.entity.bodies[0].height], [24, 16]);
  assert.ok(Math.abs(payload.report.artwork.bounds.width - 25.2) < 1e-9);
  assert.equal(payload.report.preview.allowed, true);
});

test('--artwork-scale previews the drawing alone and --type-size previews a type default', () => {
  const scaled = json(run(['--input', example, '--entity', 'authoring-bakery', '--artwork-scale', '2', '--json']));
  assert.equal(scaled.artworkScale, 2);
  // Collision stays at the resolved footprint while the drawing doubles.
  assert.deepEqual([scaled.report.entity.bodies[0].width, scaled.report.entity.bodies[0].height], [12, 8]);
  assert.ok(Math.abs(scaled.report.artwork.bounds.width - 25.2) < 1e-9);

  const typed = json(run(['--input', example, '--entity', 'authoring-bakery', '--type-size', '24,16', '--json']));
  assert.deepEqual(typed.typeSize, { width: 24, height: 16 });
  // A type-default preview changes the compiled footprint and the drawing together.
  assert.deepEqual([typed.report.entity.bodies[0].width, typed.report.entity.bodies[0].height], [24, 16]);
  assert.ok(Math.abs(typed.report.artwork.bounds.width - 25.2) < 1e-9);

  const both = json(run(['--input', example, '--entity', 'authoring-bakery', '--type-size', '24,16', '--artwork-scale', '0.5', '--json']));
  assert.ok(Math.abs(both.report.artwork.bounds.width - 12.6) < 1e-9, 'the visual scale multiplies the type-default drawing');
});

test('a typed palm and crate resolve real PNGs with no engine change', () => {
  const list = json(run(['--input', example, '--list', '--json']));
  assert.ok(list.types.find(type => type.id === 'palm' && type.image === 'palm' && type.artwork === true));
  assert.ok(list.entities.find(entity => entity.id === 'authoring-palm' && entity.type === 'palm'));

  const palm = json(run(['--input', example, '--entity', 'authoring-palm', '--json'])).report;
  // A prop kind that also has a procedural district renderer still resolves the same
  // shared catalogue artwork: the committed PNG is inline and measured, the collision
  // footprint is the type default and the drawing is the authored 6 m canopy.
  assert.equal(palm.artwork.image, 'palm');
  assert.deepEqual(palm.artwork.manifest, { inline: true, measured: true });
  assert.deepEqual([palm.entity.bodies[0].width, palm.entity.bodies[0].height], [0.8, 0.8]);
  assert.ok(Math.abs(palm.artwork.bounds.width - 6) < 1e-9);
  assert.equal(palm.artwork.silhouette.length, 12);
  assert.equal(palm.preview.allowed, true);

  // The same three visual exercises apply to a prop: instance resize, visual-only scale
  // and type default, with collision and drawing moving together only where they should.
  const resized = json(run(['--input', example, '--entity', 'authoring-palm', '--resize', '1.6,1.6', '--json'])).report;
  assert.deepEqual([resized.entity.bodies[0].width, resized.entity.bodies[0].height], [1.6, 1.6]);
  assert.ok(Math.abs(resized.artwork.bounds.width - 12) < 1e-9);
  const visual = json(run(['--input', example, '--entity', 'authoring-palm', '--artwork-scale', '0.5', '--json'])).report;
  assert.deepEqual([visual.entity.bodies[0].width, visual.entity.bodies[0].height], [0.8, 0.8]);
  assert.ok(Math.abs(visual.artwork.bounds.width - 3) < 1e-9);
  const typed = json(run(['--input', example, '--entity', 'authoring-palm', '--type-size', '1.6,1.6', '--json'])).report;
  assert.deepEqual([typed.entity.bodies[0].width, typed.entity.bodies[0].height], [1.6, 1.6]);
  assert.ok(Math.abs(typed.artwork.bounds.width - 12) < 1e-9);
});

test('an invalid draft stays inspectable but blocks gameplay preview', () => {
  const result = run(['--input', conflict, '--entity', 'authoring-bakery-conflict', '--json']);
  assert.equal(result.status, 1);
  const { report } = json(result);
  assert.equal(report.preview.allowed, false);
  assert.match(report.preview.reason, /validation error/);
  assert.ok(report.routeConflicts.some(finding => finding.code === 'road-blocked' && finding.entityIds.includes('authoring-bakery-conflict')));
  assert.match(result.stderr, /block gameplay preview/);
});

test('invalid selections fail loudly', () => {
  assert.match(run(['--input', example, '--json']).stderr, /--entity is required/);
  assert.match(run(['--input', example, '--entity', 'missing-entity', '--json']).stderr, /Unknown entity ID/);
  assert.match(run(['--input', example, '--entity', 'authoring-bakery', '--list', '--json']).stderr, /do not combine/);
  assert.match(run(['--input', example, '--entity', 'authoring-bakery', '--resize', '0,16', '--json']).stderr, /positive W,H/);
  assert.match(run(['--input', example, '--entity', 'authoring-bakery', '--artwork-scale', '0', '--json']).stderr, /--artwork-scale/);
  assert.match(run(['--input', example, '--entity', 'authoring-bakery', '--type-size', '24', '--json']).stderr, /--type-size needs positive W,H/);
  assert.match(run(['--input', example, '--entity', 'villa-cedar-house', '--artwork-scale', '2', '--json']).stderr, /--artwork-scale applies to a country prop or object/);
  assert.match(run(['--input', example, '--entity', 'villa-cedar-house', '--type-size', '2,2', '--json']).stderr, /--type-size needs an --entity with a catalogue type/);
  assert.match(run(['--input', example, '--entity', 'authoring-bakery', '--drive-angle', '0']).stderr, /require --drive-from/);
  assert.match(run(['--input', example, '--entity', 'authoring-bakery', '--layout', 'nope']).stderr, /Unknown layout/);
});

test('--json output files are exclusive and never overwrite', () => {
  const root = temporary();
  try {
    const output = path.join(root, 'report.json');
    assert.equal(run(['--input', example, '--entity', 'authoring-bakery', '--json', '--output', output]).status, 0);
    const body = readFileSync(output, 'utf8');
    assert.equal(run(['--input', example, '--entity', 'authoring-bakery', '--json', '--output', output]).status, 1);
    assert.equal(readFileSync(output, 'utf8'), body);
    assert.ok(!readdirSync(root).some(file => file.endsWith('.png')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('PNG mode loads the actual standalone HTML offline with an isolated context', { skip: !chromiumReady, timeout: 240000 }, () => {
  const root = temporary();
  try {
    const output = path.join(root, 'preview');
    const result = run(['--input', example, '--entity', 'authoring-bakery', '--layout', 'touch-landscape', '--output', output], 240000);
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'passed');
    assert.equal(manifest.engine, 'actual-standalone-html');
    assert.deepEqual(manifest.errors, []);
    assert.deepEqual(manifest.externalRequests, []);
    assert.deepEqual(manifest.storage, { local: 0, session: 0 });
    assert.equal(manifest.handoff.restored, true);
    assert.equal(manifest.handoff.hudHidden, true);
    // Real handoff proof: after `realtime()` releases the clock, wall-clock frames must
    // advance simulation time in the restored game — a dead animation loop would not.
    assert.ok(manifest.handoff.after, 'the live game is readable after handoff');
    assert.equal(manifest.handoff.after.mode, 'playing');
    assert.ok(manifest.handoff.after.time > manifest.handoff.before.time + 0.05, `simulation time advanced: ${JSON.stringify(manifest.handoff)}`);
    assert.equal(manifest.shots.length, 1);
    const shot = manifest.shots[0];
    assert.equal(shot.overflowsViewport, false);
    assert.equal(shot.hudOverflowsViewport, false);
    // The compact HUD clears the on-screen driving controls, reports its own internal
    // overflow, and can scroll to its last line instead of hiding it.
    assert.equal(shot.hudOverlapsControls, false);
    assert.equal(manifest.layouts[0].hudOverlapsControls, false);
    assert.equal(manifest.layouts[0].hudClipsContent, shot.hudClipsContent);
    assert.ok(shot.hudScroll, 'the HUD scroll box is reported');
    assert.equal(shot.hudReveal.revealed, true);
    assert.equal(shot.hudReveal.scrolled, shot.hudReveal.maxScroll);
    assert.equal(manifest.layouts[0].viewport.width, 844);
    assert.equal(readFileSync(path.join(output, shot.file)).subarray(1, 4).toString(), 'PNG');
    const duplicate = run(['--input', example, '--entity', 'authoring-bakery', '--layout', 'touch-landscape', '--output', output], 60000);
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /EEXIST/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--drive-from proves a physical hit on the selected bakery', { skip: !chromiumReady, timeout: 240000 }, async () => {
  const root = temporary();
  try {
    const output = path.join(root, 'bakery-drive');
    const result = run(['--input', example, '--entity', 'authoring-bakery', '--drive-from', '240,450', '--layout', 'desktop', '--output', output, '--standalone', await standaloneHtml()], 240000);
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'passed');
    assert.equal(manifest.drive.passed, true);
    assert.equal(manifest.drive.contacted, true);
    assert.equal(manifest.drive.checks.physicalContact, true);
    assert.equal(manifest.drive.checks.droveForward, true);
    assert.equal(manifest.drive.checks.noMidDriveTeleport, true);
    assert.equal(manifest.drive.checks.stockVehicle, true);
    // Evidence comes from the bakery's own body: post-solve overlap, its swept path or its
    // own response. A building takes no hp damage from an impact, so the run proves the
    // contact geometrically.
    assert.ok(manifest.drive.overlapDepth > 0 || manifest.drive.swept || manifest.drive.entityDamage > 0 || manifest.drive.destroyed, JSON.stringify(manifest.drive));
    // A structural body carries an infinite hp, so its damage evidence stays a finite zero
    // rather than becoming NaN.
    assert.equal(manifest.drive.entityDamage, 0);
    assert.ok(Number.isFinite(manifest.drive.overlapDepth) && Number.isFinite(manifest.drive.damage));
    assert.equal(manifest.shots.length, 2, 'the entity frame and the impact frame');
    assert.ok(manifest.shots[1].file.endsWith('-impact.png'));
    assert.deepEqual(manifest.errors, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--drive-from proves a physical hit on the selected crate', { skip: !chromiumReady, timeout: 240000 }, async () => {
  const root = temporary();
  try {
    const output = path.join(root, 'crate-drive');
    const result = run(['--input', example, '--entity', 'authoring-crate', '--drive-from', '260,450', '--layout', 'desktop', '--output', output, '--standalone', await standaloneHtml()], 240000);
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.drive.passed, true);
    assert.equal(manifest.drive.checks.physicalContact, true);
    // A crate is not structural, so the impact consumes its own hp and destroys it.
    assert.ok(manifest.drive.entityDamage > 0 || manifest.drive.destroyed, JSON.stringify(manifest.drive));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--drive-from rejects a run that only damages the taxi on an unrelated prop', { skip: !chromiumReady, timeout: 240000 }, async () => {
  const root = temporary();
  try {
    const output = path.join(root, 'bakery-miss');
    // From here the taxi meets `authoring-crate` at 260 m and stops short of the bakery at
    // 240 m, so any player damage belongs to a different entity.
    const result = run(['--input', example, '--entity', 'authoring-bakery', '--drive-from', '290,430', '--layout', 'desktop', '--output', output, '--standalone', await standaloneHtml()], 240000);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Drive proof did not collide physically/);
    // The failed proof still writes its manifest and screenshots for inspection.
    assert.match(result.stderr, /failed manifest written to/);
    const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'failed');
    assert.equal(manifest.drive.passed, false);
    assert.equal(manifest.drive.contacted, false);
    assert.equal(manifest.drive.checks.physicalContact, false);
    assert.equal(manifest.drive.entityDamage, 0);
    assert.equal(manifest.drive.overlapDepth, 0);
    assert.equal(manifest.drive.swept, false);
    assert.equal(manifest.drive.checks.droveForward, true, 'the taxi did drive; it simply never touched the bakery');
    // The taxi really did take damage from the unrelated crate, which is exactly what the
    // old generic-damage rule mistook for a hit on the selected entity.
    assert.ok(manifest.drive.damage > 0, `the unrelated crate damages the taxi: ${JSON.stringify(manifest.drive)}`);
    assert.equal(manifest.shots.length, 2, 'the entity frame and the impact frame are still saved');
    assert.equal(readFileSync(path.join(output, manifest.shots[1].file)).subarray(1, 4).toString(), 'PNG');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--drive-from rejects a nearby run that only damages the taxi on the neighbour', { skip: !chromiumReady, timeout: 240000 }, async () => {
  const root = temporary();
  try {
    const output = path.join(root, 'bakery-near-miss');
    // The taxi starts only a few metres clear of the bakery's east face and drives east
    // into the neighbouring `authoring-crate`, so it is damaged while the selected bakery
    // is never touched. Proximity to the selected entity must not read as contact.
    const result = run(['--input', example, '--entity', 'authoring-bakery', '--drive-from', '250,430', '--drive-angle', '0', '--layout', 'desktop', '--output', output, '--standalone', await standaloneHtml()], 240000);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Drive proof did not collide physically/);
    assert.match(result.stderr, /failed manifest written to/);
    const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'failed');
    assert.equal(manifest.drive.passed, false);
    assert.equal(manifest.drive.contacted, false);
    assert.equal(manifest.drive.checks.physicalContact, false);
    assert.equal(manifest.drive.entityDamage, 0);
    assert.equal(manifest.drive.overlapDepth, 0);
    assert.equal(manifest.drive.swept, false);
    assert.equal(manifest.drive.checks.droveForward, true, 'the taxi drove; it simply never touched the bakery');
    // Starting beside the bakery does not matter: the neighbour's damage is not evidence.
    assert.ok(manifest.drive.damage > 0, `the neighbouring crate damages the taxi: ${JSON.stringify(manifest.drive)}`);
    assert.equal(manifest.shots.length, 2, 'the entity frame and the impact frame are still saved');
    assert.equal(readFileSync(path.join(output, manifest.shots[1].file)).subarray(1, 4).toString(), 'PNG');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--drive-from rejects a distant run that never reaches the selected bakery', { skip: !chromiumReady, timeout: 240000 }, async () => {
  const root = temporary();
  try {
    const output = path.join(root, 'bakery-distant');
    // The concrete reproduction: the taxi starts far from the bakery at 240,430 and is
    // given only 1.5 s, so it moves under its own power but cannot arrive. Nothing touches
    // the selected building. Unlike the near and wrong-crate negatives above, a distant run
    // may never touch anything at all, so taxi damage is not required here.
    const result = run(['--input', example, '--entity', 'authoring-bakery', '--drive-from', '7,14', '--drive-seconds', '1.5', '--layout', 'desktop', '--output', output, '--standalone', await standaloneHtml()], 240000);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Drive proof did not collide physically/);
    assert.match(result.stderr, /failed manifest written to/);
    const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'failed');
    assert.equal(manifest.drive.passed, false);
    assert.equal(manifest.drive.contacted, false);
    assert.equal(manifest.drive.checks.physicalContact, false);
    // The taxi still moved under its own power; a distant start is not a stuck vehicle.
    assert.equal(manifest.drive.checks.droveForward, true, 'the taxi drove, it just never reached the bakery');
    assert.equal(manifest.drive.checks.noMidDriveTeleport, true);
    assert.equal(manifest.drive.checks.stockVehicle, true);
    // The selected entity is untouched: no overlap, no sweep, no hp loss, no destruction.
    assert.equal(manifest.drive.entityDamage, 0);
    assert.equal(manifest.drive.overlapDepth, 0);
    assert.equal(manifest.drive.swept, false);
    assert.equal(manifest.drive.destroyed, false);
    // The taxi may never have hit anything, so its own damage is only required to be a
    // finite number, never a positive one.
    assert.ok(Number.isFinite(manifest.drive.damage) && manifest.drive.damage >= 0, `taxi damage is a finite number: ${JSON.stringify(manifest.drive.damage)}`);
    assert.equal(manifest.shots.length, 2, 'the entity frame and the impact frame are still saved');
    assert.equal(readFileSync(path.join(output, manifest.shots[1].file)).subarray(1, 4).toString(), 'PNG');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('map authoring automation applies typed placements and isolates previews', { skip: !chromiumReady, timeout: 240000 }, async () => {
  const errors = [], requests = [];
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* file:// may deny storage */ } });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      requests.push(url); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${pathToFileURL(await standaloneHtml()).href}?debug=1`);
    await page.waitForFunction(() => typeof window.__taxi?.map?.open === 'function');
    // The removed studio must leave no visible entry point or residual editor DOM.
    assert.equal(await page.locator('#map-editor, #map-preview-bar').count(), 0);
    assert.equal(await page.locator('[data-lab="map"]').count(), 0);
    assert.equal(await page.getByText('Map studio', { exact: false }).count(), 0);

    const result = await page.evaluate(() => {
      const lab = window.__taxi, api = lab.map, locks = () => ({ panel: document.querySelector('#debug-panel').inert, app: document.querySelector('#app').inert });
      api.open();
      const opened = api.snapshot();
      const draftLocks = locks();
      const exported = api.export();
      const roundTrip = { revision: api.import(exported).revision === opened.revision, valid: api.validate().errors, canonical: api.export() === exported };
      const size = id => { const bounds = api.describe(id).bounds; return { width: bounds.max.x - bounds.min.x, height: bounds.max.y - bounds.min.y }; };
      // An untyped 1.6 m placement, then a typed bakery placement that resolves the
      // catalogue default through the same atomic operations the CLI uses.
      api.apply({ baseRevision: opened.revision, operations: [{
        type: 'add', collection: 'countryProps',
        descriptor: { id: 'automation-untyped', owner: 'southern-estates', position: { x: 150, y: 450 }, kind: 'crate', angle: 0, color: '#426e58', label: '', width: 1.6, height: 1.6 },
      }] });
      const applied = api.apply({ baseRevision: api.snapshot().revision, operations: [{
        type: 'add', collection: 'countryProps',
        descriptor: { id: 'automation-bakery', owner: 'southern-estates', position: { x: 166, y: 450 }, kind: 'building', angle: 0, color: '#426e58', label: '', type: 'bakery' },
      }] });
      const typed = { size: size('automation-bakery'), descriptor: { ...api.snapshot().document.countryProps.find(p => p.id === 'automation-bakery') } };
      const untyped = size('automation-untyped');
      api.undo();
      const undone = api.snapshot().document.countryProps.some(p => p.id === 'automation-bakery');
      api.redo();
      const redone = api.snapshot().document.countryProps.some(p => p.id === 'automation-bakery');
      const revision = api.snapshot().revision;

      // A structurally valid draft with a real validation error must not build a preview.
      api.apply({ baseRevision: revision, operations: [{ type: 'move', targetId: 'fairway-a', position: { x: 208, y: 310 } }] });
      const invalid = { errors: api.validate().errors, blocked: false, message: '', state: null };
      try { api.preview({ spawnId: 'fairway-club' }); } catch (error) { invalid.blocked = true; invalid.message = error.message; }
      invalid.state = api.previewState();
      api.undo();

      // Preview runs an isolated persistence-disabled game; fixed stepping must not
      // alter the lab game or the draft used to build it.
      const labBefore = { time: lab.state().time, position: lab.state().position };
      const preview = api.preview({ spawnId: 'fairway-club' });
      const previewLocks = locks();
      const stepped = api.step(0.5, ['KeyW']);
      const previewState = api.previewState();
      api.live();
      const edited = api.edit();
      const editLocks = locks();
      const labAfter = { time: lab.state().time, position: lab.state().position };
      const restored = { edited: edited.revision === revision, previewState: api.previewState(), lab: labAfter.time === labBefore.time && labAfter.position.x === labBefore.position.x && labAfter.position.y === labBefore.position.y };

      // A second preview can be closed directly, restoring the pre-open clock and UI.
      api.preview({ spawnId: 'fairway-club' }); api.close();
      return {
        opened: opened.schemaVersion, applied: applied.changedIds, typed, untyped, undone, redone, revision, roundTrip, invalid, draftLocks, previewLocks, editLocks, closedLocks: locks(),
        preview: { mode: preview.mode, time: preview.time, moved: Math.hypot(stepped.position.x - preview.position.x, stepped.position.y - preview.position.y), state: previewState?.time, restored },
        closed: { active: api.previewState(), state: lab.state().lab },
      };
    });
    assert.equal(result.opened, 4);
    assert.ok(result.applied.includes('automation-bakery'));
    assert.equal(result.roundTrip.revision, true);
    assert.equal(result.roundTrip.valid, 0);
    assert.equal(result.roundTrip.canonical, true);
    assert.ok(result.invalid.errors > 0, `the invalid draft reports validation errors: ${JSON.stringify(result.invalid)}`);
    assert.equal(result.invalid.blocked, true);
    assert.match(result.invalid.message, /Preview blocked by/);
    assert.equal(result.invalid.state, null);
    assert.deepEqual(result.draftLocks, { panel: true, app: true });
    assert.deepEqual(result.previewLocks, { panel: true, app: false });
    assert.deepEqual(result.editLocks, { panel: true, app: true });
    assert.deepEqual(result.closedLocks, { panel: false, app: false });
    const metres = (actual, width, height, message) => assert.ok(
      Math.abs(actual.width - width) < 1e-6 && Math.abs(actual.height - height) < 1e-6,
      `${message}: ${JSON.stringify(actual)}`,
    );
    metres(result.untyped, 1.6, 1.6, 'an untyped placement resolves its explicit size');
    metres(result.typed.size, 12, 8, 'a typed placement adopts the bakery default');
    assert.equal(result.typed.descriptor.type, 'bakery');
    assert.equal(result.typed.descriptor.width, undefined);
    assert.equal(result.typed.descriptor.height, undefined);
    assert.equal(result.undone, false, 'undo removed the typed placement');
    assert.equal(result.redone, true, 'redo restored the typed placement');
    assert.equal(result.preview.mode, 'playing');
    assert.ok(result.preview.moved > 0.1, `fixed-step preview moved under its own power: ${JSON.stringify(result.preview)}`);
    assert.ok(Math.abs(result.preview.state - (result.preview.time + 0.5)) < 1e-9, `stepping advanced the preview clock: ${JSON.stringify(result.preview)}`);
    assert.equal(result.preview.restored.edited, true);
    assert.equal(result.preview.restored.previewState, null);
    assert.equal(result.preview.restored.lab, true, 'the lab game is untouched by the isolated preview');
    assert.equal(result.closed.active, null);
    assert.deepEqual(errors, [], 'Browser errors');
    assert.deepEqual(requests, [], 'External runtime requests');
    await context.close();
  } finally { await browser.close(); }
});

test('drafting rejects real input and restores the prior clock on edit and close', { skip: !chromiumReady, timeout: 240000 }, async () => {
  const errors = [], requests = [];
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* file:// may deny storage */ } });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      requests.push(url); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${pathToFileURL(await standaloneHtml()).href}?debug=1`);
    await page.waitForFunction(() => typeof window.__taxi?.map?.open === 'function');
    const snapshot = () => page.evaluate(() => structuredClone(__taxi.state()));
    const locks = () => page.evaluate(() => ({ panel: document.querySelector('#debug-panel').inert, app: document.querySelector('#app').inert }));

    // Drafting must reject every real user path, including keys that would normally
    // clear externalClock, and LAB controls that mutate the original temporary game.
    await page.evaluate(() => __taxi.realtime());
    await page.evaluate(() => __taxi.map.open());
    assert.deepEqual(await locks(), { panel: true, app: true });
    const before = await snapshot();
    await page.keyboard.down('w');
    await page.waitForTimeout(300);
    await page.keyboard.up('w');
    for (const key of ['p', 'g', 'h', 'e', 'r', 'Escape']) await page.keyboard.press(key);
    const controls = await page.evaluate(() => ['live', 'step', 'reset'].map(key => {
      const rect = document.querySelector(`[data-lab="${key}"]`).getBoundingClientRect();
      return { key, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }));
    for (const control of controls) await page.mouse.click(control.x, control.y);
    await page.waitForTimeout(300);
    assert.deepEqual(await snapshot(), before, 'drafting rejected keys, shortcuts and LAB controls');

    // close() restores the clock state that existed before open(): live here.
    await page.evaluate(() => __taxi.map.close());
    assert.deepEqual(await locks(), { panel: false, app: false });
    const liveStart = await snapshot();
    await page.waitForTimeout(350);
    const liveEnd = await snapshot();
    assert.ok(liveEnd.time > liveStart.time, 'close restores a previously live clock');

    // close() also restores a previously frozen clock.
    await page.evaluate(() => __taxi.step(0));
    await page.evaluate(() => { __taxi.map.open(); __taxi.map.close(); });
    const frozenStart = await snapshot();
    await page.waitForTimeout(350);
    assert.equal((await snapshot()).time, frozenStart.time, 'close restores a previously frozen clock');

    // edit() always freezes drafting, even when the prior clock was live.
    await page.evaluate(() => __taxi.realtime());
    await page.evaluate(() => { __taxi.map.open(); __taxi.map.preview({ spawnId: 'fairway-club' }); __taxi.map.edit(); });
    assert.deepEqual(await locks(), { panel: true, app: true });
    const editedStart = await snapshot();
    await page.waitForTimeout(350);
    assert.equal((await snapshot()).time, editedStart.time, 'edit freezes the restored draft');
    await page.evaluate(() => __taxi.map.close());
    const afterEditStart = await snapshot();
    await page.waitForTimeout(350);
    assert.ok((await snapshot()).time > afterEditStart.time, 'close after edit restores the prior live clock');

    // With a previously frozen clock, both edit and close stay frozen.
    await page.evaluate(() => __taxi.step(0));
    await page.evaluate(() => { __taxi.map.open(); __taxi.map.preview({ spawnId: 'fairway-club' }); __taxi.map.edit(); });
    const frozenEditStart = await snapshot();
    await page.waitForTimeout(350);
    assert.equal((await snapshot()).time, frozenEditStart.time, 'edit keeps a frozen prior clock frozen');
    await page.evaluate(() => __taxi.map.close());
    const frozenCloseStart = await snapshot();
    await page.waitForTimeout(350);
    assert.equal((await snapshot()).time, frozenCloseStart.time, 'close keeps a frozen prior clock frozen');

    // Preview keeps physical gameplay live while the LAB panel stays inert.
    await page.evaluate(() => { __taxi.realtime(); __taxi.map.open(); });
    const preview = await page.evaluate(() => __taxi.map.preview({ spawnId: 'fairway-club' }));
    assert.deepEqual(await locks(), { panel: true, app: false });
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    await page.keyboard.up('w');
    const previewAfter = await page.evaluate(() => __taxi.map.previewState());
    assert.ok(previewAfter.time > preview.time, 'physical preview gameplay advances time');
    assert.ok(Math.hypot(previewAfter.position.x - preview.position.x, previewAfter.position.y - preview.position.y) > 0.1, 'physical preview gameplay drives the isolated taxi');
    await page.evaluate(() => __taxi.map.close());
    assert.deepEqual(await locks(), { panel: false, app: false }, 'close restores LAB usability');

    assert.deepEqual(errors, [], 'Browser errors');
    assert.deepEqual(requests, [], 'External runtime requests');
    await context.close();
  } finally { await browser.close(); }
});

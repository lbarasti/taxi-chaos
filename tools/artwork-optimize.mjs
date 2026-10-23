// Display-resolution WebP derivatives for the standalone bundle. Masters stay at full
// resolution beside the catalogue for measurement and future edits; the build imports
// `src/assets/optimized/<same path>.webp` instead. Run after changing authored art:
//
//   npm run artwork:optimize
//   npm run artwork:prep -- --write
//
// `--check` verifies every derivative exists at its budgeted width without encoding.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = resolve(root, 'src/assets');
const check = process.argv.includes('--check');
const portraitWidth = 256;
const quality = 80;

try {
  execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
} catch {
  throw new Error('cwebp is required to regenerate artwork derivatives (brew install webp)');
}

const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { artworkRecords, objectRecords } = await server.ssrLoadModule('/src/catalogue/content.ts');
  const { inlineEntries } = await server.ssrLoadModule('/src/catalogue/generate.ts');
  const { bundledArtworkPath } = await server.ssrLoadModule('/src/catalogue/assets.ts');
  const { measureArtworkSources, readPng, readWebpSize } = await server.ssrLoadModule('/src/catalogue/png.ts');
  const { compileArtworkCatalogue, compileObjectCatalogue, deriveArtwork } = await server.ssrLoadModule('/src/catalogue/compile.ts');
  const { defaultMap } = await server.ssrLoadModule('/src/map/default.ts');
  const { compileMap } = await server.ssrLoadModule('/src/map/compile.ts');
  const { MAX_ZOOM } = await server.ssrLoadModule('/src/rendering/zoom.ts');
  const portraitSourceIds = JSON.parse(readFileSync(resolve(root, 'src/narrative/portrait-manifest.json'), 'utf8'));

  const read = (png) => {
    try { return readFileSync(resolve(assets, png)); }
    catch { return undefined; }
  };

  const entries = inlineEntries(artworkRecords, objectRecords);
  const sources = measureArtworkSources(entries, read);
  const catalogue = compileArtworkCatalogue(artworkRecords, sources);
  const objects = compileObjectCatalogue(objectRecords, sources, artworkRecords);
  // Two device pixels per CSS pixel at the game's closest camera. The largest drawn
  // extent—not the type's default footprint—drives the budget, so a placement resized
  // in the authored map still gets full display resolution.
  const pixelsPerMetre = MAX_ZOOM * 2;

  /** Largest drawn extent of each image in the shipped map, in metres. Placements
   * already fold in their footprint, artwork fit and `artworkScale`. */
  const placed = new Map();
  for (const object of Object.values(compileMap(defaultMap).objects)) {
    const art = object.artwork;
    if (!art) continue;
    const extent = placed.get(art.image) ?? { width: 0, height: 0 };
    extent.width = Math.max(extent.width, art.bounds.width);
    extent.height = Math.max(extent.height, art.bounds.height);
    placed.set(art.image, extent);
  }

  const jobs = [];
  for (const entry of entries) {
    const source = sources[entry.id];
    if (!source) continue; // Vector ground tiles inline as authored.
    const legacy = artworkRecords.find((record) => record.id === entry.id);
    // Start from the type's default drawn extent. Runtime props such as park trees
    // derive artwork from their bodies, so a type default can exceed every map
    // placement; the shipped map can only raise the budget.
    let extent;
    if (legacy) {
      const structure = catalogue.structures[entry.id];
      const grounds = catalogue.ground[entry.id];
      extent = structure ? structure.bounds : { width: grounds.tileMetres, height: grounds.tileMetres };
    } else {
      const record = objectRecords.find((candidate) => candidate.id === entry.id);
      const template = objects[entry.id]?.artwork?.[0];
      if (!record || !template) throw new Error(`Artwork ${entry.id}: no compiled source for its direct image`);
      extent = deriveArtwork(template, record.width, record.height, record.artworkScale ?? 1).bounds;
    }
    const actual = placed.get(entry.id);
    if (actual) extent = { width: Math.max(extent.width, actual.width), height: Math.max(extent.height, actual.height) };
    if (!Number.isFinite(extent.width) || extent.width <= 0 || !Number.isFinite(extent.height) || extent.height <= 0) throw new Error(`Artwork ${entry.id}: missing metric art extent`);
    // The derivative is drawn through the authored crop, so budget the master pixels
    // that survive that crop. Scaling width alone keeps the source aspect.
    const record = legacy ?? objectRecords.find((candidate) => candidate.id === entry.id);
    const crop = record?.crop ?? source.crop ?? { x: 0, y: 0, width: source.width, height: source.height };
    const scale = Math.max(extent.width * pixelsPerMetre / crop.width, extent.height * pixelsPerMetre / crop.height);
    const target = Math.min(source.width, Math.max(64, Math.ceil(source.width * scale)));
    jobs.push({ group: 'map', id: entry.id, source: entry.png, output: bundledArtworkPath(entry.png), masterWidth: source.width, target });
  }

  for (const id of portraitSourceIds) {
    const source = `characters/${id}`;
    const bytes = read(source);
    if (!bytes) throw new Error(`Portrait ${id}: missing master ${source}`);
    const measured = readPng(bytes);
    if (!measured) throw new Error(`Portrait ${id}: ${source} is not a readable PNG`);
    jobs.push({ group: 'portraits', id, source, output: `optimized/characters/${id.replace(/\.[^.]+$/, '.webp')}`, masterWidth: measured.width, target: Math.min(measured.width, portraitWidth) });
  }

  if (check) {
    const failures = [];
    for (const job of jobs) {
      const output = read(job.output);
      if (!output) { failures.push(`${job.id}: missing ${job.output}`); continue; }
      const size = readWebpSize(output);
      if (!size) { failures.push(`${job.id}: ${job.output} is not a readable WebP`); continue; }
      if (size.width !== job.target) failures.push(`${job.id}: ${job.output} is ${size.width}px wide, expected ${job.target}px`);
    }
    if (failures.length) {
      console.error(failures.join('\n'));
      process.exitCode = 1;
    } else console.log(`Current: ${jobs.length} artwork derivatives at display resolution`);
  } else {
    let before = 0, after = 0;
    for (const job of jobs) {
      const output = resolve(assets, job.output);
      mkdirSync(dirname(output), { recursive: true });
      const args = ['-quiet', '-q', String(quality), '-m', '6', '-alpha_q', '100'];
      if (job.target < job.masterWidth) args.push('-resize', String(job.target), '0');
      args.push(resolve(assets, job.source), '-o', output);
      execFileSync('cwebp', args);
      before += statSync(resolve(assets, job.source)).size;
      after += statSync(output).size;
    }
    const mib = (bytes) => `${(bytes / 1048576).toFixed(2)} MiB`;
    console.log(`Wrote ${jobs.length} derivatives: ${mib(before)} of masters -> ${mib(after)} bundled (${(before / after).toFixed(1)}x smaller)`);
    for (const group of ['portraits', 'map']) {
      const selected = jobs.filter((job) => job.group === group);
      const groupBefore = selected.reduce((sum, job) => sum + statSync(resolve(assets, job.source)).size, 0);
      const groupAfter = selected.reduce((sum, job) => sum + statSync(resolve(assets, job.output)).size, 0);
      console.log(`  ${group.padEnd(9)} ${selected.length} images, ${mib(groupBefore)} -> ${mib(groupAfter)}`);
    }
  }
} finally {
  await server.close();
}

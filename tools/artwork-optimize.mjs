// Generate only changed WebP derivatives for the standalone, offline build.
// PNG masters are the source of truth; WebPs and the cache are generated and ignored.
// "npm run assets:prepare" invokes this before regenerating the inline manifest.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, withArtworkRuntime, writeIfChanged } from './artwork-runtime.mjs';

export async function optimizeArtwork({ root, assets, server, read, measurePng }, args = []) {
  if (args.some(arg => arg !== '--force')) throw new Error('Usage: npm run artwork:optimize -- [--force]');
  const force = args.includes('--force');
  const portraitWidth = 256;
  const quality = 80;
  const cachePath = resolve(assets, 'optimized/.artwork-cache.json');

  let encoderVersion;
  try {
    encoderVersion = execFileSync('cwebp', ['-version'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Asset preparation needs cwebp (macOS: brew install webp; Ubuntu: sudo apt-get install webp)');
  }

  const { artworkRecords, objectRecords } = await server.ssrLoadModule('/src/catalogue/content.ts');
  const { inlineEntries } = await server.ssrLoadModule('/src/catalogue/generate.ts');
  const { bundledArtworkPath } = await server.ssrLoadModule('/src/catalogue/assets.ts');
  const { measureArtworkSources, readPngSize, readWebpSize } = await server.ssrLoadModule('/src/catalogue/png.ts');
  const { compileArtworkCatalogue, compileObjectCatalogue, compileObjectPlacement, deriveArtwork } = await server.ssrLoadModule('/src/catalogue/compile.ts');
  const { defaultMap } = await server.ssrLoadModule('/src/map/default.ts');
  const { MAX_ZOOM } = await server.ssrLoadModule('/src/rendering/zoom.ts');
  const portraitSourceIds = JSON.parse(readFileSync(resolve(root, 'src/narrative/portrait-manifest.json'), 'utf8'));

  const entries = inlineEntries(artworkRecords, objectRecords);
  const sources = measureArtworkSources(entries, read, undefined, measurePng);
  const catalogue = compileArtworkCatalogue(artworkRecords, sources);
  const objects = compileObjectCatalogue(objectRecords, sources, artworkRecords);
  // Two device pixels per CSS pixel at the game's closest camera. The largest drawn
  // extent—not the type's default footprint—drives the budget, so a placement resized
  // in the authored map still gets full display resolution.
  const pixelsPerMetre = MAX_ZOOM * 2;

  /** Largest drawn extent of each image in the shipped map, in metres. Placements
   * already fold in their footprint, artwork fit and `artworkScale`. */
  const placed = new Map();
  // Compile authored placements with the in-memory catalogue. Importing compileMap
  // here would load artwork/catalogue -> generated.ts before the first build has
  // created that file, making generation from a clean checkout impossible.
  for (const placement of defaultMap.objectPlacements) {
    const art = compileObjectPlacement(placement, objects).artwork;
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
    const measured = readPngSize(bytes);
    if (!measured) throw new Error(`Portrait ${id}: ${source} is not a readable PNG`);
    jobs.push({ group: 'portraits', id, source, output: `optimized/characters/${id.replace(/\.[^.]+$/, '.webp')}`, masterWidth: measured.width, target: Math.min(measured.width, portraitWidth) });
  }


  // The same master can be shared by several IDs. Encode it once, at the largest
  // required resolution, then let every catalogue ID refer to that one derivative.
  const unique = new Map();
  for (const job of jobs) {
    const existing = unique.get(job.output);
    if (!existing) unique.set(job.output, { ...job });
    else {
      if (existing.source !== job.source) throw new Error(`Conflicting artwork source for ${job.output}`);
      existing.target = Math.max(existing.target, job.target);
    }
  }

  let previous = {};
  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (parsed.version === 1 && parsed.jobs && typeof parsed.jobs === 'object') previous = parsed.jobs;
  } catch { /* First run, or invalid cache: regenerate rather than trusting it. */ }
  const current = Object.create(null);
  let generated = 0, reused = 0, removed = 0;
  for (const job of unique.values()) {
    const master = read(job.source);
    // A content fingerprint is cache invalidation, not a separate correctness check.
    // Encoding settings, tool version and the compiled size budget are all inputs.
    const key = digest(Buffer.concat([
      master,
      Buffer.from(JSON.stringify({ algorithm: 1, encoderVersion, quality, method: 6, alphaQuality: 100, target: job.target, masterWidth: job.masterWidth })),
    ]));
    const output = resolve(assets, job.output);
    const cached = previous[job.output];
    if (!force && cached?.key === key && existsSync(output) && cached.outputHash === digest(readFileSync(output))) {
      current[job.output] = cached;
      reused++;
      continue;
    }

    mkdirSync(dirname(output), { recursive: true });
    const temporary = `${output}.tmp-${process.pid}`;
    try {
      const options = ['-quiet', '-q', String(quality), '-m', '6', '-alpha_q', '100'];
      if (job.target < job.masterWidth) options.push('-resize', String(job.target), '0');
      execFileSync('cwebp', [...options, resolve(assets, job.source), '-o', temporary]);
      const size = readWebpSize(readFileSync(temporary));
      if (!size || size.width !== job.target) throw new Error(`Artwork ${job.id}: encoder produced an unexpected image size`);
      renameSync(temporary, output);
    } finally {
      rmSync(temporary, { force: true });
    }
    current[job.output] = { key, outputHash: digest(readFileSync(output)) };
    generated++;
  }

  // When an image is removed from the portrait catalogue, an old derivative must
  // not linger in the glob registry and cause a spurious extra-portrait error.
  for (const group of ['map', 'characters']) {
    const directory = resolve(assets, 'optimized', group);
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) {
      if (!file.endsWith('.webp')) continue;
      if (!Object.hasOwn(current, `optimized/${group}/${file}`)) {
        rmSync(resolve(directory, file));
        removed++;
      }
    }
  }

  const cacheText = JSON.stringify({ version: 1, jobs: current }, null, 2) + '\n';
  writeIfChanged(cachePath, cacheText);

  const listed = [...unique.values()];
  const before = listed.reduce((sum, job) => sum + statSync(resolve(assets, job.source)).size, 0);
  const after = listed.reduce((sum, job) => sum + statSync(resolve(assets, job.output)).size, 0);
  const mib = bytes => (bytes / 1048576).toFixed(2) + ' MiB';
  console.log(`Artwork: ${generated} generated, ${reused} reused, ${removed} removed (${listed.length} derivatives; ${mib(before)} masters -> ${mib(after)} bundled)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await withArtworkRuntime(runtime => optimizeArtwork(runtime, process.argv.slice(2)));
}

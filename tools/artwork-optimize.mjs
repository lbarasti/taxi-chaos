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
  // Two device pixels per CSS pixel at the game's closest camera, with a small margin
  // for art that is drawn slightly wider than its footprint.
  const pixelsPerMetre = MAX_ZOOM * 2 * 1.15;

  const jobs = [];
  for (const entry of entries) {
    const source = sources[entry.id];
    if (!source) continue; // Vector ground tiles inline as authored.
    const legacy = artworkRecords.find((record) => record.id === entry.id);
    let metres;
    if (legacy) {
      const structure = catalogue.structures[entry.id];
      metres = structure ? structure.bounds.width : catalogue.ground[entry.id].tileMetres;
    } else {
      const record = objectRecords.find((candidate) => candidate.id === entry.id);
      const template = objects[entry.id]?.artwork?.[0];
      if (!record || !template) throw new Error(`Artwork ${entry.id}: no compiled source for its direct image`);
      metres = deriveArtwork(template, record.width, record.height, record.artworkScale ?? 1).bounds.width;
    }
    if (!Number.isFinite(metres) || metres <= 0) throw new Error(`Artwork ${entry.id}: missing metric art width`);
    const target = Math.min(source.width, Math.max(64, Math.ceil(metres * pixelsPerMetre)));
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

// Browser-free artwork preparation: measures transparent export padding, validates
// catalogue geometry and writes the inline image manifest. Replaces hand-registered
// `?inline` imports and asset ID unions. No Vite plugin is needed, so the module runner
// loads with `configFile: false`.
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = resolve(root, 'src/assets');
const generated = resolve(root, 'src/catalogue/generated.ts');

const args = process.argv.slice(2);
const allowed = new Set(['--check', '--write', '--json', '--artwork', '--crop']);
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i])) throw new Error(`Unknown argument: ${args[i]}`);
  if (['--artwork', '--crop'].includes(args[i]) && (!args[++i] || args[i].startsWith('--'))) throw new Error(`Missing value for ${args[i - 1]}`);
}
if (args.includes('--write') && args.includes('--check')) throw new Error('Choose either --write or --check');
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const write = args.includes('--write'), json = args.includes('--json');
const only = option('--artwork');
const override = option('--crop')?.split(',').map(Number);
if (override && (!only || override.length !== 4 || override.some(n => !Number.isInteger(n) || n < 0) || override[2] <= 0 || override[3] <= 0))
  throw new Error('--crop needs x,y,width,height positive integers and an --artwork ID');
if (override && args.includes('--write')) throw new Error('--crop inspects geometry; it cannot rewrite the manifest');

const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { artworkRecords, objectRecords } = await server.ssrLoadModule('/src/catalogue/content.ts');
  const { compileArtworkCatalogue, compileObjectCatalogue, deriveArtwork } = await server.ssrLoadModule('/src/catalogue/compile.ts');
  const { inlineEntries, renderCatalogueModule } = await server.ssrLoadModule('/src/catalogue/generate.ts');
  const { measureArtworkSources, readPng } = await server.ssrLoadModule('/src/catalogue/png.ts');

  const entries = inlineEntries(artworkRecords, objectRecords);
  // Cache by file path so an image shared by several IDs is read and decoded once.
  const files = new Map(), measurements = new Map();
  for (const entry of entries) {
    if (files.has(entry.png)) continue;
    let file;
    try { file = readFileSync(resolve(assets, entry.png)); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error(`Artwork ${entry.id}: missing source src/assets/${entry.png}`);
      throw error;
    }
    files.set(entry.png, file);
    if (!entry.png.endsWith('.png')) continue;
    const measured = readPng(file);
    if (!measured) throw new Error(`Artwork ${entry.id}: src/assets/${entry.png} is not a readable PNG`);
    measurements.set(entry.png, measured);
  }
  const measuredSources = measureArtworkSources(entries, png => files.get(png));
  // `--crop` inspects a candidate crop without touching the checked-in manifest.
  const sources = { ...measuredSources };
  if (override) {
    if (!entries.some(entry => entry.id === only)) throw new Error(`Unknown artwork ID: ${only}`);
    const measured = measuredSources[only];
    sources[only] = { width: measured?.width ?? override[0] + override[2], height: measured?.height ?? override[1] + override[3], crop: { x: override[0], y: override[1], width: override[2], height: override[3] } };
  }

  // Geometry errors (unknown references, aspect-free sizes, crops outside the source)
  // fail here, before any game or editor build.
  const catalogue = compileArtworkCatalogue(artworkRecords, sources);
  const objects = compileObjectCatalogue(objectRecords, sources, artworkRecords);
  const legacyById = new Map(artworkRecords.map(record => [record.id, record]));
  const defaultArtwork = id => {
    const definition = objects[id], template = definition?.artwork?.[0];
    return template ? deriveArtwork(template, definition.width, definition.height, definition.artworkScale ?? 1) : undefined;
  };

  const report = entries.filter(entry => !only || entry.id === only).map(entry => {
    const legacy = legacyById.get(entry.id);
    const object = objectRecords.find(record => record.id === entry.id);
    const measured = measurements.get(entry.png);
    return {
      id: entry.id, png: entry.png, layer: legacy?.layer ?? 'structure',
      source: measured ? { width: measured.width, height: measured.height } : null,
      padding: measured?.padding ?? null,
      crop: override && entry.id === only ? sources[entry.id].crop : legacy?.crop ?? object?.crop ?? measuredSources[entry.id]?.crop ?? null,
      bounds: catalogue.structures[entry.id]?.bounds ?? defaultArtwork(entry.id)?.bounds ?? null,
    };
  });
  const text = renderCatalogueModule(entries, measuredSources);
  let current;
  try { current = readFileSync(generated, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const stale = current !== text;

  if (write) await writeFile(generated, text);
  const output = { generated: { path: 'src/catalogue/generated.ts', stale, written: write }, artworks: report };
  if (json) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(`${write ? 'Wrote' : stale ? 'STALE' : 'Current'}: src/catalogue/generated.ts`);
    for (const art of report) {
      const source = art.source ? `${art.source.width}×${art.source.height}` : 'vector';
      const padding = art.padding ? `padding ${art.padding.left}/${art.padding.top}/${art.padding.right}/${art.padding.bottom}` : 'no measured padding';
      const bounds = art.bounds ? `${art.bounds.width.toFixed(2)}×${art.bounds.height.toFixed(2)} m centred` : 'ground tile';
      console.log(`  ${art.id}: ${art.png} (${source}), ${padding}, ${bounds}`);
    }
    if (stale && !write) console.log('Run `npm run artwork:prep -- --write` to refresh the manifest.');
  }
  if (stale && !write) process.exitCode = 1;
} catch (error) { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }
finally { await server.close(); }

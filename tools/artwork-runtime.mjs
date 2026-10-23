// One module runner, file inventory and content-addressed PNG measurement cache per
// preparation session. Standalone CLIs use the same cache as automatic preparation.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function writeIfChanged(path, text) {
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return false;
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, text);
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
  return true;
}

export function createArtworkMeasurements(assets, decoderKey, readPng) {
  const path = resolve(assets, 'optimized/.artwork-measurements.json');
  let previous = {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed.version === 1 && parsed.decoderKey === decoderKey && parsed.files && typeof parsed.files === 'object') previous = parsed.files;
  } catch { /* Missing or damaged cache: measure the masters again. */ }
  const current = Object.create(null);
  let decoded = 0, reused = 0;
  return {
    measure(png, bytes) {
      const hash = digest(bytes), cached = previous[png];
      if (current[png]?.hash === hash) return structuredClone(current[png].measurement);
      if (cached?.hash === hash && cached.measurement && cached.measurementHash === digest(JSON.stringify(cached.measurement))) {
        current[png] = cached;
        reused++;
      } else {
        const measurement = readPng(bytes);
        if (!measurement) return undefined;
        current[png] = { hash, measurement, measurementHash: digest(JSON.stringify(measurement)) };
        decoded++;
      }
      // Compilers and reports cannot mutate the saved measurement or another ID.
      return structuredClone(current[png].measurement);
    },
    save() { writeIfChanged(path, JSON.stringify({ version: 1, decoderKey, files: current }, null, 2) + '\n'); },
    stats() { return { decoded, reused }; },
  };
}

export async function withArtworkRuntime(run) {
  const assets = resolve(root, 'src/assets');
  const server = await createServer({ root, configFile: false, logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { readPng } = await server.ssrLoadModule('/src/catalogue/png.ts');
    // A decoder change invalidates measurements even when the PNG bytes did not change.
    const measurements = createArtworkMeasurements(assets, digest(readFileSync(resolve(root, 'src/catalogue/png.ts'))), readPng);
    const files = new Map();
    const read = png => {
      if (!files.has(png)) {
        try { files.set(png, readFileSync(resolve(assets, png))); }
        catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
      }
      return files.get(png);
    };
    const result = await run({ root, assets, server, read, measurePng: (png, bytes) => measurements.measure(png, bytes) });
    measurements.save();
    const { decoded, reused } = measurements.stats();
    return { result, decoded, reused };
  } finally { await server.close(); }
}

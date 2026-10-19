import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';

// Vite's module runner resolves the same TS/JSON graph as the embedded browser.
const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const args = process.argv.slice(2), allowed = new Set(['--input', '--operations', '--output', '--json']);
  for (let i = 0; i < args.length; i++) { if (!allowed.has(args[i])) throw new Error(`Unknown argument: ${args[i]}`); if (args[i] !== '--json' && (!args[++i] || args[i].startsWith('--'))) throw new Error('Missing argument value'); }
  const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const { importMap, exportMap } = await server.ssrLoadModule('/src/map/serialization.ts');
  const { applyOperations } = await server.ssrLoadModule('/src/map/operations.ts');
  const { validateMap } = await server.ssrLoadModule('/src/map/validation.ts');
  let document = importMap(await readFile(arg('--input') ?? 'src/map/default-map.json', 'utf8'));
  let transaction;
  if (arg('--operations')) {
    if (!arg('--output')) throw new Error('--operations requires an explicit --output file');
    transaction = applyOperations(document, JSON.parse(await readFile(arg('--operations'), 'utf8'))); document = transaction.document;
  }
  const result = validateMap(document);
  if (arg('--output')) await writeFile(arg('--output'), exportMap(document), { flag: 'wx' });
  const report = { ...result, changedIds: transaction?.changedIds, affectedConnections: transaction?.affectedConnections };
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : `${result.revision}: ${result.errors} errors, ${result.warnings} warnings, water gap ${result.waterGap ?? 'unbounded'} m\n${result.findings.map(f => `${f.severity}: ${f.code} [${f.entityIds.join(', ')}] ${f.message}`).join('\n')}`);
  if (result.errors) process.exitCode = 1;
} catch (error) { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }
finally { await server.close(); }

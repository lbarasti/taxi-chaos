import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeBrowser } from './runtime.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const suites = new Map([
  ['menus', ['splash']],
  ['audio', ['engine-audio']],
  ['input', ['mobile-controls', 'mobile-hud']],
  ['hud', ['navigation-hud', 'player-hud']],
  ['campaign-ui', ['newsroom', 'observations', 'text-messages', 'editions', 'dialogue']],
  ['world', ['artwork', 'condo', 'city-scale', 'beach']],
  ['map-inspection', ['layers']],
]);
const extension = { 'mobile-hud': 'cjs', beach: 'cjs' };
const args = process.argv.slice(2);
const value = flag => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1]; };
if (args.includes('--list')) {
  for (const [suite, cases] of suites) console.log(`${suite}: ${cases.join(', ')}`);
  process.exit(0);
}
const selectedSuite = value('--suite');
const selectedCase = value('--case');
if (selectedSuite && !suites.has(selectedSuite)) throw new Error(`Unknown suite: ${selectedSuite}`);
const cases = [...suites].flatMap(([suite, names]) => names
  .filter(name => (!selectedSuite || suite === selectedSuite) && (!selectedCase || name === selectedCase))
  .map(name => ({ suite, name })));
if (!cases.length) throw new Error(`No browser case selected: ${selectedCase}`);
const output = path.resolve(process.env.SCREENSHOT_DIR || 'scenario-runs/browser');
await mkdir(output, { recursive: true });
const browser = await probeBrowser();
const results = [];
if (!browser.executablePath) {
  for (const { suite, name } of cases) {
    results.push({ suite, case: name, status: 'skip', reason: 'No cached Chromium passed a blank-page launch' });
    console.log(`SKIP ${suite}/${name}: browser unavailable`);
  }
  console.error(browser.failures.join('\n'));
} else {
  console.log(`Browser: ${browser.executablePath}`);
  for (const { suite, name } of cases) {
    const directory = path.join(output, name);
    await mkdir(directory, { recursive: true });
    const file = path.join(root, 'tests/browser/cases', `${name}-check.${extension[name] || 'mjs'}`);
    const start = Date.now();
    const code = await new Promise(resolve => {
      const child = spawn(process.execPath, [file], {
        cwd: root, stdio: 'inherit',
        env: { ...process.env, CHROMIUM_PATH: browser.executablePath, SCREENSHOT_DIR: directory, BROWSER_CASE_OUTPUT: directory },
      });
      child.on('error', error => { console.error(error); resolve(1); });
      child.on('exit', code => resolve(code ?? 1));
    });
    const status = code === 0 ? 'pass' : 'fail';
    results.push({ suite, case: name, status, seconds: Math.round((Date.now() - start) / 100) / 10,
      ...(code ? { screenshots: directory } : {}) });
    console.log(`${status.toUpperCase()} ${suite}/${name} (${results.at(-1).seconds}s)${code ? ` — ${directory}` : ''}`);
  }
}
await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(`Browser cases: ${results.filter(r => r.status === 'pass').length} passed, ${results.filter(r => r.status === 'fail').length} failed, ${results.filter(r => r.status === 'skip').length} skipped`);
if (results.some(r => r.status === 'fail') || (args.includes('--require-browser') && results.some(r => r.status === 'skip'))) process.exitCode = 1;

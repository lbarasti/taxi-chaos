import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const run = (args, input = '') => {
  const result = spawnSync(process.execPath, ['tools/scenario-run.mjs', ...args], { cwd, input, encoding: 'utf8', timeout: 60000, maxBuffer: 8e6 });
  if (result.error) throw result.error;
  return result;
};
const replies = result => result.stdout.trim().split('\n').map(line => JSON.parse(line));
const commands = [
  { op: 'advance', event: 'cafe-boarded' },
  { op: 'capture', name: 'texts', view: 'texts', panelOnly: true },
  { op: 'place', at: 'garden-cafe' },
  { op: 'photo' },
  { op: 'capture', name: 'frontage', focus: 'cafe', zoom: 20 },
  { op: 'expect', path: 'materialIds', equals: ['cafe-photo'] },
];
const input = commands.map(command => JSON.stringify(command)).join('\n') + '\n';

test('short piped headless input reaches EOF without losing commands', () => {
  const result = run(['--stdin', '--json'], input);
  assert.equal(result.status, 0, result.stderr);
  const steps = replies(result);
  assert.equal(steps.length, commands.length);
  assert.ok(steps.every(step => step.status === 'passed'));
  assert.deepEqual(steps.at(-1).state.materialIds, ['cafe-photo']);
});

test('short piped PNG input survives Vite startup and matches every headless state', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'taxi-scenario-'));
  try {
    const output = path.join(root, 'run');
    const A = run(['--stdin', '--json'], input), B = run(['--stdin', '--output', output], input);
    assert.equal(A.status, 0, A.stderr); assert.equal(B.status, 0, B.stderr);
    const headless = replies(A), browser = replies(B);
    assert.equal(browser.length, commands.length);
    headless.forEach((reply, i) => assert.deepEqual(browser[i].state, reply.state, `Command ${i + 1} state parity`));
    const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'passed'); assert.equal(manifest.shots.length, 2);
    assert.deepEqual(manifest.errors, []); assert.deepEqual(manifest.externalRequests, []);
    assert.deepEqual(manifest.storage, { local: 0, session: 0 });
    for (const shot of manifest.shots) assert.equal(readFileSync(path.join(output, shot.file)).subarray(1, 4).toString(), 'PNG');
    const duplicate = run(['--stdin', '--output', output], input);
    assert.equal(duplicate.status, 1); assert.match(duplicate.stderr, /EEXIST/);
    assert.equal(readFileSync(path.join(output, 'manifest.json'), 'utf8'), JSON.stringify(manifest, null, 2) + '\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('failed commands retain a partial report and failure PNG; malformed JSON replies and stops', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'taxi-scenario-'));
  try {
    const output = path.join(root, 'run');
    const result = run(['--stdin', '--output', output], JSON.stringify({ op: 'expect', path: 'campaign.world.cafe', equals: 'boarded' }) + '\n' + input);
    assert.equal(result.status, 1); assert.equal(replies(result).length, 1);
    const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'failed'); assert.equal(manifest.steps.length, 1);
    assert.match(manifest.error, /expected equals "boarded", got "open"/);
    assert.ok(readdirSync(output).some(file => file.endsWith('-failure.png')));
    const malformed = run(['--stdin', '--json'], '{bad-json}\n' + input);
    assert.equal(malformed.status, 1); assert.equal(replies(malformed).length, 1);
    assert.equal(replies(malformed)[0].error, 'Invalid JSON');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

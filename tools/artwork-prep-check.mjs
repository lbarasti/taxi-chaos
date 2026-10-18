// Offline checks for the browser-free artwork prep CLI. Run with `npm run artwork:test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const generated = fileURLToPath(new URL('../src/catalogue/generated.ts', import.meta.url));
const run = args => {
  const result = spawnSync(process.execPath, ['tools/artwork-prep.mjs', ...args], { cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 8e6 });
  if (result.error) throw result.error;
  return result;
};

test('the checked-in manifest is current and reports padding for every referenced image', () => {
  const result = run(['--check', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.generated.stale, false);
  assert.deepEqual(output.artworks.map(art => art.id), ['shop-tar', 'shop-rust', 'shop-concrete', 'tree-worn', 'asphalt', 'luxury-condo', 'hospital']);
  const hospital = output.artworks.find(art => art.id === 'hospital');
  assert.deepEqual(hospital.padding, { left: 33, top: 16, right: 28, bottom: 30 });
  assert.deepEqual(hospital.crop, { x: 33, y: 16, width: 726, height: 1951 });
  assert.ok(Math.abs(hospital.bounds.x + 13.3) < 1e-9);
  assert.ok(Math.abs(hospital.bounds.y + 33.3) < 1e-9);
  assert.ok(Math.abs(hospital.bounds.width - 26.6) < 1e-9);
  assert.ok(Math.abs(hospital.bounds.height - 66.6) < 1e-9);
  const condo = output.artworks.find(art => art.id === 'luxury-condo');
  assert.deepEqual(condo.crop, { x: 100, y: 60, width: 1055, height: 1090 }, 'authored crop overrides the measured padding');
  assert.deepEqual(condo.padding, { left: 0, top: 17, right: 94, bottom: 24 });
  assert.equal(output.artworks.find(art => art.id === 'asphalt').source, null);
});

test('an explicit crop override changes only the reported geometry', () => {
  const before = readFileSync(generated, 'utf8');
  const result = run(['--artwork', 'luxury-condo', '--crop', '10,20,1000,1000', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const [condo] = JSON.parse(result.stdout).artworks;
  assert.deepEqual(condo.crop, { x: 10, y: 20, width: 1000, height: 1000 });
  assert.deepEqual(condo.bounds, { x: -7.15, y: -6.65, width: 14.3, height: 13.3 }, 'authored metres still drive the bounds');
  assert.equal(readFileSync(generated, 'utf8'), before);
});

test('invalid selections fail loudly instead of writing', () => {
  assert.match(run(['--crop', '0,0,10,10']).stderr, /--crop needs x,y,width,height/);
  assert.match(run(['--artwork', 'no-such-art', '--crop', '0,0,10,10']).stderr, /Unknown artwork ID/);
  assert.match(run(['--write', '--check']).stderr, /Choose either/);
  assert.match(run(['--artwork', 'hospital', '--crop', '0,0,10,10', '--write']).stderr, /cannot rewrite the manifest/);
  assert.match(run(['--unknown']).stderr, /Unknown argument/);
});

test('a stale manifest fails --check until --write restores it', () => {
  const before = readFileSync(generated, 'utf8');
  try {
    writeFileSync(generated, before.replace("'shop-tar': artwork0,", "'shop-tar': artwork1,"));
    const stale = run(['--check']);
    assert.equal(stale.status, 1);
    assert.match(stale.stdout, /STALE/);
    assert.equal(run(['--write']).status, 0);
    assert.equal(readFileSync(generated, 'utf8'), before);
  } finally { writeFileSync(generated, before); }
});

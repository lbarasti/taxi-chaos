import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArtworkMeasurements } from './artwork-runtime.mjs';

function fixture(t) {
  const assets = mkdtempSync(join(tmpdir(), 'taxi-artwork-cache-'));
  t.after(() => rmSync(assets, { recursive: true, force: true }));
  const path = join(assets, 'optimized/.artwork-measurements.json');
  let calls = 0;
  const decode = bytes => {
    calls++;
    if (!bytes[0]) return undefined;
    const width = bytes[0];
    return { width, height: 2, crop: { x: 0, y: 0, width, height: 2 }, padding: { left: 0, top: 0, right: 0, bottom: 0 } };
  };
  return { path, cache: (key = 'decoder-v1') => createArtworkMeasurements(assets, key, decode), calls: () => calls };
}

test('measurements persist across sessions and detach shared geometry without rewriting the cache', t => {
  const f = fixture(t), bytes = Buffer.from([10]);
  const first = f.cache();
  const measurement = first.measure('shared.png', bytes);
  measurement.crop.width = 999;
  assert.equal(first.measure('shared.png', bytes).crop.width, 10);
  assert.equal(f.calls(), 1);
  first.save();
  const before = { bytes: readFileSync(f.path, 'utf8'), mtime: statSync(f.path).mtimeMs };
  const next = f.cache();
  assert.equal(next.measure('shared.png', bytes).crop.width, 10);
  assert.deepEqual(next.stats(), { decoded: 0, reused: 1 });
  next.save();
  assert.equal(f.calls(), 1);
  assert.equal(readFileSync(f.path, 'utf8'), before.bytes);
  assert.equal(statSync(f.path).mtimeMs, before.mtime);
});

test('changed source bytes invalidate only their measurement, including within one session', t => {
  const f = fixture(t), first = f.cache();
  first.measure('first.png', Buffer.from([10]));
  first.measure('second.png', Buffer.from([20]));
  first.save();
  const next = f.cache();
  assert.equal(next.measure('first.png', Buffer.from([11])).width, 11);
  assert.equal(next.measure('second.png', Buffer.from([20])).width, 20);
  assert.deepEqual(next.stats(), { decoded: 1, reused: 1 });
  assert.equal(next.measure('first.png', Buffer.from([12])).width, 12);
  assert.equal(f.calls(), 4);
});

test('decoder changes invalidate measurements even when source bytes stay the same', t => {
  const f = fixture(t), first = f.cache();
  first.measure('first.png', Buffer.from([10]));
  first.save();
  const next = f.cache('decoder-v2');
  next.measure('first.png', Buffer.from([10]));
  assert.deepEqual(next.stats(), { decoded: 1, reused: 0 });
});

test('damaged cache JSON, schema and individual measurements are safely remeasured', t => {
  const f = fixture(t), first = f.cache(), bytes = Buffer.from([10]);
  first.measure('first.png', bytes);
  first.save();
  const valid = readFileSync(f.path, 'utf8');
  const damaged = JSON.parse(valid);
  damaged.files['first.png'].measurement.width = 999;
  for (const text of ['{', 'null', JSON.stringify({ version: 2 }), JSON.stringify(damaged)]) {
    writeFileSync(f.path, text);
    const next = f.cache();
    assert.equal(next.measure('first.png', bytes).width, 10);
    assert.deepEqual(next.stats(), { decoded: 1, reused: 0 });
  }
});

test('unreadable sources never become cached measurements and unused entries are pruned', t => {
  const f = fixture(t), first = f.cache();
  assert.equal(first.measure('invalid.png', Buffer.from([0])), undefined);
  first.measure('removed.png', Buffer.from([20]));
  first.save();
  const next = f.cache();
  next.measure('current.png', Buffer.from([10]));
  next.save();
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(f.path)).files), ['current.png']);
});

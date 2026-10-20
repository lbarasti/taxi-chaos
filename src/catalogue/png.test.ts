import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { measureArtworkSources, readPng } from './png';

const bytes = (png: string) => readFileSync(fileURLToPath(new URL(`../assets/${png}`, import.meta.url)));
const asset = (png: string) => readPng(bytes(png));
const read = (png: string) => {
  try { return bytes(png); }
  catch { return undefined; }
};

describe('browser-free PNG source preparation', () => {
  it('measures dimensions and transparent export padding', () => {
    expect(asset('map/hospital-structure.png')).toMatchObject({ width: 787, height: 1997, crop: { x: 33, y: 16, width: 726, height: 1951 }, padding: { left: 33, top: 16, right: 28, bottom: 30 } });
    expect(asset('map/shop-tar.png')).toMatchObject({ width: 256, height: 256, crop: { x: 0, y: 0, width: 256, height: 256 }, padding: { left: 0, top: 0, right: 0, bottom: 0 } });
    expect(asset('map/tree-worn.png')).toMatchObject({ width: 192, height: 192, crop: { x: 0, y: 0, width: 192, height: 192 } });
    expect(asset('map/luxury-condo.png')).toMatchObject({ width: 1254, height: 1254, crop: { x: 0, y: 110, width: 1175, height: 1106 } });
  });

  it('skips vector references and keeps one measured entry per PNG', () => {
    const entries = [{ id: 'asphalt', png: 'map/asphalt.svg' }, { id: 'shop-tar', png: 'map/shop-tar.png' }];
    expect(measureArtworkSources(entries, read)).toEqual({ 'shop-tar': { width: 256, height: 256, crop: { x: 0, y: 0, width: 256, height: 256 } } });
  });

  it('reads and decodes a shared file once, with a detached crop per artwork ID', () => {
    const reads: string[] = [];
    const shared = measureArtworkSources(
      [{ id: 'first', png: 'map/shop-tar.png' }, { id: 'second', png: 'map/shop-tar.png' }],
      png => { reads.push(png); return bytes(png); },
    );
    expect(reads).toEqual(['map/shop-tar.png']);
    expect(shared.first.crop).toEqual(shared.second.crop);
    expect(shared.first.crop).not.toBe(shared.second.crop);
  });

  it('rejects unreadable or non-PNG input instead of guessing geometry', () => {
    expect(readPng(new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(readPng(new Uint8Array(8))).toBeUndefined();
    expect(() => measureArtworkSources([{ id: 'missing', png: 'map/absent.png' }], () => undefined)).toThrow(/missing source/);
    expect(() => measureArtworkSources([{ id: 'misnamed', png: 'map/misnamed.png' }], () => bytes('map/asphalt.svg'))).toThrow(/not a PNG/);
  });
});

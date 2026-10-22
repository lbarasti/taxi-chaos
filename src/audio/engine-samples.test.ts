import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('embedded road-car recordings', () => {
  it.each(['player-engine', 'engine-load'])('%s stays compact, seamless and free of a dominant high-frequency whine', name => {
    const wav = readFileSync(`src/assets/audio/${name}.wav`);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(22050);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    const samples = Array.from({ length: wav.readUInt32LE(40) / 2 }, (_, i) => wav.readInt16LE(44 + i * 2) / 32768);
    expect(samples.length / 22050).toBeGreaterThan(3);
    expect(wav.length).toBeLessThan(200000);
    const energy = samples.reduce((total, value) => total + value * value, 0);
    expect(Math.sqrt(energy / samples.length)).toBeCloseTo(0.18, 3);
    expect(samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0)).toBeLessThan(0.9);
    expect(Math.abs(samples[0] - samples.at(-1)!)).toBeLessThan(0.06);
    // Normalised first-difference energy weights upper frequencies. The former
    // player idle scores 0.55; these real car layers must stay well below that.
    const difference = samples.slice(1).reduce((total, value, i) => total + (value - samples[i]) ** 2, 0);
    expect(difference / energy).toBeLessThan(0.06);
  });
});

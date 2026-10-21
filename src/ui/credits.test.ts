import { describe, expect, it } from 'vitest';
import { audioCredits, audioCreditsMarkup, creditsMarkup } from './credits';

describe('credits page', () => {
  const html = creditsMarkup();

  it('keeps every attribution, source link and licence wording', () => {
    for (const credit of audioCredits) {
      expect(html).toContain(`href="${credit.href}"`);
      expect(html).toContain(credit.label);
    }
    expect(html).toContain('CC0');
    expect(html).toContain('CC BY 3.0');
    expect(html).toContain('https://creativecommons.org/publicdomain/zero/1.0/');
    expect(html).toContain('https://creativecommons.org/licenses/by/3.0/');
    expect(html).toContain('Samples edited for mono, loudness, loop seams and size; pitch/filter changes in-game.');
    expect(html).toContain('short procedural Web Audio tones created for Taxi Chaos');
    expect(html).toContain('No music or voice recordings are included.');
    expect(html).toContain('https://patkerr.co.uk/motion-lab/');
    expect(html).toContain('Motion Lab v0.8.2');
    expect(html).toContain('Driving and rigid-body fundamentals are adapted from');
    expect(html).toContain('https://fonts.google.com/specimen/Space+Grotesk');
    expect(html).toContain('Florian Karsten');
    expect(html).toContain('SIL Open Font License 1.1');
    expect(html).toContain('https://github.com/floriankarsten/space-grotesk/blob/master/OFL.txt');
    expect(html).toContain('Drawn procedurally, not texture-based.');
    expect(html).toContain('User-supplied PNG portraits for the Open Shore cast');
    expect(html).toContain('plus the bundled officer portrait');
    expect(html).toContain('original neutral placeholder cards (legacy-mia.png, legacy-frankie.png) created for Taxi Chaos');
    // No stale vector-identity claim, and no separate "identity cards" category, survives
    // the raster migration: those nine supplied PNGs are part of the cast above.
    expect(html).not.toContain('SVG identity cards');
    expect(html).not.toContain('original provisional vector art');
    expect(html).not.toContain('nine identity cards');
    expect(html).not.toContain('Identity cards');
  });

  it('groups content by functional role with an accessible heading per group', () => {
    const sections = html.match(/<section class="credits-section" aria-labelledby="([^"]+)">/g) ?? [];
    expect(sections).toHaveLength(4);
    expect(html).toContain('Driving physics');
    expect(html).toContain('Sound FX');
    expect(html).toContain('Typography');
    expect(html).toContain('Art &amp; characters');
    for (const id of html.match(/aria-labelledby="([^"]+)"/g) ?? []) {
      const value = id.slice('aria-labelledby="'.length, -1);
      expect(html).toContain(`id="${value}"`);
    }
    expect(html).toContain('<dl class="credits-list">');
    expect((html.match(/<dt>/g) ?? []).length).toBe((html.match(/<dd>/g) ?? []).length);
    expect((html.match(/<dt>/g) ?? []).length).toBeGreaterThan(audioCredits.length);
    expect(html).not.toContain('<details');
    expect(html).not.toContain('<summary');
  });

  it('splits the sound credits into one row per mix role', () => {
    expect(html).toContain('<dt>Engines &amp; horns</dt>');
    expect(html).toContain('<dt>Impacts &amp; explosions</dt>');
    expect(html).toContain('<dt>Sirens</dt>');
    expect(html).toContain('<dt>Tyres</dt>');
    expect(html).toContain('<dt>Boost</dt>');
    expect(html).toContain('<dt>Fire</dt>');
    expect((html.match(/<span class="credit-tag">/g) ?? []).length).toBe(audioCredits.length);
  });

  it('escapes authored text', () => {
    expect(html).toContain('Impacts &amp; explosions');
    expect(html).not.toContain('Impacts & explosions');
    expect(html).toContain('Pat Kerr&#39;s Motion Lab v0.8.2');
  });
});

describe('inline audio credits', () => {
  it('keeps the compact lab note and its source links unchanged', () => {
    const html = audioCreditsMarkup();
    expect(html).toContain('<div class="audio-credits">');
    expect(html).toContain('Engines/horns: <a href="https://opengameart.org/content/car-sound-effects-pack-low-quality" target="_blank" rel="noopener">GGBotNet</a>');
    expect(html).toContain('Impacts/explosions: <a href="https://kenney.nl/assets" target="_blank" rel="noopener">Kenney</a>');
    expect(html).toContain('Siren: <a href="https://opengameart.org/content/sirens-and-alarm-noise" target="_blank" rel="noopener">aquinn</a> (CC0).');
    expect(html).toContain('Tyres: <a href="https://opengameart.org/content/car-tire-squeal-skid-loop" target="_blank" rel="noopener">audible-edge / Tom Haigh, loop by qubodup</a>');
    expect(html).toContain('Boost: <a href="https://opengameart.org/content/racing-speed-boost-sound" target="_blank" rel="noopener">Iwan Gabovitch / qubodup</a>');
    expect(html).toContain('Fire: <a href="https://opengameart.org/content/fire-loop" target="_blank" rel="noopener">qubodup</a>');
    expect(html).toContain('<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>');
    expect(html).toContain('Samples edited for mono, loudness, loop seams and size; pitch/filter changes in-game.');
    for (const credit of audioCredits) expect(html).toContain(`href="${credit.href}"`);
  });
});

import { describe, expect, it } from 'vitest';
import {
  characters, getCharacter, isCharacterId, messageCharacter, validateCharacterCatalogue,
  type Character, type CharacterPortrait,
} from './characters';
import { portraitLayout, portraits, portraitSourceIds, resolvePortrait, validatePortraitRegistry, type PortraitFormat } from './portraits';

const mime: Record<PortraitFormat, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

describe('portrait registry', () => {
  it('bundles every declared portrait as an inlined data URL', () => {
    expect(() => validatePortraitRegistry()).not.toThrow();
    expect(Object.keys(portraits).sort()).toEqual([...portraitSourceIds].sort());
    for (const id of portraitSourceIds) expect(portraits[id].src.startsWith(`data:${mime[portraits[id].format]}`)).toBe(true);
  });

  it('declares exactly the supplied PNG portraits, with no leftover vector identities', () => {
    // The supplied cast is raster-only now, so the manifest must match the folder and
    // every entry must be a PNG rather than a stale SVG identity card.
    expect(portraitSourceIds.every(id => id.endsWith('.png'))).toBe(true);
    expect(new Set(Object.values(portraits).map(({ format }) => format))).toEqual(new Set<PortraitFormat>(['png']));
    expect([...portraitSourceIds]).toContain('officer.png');
    expect([...portraitSourceIds]).toContain('legacy-mia.png');
    expect([...portraitSourceIds]).toContain('legacy-frankie.png');
  });
});

describe('character catalogue', () => {
  it('is deeply frozen and consistent with its typed keys', () => {
    expect(() => validateCharacterCatalogue()).not.toThrow();
    expect(Object.isFrozen(characters)).toBe(true);
    for (const [id, character] of Object.entries(characters)) {
      expect(character.id).toBe(id);
      expect(character.name).toBeTruthy();
      expect(character.attribution).toContain('Taxi Chaos');
      expect(Object.isFrozen(character)).toBe(true);
      expect(Object.isFrozen(character.portrait)).toBe(true);
      expect(Object.isFrozen(character.portrait.sources)).toBe(true);
    }
  });

  it('attributes each supplied PNG portrait and keeps the legacy placeholders distinct', () => {
    // Every attribution names the actual portrait file(s) the character ships, so the
    // supplied raster cast never keeps a stale vector-identity or placeholder claim.
    const legacy = new Set(['mia', 'frankie']);
    for (const [id, character] of Object.entries(characters)) {
      for (const source of character.portrait.sources) expect(character.attribution).toContain(source);
      if (legacy.has(id)) {
        expect(character.attribution).toContain('Neutral legacy placeholder card');
        expect(character.attribution).toContain('not shipped');
      } else {
        expect(character.attribution).toContain('Portrait art supplied for Taxi Chaos');
        expect(character.attribution).not.toMatch(/placeholder|identity card/i);
      }
    }
  });

  it('looks up typed ids and rejects unknown speakers', () => {
    expect(getCharacter('mia')).toMatchObject({ id: 'mia', name: 'Mia' });
    expect(getCharacter('frankie').name).toBe('Frankie');
    expect(isCharacterId('mia')).toBe(true);
    expect(isCharacterId('mia-meridian-vans')).toBe(false);
    expect(isCharacterId('toString')).toBe(false);
  });

  it('keeps the legacy ids on their own neutral placeholders, never a reassigned cast portrait', () => {
    // `mia` and `frankie` stay stable because the legacy mission catalogue and the
    // dialogue preview reference them. Their supplied rasters are gone, so they must
    // fall back to the dedicated placeholder cards rather than borrow Mara or Celia.
    expect(resolvePortrait(characters.mia)).toMatchObject({ source: 'legacy-mia.png', format: 'png' });
    expect(resolvePortrait(characters.frankie)).toMatchObject({ source: 'legacy-frankie.png', format: 'png' });
    const castSources = new Set(Object.entries(characters)
      .filter(([id]) => !['mia', 'frankie'].includes(id))
      .flatMap(([, character]) => character.portrait.sources));
    expect(castSources.has('legacy-mia.png')).toBe(false);
    expect(castSources.has('legacy-frankie.png')).toBe(false);
  });

  it('resolves the right name and portrait when the speaker changes', () => {
    const mia = messageCharacter({ speaker: 'mia' });
    const frankie = messageCharacter({ speaker: 'frankie' });
    expect(mia.name).toBe('Mia');
    expect(frankie.name).toBe('Frankie');
    expect(resolvePortrait(mia).src).not.toBe(resolvePortrait(frankie).src);
  });

  it('rejects invalid metadata instead of shipping it', () => {
    const base = characters.mara;
    const withPortrait = (portrait: Partial<CharacterPortrait>): Character => ({ ...base, portrait: { ...base.portrait, ...portrait } });
    expect(() => validateCharacterCatalogue({ mystery: { ...base, id: 'someone-else' } })).toThrow(/id mismatch/);
    expect(() => validateCharacterCatalogue({ mara: withPortrait({ sources: ['missing.png'] as never }) })).toThrow(/unknown portrait/);
    expect(() => validateCharacterCatalogue({ mara: withPortrait({ objectPosition: 'sideways' }) })).toThrow(/objectPosition/);
    expect(() => validateCharacterCatalogue({ mara: withPortrait({ crop: { x: 0.5, y: 0, width: 0.8, height: 1 } }) })).toThrow(/crop/);
    expect(() => validateCharacterCatalogue({ mara: withPortrait({ crop: { x: 0, y: 0, width: 0, height: 1 } }) })).toThrow(/crop/);
  });
});

describe('portrait layout', () => {
  // Framing is exercised with explicit fixtures so the maths never depends on which
  // raster a particular cast member happens to ship today.
  const framed = (portrait: CharacterPortrait): Character => ({ id: 'framing-fixture', name: 'Framing fixture', portrait, attribution: 'Test fixture for Taxi Chaos framing.' });

  it('fills the frame with the configured focal point when there is no crop', () => {
    expect(portraitLayout(framed({ sources: ['celia.png'], objectPosition: '50% 14%' })))
      .toMatchObject({ objectFit: 'cover', objectPosition: '50% 14%', width: '100%', height: '100%', left: '0%', top: '0%' });
  });

  it('defaults to a centred focal point when none is authored', () => {
    expect(portraitLayout(framed({ sources: ['celia.png'] })))
      .toMatchObject({ objectPosition: '50% 50%', width: '100%', height: '100%' });
  });

  it('scales and offsets the source for a configured crop', () => {
    expect(portraitLayout(framed({ sources: ['celia.png'], objectPosition: '50% 50%', crop: { x: 0.06, y: 0, width: 0.88, height: 1 } })))
      .toMatchObject({ objectPosition: '50% 50%', width: '113.6364%', height: '100%', left: '-6.8182%', top: '0%' });
  });
});

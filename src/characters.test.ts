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

  it('supports SVG, PNG and JPEG files alongside each other', () => {
    const formats = new Set(Object.values(portraits).map(({ format }) => format));
    expect(formats).toEqual(new Set<PortraitFormat>(['svg', 'png', 'jpg']));
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

  it('looks up typed ids and rejects unknown speakers', () => {
    expect(getCharacter('mia')).toMatchObject({ id: 'mia', name: 'Mia' });
    expect(getCharacter('frankie').name).toBe('Frankie');
    expect(isCharacterId('mia')).toBe(true);
    expect(isCharacterId('mia-meridian-vans')).toBe(false);
    expect(isCharacterId('toString')).toBe(false);
  });

  it('resolves the authored format, preferring the raster for live dialogue', () => {
    expect(resolvePortrait(characters.mia)).toMatchObject({ source: 'mia.png', format: 'png' });
    expect(resolvePortrait(characters.frankie)).toMatchObject({ source: 'frankie.jpg', format: 'jpg' });
    expect(portraits['mia.svg'].format).toBe('svg');
  });

  it('resolves the right name and portrait when the speaker changes', () => {
    const mia = messageCharacter({ speaker: 'mia' });
    const frankie = messageCharacter({ speaker: 'frankie' });
    expect(mia.name).toBe('Mia');
    expect(frankie.name).toBe('Frankie');
    expect(resolvePortrait(mia).src).not.toBe(resolvePortrait(frankie).src);
  });

  it('rejects invalid metadata instead of shipping it', () => {
    const base = characters.mia;
    const withPortrait = (portrait: Partial<CharacterPortrait>): Character => ({ ...base, portrait: { ...base.portrait, ...portrait } });
    expect(() => validateCharacterCatalogue({ mystery: { ...base, id: 'someone-else' } })).toThrow(/id mismatch/);
    expect(() => validateCharacterCatalogue({ mia: withPortrait({ sources: ['missing.png'] as never }) })).toThrow(/unknown portrait/);
    expect(() => validateCharacterCatalogue({ mia: withPortrait({ objectPosition: 'sideways' }) })).toThrow(/objectPosition/);
    expect(() => validateCharacterCatalogue({ mia: withPortrait({ crop: { x: 0.5, y: 0, width: 0.8, height: 1 } }) })).toThrow(/crop/);
    expect(() => validateCharacterCatalogue({ mia: withPortrait({ crop: { x: 0, y: 0, width: 0, height: 1 } }) })).toThrow(/crop/);
  });
});

describe('portrait layout', () => {
  it('fills the frame with the configured focal point when there is no crop', () => {
    expect(portraitLayout(characters.mia)).toMatchObject({ objectFit: 'cover', objectPosition: '50% 14%', width: '100%', height: '100%', left: '0%', top: '0%' });
  });

  it('scales and offsets the source for a configured crop', () => {
    expect(portraitLayout(characters.frankie)).toMatchObject({ objectPosition: '50% 50%', width: '113.6364%', height: '100%', left: '-6.8182%', top: '0%' });
  });
});

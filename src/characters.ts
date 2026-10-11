import { portraits, type PortraitFormat, type PortraitSourceId } from './portraits';

/** Normalised source rectangle (0..1) used to crop a portrait inside its frame. */
export type PortraitCrop = Readonly<{ x: number; y: number; width: number; height: number }>;

export type CharacterPortrait = Readonly<{
  /** Ordered authored files; the first source available in the registry wins. */
  sources: readonly PortraitSourceId[];
  /** CSS object-position; frames use `object-fit: cover`, so this sets the focal point. */
  objectPosition?: string;
  /** Optional crop of the source file, useful when the art has generous margins. */
  crop?: PortraitCrop;
}>;

export type Character = Readonly<{
  id: string;
  name: string;
  portrait: CharacterPortrait;
  attribution: string;
}>;

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
};

/**
 * Authored characters with immutable metadata. Names are display labels; the
 * stable `id` is what story beats reference, so a name can change without
 * rewriting dialogue.
 */
const catalogue = {
  mia: {
    id: 'mia',
    name: 'Mia',
    // Raster first for consistent framing; the original vector is retained as the authored alternate.
    portrait: { sources: ['mia.png', 'mia.svg'], objectPosition: '50% 14%' },
    attribution: 'Portrait art created for Taxi Chaos (mia.svg vector, mia.png raster).',
  },
  frankie: {
    id: 'frankie',
    name: 'Frankie',
    portrait: { sources: ['frankie.jpg'], objectPosition: '50% 50%', crop: { x: 0.06, y: 0, width: 0.88, height: 1 } },
    attribution: 'Portrait art created for Taxi Chaos (frankie.jpg raster).',
  },
} satisfies Record<string, Character>;

export type CharacterId = keyof typeof catalogue;
export const characters = deepFreeze(catalogue);

const OBJECT_POSITION = /^(?:left|center|right|top|bottom|-?\d*\.?\d+(?:%|px|em|rem))\s+(?:left|center|right|top|bottom|-?\d*\.?\d+(?:%|px|em|rem))$/;
const inUnitRange = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;

/** Fails fast on authored mistakes: unknown portraits, mismatched ids, bad framing. */
export function validateCharacterCatalogue(entries: Readonly<Record<string, Character>> = characters): void {
  for (const [id, character] of Object.entries(entries)) {
    if (character.id !== id) throw new Error(`Character id mismatch: entry "${id}" declares "${character.id}"`);
    if (!character.name.trim()) throw new Error(`Character ${id} needs a display name`);
    if (!character.attribution.trim()) throw new Error(`Character ${id} needs attribution`);
    const { sources, objectPosition, crop } = character.portrait;
    if (!sources.length) throw new Error(`Character ${id} needs at least one portrait source`);
    for (const source of sources) if (!Object.hasOwn(portraits, source)) throw new Error(`Character ${id} references unknown portrait ${source}`);
    if (objectPosition && !OBJECT_POSITION.test(objectPosition.trim())) throw new Error(`Character ${id} has an invalid objectPosition: ${objectPosition}`);
    if (crop) {
      const { x, y, width, height } = crop;
      if (!inUnitRange(x) || !inUnitRange(y) || !(width > 0 && width <= 1) || !(height > 0 && height <= 1) || x + width > 1 + 1e-9 || y + height > 1 + 1e-9) {
        throw new Error(`Character ${id} has an out-of-range crop: ${JSON.stringify(crop)}`);
      }
    }
  }
}

export type ResolvedPortrait = Readonly<{ source: PortraitSourceId; src: string; format: PortraitFormat }>;

/** Picks the first authored source that exists, so portraits can be swapped by format. */
export function resolvePortrait(character: Character): ResolvedPortrait {
  for (const source of character.portrait.sources) {
    const portrait = portraits[source];
    if (portrait) return Object.freeze({ source, src: portrait.src, format: portrait.format });
  }
  throw new Error(`No bundled portrait for character ${character.id}`);
}

export type PortraitLayout = Readonly<{
  src: string; objectFit: 'cover'; objectPosition: string;
  width: string; height: string; left: string; top: string;
}>;

/** DOM-free layout maths shared by the view and its tests. */
export function portraitLayout(character: Character): PortraitLayout {
  const { src } = resolvePortrait(character);
  const { objectPosition = '50% 50%', crop } = character.portrait;
  const percent = (value: number) => `${Math.round(value * 1e6) / 1e4}%`;
  if (!crop) return Object.freeze({ src, objectFit: 'cover' as const, objectPosition, width: '100%', height: '100%', left: '0%', top: '0%' });
  return Object.freeze({
    src, objectFit: 'cover' as const, objectPosition,
    width: percent(1 / crop.width), height: percent(1 / crop.height),
    left: percent(-crop.x / crop.width), top: percent(-crop.y / crop.height),
  });
}

export function getCharacter(id: CharacterId): Character { return characters[id]; }
export function isCharacterId(value: string): value is CharacterId { return Object.hasOwn(characters, value); }
/** Resolves the character a dialogue message belongs to. */
export function messageCharacter(message: { speaker: CharacterId }): Character { return characters[message.speaker]; }

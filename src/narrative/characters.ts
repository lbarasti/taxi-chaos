import characterData from './characters.json';
import { portraitSourceIds, type PortraitSourceId } from './portrait-manifest';

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

export type CharacterId = keyof typeof characterData;

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
};

/**
 * Authored characters with immutable metadata. The source of truth is
 * `characters.json` so new cast members are config + assets, never game or view
 * code. Names are display labels; the stable `id` is what story beats reference,
 * so a name can change without rewriting dialogue.
 */
const catalogue = characterData as Record<CharacterId, Character>;
export const characters: Readonly<Record<CharacterId, Character>> = deepFreeze(catalogue);

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
    for (const source of sources) if (!(portraitSourceIds as readonly string[]).includes(source)) throw new Error(`Character ${id} references unknown portrait ${source}`);
    if (objectPosition && !OBJECT_POSITION.test(objectPosition.trim())) throw new Error(`Character ${id} has an invalid objectPosition: ${objectPosition}`);
    if (crop) {
      const { x, y, width, height } = crop;
      if (!inUnitRange(x) || !inUnitRange(y) || !(width > 0 && width <= 1) || !(height > 0 && height <= 1) || x + width > 1 + 1e-9 || y + height > 1 + 1e-9) {
        throw new Error(`Character ${id} has an out-of-range crop: ${JSON.stringify(crop)}`);
      }
    }
  }
}

export function getCharacter(id: CharacterId): Character { return characters[id]; }
export function isCharacterId(value: string): value is CharacterId { return Object.hasOwn(characters, value); }
/** Resolves the character a dialogue message belongs to. */
export function messageCharacter(message: { speaker: CharacterId }): Character { return characters[message.speaker]; }

/**
 * DOM-free portrait manifest.
 *
 * The declared file names are stable portrait identities referenced by the
 * character catalogue and the authored mission dialogue. Keeping the list here,
 * separate from the eager `import.meta.glob` image registry in `portraits.ts`,
 * lets schema/character/mission validation run in Node without pulling in any
 * browser asset loader or emitting runtime image requests.
 */
import manifest from './portrait-manifest.json';
export type PortraitFormat = 'svg' | 'png' | 'jpg' | 'jpeg' | 'webp';

/** Portrait master files shipped with the game; keep in sync with
 * `src/assets/characters/`. The standalone build inlines a WebP derivative from
 * `src/assets/optimized/characters/`. */
export const portraitSourceIds = Object.freeze(manifest);
export type PortraitSourceId = (typeof portraitSourceIds)[number];

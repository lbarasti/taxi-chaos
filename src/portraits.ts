import type { Character } from './characters';
import { portraitSourceIds, type PortraitFormat, type PortraitSourceId } from './portrait-manifest';

export { portraitSourceIds };
export type { PortraitFormat, PortraitSourceId };

/**
 * Build-time portrait registry.
 *
 * Every portrait file is imported eagerly with `?inline`, so it becomes a data
 * URL in development and in the standalone production HTML. That keeps the game
 * offline and independent of the generic asset inline threshold: adding a raster
 * portrait cannot silently emit an external file that breaks the single-file build.
 *
 * This module is the only place that reaches for browser assets. Character and
 * mission validation deliberately depend on the DOM-free `portrait-manifest`
 * instead, so they can run without an image loader.
 */
export type Portrait = Readonly<{ src: string; format: PortraitFormat }>;

const portraitModules = import.meta.glob('./assets/characters/*.{svg,png,jpg,jpeg}', {
  eager: true, query: '?inline', import: 'default',
}) as Record<string, string>;

const modulePath = (id: PortraitSourceId) => `./assets/characters/${id}`;
const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

function formatOf(name: string): PortraitFormat {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (extension === 'svg' || extension === 'png' || extension === 'jpg' || extension === 'jpeg') return extension;
  throw new Error(`Unsupported portrait format: ${name}`);
}

export const portraits: Readonly<Record<PortraitSourceId, Portrait>> = Object.freeze(
  Object.fromEntries(portraitSourceIds.map((id) => [id, Object.freeze({ src: portraitModules[modulePath(id)], format: formatOf(id) } satisfies Portrait)])),
) as Readonly<Record<PortraitSourceId, Portrait>>;

/** Throws when the declared registry and the checked-in files drift apart. */
export function validatePortraitRegistry(): void {
  const bundled = Object.keys(portraitModules).map(fileName).sort();
  const declared = [...portraitSourceIds].sort();
  if (bundled.join() !== declared.join()) throw new Error(`Portrait registry mismatch: bundled [${bundled}] vs declared [${declared}]`);
  for (const id of portraitSourceIds) {
    const { src } = portraits[id];
    if (typeof src !== 'string' || !src.startsWith(`data:image/`)) throw new Error(`Portrait ${id} was not inlined as a data URL`);
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

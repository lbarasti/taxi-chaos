/**
 * Build-time portrait registry.
 *
 * Every portrait file is imported eagerly with `?inline`, so it becomes a data
 * URL in development and in the standalone production HTML. That keeps the game
 * offline and independent of the generic asset inline threshold: adding a raster
 * portrait cannot silently emit an external file that breaks the single-file build.
 *
 * The file name is the stable portrait identity referenced by the character
 * catalogue in `src/characters.ts`.
 */
export type PortraitFormat = 'svg' | 'png' | 'jpg' | 'jpeg';
export type Portrait = Readonly<{ src: string; format: PortraitFormat }>;

/** Portrait files shipped with the game; keep in sync with `src/assets/characters/`. */
export const portraitSourceIds = Object.freeze(['mia.png', 'mia.svg', 'frankie.jpg'] as const);
export type PortraitSourceId = (typeof portraitSourceIds)[number];

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

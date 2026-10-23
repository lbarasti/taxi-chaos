/**
 * Bundled artwork paths. Raster masters stay beside the authored catalogue at full
 * resolution for measurement and future edits; the standalone build imports the
 * display-resolution derivative `artwork-optimize` writes from each PNG.
 */
export function bundledArtworkPath(source: string): string {
  return source.endsWith('.png') ? `optimized/${source.slice(0, -'.png'.length)}.webp` : source;
}

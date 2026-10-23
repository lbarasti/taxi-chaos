import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { propArtwork } from '../artwork/catalogue';
import { artworkRecords, objectRecords } from './content';
import { compileArtworkCatalogue, compileBuildingCatalogue, compileObjectCatalogue } from './compile';
import { inlineEntries, renderCatalogueModule } from './generate';
import { artworkInline, artworkSources } from './generated';
import { measureArtworkSources } from './png';

const path = (relative: string) => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const read = (png: string) => {
  try { return readFileSync(path(`assets/${png}`)); }
  catch { return undefined; }
};
describe('inline artwork manifest', () => {
  it('measures every referenced PNG, so adding an image needs no registration', () => {
    expect(artworkSources).toEqual(measureArtworkSources(inlineEntries(artworkRecords, objectRecords), read, read));
  });

  it('inlines exactly the referenced images, one per artwork ID', () => {
    expect(Object.keys(artworkInline)).toEqual(inlineEntries(artworkRecords, objectRecords).map(entry => entry.id));
    for (const source of Object.values(artworkInline)) expect(source.length).toBeGreaterThan(0);
  });

  it('stays in sync with its renderer, so the prep CLI can check it offline', () => {
    expect(readFileSync(path('catalogue/generated.ts'), 'utf8')).toBe(renderCatalogueModule(inlineEntries(artworkRecords, objectRecords), artworkSources));
  });

  it('resolves every authored reference without engine edits', () => {
    const catalogue = compileArtworkCatalogue(artworkRecords, artworkSources);
    const objects = compileObjectCatalogue(objectRecords, artworkSources, artworkRecords);
    const objectArtwork = objectRecords.filter(record => objects[record.id].artwork?.[0]?.image === record.id).map(record => record.id);
    expect(Object.keys(propArtwork)).toEqual([...artworkRecords.filter(record => record.layer === 'structure').map(record => record.id), ...objectArtwork]);
    expect(Object.keys(catalogue.ground)).toEqual(artworkRecords.filter(record => record.layer === 'ground').map(record => record.id));
    expect(() => compileBuildingCatalogue(objectRecords, artworkSources, artworkRecords)).not.toThrow();
  });
});

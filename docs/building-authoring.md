# Adding city buildings

Building content has two entry points:

- `src/buildings.ts`: reusable types with default dimensions, storeys, artwork,
  fallback style and sign placement.
- `src/city-content.ts`: instances with stable IDs, types, positions, owning
  blocks, display labels and optional footprint/sign overrides or service entrance.

The city remains read-only in the map editor. These are repository authoring
files, not a new imported map format. Existing countryside/harbour content keeps
its own established workflows.

## Replace one shop

Add a type to `buildingDefinitions`, reusing an existing roof or fallback:

```ts
bakery: {
  width: 10, height: 10, storeys: 2,
  artwork: [propArtwork.shopConcrete],
  presentation: {
    fallback: 'shop',
    sign: { width: 8.6, inset: 0.95, size: 0.72, color: '#f0dfae' },
  },
},
```

Add its placement to the `buildings` array in `city-content.ts`:

```ts
{
  id: 'city-building-0-2-shop-0-0', type: 'bakery', owner: 'city',
  blockId: 'city-block-0-2', position: vec(14, 94),
  label: 'BAKERY', color: '#596b70',
},
```

A matching stable ID replaces only that generated building, preserving its
neighbours and alleys. A new ID adds a building in the declared block. Set
`replaceBlock: true` explicitly when the placement should replace the entire
generated block; campus ownership also replaces its declared blocks.

The type name becomes part of the TypeScript placement type automatically.
Navigation and rendering need no new building-specific branches. Renaming the
display label or changing the placement ID never selects a different building
type. Optional width/height overrides update the collision body, artwork bounds
and light outline together. Use artwork suited to the footprint's aspect ratio.

For a new PNG, register its inline import in `src/artwork/images.ts` and its
bounds/crop/silhouette in `src/artwork/catalogue.ts`, then reference that artwork
from the type. Existing artwork can be reused directly. Available procedural
fallbacks are `shop`, `commercial`, `terraced` and `wards`.

## Replace streets with a larger site

Add a campus with its stable ID, rectangular bounds and occupied block IDs.
Declare four safe resident homes for each replaced block, in the existing
resident order, and any perimeter props. This supports both horizontal and
vertical sites; homes and furniture are authored data, not hospital rules.
The current hospital campus is a complete example in `city-content.ts`.

Open and closed street segments are derived from campus bounds. Road rendering,
traffic neighbour selection and detour routing use those compiled segments.
Relocate any affected parking bays and initial traffic descriptors in
`src/map/default-map.json`, retaining their stable IDs. Validation reports
overlaps and blocked routes rather than silently moving authored content.

`recoveryEntrance` declares an exterior primary recovery service independently
of the building's display name or type; at most one primary entrance is allowed.
The game reads the entrance from its compiled map.

All compiled building data is detached and recursively frozen with the map.
Generation retains the historical RNG draws, including when replacing a park.

## Verify

Run `npm test`, `npm run build` and `npm run map:check`, then use
`node tools/city-scale-check.mjs` and `node tools/artwork-check.mjs` for offline
desktop/touch screenshots, driving, lighting and fallback checks.

`src/buildings.test.ts` demonstrates a renamed/resized building, a new type,
a second horizontal campus, single-shop replacement, park replacement and
validation of unsafe resident homes or recovery entrances.

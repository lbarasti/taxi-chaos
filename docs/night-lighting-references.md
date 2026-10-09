# Night lighting references

Date: 2026-10-09

## Problem

The first night pass was too dark: a near-opaque blue-black mask crushed the streets, facades and
pavement to black, so only small hard light blobs survived. Real night-city photographs read very
differently — legible deep-indigo shadows plus dominant warm pools and saturated neon.

## References consulted

Images were opened and viewed in a browser (not just described) where possible.

- Wikimedia Commons, Basile Morin — *Kabukicho red gate and colorful neon street signs at night,
  Shinjuku, Tokyo* (viewed). https://commons.wikimedia.org/wiki/File:Kabukicho_red_gate_and_colorful_neon_street_signs_at_night,_Shinjuku,_Tokyo,_Japan.jpg
- Unsplash — *Busy street with neon signs at night in Tokyo* (viewed).
  https://unsplash.com/photos/busy-street-with-neon-signs-at-night-in-tokyo-uGWcJfe174k
- PAKUTASO — *Kabukicho Central Road at Night*.
  https://www.pakutaso.com/en/20230918257toho.html
- PAKUTASO — *Kabukicho Ichiban-gai at Night with Neon Signs* (notes warm yellows vs cool blues,
  dark sky contrast). https://www.pakutaso.com/en/20191111308post-24040.html
- PAKUTASO — *Rainy Night Alley with Neon Sign Reflections* (signage-only light, red/blue/yellow
  against dark sky). https://www.pakutaso.com/en/20200721195post-28003.html
- Pexels — *Vibrant Nightlife in Shinjuku, Tokyo* (free stock).
  https://www.pexels.com/photo/vibrant-nightlife-in-shinjuku-tokyo-31729749/
- VEETER — *Neon Storefront Night* (deep indigo night, pink/electric-blue tubes, headlight bursts).
  https://img.veeter.com/neon-storefront-night-maxixe-street
- BudgetPixel — *Rainy night city street with neon storefronts* (magenta/cyan neon, amber sodium
  streetlights, deep indigo sky, warm storefront spill). https://budgetpixel.com/p/67564
- StockCake — *Blue Hour Architecture* (blue-hour sky, warm amber windows, cool blue shadows).
  https://stockcake.com/i/blue-hour-architecture_3918554_1653350
- Reference articles on technique and colour temperature contrast:
  James Maher, *Night City and Street Photography* (pockets of light, deep shadows, seek light
  pools) https://jamesmaherphotography.com/night-city-street-photography/ ;
  Zoner, *Nighttime City Portraits* (cool blues against warm oranges).
  https://learn.zoner.com/nighttime-city-portraits-storefronts-neon-lights-and-flash-in-real-life-situations/

## What the photos actually show

1. **Sky/shadow is deep indigo, not black.** Blue-hour and lit-night frames keep a cool hue in the
   dark regions (roughly `#1b2740`–`#2a3550`), so unlit surfaces remain *readable*, just dark.
2. **Warm light dominates the street level.** Sodium/amber streetlamps and warm storefront spill are
   the base layer; they wash the pavement and lower facades.
3. **Neon is a saturated accent, not the base.** Pink/magenta, cyan, red-orange, green and blue
   signs punctuate the warm layer; wet pavement doubles the colour.
4. **Light bleeds.** Sources halate/bloom into the haze rather than ending at a hard circle edge.

## Translation to the Canvas pipeline

Owned files: `src/day-night.ts`, `src/lighting.ts` (`ambientPass`, `collectLights`, constants),
`src/renderer.ts` (`prop()` building/lamp/station/pump art only).

- **Ambient (deep indigo, not black):** night keyframe `darkness` lowered from ~0.68 to ~0.56, the
  blue tint made slightly more saturated, and `ambientPass` weakened (`maskDark` 0.94→0.8,
  `maskTint` 0.8→0.72) with a lifted cool shadow colour mixed against `[24,36,72]` plus a faint cool
  screen `lift`. This raises night shadows from ~20 to ~40 blue without flattening daytime.
- **Warm base + neon accents:** streetlamp pools widened/flattened (radius 5.5→8.5, `inner`
  0.16→0.32, intensity 0.95→1.0); storefront wash widened (radius 5→6.5, `inner` 0.22→0.34) and
  every third shopfront adds one saturated neon light from a fixed six-colour palette (bounded
  sprite cache).
- **Bleed/halation:** `LIGHT_GLOW` 0.5→0.58 so warm pools and neon glow softly into the haze.
- **Stable pools:** gradients are cached at a fixed resolution and drawn at the exact projected
  world radius. Speed-dependent camera zoom no longer snaps light coverage between size buckets;
  cache keys include the radial core fraction as well as cone spread and colour.
- **Art to receive the light:** lamps get a warm head and halo; shopfronts get emissive upper-floor
  window bands and (every third) a neon sign strip; the service station gets a lit fascia/canopy and
  warm pumps; barracks/depot get a pair of lit windows. Headlights gained a short warm ground pool;
  cones keep their existing beam. No runtime images or network.

## Verification

`npm test` (208 tests, 14 files) and `npx tsc --noEmit` pass. Browser checks at 23:00/19:00/12:00 in
an isolated context (see the task report) confirmed: readable indigo streets, broad warm pools,
pink/cyan neon accents, a lit service station and pumps, with no console errors.

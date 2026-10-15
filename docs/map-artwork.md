# Top-down map artwork

The first artwork pass replaces standard 10 × 10 m city shops and urban trees
with original SVG illustrations, and adds a repeating asphalt grain beneath city
blocks. Other buildings, the countryside, harbour and beach keep their procedural
art. Vehicle, pedestrian, map and collision data are unchanged.

## Where to work

- `src/assets/map/`: self-contained image files (SVG now; transparent PNG works too).
- `src/artwork/catalogue.ts`: image identity, bounds in metres, collision-centred
  alignment, sun-shadow silhouette and optional directed-light occluder.
- `src/artwork/images.ts`: explicit `?inline` imports, shared image decoding and
  cached world-anchored ground patterns.
- `src/renderer.ts`: ground and structure passes, dynamic signs and fallback drawing.

The existing default appearance rules choose city shops by kind, size and position,
never by display name. No map schema change or saved-map migration is needed for
this first pass. Add authored visual IDs when individual map objects need distinct
styles; do not use their labels as asset identifiers.

## Artist contract

All artwork uses a straight overhead view, with north at the top. The anchor is the
collision body's centre. Bounds describe the *entire image*, including transparent
padding, relative to that anchor. A 212 × 212 shop image occupies 10.6 × 10.6 m:
its bounds start at (-5.3, -5.3), while its physical body stays 10 × 10 m. Urban
tree art occupies 5.2 × 5.2 m around its existing 1.8 × 1.8 m collision body.

Keep the shop sign panel blank; runtime text retains the real business name. Avoid
baked cast shadows: the renderer paints a separate silhouette displaced by the
current sun. Local roof/leaf shading can stay in the image. An optional convex
occluder blocks headlight cones; it is independent of both the image bounds and
collision body, and rotates with the prop. Trees retain their existing soft-light
behaviour; their canopies do not become solid walls or new headlight blockers.

To add an image, import it with `?inline` in `images.ts`, register its image ID and
metre bounds in the catalogue, and extend the narrow appearance rule. PNG imports
use the same path; no SVG-specific runtime drawing is involved. Use self-contained
SVGs without scripts, external images, fonts or references to other files. PNGs
should include transparency where needed. Supply enough pixels for the maximum
normal zoom and device pixel ratio; the pilot images exceed that requirement.

Images decode before the first game frame and are shared with editor previews.
A failed image falls back to procedural drawing and its original light occluder.
Dead props go through the existing rubble/destruction drawing before live artwork
is considered. Dedicated damaged or destroyed images can follow when a particular
asset needs them; this pass does not add an unused state/variant system.

The asphalt tile repeats every 4 m, anchored at world origin. It is transparent
grain over the existing road colour, so daytime colour changes still work. Road
markings and sidewalks are drawn above it. Surface physics continues to use map
geometry, never pixel colours. The tile pattern is cached per canvas context.

Ground artwork remains below props and actors. Shop/tree artwork uses the existing
structure pass; actors are drawn afterwards. Foreground canopy occlusion, stacked
floors and isometric depth sorting are outside this first top-down pass.

## Verification

`npm test` covers physical footprint independence, rotating light outlines,
destruction and procedural defaults. `npm run build` checks TypeScript and enforces
one standalone HTML with embedded assets. `node tools/artwork-check.mjs` exercises
the offline production build, actual SVG decoding/drawing, missing-image fallback,
night lighting, physical tree destruction, fixed-step driving and compact touch
layouts. Screenshots are written to `scenario-runs/artwork` by default.

Verification for this first pass: 710 tests in 56 files passed, strict TypeScript
and the standalone build passed, and the offline Chromium check passed on
1440 × 900 desktop, 390 × 844 portrait and 844 × 390 landscape. An additional
context deliberately failed all map image loads and retained playable procedural
fallbacks. No browser errors or external HTTP(S) requests were observed.

![City shops and park in daylight](screenshots/map-artwork/desktop-day.png)
![The same artwork under night lighting](screenshots/map-artwork/desktop-night.png)
![Compact portrait layout](screenshots/map-artwork/portrait-day.png)

# Internet assets

Space Grotesk by Florian Karsten, downloaded from Google Fonts.
https://fonts.google.com/specimen/Space+Grotesk
Licensed under the SIL Open Font License 1.1.
https://github.com/floriankarsten/space-grotesk/blob/master/OFL.txt

City art combines procedural drawing and self-contained embedded artwork.

`src/assets/characters/` includes the user-supplied PNG portraits for Mia,
Frankie, Rosa, Celia, Adrian Vale and Bea. The nine Open Shore SVG identity
cards (Mara, Eli, Victor, Leila, Harker, Lena, Iris, Tom and Ruth) are original
provisional vector art created for Taxi Chaos, with initials for clear identity.
All portraits are bundled inline as data URLs with no external image service.

Sound FX attribution, source links, licences and editing notes are in
[`audio/CREDITS.md`](audio/CREDITS.md), embedded in the standalone HTML and
accessible from the game's welcome/pause settings.

## Map artwork

`map/shop-tar.png`, `map/shop-rust.png`, `map/shop-concrete.png`, and
`map/tree-worn.png` were generated for Taxi Chaos with OpenAI's built-in image
generation tool, using a user-supplied urban scene as a style reference. Prompt
direction was straight orthographic overhead, muted weathered materials, blank
runtime sign panels and no baked cast shadows. The three roofs use patched tar,
rusted corrugated metal and aged concrete; the tree uses an irregular olive/sage
canopy. Transparent export margins were trimmed and sprites resized to 256 px
roofs and a 192 px tree. Exact original prompts remain in Git history.
`map/asphalt.svg` is original vector surface detail.
These assets require no external fonts, images or runtime services.

`map/hospital-structure.png` adapts the user-supplied
`hospital-structure-v2.png` for the two-block Midtown Hospital. OpenAI's built-in
image-generation tool extended the roof vertically and retained its weathered
concrete, skylights, pipes and teal helipad. The original upload remains unchanged.
The adaptation requested a 26:66 footprint by adding matching roof sections,
preserving the circular helipad rather than stretching it, removing the red
cutout fringe and leaving a transparent background without external cast shadows.
Exact original prompts remain in Git history; current crop, metre bounds and
light outline are defined in `src/artwork/catalogue.ts`. The PNG is bundled
inline with a procedural fallback.

`map/luxury-condo.png` is the original straight-overhead transparent PNG supplied
by Lorenzo for the Ocean Walk condos. It is embedded unchanged; only transparent
export padding is cropped at draw time. The same asset appears at two beachfront
plots, with a procedural building fallback if image decoding fails.

`map/crate-shipping.png` and `map/bakery-front.png` are original pixel art created
for Taxi Chaos (simple generated artwork, no third-party source) for the shared
catalogue's representative crate and bakery building records. Both are small,
fully opaque sprites bundled inline with the other map artwork.

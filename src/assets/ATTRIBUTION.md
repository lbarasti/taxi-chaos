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
specifications are in `docs/map-artwork-prompts.md`. Transparent sprites are trimmed
and resized for gameplay. `map/asphalt.svg` is original vector surface detail.
These assets require no external fonts, images or runtime services.

`map/hospital-structure.png` adapts the user-supplied
`hospital-structure-v2.png` for the two-block Midtown Hospital. OpenAI's built-in
image-generation tool extended the roof vertically and retained its weathered
concrete, skylights, pipes and teal helipad. The original upload remains unchanged.
The adaptation prompt and sprite alignment are recorded in
`docs/hospital-artwork.md`. The PNG is bundled inline with a procedural fallback.

`map/luxury-condo.png` is the original straight-overhead transparent PNG supplied
by Lorenzo for the Ocean Walk condos. It is embedded unchanged; only transparent
export padding is cropped at draw time. The same asset appears at two beachfront
plots, with a procedural building fallback if image decoding fails.

# Hospital artwork

The user supplied `hospital-structure-v2.png` (1056 × 1312 RGBA) for Midtown
Hospital. The original upload is unchanged. OpenAI's built-in image-generation
tool extended that roof into a tall transparent sprite for the existing two-block
site, retaining the weathered concrete, two glazed strips, utility huts, pipes,
parapets and teal helipad.

The project asset is `src/assets/map/hospital-structure.png` (787 × 1997 RGBA).
The renderer crops transparent export padding with source bounds
(33, 16, 726, 1951) pixels, then paints it at (-13.3, -33.3, 26.6, 66.6) metres
relative to the collision centre. The physical building stays 26 × 66 m.
The building type supplies the artwork; neither placement ID nor display label
selects it. Footprint overrides scale the compiled image bounds and light outline.
Sun shadows and directed-light occlusion follow the artwork's outline.
The runtime HOSPITAL sign sits at the south frontage by the recovery entrance.

The PNG is decoded once and embedded directly in the standalone HTML. Failed
image loads retain the existing procedural hospital and its compiled silhouette.
The original street closure, parking, collisions, routing and RNG are unchanged.
No external fonts or runtime image requests are introduced.

## Adaptation

Tool: built-in `image_gen.imagegen`, edit target: the user-supplied image,
`transparent_background: true`.

Exact prompt:

```text
Use case: precise-object-edit
Asset type: transparent PNG straight-overhead hospital building sprite for a Canvas game.
Input image 1 is the edit target supplied by the user. Adapt this exact hospital roof to a much taller footprint. Preserve its weathered concrete, parapet masonry, cracks, patches, moss, utility pipes, stairwell huts, paired dark glazed skylights, and central teal circular helipad with its white H.
Required composition: one complete long rectangular hospital, portrait width:height 26:66 (about 1024 x 2592 pixels). Extend the existing structure substantially to the north and south, adding matching roof and skylight sections. Do not stretch the helipad or individual roof details: the helipad must remain a true circle with an undistorted H. Keep its size relative to the building width and its central position. The paired skylight strips may be extended with additional matching panels. Keep the whole outer perimeter visible with only a very small transparent margin.
Strict invariants: straight orthographic overhead camera, north at top, same gritty painterly raster style, no isometric view, no roads or landscaping, no people or vehicles, no cast shadow outside the building, no words or logos other than the existing H. Maintain the original building's identity and subdued palette. Clean the bright red fringe around the supplied cutout. Output genuine transparent background outside the complete building; do not bake a checkerboard or solid backdrop.
```

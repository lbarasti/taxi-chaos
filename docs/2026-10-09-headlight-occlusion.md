# Headlight occlusion & street-level receiver masking

Date: 2026-10-09

## Problem

The half-resolution lighting pass composites over the whole frame, so a vehicle's headlight cone
carved darkness out of building roofs and facades just as readily as out of the road. Lights had no
notion of which surfaces were at street level versus raised.

## Researched techniques

- Slembcke, *2D Lighting Techniques* — <https://www.slembcke.net/blog/2DLightingTechniques/>.
  Recommends building a per-light destination-alpha mask from tight occluder geometry and then
  multiplying the light by it. Notes CPU visibility polygons are heavy and pop as the camera moves,
  and that light-space multi-pass shadowing is "very expensive, requiring many passes per light".
- GameDev.net, *Dynamic 2D Soft Shadows* (r3065) — <https://gamedev.net/tutorials/programming/graphics/dynamic-2d-soft-shadows-r3065>.
  Extrudes shadow-caster boundary points away from the light into a shadow volume; overlapping
  shadows merge because the alpha target clamps. Also calls out the exact receiver problem here:
  shadows projected onto walls need a depth/receiver offset so only the floor is masked.
- GameDev StackExchange, *How can I simulate shadows for a 2D top-down game?* —
  <https://gamedev.stackexchange.com/questions/72034/how-can-i-simulate-shadows-for-a-2d-top-down-game>.
  Frames the trade-off: rotate sprites (cheap, static), static shadow maps (need rebaking), or
  ray tracing / visibility polygons (best looking, most expensive).

## Chosen technique

A hybrid of receiver masking and cheap shadow extrusion, staying on the existing reduced-resolution
Canvas 2D compositor with no per-pixel raycasting:

1. **Occluders.** Each alive raised structure (`building`, `shed`, `barracks`, `station`) contributes
   a convex world-space outline. Building outlines include the renderer's facade lift
   `(-0.25, -0.6)` so the mask matches the drawn roof silhouette. Destroyed structures become rubble
   and stop occluding. Outlines are viewport-culled once per frame.
2. **Shadow volume.** For an occluded light and each nearby occluder, the shadow volume is the
   convex hull of the outline plus the outline projected outward along each `light -> point` ray by
   `light.radius + 32`. Because the hull contains the outline, it simultaneously:
   - masks the receiver (no light on the roof/facade quad), and
   - extrudes the shadow onto the street behind the building.
3. **Clipping.** The compositor intersects the current canvas clip with
   `outerRect - shadowVolume` using `clip('evenodd')`, once per nearby occluder. Canvas clips
   intersect, so overlapping shadow volumes union correctly with no double-darkening and no
   winding-number leaks (a single nonzero multi-hole path cannot represent overlapping holes). It
   runs for both the darkness mask and the additive glow pass, so neither pass lands on roofs.

## Cost

`O(occluded beams x nearby occluders)`, with occluders viewport-culled per frame and range-rejected
per light via bounding circles. Only cone beams (headlights) and lights that set `occlude: true` are
processed, so soft radial lamps, window wash, fires, police and nitro keep their current behavior.
No visibility polygons, no per-pixel raycasting, no extra full-screen passes.

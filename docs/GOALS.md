# Goals

What the tool is for, and what "good" means for each capability.

## The job

Produce on-brand device mockups — stills and short clips — without opening a 3D
package, and without the output ever disagreeing with the preview.

## Capability goals

| Capability | Good means |
|---|---|
| **Framing** | Any aspect from 1:1 to 21:9 and up to 4K, with the preview letterboxed to the exact export aspect. What you see is the crop you get. |
| **Device** | Both models, all four colourways, switchable without reloading or losing the pose. Materials read as the real product. |
| **Screen content** | An upload lands undistorted at the display's true aspect, cover-cropped from the centre rather than squashed. |
| **Background** | Colour, procedural gradient, supplied mesh gradient, image or video — all rendered *inside* the canvas so they cannot be lost on export. |
| **Lighting** | Environment and individual lights are both adjustable, and the shadow is a real cast shadow that follows them. |
| **Animation** | Each property animates on its own row, with its own timing and easing. Move and rotate can overlap or run at different speeds. |
| **Export** | Frame-exact, deterministic, and containing every layer. Re-exporting the same frame twice gives identical pixels. |

## Non-negotiables

1. **The export is the product.** Anything that cannot survive `toBlob()` or a
   WebCodecs encode does not belong in the render path. This is why the
   background is a WebGL pass and not a DOM layer.
2. **Determinism over speed.** The timeline is seeked, never played, during
   export. Video sources are decoded, never scrubbed through a `<video>`.
3. **Measure, don't assume.** Every dimension in this project came from the
   source asset, not from a spec sheet. Every performance and correctness claim
   is checked in the browser before it is stated.
4. **Fail loudly at the boundary.** When the browser silently clamps a canvas or
   an encoder rejects a size, the app raises it rather than shipping a quietly
   wrong file.

## Success for the current phase

A user can key position at 0s and 2s and rotation at 1s and 3s, see them as two
independent rows, give them different easing, and export a clip where both
behave as shown. See `OUTCOME.md`.

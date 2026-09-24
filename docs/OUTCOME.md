# Outcome

Where the project stands, and what done looks like for the current phase.

## Delivered and verified

| Capability | State |
|---|---|
| Two devices, four colourways | Extracted from the source USDZ's own variant set; names cross-checked against the `.lsd` to eight decimal places |
| Adjustable frame | 7 presets plus custom, 1:1 to 21:9, up to 4K; preview letterboxed to the export aspect |
| Backgrounds | Mesh gradient (Lottie, default), procedural gradient, colour, image, video, transparent |
| Screen content | Image or video, cover-cropped to the display's true 0.4599 aspect; follows the colourway by default |
| Pose | Drag to rotate, shift-drag to pan, scroll to scale, DialKit numeric controls in step with all three |
| Saved views | Named, with thumbnails |
| Lighting | Environment (studio / HDRI / sky / none), key-fill-rim rig, shadow panel, ground modes, light gizmos |
| Shadows | Real cast shadow on a backdrop or floor; frustum invariant swept across 1,728 combinations |
| Timeline | Keyframes with easing — **single track, whole-transform** (the limitation this phase removes) |
| Export | PNG at 1-3x including transparent; MP4/H.264 and WebM/VP9, encoded frame-by-frame |
| Deploy | Public repo, MIT code with assets carved out, auto-deploy on push |

Measured: export is deterministic across independent passes; 3x matches 1x;
a 20-second clip encodes in roughly 4.4s at ~9ms a frame with shadows on.

## Done for this phase

The phase is complete when all of the following hold:

1. **Independent rows.** Position keyed at 0s and 2s and rotation at 1s and 3s
   appear as two rows, animate independently, and can carry different easing.
2. **`+ Animate`** adds a track for any registered property — transform, camera,
   lighting, screen and background — and already-added properties are shown as
   unavailable.
3. **Migration is silent.** A project saved with the old flat keyframes opens as
   three populated rows with its original timings and easing intact, without a
   prompt and without loss.
4. **Transition editor.** Selecting a segment shows its easing preset, bezier
   preview, start and duration, and editing them changes playback.
5. **Curve editor.** A value-axis graph with per-channel curves in axis colours
   and draggable handles.
6. **The shell matches the reference** — light theme, three-region layout, top
   bar, contextual inspector, view gizmo.
7. **Export still holds.** The existing verification set passes unchanged:
   deterministic pixels, transparent alpha, shadow frustum sweep, device switch.
   A clip animating transform *and* lighting shows both moving in the file.

## Deliberately not done

Animating colours or enums; multi-select, marquee and copy/paste of keyframes;
nested or per-object timelines; arbitrary add/remove lights; mirror floor;
per-object shadow toggles; bundled HDRI presets. Spline features with no meaning
here — Path Extrusion, Cloner, Simulation, Events, Variables & Data.

## Known open items

- `syncHelper` rebuilds light helpers on every `applyLighting` call. Harmless
  today; must be fixed before lighting is sampled per frame.
- Dragging a keyframe rebuilds the whole GSAP timeline on every `pointermove`.
- `compositionDuration` takes a keyframe array, which makes its signature the
  widest blast radius of any timeline change.
- One deliberate `exhaustive-deps` warning in `Dials.tsx`, documented in place.

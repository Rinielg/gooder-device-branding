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
| Timeline | Per-property tracks with independent timing and easing; auto-key; undo/redo; transition editor; value curve editor |
| Angles | Six built-in elevations plus saved presets, each carrying a description for later automation; shortest-path rotation; popover in the viewport and a full panel |
| Export | PNG at 1-3x including transparent; MP4/H.264 and WebM/VP9, encoded frame-by-frame |
| Loading a project | Every value validated against the defaults on import and on boot; an unknown device or a collapsed frame can no longer get in |
| Recovery | A render that throws shows what failed and offers a reload or a discard, instead of a blank page |
| Selection | Shift-click builds a group of keyframes, across tracks; dragging any member moves them all as one undo step, Delete removes them all |
| Clip length | A grip at the end of the ruler, which cannot be dragged in past the last key |
| Menus | A side menu of the app's real capabilities, and a searchable shortcut sheet on `?` |
| Tests | Vitest, 209 tests over the pure layer, plus a mutation harness (`npm run test:mutate`, 50/50) |
| Deploy | Public repo, MIT code with assets carved out, auto-deploy on push |

Measured: export is deterministic across independent passes; 3x matches 1x;
a 20-second clip encodes in roughly 4.4s at ~9ms a frame with shadows on.

## Done for this phase

**All seven hold as of `6584ba0`.** Kept for the record of what was asked.

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

## Where it stands after the Spline pass

Adopted from the audit: segment selection, timing controls in the inspector,
clip-style tracks with caps, the over-running ruler with the clip length
shaded, lane metrics, scrub handles on number fields, backfilling a key at 0,
spring easing, starter tiles, dragging a segment to carry both its keys.

Refused, with reasons in `docs/SPLINE-AUDIT.md`: no snapping, undo that merges
across properties, auto-key gated on a timeline being open, non-collapsing
inspector sections, and four documented Spline bugs.

## Known open items

- ~~`syncHelper` rebuilds light helpers on every `applyLighting` call.~~ Fixed:
  rebuilt only when the light's type changes.
- ~~Dragging a keyframe rebuilds the whole GSAP timeline on every
  `pointermove`.~~ Fixed: track actions replace only the track they touch, and
  the timeline reuses runners whose source `Track` is unchanged.
- ~~`compositionDuration` takes a keyframe array.~~ Fixed: it takes a
  `Composition`.
- One deliberate `exhaustive-deps` warning in `Dials.tsx`, documented in place.
- ~~Undo keeps 20 steps.~~ Now 50, measured by filling the stack.
- ~~A channel whose name is a word draws over its own value.~~ Fixed: the
  name moves above the field and stays the drag handle.
- Multi-select is shift-click only. There is no marquee, and no copy or
  paste of keyframes.
- ~~The clip's length grip could not extend the clip, and fought itself when
  shortening it.~~ Fixed: the mapping takes its limit as an argument and the
  grip passes none, and the zoom is frozen for the length of the drag.
- **There is no backend.** Projects live in `localStorage` and in exported
  files; uploaded media does not survive a reload. `docs/DATABASE.md` is the
  schema for putting this behind Supabase; none of it is built.
- ~~Deleting a track leaves the property where the last edit put it.~~ Fixed:
  deleting hands it back at its last sampled value.
- ~~The value graph draws easing accurately but does not let you drag bezier
  handles on the curve itself.~~ Fixed: clicking a curve between two points
  selects that transition, and a custom one is then shaped by handles on the
  graph. The axis holds still for the length of a drag, or a handle dragged
  upward would stretch the axis it is measured against and drift away from the
  pointer.
- **Commit-on-blur in a number field is unverified.** A hidden browser pane
  never has window focus, so no focus event fires at all and it cannot be
  exercised there. Enter commits, which does not depend on focus.
- ~~**A spring's curve preview clips** when the overshoot exceeds the graph's
  margin.~~ Fixed: the box is measured from the curve rather than fixed in
  advance. The spring that prompted it peaks at 1.375, which the old ±0.28
  margin placed 6% of the graph's height above its top edge.
- Coverage is the pure layer only. The three.js engine, the exporter and every
  pointer interaction are browser-verified.
- ~~A project file goes into the store unvalidated.~~ Fixed. Measured before
  the fix: a file naming an unknown device persisted, threw on the first render
  and left a blank page that reloading could not clear; a zero-sized frame
  collapsed the canvas. Both now fall back, and a reload recovers on its own
  without discarding the project.
- The store's own setters are typed, not guarded. `setDevice` will still take a
  junk id if something calls it past the types; the recovery boundary is what
  catches that, not validation.

# Context

Architecture, data flow, and why things are the way they are.

## Layout

```
Mockup/
├── app/                      the studio (Vite + React 19 + TS + vanilla three.js)
│   ├── src/engine/           renderer — no React
│   ├── src/state/store.ts    zustand; the single source of truth
│   ├── src/ui/               React panels
│   └── public/               models, textures, backgrounds, screen
├── tools/                    USDZ -> GLB pipeline
├── docs/                     this
├── iphone-18-pro.usdz        source model (both devices live inside it)
└── Gradient BG 1 - Balanced Desktop.json   source background animation
```

**React never touches three.js objects.** The engine is a set of plain classes;
`Viewport.tsx` owns their lifecycle and pushes store slices into them through
`useEffect`. Nothing in `src/engine/` imports React.

## The render path

```
Stage.render(t)
  ├── renderer.clear()
  ├── background pass      full-screen ShaderMaterial, own scene + ortho camera
  ├── renderer.clearDepth()
  └── main scene           device + shadow catcher + lights
```

`renderer.autoClear = false`; the clearing is explicit. **The background is
inside the canvas on purpose** — a DOM layer behind it could not be read by
`toBlob()` or captured by a video encoder, so it would vanish from every export.
That single decision shapes most of the rest.

## Engine files

| File | Owns |
|---|---|
| `Stage.ts` | Renderer, camera, the render path, export sizing, `relayout()` |
| `Device.ts` | GLB loading, colourway application, screen content, `localBounds` |
| `Background.ts` | The full-screen pass: colour, gradient, mesh, image, video |
| `LottieLayer.ts` | SVG-rendered Lottie rasterised to a texture |
| `Lighting.ts` | Environment (PMREM/HDRI/Sky), the key/fill/rim rig, helpers |
| `ShadowRig.ts` | The shadow catcher and the frustum fit |
| `Timeline.ts` | A paused GSAP timeline, seeked never played |
| `Exporter.ts` | Stills and video via mediabunny; deterministic frame stepping |
| `handle.ts` | Module-level handle so panels can reach the stage |

`relayout()` is the single place anything derived from the device transform,
camera or frame is recomputed. It is called from `applyStage`, `applyTransform`,
`setFrame` and `loadDevice` — because **export drives `applyTransform` per frame
but never `applyStage`**, so anything living only in the latter goes stale
mid-export.

## The model pipeline

The source USDZ contains **two devices**, not one — an iPhone 18 Pro
(72.675 × 149.961 mm) and a Pro Max (78.796 × 163.371 mm) — plus a `Color`
variant set with four colourways.

The supplied `.lsd` file uses different IDs that resolve against nothing in the
USDZ, so the USDZ is the source of truth. Its variants were cross-checked
against the `.lsd` by *value* and matched to eight decimal places, which gave
the naming: Burgundy = **Plum**, Glacier = **Sky Blue**.

glTF cannot carry a USD variant set, so `tools/build.sh` exports one GLB per
device with Black baked in, and generates `variants.json` describing the 18
materials each other colourway changes. Re-run it only if the source model
changes; the outputs are committed.

The display is material `KSynYqGGNGMUJti` on both models, driven through its
**emissive** channel. Screen content is cover-cropped to the display's true
aspect (0.4599), which is *not* the shipped wallpaper's 1:2.

## State

One zustand store. `Project` is the persisted shape, funnelled through
`PROJECT_KEYS` so persistence, export and import cannot drift apart. Persistence
is debounced 400 ms because playback writes the transform every frame.

Hydration runs at **module scope**, before `create()` — so a malformed value
throws before the app mounts, with no recovery path. That is why the merge and
migration functions are defensive.

`migrateLighting` is the precedent for any future migration: detect the old
shape, lift it into the new one, never bump `STORAGE_KEY`.

## Decisions and why

**Vanilla three.js, not react-three-fiber.** Export needs deterministic,
imperative frame stepping. R3F's reconciler is an obstacle there, not a help.

**mediabunny, not mp4-muxer.** `mp4-muxer` and `webm-muxer` are deprecated by
their own author in favour of it. It also supplies the *decoder* used to read
user video frame-accurately, so it is one dependency rather than two.

**The timeline is seeked, never played.** Playing ties frames to wall-clock time
and makes them irreproducible. Export seeks to `frame / fps`.

**Lighting modelled on Spline's split** — a scene-level environment supplying
image-based lighting and reflections, plus individually addressable lights.

**Light positions in device heights, not world units,** so the rig keeps its
shape across both models and any device scale.

**Shadow darkness is `ShadowMaterial.opacity`, not `shadow.intensity`.** The
latter is per-light and applies to every receiver, so it would also lighten the
device's own self-shadowing.

## Verification habit

Claims in this project are checked in the browser before they are made. The
established patterns, worth reusing:

- **Sweep an invariant**, don't spot-check. The shadow frustum is verified across
  1,728 combinations of fov, distance, scale, depth, rotation, softness, ground
  mode and frame preset.
- **Export twice and compare pixels** to prove determinism.
- **Decode the exported file** and sample it, rather than trusting that encoding
  succeeded.
- **Pause the rAF loop** (`setExporting(true)`) before measuring anything on the
  renderer, or `relayout()` will overwrite the value under test between frames.
- Dev-only hooks — `window.__stage`, `__engine`, `__store` — exist for exactly
  this and are stripped from production builds.

---

## Added since this file was first written

| Where | What |
|---|---|
| `src/engine/tracks.ts` | The track registry — one entry per animatable property. Eleven of them. Adding a property is one entry, not an edit in five files |
| `src/engine/presets.ts` | Angle presets: six built-in elevations, shortest-path rotation, scope, sanitising |
| `src/engine/starters.ts` | Ready-made animations for an empty timeline |
| `src/ui/spring.ts` | A damped spring as an easing function, normalised to its own settle time |
| `src/ui/ScrubField.tsx` · `src/ui/expr.ts` | Number fields whose handle scrubs and whose body types, with arithmetic |
| `src/ui/InspectorTiming.tsx` | Edit Keyframe / Edit Transition, in the inspector |
| `src/ui/CurveEditor.tsx` | The value graph, replacing the lanes on the same ruler |
| `src/ui/curvePaths.ts` | A channel's curve cut into selectable segments, and the axis they are drawn on |
| `src/ui/ease.ts` | A key's ease as a plain function, the box to draw it in, and bezier handles in graph units |
| `src/state/project.ts` | Coerces an untrusted project onto the shape of the defaults, at import and at boot |
| `src/ui/Recover.tsx` | The error boundary: what a render failure shows instead of a blank page |
| `src/state/selection.ts` | What is selected on the timeline, and what shift-click does to it |
| `src/ui/SideMenu.tsx` | The top-left menu — only things the app can actually do |
| `src/ui/ShortcutSheet.tsx` · `src/ui/shortcuts.ts` | The shortcut sheet and the one list behind it |
| `src/ui/projectFile.ts` | Save and load a project file, shared by the panel and the menu |
| `scripts/mutants.mjs` | Breaks each function on purpose to prove the tests notice |
| `src/ui/ruler.ts` | Pointer position to seconds, with the limit as an argument |
| `src/engine/screen.ts` | How an upload sits on the display: width edge to edge, top aligned, padded if short |
| `src/state/supabase.ts` | The client, or null when this build has no database |
| `src/state/cloud.ts` | Session, project list, autosave and conflict handling |
| `src/state/projectRow.ts` | The columns lifted out of the document, and the fingerprint that decides whether to save |
| `src/ui/CloudSheet.tsx` · `src/ui/CloudBadge.tsx` | Signing in, the project list, and whether the work is safe |

### The two ideas worth keeping in mind

**The registry is the single description of a track.** The `+ Animate` menu,
the rows, the GSAP build, the curve editor, presets and the sampler all read
from it. A `TrackId` that is not registered does not exist as far as the app is
concerned.

**A preset's value is a `Sample`** — the same shape the timeline evaluates to.
Applying one goes through the ordinary setters, so auto-key is the timeline
integration and there is no preset-shaped special case anywhere in the
timeline.

### Reference material

`docs/SPLINE-REFERENCE.md` says where the Spline screenshots are (outside the
repo, deliberately) and what each shows. `docs/SPLINE-AUDIT.md` is what we took
from the behavioural audit and what we refused.

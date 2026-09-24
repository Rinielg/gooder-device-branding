# Plan — Spline-style UI rebuild and per-property timeline

> The approved plan for the next phase, copied into the repo so it
> survives outside a chat session. Agreed scope: light theme; tracks for
> transform, camera, lighting and screen/background; rows + transition
> editor + curve editor; full Spline shell; **timeline capability first**.

---


## Context

Two things prompted this. First, a request for project documentation before any
more building, because this conversation is long and the reasoning behind a lot
of non-obvious decisions currently lives only in it. Second, five Spline
screenshots with a specific functional ask: **a user should see different
parameters animating on their own timeline rows, so move and rotate can be
controlled separately.**

Today the timeline is a single track, and every keyframe captures the entire
transform as one unit (`Keyframe { id, time, ease, transform }`). Position and
rotation cannot be timed independently, given different easing, or overlapped.
That is a data-model limitation, not a UI one, so this is a rewrite of the
timeline model with a UI rebuild on top.

**Agreed scope:** light theme matching the screenshots; tracks for transform,
camera, lighting and screen/background; rows plus the transition editor plus the
curve editor; the full Spline shell; **timeline capability first, shell and
theme second**, so multi-track animation is usable while the rest follows.

---

## Step 0 — Documentation (lands first, before any code)

Six files under `docs/`, matching the requested set. Purpose: a fresh session, or
another person, can pick this up without the conversation.

| File | Holds |
|---|---|
| `docs/BRIEF.md` | What the tool is, who it's for, the original ask and how it has grown |
| `docs/GOALS.md` | What the tool is for, and what "good" means for each capability |
| `docs/OUTCOME.md` | Definition of done for this phase, plus current delivered state |
| `docs/GUIDELINES.md` | House patterns: state shape, deep merge, engine/UI seam, verification habit |
| `docs/GUARDRAILS.md` | The verified traps, below — each with the symptom and the fix |
| `docs/CONTEXT.md` | Architecture map, data flow, file roles, decisions and their reasons |

`GUARDRAILS.md` is the highest-value file, because every entry is something
already paid for once:

- `PCFSoftShadowMap` is deprecated in r186 and silently downgraded; only VSM
  honours `shadow.radius`.
- VSM's radius is in shadow-map **texels**; at a tight frustum single digits look
  identical to a hard shadow.
- Outside a directional light's shadow frustum the mask is exactly `1.0` with no
  falloff — the frustum must be fitted to the catcher, not the footprint.
- Eight device meshes are `alphaMode: BLEND`; three's depth material ignores
  `opacity`, so casters must be gated on it.
- `scene.background = Color` sets `forceClear`, which bypasses `autoClear` and
  wipes the background pass. Never use it.
- `new Quality(12_000_000)` in mediabunny is a **quantizer**, not a bitrate.
- lottie-web's canvas renderer ignores gradient opacity stops; the mesh gradient
  must go through the SVG renderer.
- `<video>` seeking is off-by-one and `requestVideoFrameCallback` never fires on
  a paused element — export decodes containers instead.
- `Box3.setFromObject` measures the **world** box, so measuring a posed device
  inflates its size.
- Export captures in the same task as the render; no `await` may be introduced
  between `renderPrepared` and `toBlob`.
- A leaf value must replace in `deepMerge`, not fall back to base.

---

## The data model

```ts
export interface TrackKey {
  id: string
  time: number
  /** Ease used to arrive AT this key. 'custom' reads `bezier`. */
  ease: EaseName | 'custom'
  bezier?: [number, number, number, number]
  /** Channel name -> value, e.g. { x, y, z } or { fov, distance }. */
  value: Record<string, number>
}

export interface Track { id: TrackId; enabled: boolean; keys: TrackKey[] }

export interface Composition {
  schemaVersion: 1
  /** Explicit, no longer derived from the last keyframe. */
  duration: number
  tracks: Partial<Record<TrackId, Track>>
}
```

**A track registry is the centre of this design.** One declarative definition per
animatable property drives the `+ Animate` menu, the row list, the GSAP build,
the curve editor and the sampled-value application. Without it, four property
families across five UI surfaces becomes unmaintainable.

```ts
interface TrackDef {
  id: TrackId                     // 'position' | 'rotation' | 'scale' | 'camera' | …
  label: string                   // 'Position'
  group: 'Transform' | 'Camera' | 'Light' | 'Look'
  channels: { key: string; label: string; colour: string }[]   // X/Y/Z -> red/green/blue
  read(s: Store): Record<string, number>
  apply(stage: Stage, v: Record<string, number>): void          // cheap, synchronous
}
```

Tracks to register: `position`, `rotation`, `scale`, `camera` (fov, distance),
`keyLight` (intensity, x, y, z), `shadow` (opacity, softness), `environment`
(intensity, rotationY, exposure), `screen` (brightness), `background`
(gradient speed, vignette).

**Migration.** `migrateKeyframes(persisted)` sits beside the existing
`migrateLighting` in `src/state/store.ts` and fans each old flat keyframe into
three keys — position, rotation, scale — at the same time with the same ease.
Existing work is preserved and `STORAGE_KEY` is **not** bumped.

---

## Files

| File | Change |
|---|---|
| `src/engine/tracks.ts` **(new)** | The `TrackDef` registry — the single source of truth |
| `src/engine/Timeline.ts` | Build one GSAP timeline per track over per-track proxies; `sample(t)` returns a multi-slice sample. **Keep `duration` and the public shape** — `Exporter.ts` needs zero edits if they survive |
| `src/engine/types.ts` | `TrackKey`, `Track`, `Composition`, `TrackId`; keep `Transform`, `EASES`, `SavedView` untouched |
| `src/state/store.ts` | `composition` replaces `keyframes`; per-track actions; `migrateKeyframes`; `compositionDuration` takes the composition, not a `Keyframe[]` |
| `src/engine/Stage.ts` | `applySampled(sample)` routing each slice to a cheap synchronous setter |
| `src/engine/Lighting.ts` | **Only rebuild a helper when the light type changes**, and add a numeric-only fast path |
| `src/engine/Exporter.ts` | `renderFrame` applies the whole sample, not just the transform |
| `src/ui/TimelinePanel.tsx` | Rebuilt: three columns, per-track rows, shared `pxPerSec`, playhead spanning all rows |
| `src/ui/TransitionPanel.tsx` **(new)** | Spline's Edit Transition — preset, bezier preview, start, duration |
| `src/ui/CurveEditor.tsx` **(new)** | Value-axis graph, per-channel curves in axis colours, draggable handles |
| `src/styles.css` | Light tokens; timeline rules rewritten for scrollable, zoomable, multi-row tracks |
| `src/App.tsx` | Shell re-layout — the timeline moves **inside the left column**, inspector runs full height |

---

## Known couplings to handle

- **`keyframes.length > 0` appears three times** (rAF loop, `scrubTo`, the
  paused-edit effect) as "is there any animation?". Replace all three with one
  `hasAnimation` selector.
- **The timeline rebuilds on every `pointermove`** while dragging a keyframe,
  because each action returns a new array. With N tracks this needs either
  per-track rebuilds or a deferred commit on drag end.
- **`.track { overflow: hidden }` and `left: N%` positioning** make horizontal
  zoom impossible. The rebuild needs a scroll container of width
  `duration * pxPerSec`, with the ruler sticky and the playhead hoisted out of
  the individual row.
- **Keyframe selection is local `useState`** in `TimelinePanel`. Hoist to the
  store so the transition editor and curve editor can read it.
- **`addKeyframe` forces the first key to `t=0`** and coalesces within 1 ms. Both
  behaviours will feel wrong once tracks are independent — key only the property
  being edited, at the playhead, as Spline does.
- **Animated lighting must not go through `setLighting`**, which is async and
  keyed on the whole object in a `useEffect`. It gets the synchronous path.
- **Colours are hex strings**, so light colour is step-only unless decomposed to
  RGB channels. Out of scope for now; numeric channels only.

---

## Sequencing

1. ~~**Docs** (step 0).~~ **Done.**
2. ~~**Model:** registry, `Composition`, `migrateKeyframes`, `Timeline` rewrite,
   `hasAnimation`.~~ **Done** — `src/engine/tracks.ts` holds the registry,
   `CompositionTimeline` runs one paused GSAP timeline per track, and the old
   single-row panel still works by grouping keys that share a time. Verified:
   position keyed at 0s/2s and rotation at 1s/3s animate independently with
   different easing, untracked channels hold at the user's pose, a legacy
   project migrates into three populated tracks with its timings and easing
   intact, and two export passes at the same time are byte-identical.
3. ~~**Timeline UI:** rows, `+ Animate`, drag, zoomable ruler, hoisted playhead.~~
   **Done** — one row per property with its own keys, mute and remove per row,
   an Animate menu, drag-to-retime with cross-track snapping (alt to suspend),
   a pixel-based zoomable ruler (modifier-scroll, ±, Fit) and one playhead
   spanning every row. Composition length is now settable and authoritative.
4. ~~**Transition editor.**~~ **Done** — `src/ui/TransitionPanel.tsx`: the
   segment arriving at the selected key, with a sampled ease preview (accurate
   for non-bezier eases like `back` and `expo`), draggable handles for custom
   cubic-beziers, time, duration and per-channel value editing.
4b. ~~**Authoring UX pass.**~~ **Done** — auto-key once a property is animated,
   a per-row key indicator that toggles, playback that rewinds from the end,
   and an auto clip length that follows the keys rather than the background.
   Raised by use: the five-step flow (pose, key, click the timeline, pose,
   play) did not work, because step four was discarded and step five played
   dead air.
5. ~~**Extend tracks** to camera, lighting, screen and background — including
   the `Lighting` helper fix and `Stage.applySampled`.~~ **Done** — eleven
   tracks across four groups. `Stage` implements a `TrackTarget` of cheap
   per-frame setters and the registry drives them, base first and the sample
   over the top, so removing a track restores the dialled value with nothing
   having to notice. A fully animated frame costs 0.022ms; a 60-frame export
   with transform, environment, key light, shadow and background all animating
   runs at 7.6ms/frame, unchanged from before.
5b. **Panels follow the timeline.** **Done** — every animatable control reads
   the sampled value while its property is animated, marked with a small
   diamond, and editing one keys it at the playhead.
6. **Light theme:** tokens, then sweep every panel.
7. **Spline shell:** three-region layout, top bar, contextual inspector, gizmo.
8. **Curve editor** — the *value* graph (per-channel curves over time), which
   is distinct from the easing curve already in the transition editor and wants
   the shell's vertical space.

---

## Verification

`npm run dev` in `app/`, driven through the browser:

- **The ask:** key position at 0s and 2s, rotation at 1s and 3s, confirm they
  animate independently with different easing and that each row shows its own
  keys.
- **Migration:** load a project saved with flat keyframes and confirm it becomes
  three populated rows with the original timings and easing intact.
- **Playback and scrub:** scrub across a boundary where only one track has keys
  and confirm untracked properties hold rather than snapping.
- **Export parity:** re-run the existing two-pass pixel-equality check, then
  export a clip animating transform *and* lighting together and confirm the
  lighting moves in the file. Time it — the per-frame lighting path is the risk.
- **Regression:** the whole existing verification set still passes — shadow
  frustum sweep, transparent export alpha, deterministic export, device switch.
- `npx tsc --noEmit -p tsconfig.app.json`, `npx oxlint src`, `npm run build`.

---

## Out of scope

Animating colours or enums, multi-select and marquee on keyframes, copy/paste of
keys, nested timelines or per-object timelines (there is one object), and Spline
features with no meaning here — Path Extrusion, Cloner, Simulation, Events,
Variables & Data.

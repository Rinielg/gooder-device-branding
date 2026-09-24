# Guardrails

Every entry here has already cost time once. Each is **verified in this
codebase**, not recalled from documentation. Symptom first, because that is how
you will meet it again.

---

## three.js r186

**`PCFSoftShadowMap` does nothing.**
Deprecated in r186; `WebGLShadowMap.js:99` warns and reassigns it to
`PCFShadowMap`. It still exports and still typechecks. Soft shadows must use
`VSMShadowMap` — the only type that honours `shadow.radius`.

**VSM's radius is in shadow-map texels, not world units.**
With the frustum fitted tightly (~0.012 units per texel at 2048) a radius of 4
is visually identical to a hard shadow. The softness slider maps 0–2 onto 4–36.
*Symptom: the softness control appears to do nothing.*

**Outside a shadow frustum the mask is exactly 1.0, with no falloff.**
`shadowmap_pars_fragment.glsl.js:157,203`. An under-sized shadow camera does not
fade — it cuts a razor-straight line. Fit the frustum to the **catcher**, then
size the catcher to the shadow footprint. Getting that order backwards moves the
clip rather than removing it.
*Symptom: a hard straight edge across the image that moves when you orbit.*

**`scene.background = Color` wipes the background pass.**
It sets `forceClear`, which **bypasses `autoClear`** and clears colour and depth
at the start of the main render (`WebGLBackground.js:53-82`). This project never
assigns `scene.background`; the background is a full-screen shader pass.

**`Box3.setFromObject` measures the world box.**
Measuring a rotated device inflates its "height", which then feeds camera
distance and the shadow fit. `Device.measureLocal` neutralises the transform
first.
*Symptom: framing changes depending on the pose when you switch device.*

**`RGBELoader` is a deprecation shim** that warns on construction. Use
`HDRLoader`.

**`autoClear = false` does not break shadow maps.** The shadow pass sets its own
render target and calls `renderer.clear()` unconditionally, then restores.

---

## Materials and the model

**Eight device meshes are `alphaMode: BLEND`,** down to 0.10 opacity, and
three's depth material copies only `alphaMap`/`alphaTest`/`map`/
`displacementMap` — **never `opacity` or `transparent`**. Casting is gated on
opacity in `Device.load`, or those coatings throw fully solid shadow slabs.

**The display mesh must not cast.** It is coplanar with the cover glass and
coplanar casters are a classic acne source.

**Pin `material.shadowSide`.** VSM uses `material.side` unflipped while PCF
flips it, so switching quality would change the *silhouette*, not just the
softness.

**glTF textures need `flipY = false`.** Any texture bound to the device —
including an uploaded screen image — must match, or it renders upside down.

---

## Export

**Capture happens in the same task as the render.** `preserveDrawingBuffer` is
off deliberately. **No `await` may be introduced between `renderPrepared` and
`toBlob`.** The same constraint applies to `engine.thumbnail`.

**`new Quality(12_000_000)` is a quantizer, not a bitrate.** mediabunny reads a
bare number as a quantizer and encodes at maximum quality — 47.8 MB where 3.1 MB
was asked for. Only `new Quality({ bitrate, bitrateMode })` sets a bitrate.

**Use `quality`, not `bitrate`,** in `VideoEncodingConfig`. The older `bitrate`
field is silently ignored.

**`avc1.42001f` fails at 1080p.** It is a *level* problem, not a profile one.
Let mediabunny pick, or pin `avc1.640034`.

**Encoder dimensions must be even.** `evenSize()` exists for this.

**Browsers clamp the canvas at ~33 megapixels** while `getDrawingBufferSize()`
keeps reporting what you asked for. `beginExportSize` checks the real
`gl.drawingBufferWidth` and throws rather than shipping a stretched file.

**`setPixelRatio(1)` for export.** At DPR 2 a request for 1080p silently
produces 4K, which then mismatches the encoder config.

**`<video>` seeking is off-by-one and lies about it.** `currentTime` reads back
the value you set while the pixels are the previous frame. `requestVideoFrameCallback`
**never fires on a paused element**, so the usual "seek then await a frame"
recipe hangs. Export decodes the container with mediabunny instead.

**`ShadowMaterial` writes the shadow into alpha** — `opacity * (1 - shadowMask)`.
On a transparent export that is usually wanted, so it is a toggle defaulting to
on.

**`relayout()` runs every frame,** including during export. Anything that must
persist across frames — such as suppressing the shadow catcher — has to be state
the rig owns, not a direct poke at `.visible`.

---

## Lottie

**The canvas renderer ignores gradient opacity stops.** The supplied mesh
gradient's softness comes entirely from radial gradients whose alpha ramps fall
to zero; on canvas those are ignored and every blob stays opaque to its rim.
The SVG renderer honours them, so the layer rasterises SVG output into a canvas
at ~3ms a frame.
*Symptom: soft blended blobs render as hard-edged ellipses.*

**Chrome cannot build an `ImageBitmap` from an SVG blob.** Use `<img>` +
`decode()`.

**The canvas renderer needs a sized container.** Passing an existing 2D context
with a detached container loads fine and reports the right frame count, then
renders every frame fully transparent.

---

## State

**A leaf value must replace in `deepMerge`, not fall back to base.** Returning
`base` for a primitive override silently discards every nested edit and makes an
entire settings panel inert.

**Hydration is a shallow per-slice spread.** Fine the first time a slice
appears; after that any key added to a nested object arrives `undefined` — a NaN
uniform, or a throw on `color.set()` during module-scope hydration. Nested
slices use the recursive merge.

**Arrays replace wholesale.** A persisted short array leaves later indices
`undefined`. Lights are a keyed record for this reason.

**Do not bump `STORAGE_KEY`** to migrate — that discards the user's project.
Write a `migrate*` function beside the existing ones.

**Strip `blob:` URLs on load.** Uploaded media dies with the page.

**A persisted `Composition` is untrusted input.** It may name a `TrackId` that
no longer exists, or carry a key missing a channel. An unknown track drives
nothing; a missing channel tweens to `undefined` and puts NaN into the pose.
`sanitiseComposition` rebuilds every key's value from the registry's channel
list and drops anything that does not survive it.

**A `TrackId` in the union is not a track.** The registry in `tracks.ts` is what
makes one real. The union is deliberately ahead of it so later steps are
additive, and everything else — the menu, the rows, the migration — filters
through `isRegistered`.

---

## Performance

**Shadow maps regenerate every frame by default.** `shadowMap.autoUpdate` is
false here; `needsUpdate` is poked from `relayout()`.

**Changing `shadowMap.type` recompiles every material** — a several-hundred-
millisecond stall on each Hard↔Soft switch.

**`syncHelper` rebuilds light helpers on every `applyLighting` call.** Harmless
while lighting only changes on user input; fatal if lighting is sampled per
frame. Rebuild only when the light *type* changes.

**Every store edit returns a new `Composition`,** and the timeline rebuilds on
it — once per `pointermove` while a key is dragged. Track actions replace only
the track they touch, and `CompositionTimeline.build` reuses any runner whose
source `Track` is identical, so a drag rebuilds one GSAP timeline rather than
all of them.

**A GSAP tween of duration 0 is applied immediately, not at its position.** Two
keys at the same instant need a sub-frame duration (`1e-4`) to step cleanly.

**Anything that writes the sampled pose back to the store must pass
`{ silent: true }`.** `setTransform` auto-keys, so the playback loop and the
scrubber — which write the timeline's own output back so the dials follow —
would otherwise lay down a key on every frame. The store also refuses to key
while `playing` or `exporting` as a second line of defence.

**Auto-key only fires for tracks that already exist.** Posing an unkeyed device
must not start an animation by accident, so the first key stays a deliberate
act.

**Playback rewinds when the playhead sits at the end of the animation.** Keying
a pose leaves the playhead on the last key, so without this the first press of
play runs the tail of the clip, where by definition nothing moves — which reads
exactly like a broken timeline. This was the single biggest source of "it does
not work".

**A hidden browser pane throttles `requestAnimationFrame` to zero.** Playback
measured through the devtools console will sit perfectly still and look broken;
`document.visibilityState` is the check. Take a screenshot to force frames
before timing anything that depends on the render loop.

**Timeline positions are pixels, not percentages.** A percentage cannot zoom,
which is why the old single row could never show less than the whole
composition. The lanes are a scroll container of `duration * pxPerSec`.

**An easing preview must sample the ease, not draw its parameters.** `back`,
`expo` and `elastic` are not cubic beziers, so a bezier-shaped preview
misrepresents them. Only a custom curve gets handles.

**A non-square SVG viewBox turns circular drag handles into ellipses.** The
easing graph folds its overshoot margin into a unit box instead, and every
stroke uses `vector-effect: non-scaling-stroke`.

---

## Verifying in the browser

**The console buffer and dynamically imported modules survive HMR.** A stale
`await import('/src/…')` in the console can return the *previous* version of a
module and quietly disagree with what the page is rendering. Hard-reload before
trusting a console measurement, and read errors by their position in the log
rather than their presence.

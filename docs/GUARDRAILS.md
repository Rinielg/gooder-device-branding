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

**A roughness map is data, not a picture — never ship one as JPEG.** JPEG
quantises in 8x8 blocks, and roughness drives the width of the specular
highlight, so a step invisible in a photograph becomes a hard-edged band across
a polished surface. Two of the device's roughness maps came out of the source
USDZ as JPEG and measured 1.30x and 1.36x more difference across the block seam
than inside it; the lossless ones in the same model measure 1.01x. It showed
worst on Silver, which is why it was reported there first.

The test is cheap and worth repeating on any data map:

    seam = mean |dx| where x % 8 == 7;  inside = mean |dx| elsewhere
    ratio = seam / inside      # ~1.0 is clean, >1.2 is JPEG

`scripts/deblock-roughness.py` repairs them, solving for the gentlest
correction that brings the ratio to 1.0 rather than using a fixed strength —
over-correcting flattens real detail and measures as a ratio *below* one.

**An emissive map on a standard material is still a lit surface.** The
display was `emissive` white, `emissiveMap` the upload, `color` black — which
looks unlit and is not. Measured on a flat `#3366cc`: it rendered `#4e7bcf`.
Turning off tone mapping gave `#4a72d0`, clearing `scene.environment` gave
`#3767cc`, and only silencing the lights as well gave `#3366cb` — the source. A
dielectric reflects about four per cent of whatever is in front of it however
rough it is, and `envMapIntensity = 0` did not stop the scene environment
reaching it. `MeshBasicMaterial` with `toneMapped = false` is the only thing
that renders an upload as the file that was uploaded.

**Swapping a material means swapping it everywhere it is looked up.** The map
kept its old name in `Device.materials`, so `setScreen` wrote the texture to a
material no longer on any mesh and the display went white. The entry is deleted
on the swap: a lookup by name returning a detached material is a write that
silently goes nowhere.

**Fitting by width leaves a gap when the image is the shorter shape.**
Clamp-to-edge repeats the last row of pixels down it, which streaks unless that
row is one colour — the shipped wallpaper's last row runs from `#000000` to
`#341719`. Short images are padded on a canvas with that row's mean instead.

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

**The theme lives in the store, not in a component.** Two components each
holding their own `useState` copy drift the moment one toggles. It is applied to
`<html>` at module import so the first paint is already right, and DialKit
themes itself separately and has to be told which one it is in.

**A tab change belongs to the action that causes it, not to an effect watching
the selection.** Setting it inside `selectKey` moves it as part of the click;
an effect makes it a second render caused by the first, which React warns about
and which can cascade.

**The panels read the sampled value, not the project's, while a property is
animated.** `store.sampled` is a view of the project, never part of it: not
persisted, not undoable, never written back. Editing a control still writes to
the project, and auto-key turns that into a key at the playhead — which is why
a slider showing an interpolated value can be nudged and lands a key there.

**A resolved URL must never be written into a saved document.** Signed links
expire and object URLs die with the page. One signed URL persisted into a
project was still there hours later, dead; the screen texture failed, the boot
sequence aborted at `setScreen`, and the app sat on "Loading model…" for ever
— with the error auto-cleared from the toast before anybody looked at it. The
id is durable, the URL is not: `stripRuntimeUrls` blanks the URL of any slot
that has an id, and every media load in the boot path now fails soft.

**An upload is an edit.** Marking the document synced after recording an asset
id suppressed the very save that would have recorded it, so the file reached
the bucket and nothing in the project pointed at it. Only *resolving* an id
into a URL is a non-edit.

**`img.decode()` can stay pending while the document is hidden.** It waits for
the image to be ready to paint, which a background tab is in no hurry to be, so
the await never returns and whatever was loading never finishes. `onload` fires
on bytes and parsing regardless.

**An origin missing from `additional_redirect_urls` is silently rewritten.**
A sign-in link then arrives pointing at `site_url` — a port nothing is serving
— and reads as a broken link rather than as a config gap. Both the dev server's
origin and the deployed one belong in `supabase/config.toml`.

**Grep the stylesheet for a class name before you use it.** Reusing one does
not conflict loudly: the two rule sets interleave and the later one silently
wins, somewhere else in the app. It has happened twice. `.preset` on the angle
grid made it ignore its own column count, and `.tl-length` — already the
transport's Length field — turned that field into a 484px-tall absolutely
positioned box while the timeline's new end grip appeared to do nothing,
because the element being tested was the wrong one. The check is one command:

    grep -n '^\.name' src/styles.css

Angle presets use `.angle-*`; the clip's end grip is `.tl-endgrip`.

**A zustand selector must never build its result.** `useStore(s => ({ a: s.a,
b: s.b }))` returns a fresh object every call, never compares equal, and
re-renders until React gives up with "Maximum update depth exceeded". Select
each slice on its own and compose with `useMemo`.

**`setSampled` compares before it writes,** because it is called every frame.
An idle playhead costs 0.006ms; a tab with no animated controls, 0.023ms; the
Light tab with nine animated controls on screen, 0.93ms. The selectors return
numbers rather than objects so a control only re-renders when its own channel
moves.

**A control that reads a sampled value must edit from that value, not the
project's.** A light's X/Y/Z share one setter: building the new position from
the project's array would snap the other two axes back the moment one is
nudged.

**DialKit's write-back is measured against what the dials were last set to,**
not against the project. With the camera animated those differ every frame, and
comparing against the project would push the sampled value into it on every
scrub — and record an undo step for each.

**Everything a track drives is re-applied from the project every frame, then
overridden by the sample.** That is what makes removing a track restore the
value the panels show, without anything having to detect the removal. It costs
a handful of property writes — a fully animated frame measures 0.022ms.

**Nothing in a `TrackTarget` setter may allocate, load or stall.** They run once
per frame during playback and once per frame during export. Anything derived —
the shadow catcher, the light frustum — is recomputed once in `commit`.

**An animated shadow cannot apply itself.** The catcher is rebuilt in
`relayout`, so the sampled opacity and softness are left on the Stage for
`relayout` to read rather than written to a material.

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

**A margin chosen in advance crops whatever it was not sized for.** The easing
preview reserved ±0.28 for overshoot, which is fine for `back` and wrong for a
spring: one at stiffness 180 and damping 8 peaks at 1.375, six per cent of the
graph's height above the top edge, and `overflow: hidden` did the rest. The
number was right and the picture was a lie. Measure the box from what will be
drawn — `curveBox` and `valueScale` — and include the drag handles, since a
handle outside the axis is a control that cannot be reached.

**A measured axis must hold still for the length of a drag.** If the box is
derived from what is drawn, dragging a handle upward stretches the axis that
handle is measured against, so the handle moves less than the pointer and the
drag fights itself. The value graph freezes its axis at pointer-down and
re-fits on release; the small preview keeps a fixed box instead, because that
box is also what its drag clamps to.

**A non-square SVG viewBox turns circular drag handles into ellipses.** The
easing graph folds its overshoot margin into a unit box instead, and every
stroke uses `vector-effect: non-scaling-stroke`.

---

## Loading state

**Persisted state turns a bad value into a permanent one.** A project file
naming a device that does not exist went into the store, was saved to
`localStorage`, threw on `DEVICES[device].label` at the next render, and left a
blank page — which reloading reproduced, because the reload read the same
value back. The only escape was clearing site data. Validate at the boundary,
and keep a render-error boundary behind it so the failure is at worst
temporary.

**Validate against the defaults, not against a hand-written schema.** The
defaults are the schema: a leaf takes the incoming value only if it has the
same type, and a key the defaults do not have is dropped. Rules written out
field by field drift the moment someone adds a setting and forgets one.

**Migrate before validating.** The other order rejects an old shape for not
matching the current one, which is the job migration exists to do. The legacy
lighting rig lived under `stage`, so validating first would drop
`stage.keyIntensity` as an unknown key and quietly reset the lights.

**Take a fixed-length array whole or not at all.** A light's position and a
gradient's colours are sized to what the shaders read. Coercing element by
element yields a value that is part file and part default — one nobody chose.

**A bound enforced only in the UI is not a bound.** The frame's number fields
clamped to 64–7680 while a loaded file could set any size at all. One exported
constant, used by both.

**A control that sets a limit must not be clamped by it.** `timeAt` clamps to
the clip, which is right for the playhead and wrong for the grip that sets the
clip's length: drag it right and the time you ask for is the time you already
had, so the clip could only ever be shortened. `rulerTime` takes the limit as
an argument and the grip passes none.

**The zoom is fitted to the duration, so the grip that changes the duration
moves its own axis.** Without freezing the fit for the length of the drag, the
grip snaps back under the pointer on every move and the drag converges on the
length it started with. Third time this shape of bug has appeared — see also
the value graph's axis and the easing preview's box.

---

## Verifying in the browser

**A handful of synthetic pointer events is not a drag.** The length grip passed
a synthetic test and failed the moment a person used it. Two reasons, and each
one needs a real drag to show: a feedback loop needs many moves before it
converges, and a clamp at the boundary only bites when you cross it. Dispatching
`pointermove` yourself proves the handler is wired; it does not prove the
gesture works. Drive the browser's own mouse for anything that depends on how
many moves there are, or on going past an edge.

**HMR keeps a stale component mounted after a failed update.** A store value
can change, its subscribers fire, and the DOM not move — because the mounted
component is the previous version of the module, still holding local state that
the new version no longer has. Hard-reload before concluding a wiring bug.

**Screenshots of a hidden browser pane are cached frames.** They can be several
actions out of date and identical to each other. Assert against the DOM; take
screenshots for looking, not for measuring.

**The console buffer and dynamically imported modules survive HMR.** A stale
`await import('/src/…')` in the console can return the *previous* version of a
module and quietly disagree with what the page is rendering. Hard-reload before
trusting a console measurement, and read errors by their position in the log
rather than their presence.

# Gooder Device Branding

**Live:** https://gooder-device-branding.vercel.app

A hostable web page that renders the iPhone 18 Pro / Pro Max in 3D inside a
configurable frame, animates it on a keyframe timeline, and exports the result
as a PNG or an MP4 at the frame's exact dimensions.

```bash
cd app
npm install
npm run dev      # http://localhost:5199
npm run build    # static output in app/dist — deploy that folder anywhere
```

### Deploying

The app lives in `app/`, not at the repository root, so a host pointed at the
root will not find a `package.json`. The committed `vercel.json` handles that
for Vercel:

```json
{
  "installCommand": "npm ci --prefix app",
  "buildCommand": "npm run build --prefix app",
  "outputDirectory": "app/dist"
}
```

Leave Vercel's **Root Directory** setting empty so it picks this up. Setting
Root Directory to `app` instead also works, but then `vercel.json` is ignored —
do one or the other, not both.

The Vercel project is linked to this repository, so pushes to `main` deploy
automatically.

It is a purely static build with no server, no environment variables and no
runtime configuration, so any static host works the same way.

---

## What's here

| Path | What it is |
|---|---|
| `app/` | The studio (Vite + React + TypeScript + three.js) |
| `app/public/models/` | `iphone-18-pro.glb`, `iphone-18-pro-max.glb`, `variants.json` |
| `app/public/textures/` | Colourway textures referenced by `variants.json` |
| `app/public/backgrounds/` | The default mesh gradient (Lottie) |
| `tools/` | The USDZ → GLB pipeline, so the assets can be rebuilt |
| `docs/` | Brief, goals, outcome, guidelines, guardrails and context |
| `iphone-18-pro.usdz` | Source model (unchanged) |
| `iphone-18-pro-color-variants.lsd` | Source colourway data (unchanged) |
| `Gradient BG 1 - Balanced Desktop.json` | Source background animation (unchanged) |

---

## Documentation

Start here if you are picking this up fresh — `docs/` holds the durable context
that would otherwise live only in a chat log.

| File | Read it for |
|---|---|
| [BRIEF](docs/BRIEF.md) | What the tool is, the original ask, how it grew |
| [GOALS](docs/GOALS.md) | What it is for, and what "good" means per capability |
| [OUTCOME](docs/OUTCOME.md) | What is delivered, and what done looks like next |
| [GUIDELINES](docs/GUIDELINES.md) | House patterns — boundaries, state, verification |
| [GUARDRAILS](docs/GUARDRAILS.md) | **The traps.** Every entry has cost time once |
| [CONTEXT](docs/CONTEXT.md) | Architecture, data flow, decisions and their reasons |
| [PLAN](docs/PLAN.md) | The approved plan for the next phase |

If you only read one, read **GUARDRAILS** — it is the difference between an
afternoon and a week on several of the things in here.

---

## The model

The USDZ turned out to contain **two devices**, not one, plus a `Color` variant
set with four colourways. Both are now selectable.

| Device | Body (mm) | Display (mm) | Display aspect |
|---|---|---|---|
| iPhone 18 Pro | 72.675 × 149.961 × 13.643 | 66.503 × 144.684 | 0.45964 |
| iPhone 18 Pro Max | 78.796 × 163.371 × 13.643 | 72.790 × 158.259 | 0.45994 |

The colourways in the USDZ are named `Black`, `Burgundy`, `Glacier`, `Silver`.
The `.lsd` file names the same four `Black`, `Plum`, `Silver`, `Sky_Blue`, and
its material values match the USDZ's to eight decimal places — so the USDZ is
used as the source of truth and the `.lsd` names are used as the UI labels.

glTF has no way to carry a USD variant set, so `tools/build.sh` exports one GLB
per device with **Black** baked in, and writes `variants.json` describing the 18
materials each other colourway changes. The app applies those at runtime.

**To rebuild the assets:** `./tools/build.sh` (needs Blender 3.3+ and Apple's
`usdcat`). It is not needed for day-to-day use — the assets are committed.

---

## Screen content

The display is material `KSynYqGGNGMUJti` on both models, driven through its
**emissive** channel so it reads as a lit screen rather than a printed surface.

Author screen content at **1206 × 2622** — a native iPhone 17 Pro screenshot,
within 0.02% of the model's display aspect. Anything else is cover-cropped from
the centre rather than squashed. The shipped wallpaper is 1:2 while the display
surface is 1:2.174, which is why the app fits by *aspect* and not by texture
dimensions.

By default the display shows the stock wallpaper of whichever colourway is
selected. Uploading an image or video takes over; **Stock** hands it back.

---

## How the pieces fit

**Everything is drawn in one WebGL canvas.** The background — mesh gradient,
procedural gradient, solid colour, image or video — is a full-screen shader pass
rendered *before* the device, not a DOM layer behind the canvas. That is what
makes the export faithful: a CSS gradient or an `<img>` behind the canvas cannot
be read back by `toBlob()` or captured by a video encoder, so it would silently
vanish from anything you exported.

**The timeline is a paused GSAP timeline.** Keyframes capture the full transform
(position, rotation, scale). The timeline is never played for export — it is
seeked to `frame / fps`, so a render is reproducible rather than tied to how
fast the machine happened to be running.

**DialKit drives the numbers.** The zustand store is the single source of truth;
dial edits write into it, and changes from anywhere else (dragging the model,
scrubbing, loading a saved view) are written back out to the dials.

---

## Backgrounds

| Type | What it is |
|---|---|
| **Mesh** *(default)* | `Gradient BG 1 - Balanced Desktop`, a Lottie animation |
| Gradient | A procedural, domain-warped shader gradient |
| Colour | Flat fill |
| Image / Video | Your own upload |
| None | Transparent, for a cut-out PNG |

The default mesh gradient is **1920 x 1080, 24 fps, 480 frames — exactly 20
seconds**. It runs once and then holds its final frame; it does not loop. The
timeline and the export duration both default to that 20 seconds, and playback
stops at the end rather than restarting. (The asset is authored as a seamless
loop, so the frame it holds on is the same as its first — turn **Loop** on in
the transport if you want it to run continuously.)

Lottie is used rather than a rendered video for two reasons: it is vector, so it
stays clean at any export size, and `goToAndStop(frame, true)` is exactly
frame-accurate, which makes every exported frame reproducible.

**Replace** takes any other Lottie JSON.

### Why it goes through the SVG renderer

The animation is rendered with lottie-web's **SVG** renderer and then rasterised
into a canvas, rather than using the canvas renderer directly.

lottie-web's canvas renderer does not apply the **opacity stops on a gradient
fill**. This file's softness comes entirely from radial gradients whose alpha
ramps fall from 1 to 0 across each blob — there is no blur effect anywhere in
it. Rendered on canvas, those ramps are ignored, every blob stays opaque to its
rim, and the result is a set of hard-edged ellipses instead of a soft mesh. The
SVG renderer honours them.

Rasterising the SVG costs about 3ms a frame at 1920x1080, which is invisible in
the preview and adds about a second to a 20-second export. Two details it
depends on: Chrome cannot build an `ImageBitmap` from an SVG blob, so it goes
through an `<img>` and `decode()`; and the export path awaits the rasteriser
before capturing, while the preview does not, so a scrub never blocks.

The default frame is **Landscape 16:9**, matching this background's own aspect
so none of it is cropped. Portrait presets cover-crop it to the middle; the Zoom
and Offset controls reframe it.

---

## Lighting, shadows and environment

The **Light** tab splits lighting the way Spline does: a scene-level environment
that supplies image-based lighting and reflections, plus individually
addressable light objects.

| Panel | What it covers |
|---|---|
| Environment | Studio / HDRI upload / physical sky / none, intensity, rotation, ambient, exposure and tone-mapping operator |
| Lights | A key, fill and rim light — type, colour, intensity, position, and which one casts |
| Shadow | On/off, what it catches on, hard or soft, opacity, softness, distance, and resolution/bias under Advanced |
| Rig | Light gizmos, and a reset |

Light positions are stored in **device heights**, not world units, so the rig
keeps its shape across both models and at any device scale.

### The shadow

It is a real cast shadow: the key light renders a shadow map, and an invisible
`ShadowMaterial` plane catches it — behind the device by default, or beneath it
in floor mode. The shadow is therefore the device's true silhouette and moves
when you move the light.

The thing that makes this hard is not the plane, it is the light's frustum.
**Outside a directional light's orthographic shadow camera the shadow mask is
exactly 1.0 with no falloff at all**, so an under-sized frustum produces a
razor-straight cut across the image. The rig sizes the catcher to where the
shadow can actually land — the device's bounds projected along the light
direction — and then fits the frustum to the catcher, so the frustum is always
the outer bound. That invariant is swept across fov, distance, scale, depth,
rotation, softness, both ground modes and every frame preset.

Two r186 details worth knowing if you change this:

- **Soft means VSM.** `PCFSoftShadowMap` is deprecated and silently downgraded
  to plain PCF, which has no adjustable softness. Only `VSMShadowMap` honours
  `shadow.radius`.
- **VSM's radius is in shadow-map texels, not world units.** The frustum is
  fitted tightly (~0.012 units per texel at 2048), so single-digit radii are
  indistinguishable from a hard shadow. The softness slider maps 0–2 onto 4–36.

Not every mesh casts. Eight of the device's meshes are blended, down to 0.10
opacity, and three's depth material ignores `opacity` and `transparent` — so
casting is gated on opacity, or those coatings would throw fully solid shadows.
The display is excluded too: it is coplanar with the cover glass and coplanar
casters are a classic source of shadow acne.

On a transparent export the shadow lands in the alpha channel, giving a cut-out
device with its shadow attached. Turn that off under Shadow → Advanced for a
clean silhouette.

Shadows cost about 9ms a frame at 960×540, against 3.6ms without — roughly 4.4s
for a 20-second export.

---

## Export

| | |
|---|---|
| Stills | PNG at 1×/2×/3× the frame. Transparent PNG when the background is **None**. |
| Video | MP4 / H.264 by default, WebM / VP9 as an option. |
| Encoding | WebCodecs via [mediabunny](https://mediabunny.dev), frame by frame. |

Video is **encoded, not screen-recorded**, so it never drops frames and the
bitrate you ask for is the bitrate you get.

User-supplied video — whether on the screen or in the background — is decoded
frame-accurately during export rather than played back. A `<video>` element is
not reliable here: seeking with `currentTime` lands on the wrong frame often
enough to matter, and `requestVideoFrameCallback` never fires on a paused
element, so the usual recipe hangs.

**Size limits.** Browsers clamp the canvas backing store at roughly 33
megapixels, and report the size you *asked for* rather than the one you got. The
app checks the real GL dimensions and refuses rather than silently exporting a
smaller, stretched frame. Every realistic size up to 8K is fine.

---

## Shortcuts

| Key | Action |
|---|---|
| Space | Play / pause |
| K | Add a keyframe at the playhead |
| Drag | Rotate the device |
| Shift-drag | Pan |
| Scroll | Scale |

---

## Saving

Keyframes, saved views, colourway, frame and lighting persist to
`localStorage` and can be exported to a JSON project file. Uploaded media does
not travel with the project — object URLs do not survive a reload — so images
and video need re-attaching after loading a project.

---

## Licence

The source code is MIT — see [LICENSE](LICENSE).

The bundled media assets are **not** covered by it. The device model, the
textures and wallpapers derived from it, and the background animation are
third-party and carry their own terms — [NOTICE](NOTICE) sets out exactly what
is and isn't covered.

---

## Third-party assets

This repository bundles assets it did not originate:

- `iphone-18-pro.usdz` and everything generated from it — the two GLBs in
  `app/public/models/` and the textures in `app/public/textures/` — are a
  third-party device model.
- The four stock wallpapers under `app/public/textures/` and
  `screen/stock-wallpaper.jpg` were extracted from that model and are Apple
  artwork.
- `Gradient BG 1 - Balanced Desktop.json` is a supplied background animation.

They are included so the studio runs as-is. **No licence is granted for them
here** — they remain under whatever terms they arrived with. If you are reusing
this project, supply your own model and background and rebuild with
`./tools/build.sh`.

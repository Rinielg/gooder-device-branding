# Device screen — exact dimensions

> **Note:** these figures are the **iPhone 18 Pro Max**, which the studio ships
> as `app/public/models/iphone-18-pro-max.glb`. The smaller iPhone 18 Pro has a
> 66.503 x 144.684 mm display, aspect 0.45964 — author at 1206 x 2624 for that
> one. Both were re-measured from the source USDZ; see `tools/build.sh`.

## The screen surface

| | |
|---|---|
| **Size** | **72.79 × 158.26 mm** |
| **Aspect** | **0.4599** — 1 : 2.174 |
| UV coverage | 0 → 1 on both axes, across the whole surface |
| Mesh | material `KSynYqGGNGMUJti`, 241 triangles, flat (0 mm thick) |

The whole device, for reference: **78.8 × 13.64 × 163.37 mm**.

## The stock wallpaper

`stock-wallpaper.jpg`, extracted from the USDZ — **1024 × 2048 px**, aspect 0.5.

## The thing to know

**Those two aspects disagree, and the geometry wins.**

The texture is 1:2. The surface it covers is 1:2.174. The UVs run 0→1 across the
whole surface, so the stock wallpaper is displayed about **8.7% taller than it
was drawn**. That is how the asset ships; it is not something this project did.

So author to the *screen's* aspect, not the texture's. The viewer crops uploads
to 0.4599 for exactly this reason — an image authored at 1:2 to "match the
texture" would come out stretched.

## What to author at

| Use | Size | Aspect |
|---|---|---|
| **Recommended** | **1206 × 2622 px** | 0.4600 |
| Matching the stock texture's width | 1024 × 2227 px | 0.4598 |
| Higher density | 1440 × 3131 px | 0.4599 |

1206 × 2622 is a native iPhone 17 Pro screenshot, which is within 0.02% of the
model's screen aspect — take one and it lands with no crop and no distortion.

Anything else still works: uploads are cover-cropped from the centre, so they
fill the screen and lose the overhang rather than squashing. Only the aspect
matters, not the exact pixel count.

## Masking

The mesh is the rounded rectangle of the display itself, so corners are clipped
by the geometry — no need to round them in the image. There is no cutout for the
Dynamic Island: it sits in front as separate geometry, and anything under it is
simply covered.

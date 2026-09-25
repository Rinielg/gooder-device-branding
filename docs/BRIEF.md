# Brief

**Gooder Device Branding** — a hostable web page that renders an iPhone in 3D
inside a configurable frame, animates it, and exports the result as a PNG or an
MP4 at the frame's exact dimensions.

Owner: Riniel Gresse (The Good Machine). Built for Pure Health / Pura device
mockups, then generalised and open-sourced.

- Repository: https://github.com/Rinielg/gooder-device-branding (public)
- Live: https://gooder-studio.vercel.app
- Source assets live at the repo root; the app is in `app/`

## The original ask

> Host a 3D model of a device on a web page, framed in an adjustable container
> with a configurable background. Select colour variants. Put an image or video
> on the device screen. A timeline with keyframes I can add, remove, move and
> save. A controller to adjust position, scale and angle, plus drag-to-rotate,
> with saved views. Export the frame as an image or video, containing every
> asset in the frame.

Named dependencies: GSAP for animation, DialKit for the controller, Context7 for
current library documentation.

## How it has grown

Each phase was requested on top of the last, not planned up front:

1. **Core tool** — model pipeline, frame, backgrounds, colourways, screen
   content, timeline, saved views, PNG and MP4 export.
2. **Mesh gradient background** — a supplied 20-second Lottie as the default.
3. **Public repo and deploy** — MIT for the code, third-party assets carved out.
4. **Lighting system** — a Spline-style split of scene environment and light
   objects, prompted by a shadow being clipped.
5. ~~**Spline-style UI and per-property timeline**~~ — delivered, then taken
   further against a behavioural audit of Spline itself.
6. **Angle presets** — six built-in elevations and saved presets, each carrying
   a plain-language description. The descriptions are not a notes field: they
   are what a future automation matches a request against, so that "focus on
   the bottom navigation" can resolve to an angle. This is the seam the planned
   Figma plugin will use to pull a UI screen onto the display and frame it.

## What this is not

Not a general 3D editor. It renders one device at a time, from a fixed library
of two models, for producing marketing stills and short clips. Features that
exist in Spline but have no meaning here — Path Extrusion, Cloner, Simulation,
Events, Variables — are deliberately absent.

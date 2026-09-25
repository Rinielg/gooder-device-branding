# Spline reference material — where it is and what is in it

Deliberately **not committed**. The screenshots are Spline's own product UI and
this repository is public; they are also 54MB. They live outside the repo:

```
/Users/thegoodmachine/AI-projects/Gooder-AI/Gooder Studio/Research & Resources/Spline/
```

Read them with the image tools when a UI question needs settling. They are
Retina 2×, about 3570 × 2140, so downscale to ~1600px wide first or they cost
more context than they are worth:

```bash
sips -Z 1600 "<file>" --out /tmp/s.png
```

Alongside them: **`Spline Editor UX Audit.md`**, written by a browser session
driving Spline directly. That is the better source for *behaviour* — it has
measured values, click paths and keyboard shortcuts, and it marks what it could
not verify. `docs/SPLINE-AUDIT.md` is our reading of it.

---

## What each screenshot shows

Characterised while reading them. Ones not opened are marked, rather than
guessed at.

| File | Shows |
|---|---|
| `09.23.25` | A Path selected. Inspector: Transform, Events, Path, Path Extrusion. Timeline with a single Position row |
| `09.24.03` | **Nothing selected** — the scene inspector: Frame, Scene, then icon+label+chevron rows (Light, Simulation, Effects, Fog, Sky, Ambient Shadows, Color) with pill toggles, then Global Settings |
| `09.24.15` | An Ellipse selected. Track bars turn **blue** when their object is selected; Position / Rotation / Size rows |
| `09.24.46` | not opened |
| `09.25.12` | Path Extrusion in full, Material with a sphere thumbnail, Modifiers, Visibility |
| `09.25.23` | not opened |
| `09.25.34` | Caps / Corner, Material "Glass", Visibility with the Shadows dropdown |
| `09.25.53` · `09.26.03` | not opened |
| `09.26.17` · `09.26.27` | Export modal — Public URL tab |
| `09.26.38` | Export modal — Code Export, showing the tab row with the active pill and underline |
| `09.26.47` | Export modal — Self-Hosted. **The one saturated indigo button in the whole UI** |
| `09.27.23` | The **Light** section expanded in place: Ambient, Color, Intensity, Shadow, Softness |
| `09.27.43` | not opened |

Two further images arrived in the conversation rather than as files, and were
the most useful of the lot:

- A **timeline close-up**: three columns — timelines list │ property list with
  live X/Y/Z fields │ tracks. Grey bars with darker rounded end caps. Green
  playhead with a green time pill. Everything past the clip length shaded.
- **The full editor** with **Edit Transition in the right rail**: a Custom
  Bezier dropdown, the curve card with two green handles, Bezier / Start /
  Duration, then Properties. Also shows the left panel we do not have (Agent /
  Objects / Assets, a scene list and an object tree), and a selected track bar
  rendering **dark** while its siblings stay blue.

---

## Measured values

Sampled from the originals by region mode, not eyeballed.

| | |
|---|---|
| Panels | `#ffffff` |
| Field fill, inactive segment | `#f2f2f2` |
| Active segment, pressed, selected row | `#cccccc` |
| Timeline lanes | `#e0e0e0` / `#d9d9d9` |
| Accent | ≈ `#5b5bf5` — **one primary action at a time, nothing else** |
| Rows | 24px lane on a 28px pitch |
| Number field | 44 × 24px, radius 6px, no border |
| Label column | 60px, 11px/400 |
| Section title | 11px/500 |
| Timeline scale | 1s ≈ 125px at default zoom |

The single most useful observation: **Spline's chrome is essentially
monochrome.** Colour appears in the axis gizmo, the green playhead, the blue
track bars, status dots, and exactly one indigo button. Everything else is grey
on white. Our first light theme leaned on blue far more than that, and pulling
it back closed most of the gap.

---

## Where the layout differs from ours, on purpose

| | Spline | Us |
|---|---|---|
| Left panel | Object tree, scene list, assets | None — there is one object |
| Timelines | Several per scene | One composition |
| Timeline rows | Object row with property rows nested under it | Property rows only |
| Snapping | None observed | Snaps across tracks, alt to suspend — the reason per-property rows work |

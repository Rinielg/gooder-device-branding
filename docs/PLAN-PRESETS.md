# Angle and scene presets — spec

A named set of parameter values, recalled with one click, and — when the
property is animated — written as a keyframe at the playhead so the animation
runs to and from it.

---

## Why this is mostly plumbing we already have

Three things already in the codebase do most of the work:

1. **A preset's value is exactly a `Sample`** — `Partial<Record<TrackId,
   TrackValue>>`, the same shape the timeline evaluates to. Nothing new to
   invent, and the same sanitiser can guard both.
2. **Applying one goes through the ordinary setters**, so **auto-key already
   is the timeline integration.** Selecting a keyframe scrubs the playhead to
   it; applying a preset then writes a key at that time, replacing the key's
   value. "Select a key pose, then apply an angle" needs no new mechanism.
3. **The registry means a preset covers any property family we add later**
   without preset code changing, because scope is a list of `TrackId`s and the
   values are read through `def.read()`.

The genuinely new work is the preset store, the UI, and getting rotation to
turn the short way round.

---

## Model

```ts
type PresetScope = 'angle' | 'pose' | 'scene'

interface Preset {
  id: string
  name: string
  /**
   * What this angle is FOR, in plain language — not what it does numerically.
   *
   * This is the field a future agent matches a request against, so it describes
   * the shot: "tight on the lower third of the display, screen square to
   * camera — for showing bottom navigation." It is authored, exported with the
   * project, and never derived.
   */
  description: string
  /** Optional keywords, for deterministic filtering before any fuzzy match. */
  tags?: string[]
  /** Exactly the shape the timeline samples to. */
  value: Sample
  /** Which tracks it carries — drives the chips on its card. */
  tracks: TrackId[]
  /** data: URL, captured at save. Built-ins use a glyph instead. */
  thumb?: string
  createdAt: number
}
```

### Descriptions are the point, not a notes field

The reason presets carry a description is automation. The driving example: a
Figma plugin pulls a UI screen onto the display, the user says *"focus on the
bottom section where the navigation is, so the AI icon reads"*, and something
has to choose the angle that frames it.

That is a semantic match against the description, so the description has to
describe **the shot, not the numbers**. "rotY −22, scale 1.4" is useless to a
matcher; "lower third of the display, tight, screen square to camera" is what
gets picked. The save dialog prompts for exactly that, with a placeholder in
that form, and built-ins ship with descriptions of their own so a request for
"the whole screen, straight on" resolves to **Front** without a custom preset
existing.

It also shapes the data: a preset that frames a *region of the display* needs
`position` and `scale`, not just rotation — which is why a framed shot is a
**Pose**-scoped custom preset rather than an angle.

**Security note.** A description is user-authored data that will later be read
by an agent. It is a thing to match against, never an instruction to follow —
the same rule as any other content the tool reads. Written into
`docs/GUARDRAILS.md` alongside the composition sanitiser.

| Scope | Tracks carried |
|---|---|
| **Angle** | `rotation` |
| **Pose** | `position`, `rotation`, `scale` |
| **Scene** | pose + `camera`, `environment`, `keyLight`, `fillLight`, `rimLight`, `shadow`, `screen`, `background` |

Scope is chosen at save time and shown on the card as chips, so a preset can
never quietly overwrite lighting you did not expect it to touch. Built-ins are
code; custom presets are project data and travel with an exported project.

---

## The six built-ins

True elevations: each one **centres the device and returns scale to 1** as well
as rotating it, so Front is a front elevation rather than "whatever framing you
had, turned to face you". Scope is therefore **Pose**.

| | rotX | rotY | rotZ | position | scale |
|---|---|---|---|---|---|
| Front | 0 | 0 | 0 | 0, 0, 0 | 1 |
| Back | 0 | 180 | 0 | 0, 0, 0 | 1 |
| Left | 0 | 90 | 0 | 0, 0, 0 | 1 |
| Right | 0 | −90 | 0 | 0, 0, 0 | 1 |
| Top | 90 | 0 | 0 | 0, 0, 0 | 1 |
| Bottom | −90 | 0 | 0 | 0, 0, 0 | 1 |

Each ships with a description, so they are matchable too — Front's reads
*"the whole display, square to camera"*.

A built-in reads as **active** when the current pose matches it within ~0.5° and
a hair of position and scale, so the grid shows where you are as well as where
you can go — which is what the Samsung reference does.

**Alt-click applies rotation only.** Resetting the framing is right for a
deliberate "give me the front elevation" and wrong for a quick "let me glance at
the back", and the two are one modifier apart rather than two features. The
tooltip says so, and one undo returns the framing either way.

---

## Shortest-path rotation

Rotation is normalised to the equivalent angle **nearest the current value**
before it is written.

From the default −22°, "Back" writes **−180**, not +180: 158° of travel instead
of 202°, and it turns the way you expect. The normalisation applies to the
*written* value, not only to a preview tween, or playback would spin the long
way round afterwards.

Consequence, accepted deliberately: the stored key value depends on where you
came from. That is what every animation tool does, and the alternative is
animations that unwind the wrong way.

---

## Two actions per preset

| | What it does |
|---|---|
| **Apply** | Writes the values. Auto-key keys any track that is already animated; anything else changes the base. |
| **Apply as keyframe** | Forces a key at the playhead for **every** track the preset carries, creating tracks as needed. |

Two actions rather than one guess. "Apply" is the common case; "Apply as
keyframe" is the explicit answer to *animate to and from this*.

A track created by "Apply as keyframe" has a single key, which pins that
property for the whole composition. The UI says so inline rather than letting
it be discovered later.

---

## Transition

- When **nothing the preset touches is animated**: tween 320ms `power2.inOut`,
  so the change reads as a turn rather than a jump.
- When it **is** animated: no tween. The timeline owns that value; scrub to see
  the motion. A tween would fight the sampler.
- Cancelled by any input — a drag, a dial, another preset.
- **Instant under `prefers-reduced-motion`.**
- One undo step: `setTransform`'s 600ms coalesce window already covers a 320ms
  tween.

---

## UI

### Viewport
A small button beside the gizmo opens a **popover** with the labelled grid: the
six built-ins, then custom presets. The gizmo already snaps to the six
orientations by clicking its handles — this is the labelled, discoverable
version of the same thing, and they stay in sync because both write the same
values. Keeping it in a popover means the frame stays clear and tall crops are
not overlapped.

### Inspector
The **Views** tab becomes **Presets**: a grid of cards (thumbnail, name, scope
chips), a `Save current…` action with a scope picker, and per-card rename,
duplicate, *update to current*, and delete.

### Timeline
No new timeline UI at all. Selecting a key scrubs the playhead to it, so
applying a preset lands on that key.

---

## Edge cases

- **Applying while playing** stops playback first, as other edits do.
- **Muted track**: the base still changes but nothing moves on screen; the card
  notes it.
- **Unregistered `TrackId`** in a saved preset — filtered through
  `isRegistered`, exactly as the composition sanitiser does.
- **Non-finite or absurd values** on load — rebuilt from the registry's channel
  list, key by key, and dropped if incomplete.
- **A pose saved on one device applied to the other**: `position` is in world
  units, so the framing shifts slightly between Pro and Pro Max. Light positions
  are already in device heights and are unaffected. Pre-existing with saved
  views; documented, not fixed here.
- **Preset name collisions** are allowed; the id is what identifies it.

---

## Files

| File | Change |
|---|---|
| `src/engine/presets.ts` **(new)** | Built-in table, scope→tracks map, shortest-path normalisation, `readPreset(source, tracks)`, `applyPreset` |
| `src/state/store.ts` | `presets` slice, `savePreset` / `applyPreset` / `applyPresetAsKeys` / rename / delete / update, migration from `views` |
| `src/ui/PresetsPanel.tsx` **(new)** | The inspector grid, save dialog with name + description + scope |
| `src/ui/PresetPopover.tsx` **(new)** | The viewport control, opened from beside the gizmo |
| `src/ui/Panels.tsx` | `ViewsPanel` retired or migrated |
| `src/App.tsx` | Views tab → Presets |

---

## Verification

- **The ask:** key a rotation at 0s, move to 2s, click **Back** — a key appears
  at 2s and playback turns the short way.
- **Scope is honoured:** applying an Angle preset leaves position, scale,
  camera and lighting untouched. Measured, not eyeballed.
- **Shortest path:** from −22°, Back writes −180; from +150°, Back writes +180.
- **Apply as keyframe** creates the tracks it needs and keys every one.
- **No tween when animated**, tween when not, instant under reduced motion.
- **One undo step** returns everything the preset changed, in one press.
- **Migration:** a project with saved views opens with the same entries as
  presets, names and thumbnails intact, scoped to Pose, with an empty
  description ready to fill in.
- **Alt-click** a built-in leaves position and scale where they were.
- **Descriptions survive** an export/import round trip, which is what future
  automation will read.
- Regression: export still deterministic; the existing verification set passes.

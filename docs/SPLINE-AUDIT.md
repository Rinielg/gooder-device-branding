# Spline UX audit, read against ours

Source: `Research & Resources/Spline/Spline Editor UX Audit.md` (25 Sep 2026).
Read against the platform as of `abe3cd4`.

The audit is unusually good — measured, honest about what it could not verify,
and it names Spline's own bugs. What follows is what it changes for us.

---

## 1. Where we already agree

Worth stating, because it means several decisions taken on instinct were right.

| | Spline | Us |
|---|---|---|
| **Auto-key keys only the property you touched** | Changing Rotation creates a Rotation key only | Same — derived by reading each track before and after |
| Selecting a key moves the playhead to it | Yes | Yes |
| Graph editor replaces the track area on the same ruler | Yes, 4th transport button | Same |
| Graph channel colours match the gizmo axes | X red, Y green, Z blue | Same tokens drive both |
| Dragging a graph point changes time **and** value | Yes | Yes |
| Value axis rescales automatically | Yes | Yes |
| Choose the graphed property by clicking the row label | Yes | Yes |
| Play at the end restarts from 0 | Stops at duration; next Play starts at 0 | Same |
| Slider click-anywhere jumps | Yes | Yes (native range input) |
| One drag is one undo step | Yes | Yes |

---

## 2. Adopted

### Easing belongs to the segment — **done**
Spline: click the bar *between* two keys → Edit Transition. Click a key → Edit
Keyframe (time and values only). We had easing on the key and the editor opening
on key selection. Spline's is better: you select the thing you are editing
rather than a proxy for it. Segments are now their own hit target.

### Timing controls live in the inspector — **done**
Spline swaps the inspector's content for **Edit Keyframe** / **Edit Transition**
with a close ×. We had a strip under the timeline, which split attention and
stole vertical space from the rows.

### A track is a clip — **done**
Bars with rounded caps, not diamonds. It reads as a duration rather than a row
of instants, which is what it is, and it gives segments somewhere to live.

### The ruler runs past the clip, with the remainder shaded — **done**
Spline's ruler shows 7s for a 5s clip and shades the rest. The length becomes a
visible boundary rather than the panel edge, and there is somewhere to drag a
key when lengthening.

### Lane metrics — **done**
24px lanes on a 28px pitch, from the audit's measured values.

### Still to adopt

| | Why |
|---|---|
| **The axis letter is the scrub handle** — `ew-resize`, 1 unit/px, 0.01/px for scale; the field body focuses for typing | The single best detail in the audit. It resolves the perpetual conflict between "click to type" and "drag to adjust" by giving them separate hit areas |
| **Expressions in number fields** (`50*2`, `10+5`) | Cheap, and genuinely used |
| **Tab moves to the next field in reading order** | Makes a transform block keyboard-complete |
| **Backfill a key at 0s when a track is created at t>0** | Spline gives you an *animation*; we give you a pin. Ours is a foot-gun dressed as safety |
| **Drag the object bar to shift every track together** | We have no equivalent. Retiming a whole move currently means dragging each row |
| **Drag a selected segment to move both its keys** | Same reason |
| **Empty-state preset tiles** (Slide in, Rotate, Scale Out, Jump, Bounce) | Turns a blank timeline into a first result. Dovetails with the angle-presets spec |
| **Spring easing** with stiffness / damping / mass / velocity | A real gap. GSAP can do it; our preset list is all beziers |

---

## 3. Deliberately not adopting

### No snapping
The audit found **none** — keys land on 1.48, 2.66, 3.01. We snap to keys on
other tracks and to the playhead, with alt to suspend.

Keep ours. Cross-track alignment is the entire reason per-property rows are
usable; without it, "start the rotation exactly where the move ends" is a
guessing game. This is a Spline weakness, not a Spline feature.

### Undo that merges across different properties
Spline merged a typed Scale X edit with a Rotation X scrub into one undo step,
and the audit could not pin down the rule. Ours coalesces by property within
600ms. Predictable beats clever: an undo you cannot predict is an undo you stop
trusting.

### Right-click on a key offering only Copy and Paste
No delete in the menu. Ours offers delete, delete-all-at-this-instant, and stop
animating. Keep.

### Auto-key gated on "the timeline is open"
Spline's timeline is hidden by default, so "open" is a real mode that means *I
am animating now*. Ours is always visible, so the same gate would mean every
dial twiddle starts an animation. Our rule — key tracks that already exist —
stays, with the backfill above as the improvement.

### Sections that do not collapse
Spline's inspector sections are fixed; only scene-level ones drill into
sub-panels. With eleven track families and a lighting rig we need collapse.

### The four documented bugs
Caret-instead-of-select-all producing appended values (`15` + `23` → `1523`);
Spring parameters reading 0 when first opened; `NaN` in Edit Keyframe for
unanimated axes after a graph edit; a creation tool arming itself. The audit
flags all four. Named here so they are not copied by accident.

---

## 4. Open questions the audit could not answer

Left unverified, and worth a second pass if we adopt scrub handles:

- Shift / alt during a number-field scrub — the automation could not send
  modifiers.
- Whether the inspector updates live during a gizmo drag or only on release.
- Marquee selection in the timeline.

---

## 5. What this leaves

Adopted now: segment selection, inspector timing panels, clip-style tracks, the
over-running ruler, lane metrics, the dark stage.

Next, in rough value order: scrub handles on the axis letters, backfilling a key
at 0s, dragging a whole clip, Spring easing, empty-state preset tiles.

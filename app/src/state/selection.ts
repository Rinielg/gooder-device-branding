import type { KeyRef, TrackId } from '../engine/types'

export interface KeySelection {
  track: TrackId
  /**
   * The key itself, or — for a segment — the key it *arrives at*, since that is
   * where the easing lives. When several keys are selected this is the one the
   * inspector edits.
   */
  key: string
  /**
   * What was clicked. Easing belongs to the segment between two keys, so
   * selecting a segment is what opens the transition editor; selecting a key
   * offers its time and values instead. Spline draws the same distinction and
   * it is the right one: you select the thing you are editing.
   */
  kind: 'key' | 'segment'
  /**
   * The rest of a shift-selected group, which may span tracks.
   *
   * Kept beside the primary rather than replacing it with a list, so every
   * reader that only cares about the one key being edited — the inspector, the
   * curve editor — carries on unchanged.
   */
  more?: KeyRef[]
}

/** Every key in the selection, the one being edited first. */
export function selectedRefs(sel: KeySelection | null): KeyRef[] {
  if (!sel) return []
  return [{ track: sel.track, key: sel.key }, ...(sel.more ?? [])]
}

export function isSelected(sel: KeySelection | null, track: TrackId, key: string): boolean {
  return selectedRefs(sel).some((r) => r.track === track && r.key === key)
}

/**
 * Shift-click: add a key to the group, or take it back out.
 *
 * Removing the key the inspector is editing promotes the next one rather than
 * emptying the selection, because the group is still there — only one member
 * of it left.
 */
export function toggleRef(sel: KeySelection | null, ref: KeyRef): KeySelection | null {
  if (!sel) return { ...ref, kind: 'key' }

  const refs = selectedRefs(sel)
  const without = refs.filter((r) => !(r.track === ref.track && r.key === ref.key))

  if (without.length === refs.length) {
    // A group is keys: there is no such thing as easing two segments at once,
    // so adding to a selected segment turns it into a key selection.
    return { ...sel, kind: 'key', more: [...(sel.more ?? []), ref] }
  }
  if (without.length === 0) return null
  const [first, ...rest] = without
  return { ...first, kind: 'key', more: rest.length ? rest : undefined }
}

/**
 * Every shortcut the app actually has.
 *
 * One list, so the panel that documents them cannot drift from the handlers
 * that implement them. `⌘` is written out and swapped for Ctrl on anything
 * that is not a Mac, because a key legend that names the wrong key is worse
 * than none.
 */
export interface Shortcut {
  keys: string[]
  action: string
  /** When the shortcut applies, if it is not everywhere. */
  note?: string
}

export interface ShortcutGroup {
  title: string
  items: Shortcut[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    items: [
      { keys: ['?'], action: 'Show these shortcuts' },
      { keys: ['Esc'], action: 'Close a panel, menu or popover' },
      { keys: ['⌘', 'Z'], action: 'Undo' },
      { keys: ['⌘', '⇧', 'Z'], action: 'Redo' },
      { keys: ['P'], action: 'Open projects', note: 'Sign in, or switch project' },
      { keys: ['H'], action: 'Open the history', note: 'Signed in' },
    ],
  },
  {
    title: 'Playback',
    items: [
      { keys: ['Space'], action: 'Play or pause' },
    ],
  },
  {
    title: 'Animation',
    items: [
      { keys: ['K'], action: 'Key the whole pose at the playhead' },
      { keys: ['⇧', 'Click'], action: 'Add a keyframe to the selection', note: 'On the timeline' },
      { keys: ['Drag'], action: 'Move every selected keyframe together' },
      { keys: ['Alt', 'Drag'], action: 'Move a keyframe without snapping' },
      { keys: ['Delete'], action: 'Delete the selected keyframes' },
    ],
  },
  {
    title: 'Number fields',
    items: [
      { keys: ['Drag'], action: 'Scrub the value', note: 'From the label or the axis letter' },
      { keys: ['⇧', 'Drag'], action: 'Scrub ten times faster' },
      { keys: ['Alt', 'Drag'], action: 'Scrub ten times finer' },
      { keys: ['↑', '↓'], action: 'Nudge by one step' },
      { keys: ['Enter'], action: 'Commit what you typed' },
      { keys: ['Esc'], action: 'Put the old value back' },
    ],
  },
  {
    title: 'The frame',
    items: [
      { keys: ['Drag'], action: 'Rotate the device' },
      { keys: ['⇧', 'Drag'], action: 'Pan the device' },
      { keys: ['Scroll'], action: 'Scale the device' },
    ],
  },
]

/** True on a Mac, where the modifier is ⌘ rather than Ctrl. */
export const isMac = typeof navigator !== 'undefined'
  && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** A key as it should be written on this platform. */
export const keyLabel = (k: string) =>
  !isMac && k === '⌘' ? 'Ctrl' : !isMac && k === '⇧' ? 'Shift' : !isMac && k === 'Alt' ? 'Alt' : k

/** Matches a shortcut against what the user typed in the search box. */
export function matchShortcuts(groups: ShortcutGroup[], query: string): ShortcutGroup[] {
  const q = query.trim().toLowerCase()
  if (!q) return groups
  // A single character is a key, not a word. Matching it against the prose as
  // well would return most of the list — every action with a 'k' in it — which
  // is noise dressed as a result.
  const keysOnly = q.length === 1
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) =>
        i.keys.some((k) => keyLabel(k).toLowerCase() === q)
        || (!keysOnly && (
          i.action.toLowerCase().includes(q)
          || (i.note ?? '').toLowerCase().includes(q)
          || g.title.toLowerCase().includes(q)
        )),
      ),
    }))
    .filter((g) => g.items.length > 0)
}

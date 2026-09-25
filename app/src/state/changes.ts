import { DEVICES, type Composition, type TrackId } from '../engine/types'
import { TRACKS } from '../engine/tracks'
import type { Project } from './store'

export interface Change {
  /** Which part of the editor this belongs to, for grouping. */
  area: string
  detail: string
}

export interface ChangeSummary {
  /** One line, for the collapsed row. */
  headline: string
  /** The full list, for the expanded one. */
  changes: Change[]
}

/**
 * What changed between two saved versions.
 *
 * The vocabulary deliberately echoes the undo stack — "Moved", "Rotated",
 * "keyframes added" — because the history panel and the undo tooltip describe
 * the same edits, and describing them two different ways would make one of
 * them wrong.
 *
 * It compares documents rather than recording intent as it happens. That costs
 * a little precision, and buys the thing that matters: a version saved by one
 * tab can be described by another, and a version from a build that did not
 * have this code can still be read.
 */
export function describeChanges(before: Project, after: Project): ChangeSummary {
  const changes: Change[] = []
  for (const compare of COMPARATORS) compare(before, after, changes)

  return { headline: headlineOf(changes), changes }
}

function headlineOf(changes: Change[]): string {
  if (changes.length === 0) return 'No changes'
  const [first, second] = changes
  if (changes.length === 1) return first.detail
  // Joined as written, never re-cased. An earlier version lower-cased the
  // second fragment to make it read as a sentence and turned the colourway
  // "Black" into "black". These are labels, not prose.
  if (changes.length === 2) return `${first.detail} and ${second.detail}`
  return `${first.detail}, ${second.detail} and ${changes.length - 2} more`
}

type Comparator = (a: Project, b: Project, out: Change[]) => void

const add = (out: Change[], area: string, detail: string) => out.push({ area, detail })

/** Numbers that came out of a drag are never exactly equal; this is the grid. */
const near = (a: number, b: number) => Math.abs(a - b) < 1e-4

const COMPARATORS: Comparator[] = [
  // ---- Device ----
  (a, b, out) => {
    if (a.device !== b.device) {
      add(out, 'Device', `${DEVICES[a.device]?.label ?? a.device} → ${DEVICES[b.device]?.label ?? b.device}`)
    }
    if (a.variant !== b.variant) add(out, 'Device', `${a.variant} → ${b.variant}`)
  },

  // ---- Frame ----
  (a, b, out) => {
    if (a.frame.width !== b.frame.width || a.frame.height !== b.frame.height) {
      add(out, 'Frame', `${a.frame.width} × ${a.frame.height} → ${b.frame.width} × ${b.frame.height}`)
    }
  },

  // ---- Pose ----
  (a, b, out) => {
    const moved = !near(a.transform.posX, b.transform.posX)
      || !near(a.transform.posY, b.transform.posY)
      || !near(a.transform.posZ, b.transform.posZ)
    const rotated = !near(a.transform.rotX, b.transform.rotX)
      || !near(a.transform.rotY, b.transform.rotY)
      || !near(a.transform.rotZ, b.transform.rotZ)
    const scaled = !near(a.transform.scale, b.transform.scale)

    const parts = [moved && 'moved', rotated && 'rotated', scaled && 'scaled'].filter(Boolean) as string[]
    if (parts.length === 0) return
    // One line rather than three: a drag usually moves all of them, and three
    // rows saying so is three rows of nothing.
    const joined = parts.length === 1 ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
    add(out, 'Pose', joined[0].toUpperCase() + joined.slice(1))
  },

  // ---- Camera ----
  (a, b, out) => {
    if (!near(a.stage.fov, b.stage.fov)) add(out, 'Camera', `Lens ${round(a.stage.fov)}° → ${round(b.stage.fov)}°`)
    if (!near(a.stage.distance, b.stage.distance)) add(out, 'Camera', 'Camera distance adjusted')
  },

  // ---- Look ----
  (a, b, out) => {
    if (a.background.kind !== b.background.kind) {
      add(out, 'Look', `Background ${a.background.kind} → ${b.background.kind}`)
    }
    // The name is what a person recognises; the URL is a runtime detail that
    // changes on every open and means nothing to anybody.
    if (a.screen.name !== b.screen.name || a.screen.assetId !== b.screen.assetId) {
      add(out, 'Look', `Screen content → ${b.screen.name}`)
    }
    if (!near(a.screen.brightness, b.screen.brightness)) add(out, 'Look', 'Screen brightness adjusted')
  },

  // ---- Light ----
  (a, b, out) => {
    const ea = a.lighting.environment
    const eb = b.lighting.environment
    if (ea.mode !== eb.mode) add(out, 'Light', `Environment ${ea.mode} → ${eb.mode}`)
    else if (!near(ea.intensity, eb.intensity) || !near(ea.rotationY, eb.rotationY) || !near(ea.exposure, eb.exposure)) {
      add(out, 'Light', 'Environment adjusted')
    }

    for (const id of ['key', 'fill', 'rim'] as const) {
      const la = a.lighting.lights[id]
      const lb = b.lighting.lights[id]
      if (!la || !lb) continue
      if (la.enabled !== lb.enabled) {
        add(out, 'Light', `${cap(id)} light ${lb.enabled ? 'on' : 'off'}`)
      } else if (!near(la.intensity, lb.intensity) || la.color !== lb.color
        || la.position.some((v, i) => !near(v, lb.position[i]))) {
        add(out, 'Light', `${cap(id)} light adjusted`)
      }
    }

    const sa = a.lighting.shadows
    const sb = b.lighting.shadows
    if (sa.enabled !== sb.enabled) add(out, 'Light', `Shadows ${sb.enabled ? 'on' : 'off'}`)
    else if (!near(sa.opacity, sb.opacity) || !near(sa.softness, sb.softness)) {
      add(out, 'Light', 'Shadow adjusted')
    }
  },

  // ---- Timeline ----
  (a, b, out) => {
    const ta = tracksOf(a.composition)
    const tb = tracksOf(b.composition)

    for (const id of tb.keys()) {
      if (!ta.has(id)) add(out, 'Timeline', `${labelOf(id)} animated`)
    }
    for (const id of ta.keys()) {
      if (!tb.has(id)) add(out, 'Timeline', `${labelOf(id)} no longer animated`)
    }

    const countA = [...ta.values()].reduce((n, t) => n + t.keys.length, 0)
    const countB = [...tb.values()].reduce((n, t) => n + t.keys.length, 0)
    if (countB > countA) add(out, 'Timeline', plural(countB - countA, 'keyframe') + ' added')
    else if (countA > countB) add(out, 'Timeline', plural(countA - countB, 'keyframe') + ' removed')
    else if (countA > 0 && keyTimes(ta) !== keyTimes(tb)) add(out, 'Timeline', 'Keyframes retimed')

    if (!near(a.composition.duration, b.composition.duration)) {
      add(out, 'Timeline', `Clip ${round(a.composition.duration)}s → ${round(b.composition.duration)}s`)
    }
  },

  // ---- Angles ----
  (a, b, out) => {
    const before = new Set(a.presets.map((p) => p.id))
    const after = new Set(b.presets.map((p) => p.id))
    const added = [...after].filter((id) => !before.has(id)).length
    const removed = [...before].filter((id) => !after.has(id)).length
    if (added) add(out, 'Angles', `${plural(added, 'angle')} saved`)
    if (removed) add(out, 'Angles', `${plural(removed, 'angle')} deleted`)
  },
]

/* ------------------------------------------------------------------ */

const tracksOf = (c: Composition) => {
  const out = new Map<TrackId, { keys: { time: number }[] }>()
  for (const [id, t] of Object.entries(c.tracks)) {
    if (t && t.keys.length > 0) out.set(id as TrackId, t)
  }
  return out
}

const keyTimes = (m: Map<TrackId, { keys: { time: number }[] }>) =>
  [...m.entries()].map(([id, t]) => `${id}:${t.keys.map((k) => k.time).join(',')}`).sort().join('|')

const labelOf = (id: TrackId) => TRACKS[id]?.label ?? cap(id)
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const round = (n: number) => Math.round(n * 100) / 100
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

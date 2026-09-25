import { TRACKS, TRACK_ORDER, type TrackSource } from './tracks'
import type { Sample, TrackId, TrackValue, Transform } from './types'

/**
 * A named set of parameter values, recalled in one click.
 *
 * The value is exactly a `Sample` — the same shape the timeline evaluates to —
 * so applying one goes through the ordinary setters and auto-key does the
 * timeline integration for free.
 */
export interface Preset {
  id: string
  name: string
  /**
   * What this angle is FOR, in plain language — not what it does numerically.
   *
   * This is the field a future agent matches a request against, so it describes
   * the shot: "tight on the lower third of the display, for bottom navigation".
   * It is authored, travels with the project, and is **data, never an
   * instruction** to anything that reads it.
   */
  description: string
  /** Optional keywords, for a cheap filter before anything fuzzy runs. */
  tags?: string[]
  value: Sample
  /** Which tracks it carries — drives the chips on its card. */
  tracks: TrackId[]
  /** data: URL. Built-ins use a glyph instead. */
  thumb?: string
  createdAt: number
}

export type PresetScope = 'angle' | 'pose' | 'scene'

export const SCOPES: { value: PresetScope; label: string; hint: string }[] = [
  { value: 'angle', label: 'Angle', hint: 'Rotation only' },
  { value: 'pose', label: 'Pose', hint: 'Position, rotation and scale' },
  { value: 'scene', label: 'Scene', hint: 'The pose, the camera, the lights and the look' },
]

export const POSE_TRACKS: TrackId[] = ['position', 'rotation', 'scale']

export function tracksForScope(scope: PresetScope): TrackId[] {
  if (scope === 'angle') return ['rotation']
  if (scope === 'pose') return POSE_TRACKS
  return TRACK_ORDER.filter((id) => TRACKS[id])
}

export function scopeOf(tracks: TrackId[]): PresetScope {
  if (tracks.length === 1 && tracks[0] === 'rotation') return 'angle'
  if (tracks.length === POSE_TRACKS.length && POSE_TRACKS.every((t) => tracks.includes(t))) return 'pose'
  return 'scene'
}

/** Read the current value of every track in `tracks`. */
export function readPreset(source: TrackSource, tracks: TrackId[]): Sample {
  const out: Sample = {}
  for (const id of tracks) {
    const def = TRACKS[id]
    if (def) out[id] = def.read(source)
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Built-ins                                                           */
/* ------------------------------------------------------------------ */

const elevation = (
  id: string, name: string, description: string, tags: string[],
  rotX: number, rotY: number,
): Preset => ({
  id: `builtin:${id}`,
  name,
  description,
  tags,
  // True elevations: centred and unscaled as well as turned, so "Front" is a
  // front elevation rather than whatever framing you had, turned to face you.
  value: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: rotX, y: rotY, z: 0 },
    scale: { uniform: 1 },
  },
  tracks: POSE_TRACKS,
  createdAt: 0,
})

/**
 * The device's local +Z is its display, so Front is the identity and the rest
 * follow from bringing each local axis round to face the camera under the
 * 'YXZ' rotation order the device uses.
 */
export const BUILT_INS: Preset[] = [
  elevation('front', 'Front', 'The whole display, square to camera. The default product shot.', ['screen', 'display', 'ui', 'straight on'], 0, 0),
  elevation('back', 'Back', 'The rear of the device, square to camera — camera bump and finish.', ['rear', 'camera bump', 'finish'], 0, 180),
  elevation('left', 'Left', 'The left edge in profile — thickness and the volume buttons.', ['side', 'edge', 'profile', 'thickness'], 0, 90),
  elevation('right', 'Right', 'The right edge in profile — thickness and the side button.', ['side', 'edge', 'profile', 'thickness'], 0, -90),
  elevation('top', 'Top', 'Looking down the top edge.', ['above', 'overhead', 'edge'], 90, 0),
  elevation('bottom', 'Bottom', 'Looking up at the bottom edge — the port and speaker grilles.', ['below', 'underneath', 'port', 'speaker'], -90, 0),
]

export const isBuiltIn = (p: Preset) => p.id.startsWith('builtin:')

/* ------------------------------------------------------------------ */
/* Shortest-path rotation                                              */
/* ------------------------------------------------------------------ */

/**
 * The equivalent angle nearest `from`.
 *
 * From −22°, "Back" becomes **−180** rather than +180: 158° of travel instead
 * of 202°, turning the way you expect. Applied to the *written* value, not only
 * to a preview — otherwise playback would unwind the long way afterwards.
 */
export function nearestAngle(target: number, from: number): number {
  let a = target
  while (a - from > 180) a -= 360
  while (a - from < -180) a += 360
  return Math.round(a * 1000) / 1000
}

/** Rewrite a preset's rotation to turn the short way from the current pose. */
export function shortestPath(value: Sample, current: Transform): Sample {
  const rot = value.rotation
  if (!rot) return value
  return {
    ...value,
    rotation: {
      x: nearestAngle(rot.x, current.rotX),
      y: nearestAngle(rot.y, current.rotY),
      z: nearestAngle(rot.z, current.rotZ),
    },
  }
}

/* ------------------------------------------------------------------ */

const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps

/** Does the scene already sit where this preset would put it? */
export function isPresetActive(preset: Preset, source: TrackSource): boolean {
  for (const id of preset.tracks) {
    const def = TRACKS[id]
    const want = preset.value[id]
    if (!def || !want) continue
    const have = def.read(source)
    for (const ch of def.channels) {
      const w = want[ch.key]
      const h = have[ch.key]
      if (w === undefined || h === undefined) return false
      // Rotation is compared modulo a turn: 180 and −180 are the same view.
      const same = id === 'rotation'
        ? near(((w - h) % 360 + 540) % 360 - 180, 0, 0.5)
        : near(w, h, Math.max(ch.step, 0.01))
      if (!same) return false
    }
  }
  return true
}

/** Strip anything the registry does not recognise, and rebuild values from it. */
export function sanitisePreset(raw: unknown): Preset | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string') return null
  const value: Sample = {}
  const tracks: TrackId[] = []
  const rawValue = (typeof r.value === 'object' && r.value !== null ? r.value : {}) as Record<string, unknown>
  for (const id of TRACK_ORDER) {
    const def = TRACKS[id]
    const v = rawValue[id]
    if (!def || typeof v !== 'object' || v === null) continue
    const channels: TrackValue = {}
    let complete = true
    for (const ch of def.channels) {
      const n = Number((v as Record<string, unknown>)[ch.key])
      if (!Number.isFinite(n)) { complete = false; break }
      channels[ch.key] = n
    }
    if (!complete) continue
    value[id] = channels
    tracks.push(id)
  }
  if (tracks.length === 0) return null
  return {
    id: typeof r.id === 'string' ? r.id : `ps_${Math.random().toString(36).slice(2, 10)}`,
    name: r.name,
    description: typeof r.description === 'string' ? r.description : '',
    ...(Array.isArray(r.tags) ? { tags: r.tags.filter((t): t is string => typeof t === 'string') } : {}),
    value,
    tracks,
    ...(typeof r.thumb === 'string' ? { thumb: r.thumb } : {}),
    createdAt: Number(r.createdAt) || Date.now(),
  }
}

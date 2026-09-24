import {
  DEFAULT_TRANSFORM,
  type BackgroundState, type Composition, type LightingState, type ScreenState,
  type StageState, type Track, type TrackId, type TrackKey, type TrackValue,
  type Transform,
} from './types'

/**
 * The track registry: one declarative definition per animatable property.
 *
 * This is deliberately the only place a track is described. The `+ Animate`
 * menu, the row list, the GSAP build, the curve editor and the sampled-value
 * application all read from here, so a new animatable property is one entry
 * rather than an edit in five files.
 *
 * A `TrackId` that is not registered here does not exist as far as the app is
 * concerned — `migrateKeyframes` drops unknown ids, and the UI never offers
 * them. That is what keeps the union in `types.ts` from getting ahead of what
 * is actually wired up.
 */

export type TrackGroup = 'Transform' | 'Camera' | 'Light' | 'Look'

export interface ChannelDef {
  /** Key inside `TrackKey.value`. Namespaced per track, so `x` may repeat. */
  key: string
  label: string
  /**
   * CSS custom property that colours this channel's row and its curve. A token
   * rather than a hex so the light theme can restate it in one place.
   */
  colour: string
  /** Suffix shown next to the number. */
  unit?: string
  /** Increment for the numeric field and arrow keys. */
  step: number
}

/**
 * The slice of project state a track reads from.
 *
 * Declared structurally rather than importing `Project`, which would point the
 * engine at the store and make the dependency circular.
 */
export interface TrackSource {
  transform: Transform
  stage: StageState
  lighting: LightingState
  screen: ScreenState
  background: BackgroundState
}

export interface TrackDef {
  id: TrackId
  label: string
  group: TrackGroup
  channels: ChannelDef[]
  /** Current value of every channel, for keying at the playhead. */
  read(s: TrackSource): TrackValue
  /**
   * Fold a sampled value into a pose.
   *
   * Present only on the tracks that make up the transform. They cannot apply
   * themselves one at a time — the stage takes a whole `Transform` — so they
   * are merged first and applied once. Independent tracks (camera, lights)
   * gain their own applier when they are wired up.
   */
  write?(out: Transform, v: TrackValue): void
}

const AXIS = { x: 'var(--axis-x)', y: 'var(--axis-y)', z: 'var(--axis-z)' } as const

export const TRACKS: Partial<Record<TrackId, TrackDef>> = {
  position: {
    id: 'position',
    label: 'Position',
    group: 'Transform',
    channels: [
      { key: 'x', label: 'X', colour: AXIS.x, step: 0.05 },
      { key: 'y', label: 'Y', colour: AXIS.y, step: 0.05 },
      { key: 'z', label: 'Z', colour: AXIS.z, step: 0.05 },
    ],
    read: (s) => ({ x: s.transform.posX, y: s.transform.posY, z: s.transform.posZ }),
    write: (out, v) => {
      out.posX = v.x
      out.posY = v.y
      out.posZ = v.z
    },
  },

  rotation: {
    id: 'rotation',
    label: 'Rotation',
    group: 'Transform',
    channels: [
      { key: 'x', label: 'X', colour: AXIS.x, unit: '°', step: 1 },
      { key: 'y', label: 'Y', colour: AXIS.y, unit: '°', step: 1 },
      { key: 'z', label: 'Z', colour: AXIS.z, unit: '°', step: 1 },
    ],
    read: (s) => ({ x: s.transform.rotX, y: s.transform.rotY, z: s.transform.rotZ }),
    write: (out, v) => {
      out.rotX = v.x
      out.rotY = v.y
      out.rotZ = v.z
    },
  },

  scale: {
    id: 'scale',
    label: 'Scale',
    group: 'Transform',
    channels: [
      { key: 'uniform', label: 'Scale', colour: 'var(--axis-s)', unit: '×', step: 0.01 },
    ],
    read: (s) => ({ uniform: s.transform.scale }),
    write: (out, v) => { out.scale = v.uniform },
  },
}

/** Registration order, which is also the order rows appear in. */
export const TRACK_ORDER = Object.keys(TRACKS) as TrackId[]

export const trackDef = (id: TrackId): TrackDef | undefined => TRACKS[id]

export const isRegistered = (id: string): id is TrackId => id in TRACKS

export function makeTrackKey(time: number, value: TrackValue): TrackKey {
  return {
    id: `k_${Math.random().toString(36).slice(2, 10)}`,
    time: quantise(time),
    ease: 'power2.inOut',
    value: { ...value },
  }
}

export function makeTrack(id: TrackId, keys: TrackKey[] = []): Track {
  return { id, enabled: true, keys: sortKeys(keys) }
}

/** Times are compared for equality all over the UI, so they live on a 1ms grid. */
export const quantise = (t: number) => Math.max(0, Math.round(t * 1000) / 1000)

export const sortKeys = (keys: TrackKey[]) => [...keys].sort((a, b) => a.time - b.time)

/* ------------------------------------------------------------------ */
/* Derived reads                                                       */
/* ------------------------------------------------------------------ */

/** Tracks that exist and have at least one key, in registration order. */
export function liveTracks(c: Composition): Track[] {
  const out: Track[] = []
  for (const id of TRACK_ORDER) {
    const t = c.tracks[id]
    if (t && t.keys.length > 0) out.push(t)
  }
  return out
}

/**
 * Does the composition drive anything? The single answer to a question the
 * render loop, the scrubber and the exporter all used to ask their own way.
 *
 * One key counts. It pins its property for the whole composition, which is a
 * real effect even though nothing moves.
 */
export const hasAnimation = (c: Composition) => liveTracks(c).some((t) => t.enabled)

/** The last key across every track — how far the animation actually reaches. */
export function lastKeyTime(c: Composition): number {
  let out = 0
  for (const t of liveTracks(c)) out = Math.max(out, t.keys[t.keys.length - 1].time)
  return out
}

/**
 * Fold the transform slices of a sample over a base pose.
 *
 * Channels that no track drives hold at `base` rather than snapping to a
 * default, which is what makes it safe to animate rotation alone while
 * position stays wherever the user put it.
 */
export function mergeTransform(base: Transform, sample: Record<string, TrackValue | undefined>): Transform {
  const out: Transform = { ...DEFAULT_TRANSFORM, ...base }
  for (const id of TRACK_ORDER) {
    const def = TRACKS[id]
    const v = sample[id]
    if (def?.write && v) def.write(out, v)
  }
  return out
}

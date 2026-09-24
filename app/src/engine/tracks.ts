import {
  DEFAULT_TRANSFORM,
  type BackgroundState, type Composition, type LightId, type LightingState, type Sample,
  type ScreenState, type StageState, type Track, type TrackId, type TrackKey, type TrackValue,
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

/**
 * The engine surface a track may drive.
 *
 * Declared structurally so the registry never imports `Stage`, and so every
 * setter is a plain property write — this runs once per frame during playback
 * and per frame during export, so nothing here may allocate, load or stall.
 * Anything derived is recomputed once, in `commit`.
 */
export interface TrackTarget {
  setPose(t: Transform): void
  setCamera(fov: number, distance: number): void
  setLightSample(id: LightId, v: TrackValue): void
  setEnvironmentSample(v: TrackValue): void
  setShadowSample(v: TrackValue): void
  setScreenSample(v: TrackValue): void
  setBackgroundSample(v: TrackValue): void
  /** Recompute everything derived, once, after a whole sample has been applied. */
  commit(): void
}

export interface TrackDef {
  id: TrackId
  label: string
  group: TrackGroup
  channels: ChannelDef[]
  /** Current value of every channel, for keying at the playhead. */
  read(s: TrackSource): TrackValue
  /**
   * Fold a value into a pose.
   *
   * Present only on the tracks that make up the transform. They cannot apply
   * themselves one at a time — the stage takes a whole `Transform` — so they
   * are merged first and set once.
   */
  write?(out: Transform, v: TrackValue): void
  /** Drive the engine with a value. Everything that is not part of the pose. */
  apply?(target: TrackTarget, v: TrackValue): void
  /** Set on the three light tracks, so selecting a key can bring that light forward. */
  light?: LightId
}

/** Which inspector panel owns each group of properties. */
export const TAB_FOR_GROUP: Record<TrackGroup, 'Control' | 'Light' | 'Look'> = {
  Transform: 'Control', Camera: 'Control', Light: 'Light', Look: 'Look',
}

const AXIS = { x: 'var(--axis-x)', y: 'var(--axis-y)', z: 'var(--axis-z)' } as const
/** Scalars that are not an axis: an amount, and a secondary amount. */
const VALUE = 'var(--axis-v)'
const ALT = 'var(--axis-s)'

const light = (id: LightId, label: string): TrackDef => ({
  id: `${id}Light` as TrackId,
  label,
  group: 'Light',
  channels: [
    { key: 'intensity', label: 'Intensity', colour: VALUE, step: 0.05 },
    { key: 'x', label: 'X', colour: AXIS.x, step: 0.05 },
    { key: 'y', label: 'Y', colour: AXIS.y, step: 0.05 },
    { key: 'z', label: 'Z', colour: AXIS.z, step: 0.05 },
  ],
  read: (s) => {
    const l = s.lighting.lights[id]
    return { intensity: l.intensity, x: l.position[0], y: l.position[1], z: l.position[2] }
  },
  apply: (t, v) => t.setLightSample(id, v),
  light: id,
})

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

  camera: {
    id: 'camera',
    label: 'Camera',
    group: 'Camera',
    channels: [
      { key: 'fov', label: 'FOV', colour: VALUE, unit: '°', step: 0.5 },
      { key: 'distance', label: 'Distance', colour: AXIS.z, step: 0.02 },
    ],
    read: (s) => ({ fov: s.stage.fov, distance: s.stage.distance }),
    apply: (t, v) => t.setCamera(v.fov, v.distance),
  },

  environment: {
    id: 'environment',
    label: 'Environment',
    group: 'Light',
    channels: [
      { key: 'intensity', label: 'Intensity', colour: VALUE, step: 0.02 },
      { key: 'rotationY', label: 'Rotation', colour: AXIS.y, unit: '°', step: 1 },
      { key: 'exposure', label: 'Exposure', colour: ALT, step: 0.02 },
    ],
    read: (s) => ({
      intensity: s.lighting.environment.intensity,
      rotationY: s.lighting.environment.rotationY,
      exposure: s.lighting.environment.exposure,
    }),
    apply: (t, v) => t.setEnvironmentSample(v),
  },

  keyLight: light('key', 'Key light'),
  fillLight: light('fill', 'Fill light'),
  rimLight: light('rim', 'Rim light'),

  shadow: {
    id: 'shadow',
    label: 'Shadow',
    group: 'Light',
    channels: [
      { key: 'opacity', label: 'Opacity', colour: VALUE, step: 0.01 },
      { key: 'softness', label: 'Softness', colour: ALT, step: 0.02 },
    ],
    read: (s) => ({ opacity: s.lighting.shadows.opacity, softness: s.lighting.shadows.softness }),
    apply: (t, v) => t.setShadowSample(v),
  },

  screen: {
    id: 'screen',
    label: 'Screen',
    group: 'Look',
    channels: [
      { key: 'brightness', label: 'Brightness', colour: VALUE, step: 0.02 },
    ],
    read: (s) => ({ brightness: s.screen.brightness }),
    apply: (t, v) => t.setScreenSample(v),
  },

  background: {
    id: 'background',
    label: 'Background',
    group: 'Look',
    channels: [
      { key: 'speed', label: 'Speed', colour: VALUE, step: 0.01 },
      { key: 'vignette', label: 'Vignette', colour: ALT, step: 0.01 },
    ],
    read: (s) => ({ speed: s.background.gradient.speed, vignette: s.background.vignette }),
    apply: (t, v) => t.setBackgroundSample(v),
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
/**
 * Drive the engine for one instant: the project's own values, with any animated
 * track laid over the top.
 *
 * The base is re-applied every frame rather than only when it changes. That is
 * what makes removing a track restore the dialled-in value without anything
 * having to notice the removal, and it costs a handful of property writes.
 */
export function applySampled(target: TrackTarget, source: TrackSource, sample: Sample | null) {
  target.setPose(sample ? mergeTransform(source.transform, sample) : source.transform)
  for (const id of TRACK_ORDER) {
    const def = TRACKS[id]
    if (!def?.apply) continue
    def.apply(target, sample?.[id] ?? def.read(source))
  }
  target.commit()
}

export function mergeTransform(base: Transform, sample: Record<string, TrackValue | undefined>): Transform {
  const out: Transform = { ...DEFAULT_TRANSFORM, ...base }
  for (const id of TRACK_ORDER) {
    const def = TRACKS[id]
    const v = sample[id]
    if (def?.write && v) def.write(out, v)
  }
  return out
}

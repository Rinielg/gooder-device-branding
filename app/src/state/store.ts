import { create } from 'zustand'
import { applyTheme, readTheme, type Theme } from './theme'
import {
  DEFAULT_BACKGROUND, DEFAULT_COMPOSITION, DEFAULT_FRAME, DEFAULT_LIGHTING, DEFAULT_SCREEN,
  DEFAULT_STAGE, DEFAULT_TRANSFORM,
  type BackgroundState, type Composition, type DeviceId, type FrameState, type LegacyKeyframe,
  type LightId, type LightSettings, type LightingState, type SavedView,
  type ScreenState, type StageState, type Track, type TrackId, type TrackKey,
  type Sample, type Transform, type TrackValue, type VariantManifest,
} from '../engine/types'
import {
  TAB_FOR_GROUP, TRACKS, TRACK_ORDER, isRegistered, lastKeyTime, makeTrack, makeTrackKey,
  quantise, shiftKeys, sortKeys, type TrackSource,
} from '../engine/tracks'
import {
  BUILT_INS, POSE_TRACKS, readPreset, sanitisePreset, shortestPath, tracksForScope,
  type Preset, type PresetScope,
} from '../engine/presets'

const STORAGE_KEY = 'gooder-device-branding.v1'

export interface Project {
  device: DeviceId
  variant: string
  frame: FrameState
  stage: StageState
  lighting: LightingState
  transform: Transform
  background: BackgroundState
  screen: ScreenState
  composition: Composition
  /** Named parameter sets. Built-ins are code; these are the user's own. */
  presets: Preset[]
}

/** What `localStorage` may hold, including shapes this version no longer writes. */
type PersistedProject = Partial<Project> & {
  keyframes?: LegacyKeyframe[]
  /** Saved views, before presets absorbed them. */
  views?: SavedView[]
}

/** One list, so persist / export / import cannot drift apart. */
export const PROJECT_KEYS = [
  'device', 'variant', 'frame', 'stage', 'lighting',
  'transform', 'background', 'screen', 'composition', 'presets',
] as const

function pickProject(s: Project): Project {
  const out = {} as Record<string, unknown>
  for (const k of PROJECT_KEYS) out[k] = s[k]
  return out as unknown as Project
}

/** deepMerge accepts partial values at any depth, so the setter should too. */
export type DeepPartial<T> = T extends unknown[] ? T
  : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T

type Plain = Record<string, unknown>
const isPlainObject = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Merge saved settings over defaults at every depth.
 *
 * The per-slice spread used elsewhere is shallow, which is fine the first time
 * a slice appears but silently drops any key added to a nested object later —
 * arriving as `undefined`, which becomes a NaN uniform or throws on
 * `color.set()` during module-scope hydration.
 */
function deepMerge<T>(base: T, override: unknown): T {
  // A leaf value replaces; two objects merge. Returning `base` for a primitive
  // override would silently discard every nested edit.
  if (override === undefined) return base
  if (!isPlainObject(override) || !isPlainObject(base)) return override as T
  const out: Plain = { ...(base as unknown as Plain) }
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue
    out[k] = k in out ? deepMerge((base as unknown as Plain)[k], v) : v
  }
  return out as T
}

/** Lighting used to live as five flat fields on `stage`. Carry them over. */
function migrateLighting(persisted: Partial<Project>): LightingState {
  const saved = persisted.lighting
  if (saved) {
    const merged = deepMerge(DEFAULT_LIGHTING, saved)
    // An uploaded HDRI is a blob: URL that dies with the page.
    if (merged.environment.hdriUrl?.startsWith('blob:')) {
      merged.environment.hdriUrl = null
      merged.environment.hdriName = null
      if (merged.environment.mode === 'hdri') merged.environment.mode = 'studio'
    }
    return merged
  }
  const legacy = persisted.stage as (StageState & Partial<{
    envIntensity: number; envRotation: number
    keyIntensity: number; shadow: number; shadowBlur: number
  }>) | undefined
  if (!legacy || legacy.keyIntensity === undefined) return DEFAULT_LIGHTING
  const l = structuredClone(DEFAULT_LIGHTING)
  l.environment.intensity = legacy.envIntensity ?? l.environment.intensity
  l.environment.rotationY = legacy.envRotation ?? l.environment.rotationY
  l.lights.key.intensity = legacy.keyIntensity ?? l.lights.key.intensity
  l.shadows.opacity = legacy.shadow ?? l.shadows.opacity
  l.shadows.softness = legacy.shadowBlur ?? l.shadows.softness
  return l
}

/* ------------------------------------------------------------------ */
/* Composition migration                                               */
/* ------------------------------------------------------------------ */

/** Everything a track may read, for keying and for migration. */
const trackSource = (s: TrackSource): TrackSource => ({
  transform: s.transform, stage: s.stage, lighting: s.lighting,
  screen: s.screen, background: s.background,
})

/**
 * Drop anything the registry does not recognise and put the rest in a known
 * good shape.
 *
 * Saved projects are user data that may predate any given track, or come from
 * a hand-edited JSON export, so nothing here may assume the file is correct.
 */
function sanitiseComposition(raw: unknown): Composition {
  const out: Composition = { schemaVersion: 1, duration: 0, tracks: {} }
  if (!isPlainObject(raw)) return out

  const duration = Number(raw.duration)
  out.duration = Number.isFinite(duration) && duration > 0 ? quantise(duration) : 0

  const tracks = raw.tracks
  if (!isPlainObject(tracks)) return out

  for (const [id, saved] of Object.entries(tracks)) {
    if (!isRegistered(id) || !isPlainObject(saved)) continue
    const def = TRACKS[id]
    if (!def) continue
    const rawKeys = Array.isArray(saved.keys) ? saved.keys : []
    const keys: TrackKey[] = []
    for (const k of rawKeys) {
      if (!isPlainObject(k) || !isPlainObject(k.value)) continue
      const time = Number(k.time)
      if (!Number.isFinite(time)) continue
      // A key missing a channel would tween to undefined, so rebuild the value
      // from the channel list and skip the key if a channel has no number.
      const channels: Record<string, number> = {}
      let complete = true
      for (const ch of def.channels) {
        const n = Number((k.value as Record<string, unknown>)[ch.key])
        if (!Number.isFinite(n)) { complete = false; break }
        channels[ch.key] = n
      }
      if (!complete) continue
      keys.push({
        id: typeof k.id === 'string' ? k.id : makeTrackKey(0, channels).id,
        time: quantise(time),
        ease: typeof k.ease === 'string' ? (k.ease as TrackKey['ease']) : 'power2.inOut',
        ...(Array.isArray(k.bezier) && k.bezier.length === 4
          ? { bezier: k.bezier.map(Number) as [number, number, number, number] }
          : {}),
        value: channels,
      })
    }
    if (keys.length === 0) continue
    out.tracks[id] = { id, enabled: saved.enabled !== false, keys: sortKeys(keys) }
  }
  return out
}

/**
 * Read the animation out of a saved project.
 *
 * Before tracks existed a keyframe carried the whole transform, so each one
 * fans out into three keys — position, rotation and scale — at the same time
 * with the same easing. That is exactly equivalent: the old model could only
 * ever move all three together. `STORAGE_KEY` is deliberately not bumped, so
 * existing work survives the upgrade rather than being silently discarded.
 */
function migrateKeyframes(persisted: PersistedProject): Composition {
  if (persisted.composition) return sanitiseComposition(persisted.composition)

  const legacy = persisted.keyframes
  if (!Array.isArray(legacy) || legacy.length === 0) return structuredClone(DEFAULT_COMPOSITION)

  const out: Composition = { schemaVersion: 1, duration: 0, tracks: {} }
  for (const kf of legacy) {
    if (!kf?.transform || !Number.isFinite(kf.time)) continue
    const source = trackSource({
      transform: { ...DEFAULT_TRANSFORM, ...kf.transform },
      stage: DEFAULT_STAGE,
      lighting: DEFAULT_LIGHTING,
      screen: DEFAULT_SCREEN,
      background: DEFAULT_BACKGROUND,
    })
    for (const id of TRACK_ORDER) {
      const def = TRACKS[id]
      // Only the transform folds into a pose; nothing else was expressible.
      if (!def?.write) continue
      const key = makeTrackKey(kf.time, def.read(source))
      key.ease = kf.ease ?? 'power2.inOut'
      const track = out.tracks[id] ?? (out.tracks[id] = makeTrack(id))
      track.keys.push(key)
    }
  }
  for (const id of TRACK_ORDER) {
    const t = out.tracks[id]
    if (t) t.keys = sortKeys(t.keys)
  }
  return out
}

export interface KeySelection {
  track: TrackId
  /**
   * The key itself, or — for a segment — the key it *arrives at*, since that is
   * where the easing lives.
   */
  key: string
  /**
   * What was clicked. Easing belongs to the segment between two keys, so
   * selecting a segment is what opens the transition editor; selecting a key
   * offers its time and values instead. Spline draws the same distinction and
   * it is the right one: you select the thing you are editing.
   */
  kind: 'key' | 'segment'
}

export type InspectorTab = 'Stage' | 'Look' | 'Light' | 'Control' | 'Angles' | 'Export'

/** How many steps of undo are kept. */
export const HISTORY_LIMIT = 20
/**
 * A continuous edit — a drag, a slider, a bezier handle — should be one undo
 * step rather than sixty, so edits sharing a coalesce key inside this window
 * fold into the snapshot already on the stack.
 */
const COALESCE_MS = 600

interface Snapshot {
  label: string
  project: Project
  /** Blobs live outside the project but a background swap has to come back with it. */
  backgroundVideoBlob: Blob | null
  screenVideoBlob: Blob | null
}

/**
 * Saved views were presets with a fixed scope and no description.
 *
 * Carried over rather than kept alongside: two lists of named poses is one list
 * too many, and every view is expressible as a Pose-scoped preset.
 */
function migrateViews(persisted: PersistedProject): Preset[] {
  if (persisted.presets) {
    return persisted.presets.map(sanitisePreset).filter((p): p is Preset => p !== null)
  }
  const views = persisted.views
  if (!Array.isArray(views)) return []
  return views.flatMap((v) => {
    if (!v?.transform) return []
    const t = { ...DEFAULT_TRANSFORM, ...v.transform }
    return [{
      id: v.id ?? `ps_${Math.random().toString(36).slice(2, 10)}`,
      name: v.name ?? 'View',
      description: '',
      value: {
        position: { x: t.posX, y: t.posY, z: t.posZ },
        rotation: { x: t.rotX, y: t.rotY, z: t.rotZ },
        scale: { uniform: t.scale },
      },
      tracks: [...POSE_TRACKS],
      ...(v.thumb ? { thumb: v.thumb } : {}),
      createdAt: v.createdAt ?? Date.now(),
    } satisfies Preset]
  })
}

interface Store extends Project {
  manifest: VariantManifest | null
  /** Blobs are kept out of the persisted project; object URLs do not survive reload. */
  backgroundVideoBlob: Blob | null
  screenVideoBlob: Blob | null
  /** Length of the current background animation, in seconds. 0 when static. */
  backgroundDuration: number

  playhead: number
  playing: boolean
  /**
   * Which key is being edited. Hoisted out of the timeline panel so the
   * transition and curve editors can read it too.
   */
  selection: KeySelection | null
  loop: boolean
  ready: boolean
  /** True while an export is running; the preview loop stands down. */
  exporting: boolean
  /**
   * What the timeline evaluates to at the playhead, or null when nothing is
   * animated.
   *
   * The panels read through this so their controls show what is actually on
   * screen while scrubbing. It is a view of the project, never part of it: not
   * persisted, not undoable, and never written back into the project's own
   * values.
   */
  sampled: Sample | null
  /**
   * Which panel the inspector is showing, and which light within it.
   *
   * In the store rather than in the component because selecting a keyframe
   * moves them: the thing being animated and the thing being edited should
   * never be in two different places.
   */
  inspectorTab: InspectorTab
  inspectorLight: LightId
  /** Light or dark. A workstation preference, so it lives beside the project rather than in it. */
  theme: Theme
  /** Light gizmos are an editing aid, so they are never persisted. */
  showLightHelpers: boolean
  status: string | null
  error: string | null
  /** Undo stack, oldest first. Never persisted — history is a session thing. */
  past: Snapshot[]
  future: Snapshot[]

  setManifest(m: VariantManifest): void
  setDevice(id: DeviceId): void
  setVariant(id: string): void
  setFrame(f: Partial<FrameState>): void
  setStage(s: Partial<StageState>): void
  setLighting(l: DeepPartial<LightingState>): void
  setLight(id: LightId, l: Partial<LightSettings>): void
  resetLighting(): void
  setTransform(t: Partial<Transform>, opts?: { silent?: boolean }): void
  setBackground(b: Partial<BackgroundState>, blob?: Blob | null): void
  setBackgroundDuration(d: number): void
  setScreen(s: Partial<ScreenState>, blob?: Blob | null): void

  setPlayhead(t: number): void
  setPlaying(p: boolean): void
  setLoop(l: boolean): void

  /** Key every transform track at the playhead — the whole pose, as one gesture. */
  keyPose(): void
  /**
   * Key one property at the playhead, creating its track if needed.
   * `label` names the undo step; `keyPose` passes its own so three keys laid
   * down together read as one action.
   */
  keyTrack(id: TrackId, label?: string): void
  removeKey(track: TrackId, key: string): void
  /** Delete every key sitting at one instant, across every track. */
  removeKeysAt(time: number): void
  updateKey(track: TrackId, key: string, patch: Partial<TrackKey>): void
  moveKey(track: TrackId, key: string, time: number): void
  /** Retime several keys of one track together, keeping their spacing. */
  shiftTrackKeys(track: TrackId, keys: string[], delta: number): void
  /** Set a key's value to whatever the property reads right now. */
  recaptureKey(track: TrackId, key: string): void
  removeTrack(id: TrackId): void
  setTrackEnabled(id: TrackId, enabled: boolean): void
  /** Explicit composition length; 0 returns it to deriving one from the content. */
  setCompositionLength(seconds: number): void
  clearComposition(): void
  selectKey(sel: KeySelection | null): void

  /** Capture the current scene at `scope` as a named preset. */
  savePreset(name: string, description: string, scope: PresetScope, thumb: string): void
  updatePreset(id: string, patch: { name?: string; description?: string }): void
  /** Replace a preset's values with the current scene, keeping its scope. */
  recapturePreset(id: string, thumb: string): void
  deletePreset(id: string): void
  /**
   * Write a preset's values. Auto-key turns that into a key at the playhead for
   * anything already animated.
   *
   * `only` narrows it — alt-clicking a built-in applies the rotation alone.
   */
  applyPreset(id: string, only?: TrackId[]): void
  /** Force a key at the playhead for every track the preset carries. */
  applyPresetAsKeys(id: string): void

  undo(): void
  redo(): void
  /**
   * Run a derived sync without it becoming its own undo step.
   *
   * Some state follows other state — the wallpaper follows the colourway — and
   * that is a consequence of an action, not an action. It is already inside the
   * snapshot taken for the action that caused it.
   */
  silently(run: () => void): void

  setSampled(s: Sample | null): void
  setInspectorTab(tab: InspectorTab): void
  toggleTheme(): void
  setInspectorLight(id: LightId): void
  setReady(r: boolean): void
  setExporting(e: boolean): void
  setShowLightHelpers(v: boolean): void
  setStatus(s: string | null): void
  setError(e: string | null): void

  exportProject(): Project
  importProject(p: PersistedProject): void
}

function loadPersisted(): PersistedProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as PersistedProject
    // Media lives behind object URLs that die with the page; drop those.
    if (parsed.background) {
      parsed.background = {
        ...parsed.background,
        imageUrl: parsed.background.imageUrl?.startsWith('blob:') ? null : parsed.background.imageUrl ?? null,
        videoUrl: null,
        videoName: null,
        kind: parsed.background.kind === 'video' ? 'gradient' : parsed.background.kind,
      }
    }
    if (parsed.screen && parsed.screen.url?.startsWith('blob:')) {
      parsed.screen = { ...parsed.screen, ...DEFAULT_SCREEN }
    }
    return parsed
  } catch {
    return {}
  }
}

const persisted = loadPersisted()

const initial: Project = {
  device: persisted.device ?? 'iphone-18-pro-max',
  variant: persisted.variant ?? 'Black',
  frame: { ...DEFAULT_FRAME, ...persisted.frame },
  stage: { ...DEFAULT_STAGE, ...persisted.stage },
  lighting: migrateLighting(persisted),
  transform: { ...DEFAULT_TRANSFORM, ...persisted.transform },
  background: { ...DEFAULT_BACKGROUND, ...persisted.background },
  screen: { ...DEFAULT_SCREEN, ...persisted.screen },
  composition: migrateKeyframes(persisted),
  presets: migrateViews(persisted),
}

/**
 * Replace one track, leaving every other track object identical.
 *
 * The identity matters: the timeline reuses runners for tracks that did not
 * change, so dragging a key rebuilds one GSAP timeline rather than all of them.
 */
function patchTrack(s: Project, id: TrackId, track: Track): { composition: Composition } {
  return { composition: { ...s.composition, tracks: { ...s.composition.tracks, [id]: track } } }
}

function dropTrack(s: Project, id: TrackId): { composition: Composition } {
  const tracks = { ...s.composition.tracks }
  delete tracks[id]
  return { composition: { ...s.composition, tracks } }
}

/**
 * Write the pose into the keys as it is edited.
 *
 * Once a property is animated, moving it at a new time *means* putting a key
 * there — that is what every animation tool does, and it is the difference
 * between posing the device and having the next scrub silently throw the pose
 * away.
 *
 * **Once anything is animated, a property that is edited joins in.** A track
 * that does not exist yet is created, with a key at 0 carrying the value from
 * *before* the edit and a key at the playhead carrying the value after it — so
 * what you get is an animation rather than a property pinned to one value. The
 * first key on the composition stays deliberate; after that, having to arm each
 * property separately is ceremony.
 *
 * Which tracks are affected is derived by reading them before and after rather
 * than declared, so the registry stays the only description of a track.
 */
function autoKey(s: Store, next: TrackSource): { composition: Composition } | null {
  const time = quantise(s.playhead)
  const before = trackSource(s)
  const after_ = trackSource(next)
  let tracks = s.composition.tracks
  // Nothing animated at all means the user is posing, not animating.
  const animating = Object.keys(tracks).length > 0
  let touched = false

  for (const id of TRACK_ORDER) {
    const def = TRACKS[id]
    if (!def) continue
    const track = tracks[id]
    if (!track && !animating) continue

    const value = def.read(after_)
    const was = def.read(before)
    if (sameValue(value, was)) continue

    if (!track) {
      // A key at 0 holding what the property was, so the new track animates
      // from where it stood rather than starting life pinned.
      const keys = time > 1e-3
        ? [makeTrackKey(0, was), makeTrackKey(time, value)]
        : [makeTrackKey(0, value)]
      tracks = { ...tracks, [id]: makeTrack(id, keys) }
      touched = true
      continue
    }

    const existing = track.keys.find((k) => Math.abs(k.time - time) < 1e-3)
    const keys = existing
      ? track.keys.map((k) => (k.id === existing.id ? { ...k, value } : k))
      : sortKeys([...track.keys, makeTrackKey(time, value)])
    tracks = { ...tracks, [id]: { ...track, keys } }
    touched = true
  }

  return touched ? { composition: { ...s.composition, tracks } } : null
}

const sameValue = (a: TrackValue, b: TrackValue) =>
  Object.keys(a).every((k) => a[k] === b[k])

function sameSample(a: Sample | null, b: Sample | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  for (const k of keys) {
    const av = a[k as TrackId]
    const bv = b[k as TrackId]
    if (!av || !bv || !sameValue(av, bv)) return false
  }
  return true
}

/**
 * Apply an edit, keying any animated property it moved.
 *
 * Every panel goes through here, so animating a light or the camera behaves
 * exactly like posing the device: if the property already has a track, editing
 * it at a new time puts a key there.
 */
function withAutoKey(s: Store, patch: Partial<Project>): Partial<Project> {
  if (s.playing || s.exporting) return patch
  const keyed = autoKey(s, trackSource({ ...s, ...patch }))
  return keyed ? { ...patch, ...keyed } : patch
}

/** Built-ins are code, so they are not in the project's own list. */
function findPreset(s: Store, id: string): Preset | undefined {
  return BUILT_INS.find((p) => p.id === id) ?? s.presets.find((p) => p.id === id)
}

/**
 * Write a sample back through the ordinary setters.
 *
 * Going through the setters rather than straight into state is the point: they
 * are what auto-key hangs off, so applying a preset keys itself exactly as
 * dragging the device does, with no preset-shaped special case in the timeline.
 */
function writeSample(s: Store, value: Sample, tracks: TrackId[], label: string) {
  const pose: Partial<Transform> = {}
  for (const id of tracks) {
    const v = value[id]
    if (!v) continue
    if (id === 'position') Object.assign(pose, { posX: v.x, posY: v.y, posZ: v.z })
    else if (id === 'rotation') Object.assign(pose, { rotX: v.x, rotY: v.y, rotZ: v.z })
    else if (id === 'scale') Object.assign(pose, { scale: v.uniform })
    else if (id === 'camera') s.setStage({ fov: v.fov, distance: v.distance })
    else if (id === 'environment') {
      s.setLighting({ environment: { intensity: v.intensity, rotationY: v.rotationY, exposure: v.exposure } })
    } else if (id === 'shadow') s.setLighting({ shadows: { opacity: v.opacity, softness: v.softness } })
    else if (id === 'screen') s.setScreen({ brightness: v.brightness })
    else if (id === 'background') {
      s.setBackground({ vignette: v.vignette, gradient: { ...s.background.gradient, speed: v.speed } })
    } else if (id.endsWith('Light')) {
      s.setLight(id.replace('Light', '') as LightId, {
        intensity: v.intensity, position: [v.x, v.y, v.z],
      })
    }
  }
  if (Object.keys(pose).length > 0) s.setTransform(pose)
  // The label rides on the coalesce window the setters already opened, so the
  // whole preset is one undo step.
  void label
}

export const useStore = create<Store>((set, get) => {
  const persist = () => {
    const s = get()
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pickProject(s))) } catch { /* quota */ }
  }

  // Playback writes the transform every frame; persisting on each one would
  // serialise the whole project 60 times a second.
  let persistTimer: ReturnType<typeof setTimeout> | undefined

  // Coalescing state lives outside the store: it is bookkeeping about the last
  // edit, not part of the project, and it must not be snapshotted.
  let lastCoalesce: string | null = null
  let lastAt = 0
  let restoring = false

  const snapshot = (s: Store, label: string): Snapshot => ({
    label,
    project: pickProject(s),
    backgroundVideoBlob: s.backgroundVideoBlob,
    screenVideoBlob: s.screenVideoBlob,
  })

  /**
   * Record the state *before* an edit, and schedule the debounced save.
   *
   * `get()` is still the pre-edit state here in both call shapes — `after` runs
   * before `set` merges, and inside a `set(fn)` updater zustand has not applied
   * anything yet.
   */
  const after = <T extends object>(v: T, label = 'Edit', coalesce: string | null = null): T => {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(persist, 400)
    if (restoring) return v

    const now = Date.now()
    if (coalesce && coalesce === lastCoalesce && now - lastAt < COALESCE_MS) {
      // The entry already on the stack holds the state from before this run of
      // edits started, which is exactly what undo should return to.
      lastAt = now
      return { ...v, future: [] } as T
    }
    lastCoalesce = coalesce
    lastAt = now
    const s = get()
    return {
      ...v,
      past: [...s.past, snapshot(s, label)].slice(-HISTORY_LIMIT),
      future: [],
    } as T
  }

  /** Step through the history. Restoring is itself never recorded. */
  const travel = (from: 'past' | 'future') => {
    const s = get()
    const stack = s[from]
    const entry = from === 'past' ? stack[stack.length - 1] : stack[0]
    if (!entry) return
    const other = from === 'past' ? 'future' : 'past'
    const keep = from === 'past' ? stack.slice(0, -1) : stack.slice(1)
    const mirror = from === 'past'
      ? [snapshot(s, entry.label), ...s.future].slice(0, HISTORY_LIMIT)
      : [...s.past, snapshot(s, entry.label)].slice(-HISTORY_LIMIT)

    restoring = true
    set({
      ...entry.project,
      backgroundVideoBlob: entry.backgroundVideoBlob,
      screenVideoBlob: entry.screenVideoBlob,
      [from]: keep,
      [other]: mirror,
      // A key that no longer exists cannot stay selected.
      selection: null,
    })
    restoring = false
    lastCoalesce = null
    persist()
  }

  return {
    ...initial,
    manifest: null,
    backgroundVideoBlob: null,
    screenVideoBlob: null,
    backgroundDuration: 0,
    playhead: 0,
    playing: false,
    selection: null,
    // The shipped mesh gradient runs once and holds, so the default is a single
    // pass rather than a loop.
    loop: false,
    ready: false,
    exporting: false,
    sampled: null,
    inspectorTab: 'Stage',
    inspectorLight: 'key',
    theme: readTheme(),
    showLightHelpers: false,
    status: null,
    error: null,
    past: [],
    future: [],

    setManifest: (manifest) => set({ manifest }),
    setDevice: (device) => set(after({ device }, 'Change device')),
    setVariant: (variant) => set(after({ variant }, 'Change colourway')),
    setFrame: (f) => set((s) => after({ frame: { ...s.frame, ...f } }, 'Change frame', 'frame')),
    setStage: (v) => set((s) => after(withAutoKey(s, { stage: { ...s.stage, ...v } }), 'Change camera', 'stage')),
    setLighting: (v) => set((s) => after(withAutoKey(s, { lighting: deepMerge(s.lighting, v) }), 'Change lighting', 'lighting')),
    setLight: (id, v) => set((s) => after(withAutoKey(s, {
      lighting: { ...s.lighting, lights: { ...s.lighting.lights, [id]: { ...s.lighting.lights[id], ...v } } },
    }), `Change ${id} light`, `light:${id}`)),
    // Keyed like any other lighting edit: with a lighting track present the
    // reset has to land at the playhead, or an animated rig would swallow it.
    resetLighting: () => set((s) => after(
      withAutoKey(s, { lighting: structuredClone(DEFAULT_LIGHTING) }), 'Reset lighting',
    )),
    setTransform: (t, opts) => set((s) => {
      const transform = { ...s.transform, ...t }
      // Playback and scrubbing write the sampled pose back so the dials follow
      // along. That is the timeline talking to itself, not an edit, and keying
      // it would lay down a key on every frame.
      if (opts?.silent || s.playing || s.exporting) return { transform }
      return after(withAutoKey(s, { transform }), 'Pose device', 'transform')
    }),

    setBackground: (b, blob) => set((s) => after(withAutoKey(s, {
      background: { ...s.background, ...b },
      backgroundVideoBlob: blob === undefined ? s.backgroundVideoBlob : blob,
    } as Partial<Project>), 'Change background', 'background')),
    setScreen: (v, blob) => set((s) => after(withAutoKey(s, {
      screen: { ...s.screen, ...v },
      screenVideoBlob: blob === undefined ? s.screenVideoBlob : blob,
    } as Partial<Project>), 'Change screen', 'screen')),

    setBackgroundDuration: (backgroundDuration) => set({ backgroundDuration }),
    setPlayhead: (playhead) => set({ playhead }),
    setPlaying: (playing) => set({ playing }),
    setLoop: (loop) => set({ loop }),

    keyPose: () => {
      // Every transform track together, which is what the old single keyframe
      // did and still the common gesture: pose the device, mark it.
      for (const id of TRACK_ORDER) if (TRACKS[id]?.write) get().keyTrack(id, 'Key pose')
    },

    keyTrack: (id, label) => set((s) => {
      const def = TRACKS[id]
      if (!def) return {}
      const time = quantise(s.playhead)
      const value = def.read(s)
      // Arming a property part-way along gives it a clip, not a pin: a key at 0
      // as well, so there is something to animate between.
      const track = s.composition.tracks[id]
        ?? makeTrack(id, time > 1e-3 ? [makeTrackKey(0, value)] : [])
      // Re-keying at a time that already has one replaces its value rather than
      // stacking a second key nobody can select.
      const existing = track.keys.find((k) => Math.abs(k.time - time) < 1e-3)
      const keys = existing
        ? track.keys.map((k) => (k.id === existing.id ? { ...k, value } : k))
        : sortKeys([...track.keys, makeTrackKey(time, value)])
      return after(patchTrack(s, id, { ...track, keys }), label ?? `Key ${def.label.toLowerCase()}`, `key@${time}`)
    }),

    removeKey: (id, key) => set((s) => {
      const track = s.composition.tracks[id]
      if (!track) return {}
      const keys = track.keys.filter((k) => k.id !== key)
      const next = keys.length === 0
        ? dropTrack(s, id)
        : patchTrack(s, id, { ...track, keys })
      return after({
        ...next,
        selection: s.selection?.key === key ? null : s.selection,
      }, 'Delete keyframe')
    }),

    /** Every key sitting at one instant, across every track. */
    removeKeysAt: (time) => set((s) => {
      let tracks = s.composition.tracks
      let removed = 0
      for (const id of TRACK_ORDER) {
        const track = tracks[id]
        if (!track) continue
        const keys = track.keys.filter((k) => Math.abs(k.time - time) >= 1e-3)
        if (keys.length === track.keys.length) continue
        removed += track.keys.length - keys.length
        const next = { ...tracks }
        if (keys.length === 0) delete next[id]
        else next[id] = { ...track, keys }
        tracks = next
      }
      if (removed === 0) return {}
      return after({
        composition: { ...s.composition, tracks },
        selection: null,
      }, removed === 1 ? 'Delete keyframe' : `Delete ${removed} keyframes`)
    }),

    updateKey: (id, key, patch) => set((s) => {
      const track = s.composition.tracks[id]
      if (!track) return {}
      const keys = sortKeys(track.keys.map((k) => (k.id === key ? { ...k, ...patch } : k)))
      return after(patchTrack(s, id, { ...track, keys }), 'Edit keyframe', `edit:${key}`)
    }),

    moveKey: (id, key, time) => set((s) => {
      const track = s.composition.tracks[id]
      if (!track) return {}
      const keys = sortKeys(track.keys.map((k) => (k.id === key ? { ...k, time: quantise(time) } : k)))
      return after(patchTrack(s, id, { ...track, keys }), 'Move keyframe', `move:${key}`)
    }),

    shiftTrackKeys: (id, ids, delta) => set((s) => {
      const track = s.composition.tracks[id]
      if (!track) return {}
      const keys = sortKeys(shiftKeys(track.keys, ids, delta))
      return after(patchTrack(s, id, { ...track, keys }), 'Move keyframes', `shift:${ids.join()}`)
    }),

    recaptureKey: (id, key) => set((s) => {
      const track = s.composition.tracks[id]
      const def = TRACKS[id]
      if (!track || !def) return {}
      const value = def.read(s)
      const keys = track.keys.map((k) => (k.id === key ? { ...k, value } : k))
      return after(patchTrack(s, id, { ...track, keys }), 'Capture keyframe')
    }),

    removeTrack: (id) => set((s) => after({
      ...dropTrack(s, id),
      selection: s.selection?.track === id ? null : s.selection,
    }, `Stop animating ${TRACKS[id]?.label.toLowerCase() ?? id}`)),

    setTrackEnabled: (id, enabled) => set((s) => {
      const track = s.composition.tracks[id]
      if (!track) return {}
      return after(patchTrack(s, id, { ...track, enabled }), enabled ? 'Unmute track' : 'Mute track')
    }),

    setCompositionLength: (seconds) => set((s) => after({
      composition: { ...s.composition, duration: seconds > 0 ? quantise(seconds) : 0 },
    }, 'Change length', 'length')),

    clearComposition: () => set(after({
      composition: structuredClone(DEFAULT_COMPOSITION),
      selection: null,
    }, 'Clear animation')),

    // Selecting a key brings its own controls forward. Done here rather than in
    // an effect watching the selection, so the tab moves as part of the click
    // rather than as a second render caused by it.
    selectKey: (selection) => {
      if (!selection) { set({ selection }); return }
      const def = TRACKS[selection.track]
      set({
        selection,
        inspectorTab: def ? TAB_FOR_GROUP[def.group] : get().inspectorTab,
        inspectorLight: def?.light ?? get().inspectorLight,
      })
    },

    savePreset: (name, description, scope, thumb) => set((s) => {
      const tracks = tracksForScope(scope)
      const preset: Preset = {
        id: `ps_${Math.random().toString(36).slice(2, 10)}`,
        name, description, tracks,
        value: readPreset(trackSource(s), tracks),
        ...(thumb ? { thumb } : {}),
        createdAt: Date.now(),
      }
      return after({ presets: [preset, ...s.presets].slice(0, 60) }, 'Save preset')
    }),

    updatePreset: (id, patch) => set((s) => after({
      presets: s.presets.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }, 'Rename preset', `preset:${id}`)),

    recapturePreset: (id, thumb) => set((s) => {
      const preset = s.presets.find((p) => p.id === id)
      if (!preset) return {}
      return after({
        presets: s.presets.map((p) => (p.id === id
          ? { ...p, value: readPreset(trackSource(s), p.tracks), ...(thumb ? { thumb } : {}) }
          : p)),
      }, 'Update preset')
    }),

    deletePreset: (id) => set((s) => after({
      presets: s.presets.filter((p) => p.id !== id),
    }, 'Delete preset')),

    applyPreset: (id, only) => {
      const s = get()
      const preset = findPreset(s, id)
      if (!preset) return
      const wanted = only ?? preset.tracks
      // Short-path first, so the value that lands — and is keyed — turns the
      // near way rather than only looking like it does.
      const value = shortestPath(preset.value, s.transform)
      if (s.playing) s.setPlaying(false)
      writeSample(s, value, wanted, `Apply ${preset.name.toLowerCase()}`)
    },

    applyPresetAsKeys: (id) => {
      const s = get()
      const preset = findPreset(s, id)
      if (!preset) return
      const value = shortestPath(preset.value, s.transform)
      if (s.playing) s.setPlaying(false)
      // Arm every track the preset carries first, so auto-key has somewhere to
      // write — a track armed part-way along gets its 0s key as usual.
      for (const id2 of preset.tracks) {
        if (!get().composition.tracks[id2]) get().keyTrack(id2, `Apply ${preset.name.toLowerCase()}`)
      }
      writeSample(get(), value, preset.tracks, `Apply ${preset.name.toLowerCase()}`)
    },

    undo: () => travel('past'),
    redo: () => travel('future'),
    silently: (run) => {
      restoring = true
      try { run() } finally { restoring = false }
    },

    // Called every frame, so it compares before it writes: an idle playhead
    // must not wake every panel sixty times a second.
    setSampled: (sampled) => {
      if (!sameSample(get().sampled, sampled)) set({ sampled })
    },

    setInspectorTab: (inspectorTab) => set({ inspectorTab }),
    toggleTheme: () => {
      const theme = get().theme === 'dark' ? 'light' : 'dark'
      applyTheme(theme)
      set({ theme })
    },
    setInspectorLight: (inspectorLight) => set({ inspectorLight }),
    setReady: (ready) => set({ ready }),
    setExporting: (exporting) => set({ exporting }),
    setShowLightHelpers: (showLightHelpers) => set({ showLightHelpers }),
    setStatus: (status) => set({ status }),
    setError: (error) => set({ error }),

    exportProject: () => pickProject(get()),

    importProject: (p) => set((s) => after({
      device: p.device ?? s.device,
      variant: p.variant ?? s.variant,
      frame: { ...s.frame, ...p.frame },
      stage: { ...s.stage, ...p.stage },
      lighting: migrateLighting(p),
      transform: { ...s.transform, ...p.transform },
      background: { ...s.background, ...p.background, videoUrl: null, kind: p.background?.kind === 'video' ? 'gradient' : (p.background?.kind ?? s.background.kind) },
      screen: { ...s.screen, ...p.screen },
      // A file with no animation at all leaves the current one alone; only a
      // file that actually carries one replaces it.
      composition: p.composition || p.keyframes ? migrateKeyframes(p) : s.composition,
      presets: p.presets || p.views ? migrateViews(p) : s.presets,
    }, 'Import project')),
  }
})

/** Shortest composition offered when nothing else sets a length. */
export const MIN_COMPOSITION = 4

/**
 * How long the composition runs.
 *
 * An explicit `duration` wins outright — a 20s background animation is a reason
 * for the *default* to be long, not a reason to refuse a 5s clip. Only the keys
 * still override it, so dragging one past the end extends the composition
 * rather than silently clipping it.
 *
 * With no explicit length: once anything is keyed the clip follows the keys,
 * because the animation is the thing being made. Letting a 20s background hold
 * the ruler open means a three-second animation is previewed as three marks
 * against seventeen seconds of nothing. A second of headroom is kept past the
 * last key so the animation can always be extended by clicking past its end.
 */
export const compositionDuration = (c: Composition, backgroundDuration: number) => {
  if (c.duration > 0) return Math.max(c.duration, lastKeyTime(c))
  const keys = lastKeyTime(c)
  return keys > 0
    ? Math.max(keys + 1, MIN_COMPOSITION)
    : Math.max(backgroundDuration, MIN_COMPOSITION)
}

/** Where the animation itself ends. Playback rewinds from here, not from the clip end. */
export const animationEnd = (c: Composition) => lastKeyTime(c)

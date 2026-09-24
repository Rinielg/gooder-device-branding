import { create } from 'zustand'
import {
  DEFAULT_BACKGROUND, DEFAULT_FRAME, DEFAULT_LIGHTING, DEFAULT_SCREEN, DEFAULT_STAGE,
  DEFAULT_TRANSFORM,
  type BackgroundState, type DeviceId, type FrameState, type Keyframe, type LightId,
  type LightSettings, type LightingState, type SavedView,
  type ScreenState, type StageState, type Transform, type VariantManifest,
} from '../engine/types'
import { makeKeyframe } from '../engine/Timeline'

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
  keyframes: Keyframe[]
  views: SavedView[]
}

/** One list, so persist / export / import cannot drift apart. */
export const PROJECT_KEYS = [
  'device', 'variant', 'frame', 'stage', 'lighting',
  'transform', 'background', 'screen', 'keyframes', 'views',
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

interface Store extends Project {
  manifest: VariantManifest | null
  /** Blobs are kept out of the persisted project; object URLs do not survive reload. */
  backgroundVideoBlob: Blob | null
  screenVideoBlob: Blob | null
  /** Length of the current background animation, in seconds. 0 when static. */
  backgroundDuration: number

  playhead: number
  playing: boolean
  loop: boolean
  ready: boolean
  /** True while an export is running; the preview loop stands down. */
  exporting: boolean
  /** Light gizmos are an editing aid, so they are never persisted. */
  showLightHelpers: boolean
  status: string | null
  error: string | null

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

  addKeyframe(): void
  removeKeyframe(id: string): void
  updateKeyframe(id: string, patch: Partial<Keyframe>): void
  moveKeyframe(id: string, time: number): void
  recaptureKeyframe(id: string): void
  clearKeyframes(): void

  saveView(name: string, thumb: string): void
  deleteView(id: string): void
  renameView(id: string, name: string): void

  setReady(r: boolean): void
  setExporting(e: boolean): void
  setShowLightHelpers(v: boolean): void
  setStatus(s: string | null): void
  setError(e: string | null): void

  exportProject(): Project
  importProject(p: Partial<Project>): void
}

function loadPersisted(): Partial<Project> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<Project>
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
  keyframes: persisted.keyframes ?? [],
  views: persisted.views ?? [],
}

export const useStore = create<Store>((set, get) => {
  const persist = () => {
    const s = get()
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pickProject(s))) } catch { /* quota */ }
  }

  // Playback writes the transform every frame; persisting on each one would
  // serialise the whole project 60 times a second.
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  const after = <T,>(v: T): T => {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(persist, 400)
    return v
  }

  return {
    ...initial,
    manifest: null,
    backgroundVideoBlob: null,
    screenVideoBlob: null,
    backgroundDuration: 0,
    playhead: 0,
    playing: false,
    // The shipped mesh gradient runs once and holds, so the default is a single
    // pass rather than a loop.
    loop: false,
    ready: false,
    exporting: false,
    showLightHelpers: false,
    status: null,
    error: null,

    setManifest: (manifest) => set({ manifest }),
    setDevice: (device) => set(after({ device })),
    setVariant: (variant) => set(after({ variant })),
    setFrame: (f) => set((s) => after({ frame: { ...s.frame, ...f } })),
    setStage: (v) => set((s) => after({ stage: { ...s.stage, ...v } })),
    setLighting: (v) => set((s) => after({ lighting: deepMerge(s.lighting, v) })),
    setLight: (id, v) => set((s) => after({
      lighting: { ...s.lighting, lights: { ...s.lighting.lights, [id]: { ...s.lighting.lights[id], ...v } } },
    })),
    resetLighting: () => set(after({ lighting: structuredClone(DEFAULT_LIGHTING) })),
    setTransform: (t) => set((s) => after({ transform: { ...s.transform, ...t } })),

    setBackground: (b, blob) => set((s) => after({
      background: { ...s.background, ...b },
      backgroundVideoBlob: blob === undefined ? s.backgroundVideoBlob : blob,
    })),
    setScreen: (v, blob) => set((s) => after({
      screen: { ...s.screen, ...v },
      screenVideoBlob: blob === undefined ? s.screenVideoBlob : blob,
    })),

    setBackgroundDuration: (backgroundDuration) => set({ backgroundDuration }),
    setPlayhead: (playhead) => set({ playhead }),
    setPlaying: (playing) => set({ playing }),
    setLoop: (loop) => set({ loop }),

    addKeyframe: () => set((s) => {
      const time = s.keyframes.length === 0 ? 0 : s.playhead
      const existing = s.keyframes.find((k) => Math.abs(k.time - time) < 1e-3)
      const kf = makeKeyframe(time, s.transform)
      const keyframes = existing
        ? s.keyframes.map((k) => (k.id === existing.id ? { ...k, transform: { ...s.transform } } : k))
        : [...s.keyframes, kf].sort((a, b) => a.time - b.time)
      return after({ keyframes })
    }),

    removeKeyframe: (id) => set((s) => after({ keyframes: s.keyframes.filter((k) => k.id !== id) })),

    updateKeyframe: (id, patch) => set((s) => after({
      keyframes: s.keyframes.map((k) => (k.id === id ? { ...k, ...patch } : k)).sort((a, b) => a.time - b.time),
    })),

    moveKeyframe: (id, time) => set((s) => after({
      keyframes: s.keyframes
        .map((k) => (k.id === id ? { ...k, time: Math.max(0, Math.round(time * 1000) / 1000) } : k))
        .sort((a, b) => a.time - b.time),
    })),

    recaptureKeyframe: (id) => set((s) => after({
      keyframes: s.keyframes.map((k) => (k.id === id ? { ...k, transform: { ...s.transform } } : k)),
    })),

    clearKeyframes: () => set(after({ keyframes: [] })),

    saveView: (name, thumb) => set((s) => after({
      views: [
        { id: `vw_${Math.random().toString(36).slice(2, 10)}`, name, thumb, transform: { ...s.transform }, createdAt: Date.now() },
        ...s.views,
      ].slice(0, 40),
    })),
    deleteView: (id) => set((s) => after({ views: s.views.filter((v) => v.id !== id) })),
    renameView: (id, name) => set((s) => after({
      views: s.views.map((v) => (v.id === id ? { ...v, name } : v)),
    })),

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
      keyframes: p.keyframes ?? s.keyframes,
      views: p.views ?? s.views,
    })),
  }
})

export const timelineDuration = (keyframes: Keyframe[]) =>
  keyframes.length ? Math.max(...keyframes.map((k) => k.time)) : 0

/** Shortest composition offered when nothing else sets a length. */
export const MIN_COMPOSITION = 4

/**
 * How long the composition runs: long enough for every keyframe and for the
 * background animation to finish.
 */
export const compositionDuration = (keyframes: Keyframe[], backgroundDuration: number) =>
  Math.max(timelineDuration(keyframes), backgroundDuration, MIN_COMPOSITION)

export type DeviceId = 'iphone-18-pro' | 'iphone-18-pro-max'

export interface DeviceMeta {
  id: DeviceId
  label: string
  /** Body size in mm: width x height x thickness */
  bodyMm: [number, number, number]
  /** Screen size in mm: width x height */
  screenMm: [number, number]
  /** screenW / screenH */
  screenAspect: number
  url: string
}

export const DEVICES: Record<DeviceId, DeviceMeta> = {
  'iphone-18-pro': {
    id: 'iphone-18-pro',
    label: 'iPhone 18 Pro',
    bodyMm: [72.675, 149.961, 13.643],
    screenMm: [66.503, 144.684],
    screenAspect: 0.45964,
    url: '/models/iphone-18-pro.glb',
  },
  'iphone-18-pro-max': {
    id: 'iphone-18-pro-max',
    label: 'iPhone 18 Pro Max',
    bodyMm: [78.796, 163.371, 13.643],
    screenMm: [72.79, 158.259],
    screenAspect: 0.45994,
    url: '/models/iphone-18-pro-max.glb',
  },
}

/** The material that carries the display surface, in both GLBs. */
export const SCREEN_MATERIAL = 'KSynYqGGNGMUJti'

/* ------------------------------------------------------------------ */
/* Animatable state — everything a keyframe can capture.               */
/* ------------------------------------------------------------------ */

export interface Transform {
  posX: number
  posY: number
  posZ: number
  rotX: number
  rotY: number
  rotZ: number
  scale: number
}

export const DEFAULT_TRANSFORM: Transform = {
  posX: 0, posY: 0, posZ: 0,
  rotX: -8, rotY: -22, rotZ: 0,
  scale: 1,
}

export const TRANSFORM_KEYS = Object.keys(DEFAULT_TRANSFORM) as (keyof Transform)[]

/* ------------------------------------------------------------------ */
/* Background                                                          */
/* ------------------------------------------------------------------ */

export type BackgroundKind = 'transparent' | 'color' | 'mesh' | 'gradient' | 'image' | 'video'

/** The mesh gradient shipped with the project. */
export const DEFAULT_MESH_URL = '/backgrounds/gradient-bg-1-balanced-desktop.json'
export const DEFAULT_MESH_NAME = 'Gradient BG 1 — Balanced Desktop'

export interface GradientState {
  colors: [string, string, string, string]
  /** Animation speed; 0 freezes the gradient (deterministic for stills). */
  speed: number
  scale: number
  warp: number
  grain: number
}

export interface BackgroundState {
  kind: BackgroundKind
  color: string
  gradient: GradientState
  /** Object URL for an uploaded still. */
  imageUrl: string | null
  imageName: string | null
  /** Object URL for an uploaded video. */
  videoUrl: string | null
  videoName: string | null
  /** Lottie animation used by the `mesh` kind. */
  meshUrl: string
  meshName: string
  fit: 'cover' | 'contain'
  /** Uniform scale applied on top of the fit, 1 = none. */
  zoom: number
  offsetX: number
  offsetY: number
  vignette: number
}

export const DEFAULT_BACKGROUND: BackgroundState = {
  kind: 'mesh',
  color: '#101014',
  gradient: {
    colors: ['#1b2a4a', '#3d6ea8', '#8fb6d9', '#0d1220'],
    speed: 0.25,
    scale: 1.1,
    warp: 0.55,
    grain: 0.035,
  },
  imageUrl: null,
  imageName: null,
  videoUrl: null,
  videoName: null,
  meshUrl: DEFAULT_MESH_URL,
  meshName: DEFAULT_MESH_NAME,
  fit: 'cover',
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  vignette: 0.25,
}

/* ------------------------------------------------------------------ */
/* Screen content                                                      */
/* ------------------------------------------------------------------ */

export interface ScreenState {
  kind: 'image' | 'video'
  url: string
  name: string
  /** When true the display shows the stock wallpaper of the selected colourway. */
  followVariant: boolean
  /** Emissive multiplier — how bright the display reads. */
  brightness: number
  /** Extra zoom on top of the cover-crop. */
  zoom: number
  offsetX: number
  offsetY: number
}

export const DEFAULT_SCREEN: ScreenState = {
  kind: 'image',
  url: '/screen/stock-wallpaper.jpg',
  name: 'Stock wallpaper',
  followVariant: true,
  brightness: 1.0,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
}

/* ------------------------------------------------------------------ */
/* Lighting / frame                                                    */
/* ------------------------------------------------------------------ */

export interface StageState {
  /** Vertical field of view in degrees. */
  fov: number
  /** Camera distance in device-height multiples. */
  distance: number
}

export const DEFAULT_STAGE: StageState = {
  fov: 28,
  distance: 3.1,
}

/* ------------------------------------------------------------------ */
/* Lighting                                                            */
/* ------------------------------------------------------------------ */

export type EnvMode = 'studio' | 'hdri' | 'sky' | 'none'
export type ToneMappingName = 'aces' | 'agx' | 'neutral' | 'cineon' | 'linear' | 'none'
export type LightType = 'directional' | 'point' | 'spot'
export type LightId = 'key' | 'fill' | 'rim'
export type ShadowQuality = 'hard' | 'soft'
export type GroundMode = 'backdrop' | 'floor' | 'none'

export interface LightSettings {
  enabled: boolean
  type: LightType
  color: string
  intensity: number
  /**
   * Position in device-height multiples rather than world units, so the rig
   * keeps its shape when the device changes size or scale.
   */
  position: [number, number, number]
  castShadow: boolean
  /** Point and spot only. 0 means no limit. */
  distance: number
  decay: number
  /** Spot only. Cone half-angle in degrees, and 0-1 edge softness. */
  angle: number
  penumbra: number
}

export interface EnvironmentState {
  mode: EnvMode
  intensity: number
  /** Degrees. */
  rotationY: number
  hdriUrl: string | null
  hdriName: string | null
  showAsBackground: boolean
  backgroundBlur: number
  ambientColor: string
  ambientIntensity: number
  exposure: number
  toneMapping: ToneMappingName
  /**
   * The background is a 2D pass and skips tone mapping by default, so exposure
   * moves the device without shifting artwork that has already been composed.
   */
  toneMapBackground: boolean
  /** Sky mode. Degrees. */
  sunElevation: number
  sunAzimuth: number
}

export interface ShadowState {
  enabled: boolean
  quality: ShadowQuality
  mapSize: 512 | 1024 | 2048 | 4096
  /** 0-2 in the UI; widened a long way before it reaches VSM's texel radius. */
  softness: number
  opacity: number
  /** Gap between the device and the catcher, in device heights. */
  distance: number
  normalBias: number
  /** Keep the shadow in the alpha channel of a transparent export. */
  keepInTransparentExport: boolean
}

export interface GroundState {
  mode: GroundMode
}

export interface LightingState {
  schemaVersion: 1
  environment: EnvironmentState
  lights: Record<LightId, LightSettings>
  shadows: ShadowState
  ground: GroundState
}

export const LIGHT_IDS: LightId[] = ['key', 'fill', 'rim']

export const LIGHT_LABELS: Record<LightId, string> = {
  key: 'Key', fill: 'Fill', rim: 'Rim',
}

export const TONE_MAPPINGS: { value: ToneMappingName; label: string }[] = [
  { value: 'aces', label: 'ACES' },
  { value: 'agx', label: 'AgX' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'cineon', label: 'Cineon' },
  { value: 'linear', label: 'Linear' },
  { value: 'none', label: 'None' },
]

export const DEFAULT_LIGHTING: LightingState = {
  schemaVersion: 1,
  environment: {
    mode: 'studio',
    intensity: 1.0,
    rotationY: 0,
    hdriUrl: null,
    hdriName: null,
    showAsBackground: false,
    backgroundBlur: 0.25,
    ambientColor: '#ffffff',
    ambientIntensity: 0,
    exposure: 1.0,
    toneMapping: 'aces',
    toneMapBackground: false,
    sunElevation: 35,
    sunAzimuth: 160,
  },
  lights: {
    key: {
      enabled: true, type: 'directional', color: '#ffffff', intensity: 1.6,
      position: [-1.1, 1.59, 1.84], castShadow: true,
      distance: 0, decay: 2, angle: 30, penumbra: 0.4,
    },
    fill: {
      enabled: true, type: 'directional', color: '#bfd4ff', intensity: 0.35,
      position: [1.47, -0.61, 0.86], castShadow: false,
      distance: 0, decay: 2, angle: 30, penumbra: 0.4,
    },
    rim: {
      enabled: false, type: 'directional', color: '#ffffff', intensity: 0.8,
      position: [0.9, 0.8, -1.6], castShadow: false,
      distance: 0, decay: 2, angle: 30, penumbra: 0.4,
    },
  },
  shadows: {
    enabled: true,
    quality: 'soft',
    mapSize: 2048,
    softness: 1.0,
    opacity: 0.35,
    distance: 0.85,
    normalBias: 0.004,
    keepInTransparentExport: true,
  },
  ground: { mode: 'backdrop' },
}

export interface FrameState {
  width: number
  height: number
  /** Rounded corner radius of the exported frame, in px. */
  radius: number
}

export const DEFAULT_FRAME: FrameState = { width: 1920, height: 1080, radius: 0 }

/**
 * What a frame may be, in pixels.
 *
 * One constant because the number fields and the project validator have to
 * agree: a bound enforced only in the UI is not a bound, it is a suggestion
 * that a loaded file ignores.
 */
export const FRAME_LIMITS = { min: 64, max: 7680 } as const

export const FRAME_PRESETS: { label: string; width: number; height: number }[] = [
  { label: 'Square 1:1', width: 1080, height: 1080 },
  { label: 'Portrait 4:5', width: 1080, height: 1350 },
  { label: 'Story 9:16', width: 1080, height: 1920 },
  { label: 'Landscape 16:9', width: 1920, height: 1080 },
  { label: 'Wide 21:9', width: 2560, height: 1080 },
  { label: 'Hero 3:2', width: 1620, height: 1080 },
  { label: '4K 16:9', width: 3840, height: 2160 },
]

/* ------------------------------------------------------------------ */
/* Keyframes / views                                                   */
/* ------------------------------------------------------------------ */

/** One keyframe, named by the track it lives on. What a selection is made of. */
export interface KeyRef {
  track: TrackId
  key: string
}

export type EaseName =
  | 'none' | 'power1.inOut' | 'power2.inOut' | 'power3.inOut' | 'power4.inOut'
  | 'power2.out' | 'power3.out' | 'expo.inOut' | 'expo.out'
  | 'back.inOut(1.4)' | 'back.out(1.7)' | 'sine.inOut' | 'circ.inOut'

export const EASES: EaseName[] = [
  'none', 'sine.inOut', 'power1.inOut', 'power2.inOut', 'power3.inOut', 'power4.inOut',
  'power2.out', 'power3.out', 'expo.inOut', 'expo.out', 'circ.inOut',
  'back.inOut(1.4)', 'back.out(1.7)',
]

/* ------------------------------------------------------------------ */
/* Composition — per-property animation tracks                         */
/* ------------------------------------------------------------------ */

/**
 * One animatable property family.
 *
 * A track owns its own keys, so position and rotation can be timed, eased and
 * overlapped independently — which a single whole-transform keyframe list
 * cannot express. Adding a member here is not enough on its own: a track only
 * exists once it is registered in `tracks.ts`.
 */
export type TrackId =
  | 'position' | 'rotation' | 'scale'
  | 'camera' | 'environment' | 'keyLight' | 'fillLight' | 'rimLight' | 'shadow'
  | 'screen' | 'background'

/** Channel name -> value, e.g. `{ x, y, z }` or `{ fov, distance }`. */
export type TrackValue = Record<string, number>

export interface TrackKey {
  id: string
  /** Seconds from the start of the composition. */
  time: number
  /** Ease used to arrive AT this key. 'custom' reads `bezier`, 'spring' reads `spring`. */
  ease: EaseName | 'custom' | 'spring'
  /** Cubic bezier control points x1, y1, x2, y2 — only read when ease is 'custom'. */
  bezier?: [number, number, number, number]
  /**
   * Only read when ease is 'spring'.
   *
   * A spring is not a bezier and cannot be drawn as one — it overshoots and
   * rings — so it is its own ease rather than a preset of the curve editor.
   */
  spring?: { stiffness: number; damping: number; mass: number; velocity: number }
  value: TrackValue
}

export interface Track {
  id: TrackId
  /** A disabled track keeps its keys but stops driving the scene. */
  enabled: boolean
  /** Always sorted by time. */
  keys: TrackKey[]
}

export interface Composition {
  schemaVersion: 1
  /**
   * Explicit length in seconds. 0 means "derive from the content" — the last
   * key, the background animation, or the floor, whichever runs longest.
   */
  duration: number
  tracks: Partial<Record<TrackId, Track>>
}

export const DEFAULT_COMPOSITION: Composition = {
  schemaVersion: 1,
  duration: 0,
  tracks: {},
}

/** What the timeline evaluates to at an instant: one slice per live track. */
export type Sample = Partial<Record<TrackId, TrackValue>>

/**
 * The pre-track keyframe: one key carrying the entire transform.
 *
 * Kept only so `migrateKeyframes` can read projects saved before tracks
 * existed. Nothing new should ever produce one.
 */
export interface LegacyKeyframe {
  id: string
  time: number
  ease: EaseName
  transform: Transform
}

export interface SavedView {
  id: string
  name: string
  transform: Transform
  /** data: URL thumbnail. */
  thumb: string
  createdAt: number
}

/* ------------------------------------------------------------------ */
/* Variants (generated from the source USDZ)                           */
/* ------------------------------------------------------------------ */

export interface VariantMaterial {
  color?: [number, number, number]
  metalness?: number
  roughness?: number
  clearcoat?: number
  clearcoatRoughness?: number
  emissiveIntensity?: number
  maps?: Record<string, string>
}

export interface Variant {
  id: string
  label: string
  swatch: string
  materials: Record<string, VariantMaterial>
}

export interface DeviceVariants {
  changingMaterials: string[]
  variants: Record<string, Variant>
}

export type VariantManifest = Record<string, DeviceVariants>

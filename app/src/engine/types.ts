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
  envIntensity: number
  envRotation: number
  keyIntensity: number
  shadow: number
  shadowBlur: number
}

export const DEFAULT_STAGE: StageState = {
  fov: 28,
  distance: 3.1,
  envIntensity: 1.0,
  envRotation: 0,
  keyIntensity: 1.6,
  shadow: 0.35,
  shadowBlur: 1.0,
}

export interface FrameState {
  width: number
  height: number
  /** Rounded corner radius of the exported frame, in px. */
  radius: number
}

export const DEFAULT_FRAME: FrameState = { width: 1920, height: 1080, radius: 0 }

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

export type EaseName =
  | 'none' | 'power1.inOut' | 'power2.inOut' | 'power3.inOut' | 'power4.inOut'
  | 'power2.out' | 'power3.out' | 'expo.inOut' | 'expo.out'
  | 'back.inOut(1.4)' | 'back.out(1.7)' | 'sine.inOut' | 'circ.inOut'

export const EASES: EaseName[] = [
  'none', 'sine.inOut', 'power1.inOut', 'power2.inOut', 'power3.inOut', 'power4.inOut',
  'power2.out', 'power3.out', 'expo.inOut', 'expo.out', 'circ.inOut',
  'back.inOut(1.4)', 'back.out(1.7)',
]

export interface Keyframe {
  id: string
  /** Seconds from the start of the timeline. */
  time: number
  /** Ease used to arrive AT this keyframe from the previous one. */
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

import {
  DEVICES, FRAME_LIMITS,
  type BackgroundState, type DeviceId, type FrameState, type LightingState,
  type ScreenState, type StageState, type Transform,
} from '../engine/types'

/**
 * The part of a project that is plain settings.
 *
 * The composition and the presets are left out on purpose: both already have
 * their own sanitisers, which know things a structural pass cannot — that a
 * key belongs to a registered track, that a preset's value is a `Sample`.
 */
export interface ProjectShell {
  device: DeviceId
  variant: string
  frame: FrameState
  stage: StageState
  lighting: LightingState
  transform: Transform
  background: BackgroundState
  screen: ScreenState
}

type Plain = Record<string, unknown>
const isPlainObject = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Whether an untrusted leaf may stand in for a default one.
 *
 * Every null in the defaults is a nullable string — a URL or a file name —
 * so a null default accepts exactly those.
 */
function acceptsLeaf(base: unknown, raw: unknown): boolean {
  if (base === null) return raw === null || typeof raw === 'string'
  if (typeof base === 'number') return typeof raw === 'number' && Number.isFinite(raw)
  return typeof raw === typeof base
}

/**
 * Coerce an untrusted value onto the shape of a default.
 *
 * The default is the schema. Writing the rules out field by field would mean
 * remembering to add one every time the state grows a setting, and the day
 * someone forgets is the day a file can carry a string into a uniform.
 *
 * Keys the default does not have are dropped, which is also how junk from a
 * newer version stops travelling into this one.
 */
export function coerceShape<T>(base: T, raw: unknown): T {
  if (raw === undefined) return base

  if (Array.isArray(base)) {
    // Lengths are fixed here — an RGB colour, a light's position — and the
    // shaders are sized to them, so a different length is not a shorter array,
    // it is a different meaning.
    if (!Array.isArray(raw) || raw.length !== base.length) return base
    const ok = raw.every((v, i) => (isPlainObject(base[i]) ? isPlainObject(v) : acceptsLeaf(base[i], v)))
    // All or nothing: a half-taken array reads one channel from the file and
    // the rest from the defaults, which is a value nobody chose.
    return ok ? (raw.map((v, i) => coerceShape(base[i], v)) as T) : base
  }

  if (isPlainObject(base)) {
    if (!isPlainObject(raw)) return base
    const out: Plain = {}
    for (const [k, v] of Object.entries(base)) out[k] = coerceShape(v, raw[k])
    return out as T
  }

  return acceptsLeaf(base, raw) ? (raw as T) : base
}

/**
 * A project file, made safe to put into the store.
 *
 * It is a boundary: the file can come from another version of this app, from
 * someone else, or from a text editor. Two failures measured before this
 * existed, both of which persisted and so survived a reload — an unknown
 * device id, which threw on the first render and left a blank page; and a
 * zero-sized frame, which collapsed the canvas to nothing.
 */
export function sanitiseProject(raw: unknown, base: ProjectShell): ProjectShell {
  if (!isPlainObject(raw)) return base
  const out = coerceShape(base, raw)
  return {
    ...out,
    // A string is not enough: the id has to name a device we actually have,
    // and `in` would accept 'toString'.
    device: typeof raw.device === 'string' && Object.hasOwn(DEVICES, raw.device)
      ? (raw.device as DeviceId)
      : base.device,
    frame: {
      ...out.frame,
      width: clampSize(out.frame.width),
      height: clampSize(out.frame.height),
      radius: Math.max(0, out.frame.radius),
    },
  }
}

const clampSize = (n: number) =>
  Math.round(Math.min(Math.max(n, FRAME_LIMITS.min), FRAME_LIMITS.max))

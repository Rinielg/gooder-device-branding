import gsap from 'gsap'
import type { TrackKey } from '../engine/types'
import { DEFAULT_SPRING, springEase } from './spring'

/** Seeded when a transition is switched to Custom: a plain symmetric ease. */
export const SEED_BEZIER: [number, number, number, number] = [0.42, 0, 0.58, 1]

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/**
 * A key's ease as a plain progress function.
 *
 * Sampled rather than reconstructed from parameters, because `back`, `expo` and
 * `elastic` are not cubic beziers — anything that draws them as one is quietly
 * lying. Shared by the transition preview and the value curves so the two can
 * never disagree about what a segment does.
 */
export function easeFn(key: TrackKey): (x: number) => number {
  if (key.ease === 'spring') return springEase(key.spring ?? DEFAULT_SPRING)
  if (key.ease === 'custom') return cubicBezier(key.bezier ?? SEED_BEZIER)
  const parsed = gsap.parseEase(key.ease)
  return typeof parsed === 'function' ? parsed : (x: number) => x
}

export function cubicBezier([x1, y1, x2, y2]: [number, number, number, number]) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const xAt = (t: number) => ((ax * t + bx) * t + cx) * t
  const yAt = (t: number) => ((ay * t + by) * t + cy) * t
  const dxAt = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x: number) => {
    // Newton-Raphson from x=t; eight passes is comfortably enough for a preview.
    let t = x
    for (let i = 0; i < 8; i++) {
      const err = xAt(t) - x
      const slope = dxAt(t)
      if (Math.abs(err) < 1e-6 || slope === 0) break
      t -= err / slope
    }
    return yAt(clamp(t, 0, 1))
  }
}

/* ------------------------------------------------------------------ */

/**
 * The value range an easing preview has to draw, measured from the curve.
 *
 * A fixed margin is only safe for curves whose overshoot you already know. A
 * spring's does not follow from its parameters by inspection, so a fixed box
 * crops it — the number was right and the picture was a lie. Always at least
 * the unit box, so a gentle ease still gets a full axis to sit on.
 */
export function curveBox(ease: (x: number) => number, steps = 64): { lo: number; hi: number } {
  let lo = 0
  let hi = 1
  for (let i = 0; i <= steps; i++) {
    const y = ease(i / steps)
    if (!Number.isFinite(y)) continue
    lo = Math.min(lo, y)
    hi = Math.max(hi, y)
  }
  return { lo, hi }
}

/** The two ends of a segment, in seconds and the channel's own units. */
export interface Anchor {
  t0: number
  v0: number
  t1: number
  v1: number
}

export interface HandlePoint {
  time: number
  value: number
}

/**
 * A key's bezier control points placed on the value graph.
 *
 * The bezier is normalised to its segment; the graph is in seconds and
 * property units. Placing the handles where the curve actually is means the
 * curve can be shaped where it is read, rather than in a separate unit square
 * the eye has to translate.
 */
export function bezierHandles(
  b: [number, number, number, number],
  { t0, v0, t1, v1 }: Anchor,
): [HandlePoint, HandlePoint] {
  const at = (i: 0 | 1): HandlePoint => ({
    time: t0 + (t1 - t0) * b[i * 2],
    value: v0 + (v1 - v0) * b[i * 2 + 1],
  })
  return [at(0), at(1)]
}

/**
 * The reverse: a dragged handle back into the key's bezier.
 *
 * Returns null when the segment cannot express the handle — no duration, or a
 * channel that ends where it started. Both would divide by nothing, and
 * neither has a curve worth shaping; the caller draws no handles there.
 */
export function bezierFromHandle(
  which: 0 | 1,
  point: HandlePoint,
  { t0, v0, t1, v1 }: Anchor,
  b: [number, number, number, number],
): [number, number, number, number] | null {
  const dt = t1 - t0
  const dv = v1 - v0
  if (Math.abs(dt) < 1e-9 || Math.abs(dv) < 1e-9) return null
  const next = [...b] as [number, number, number, number]
  // x stays inside the segment, or the curve stops being a function of time.
  // y is free: past either end is an overshoot, which is a thing people want.
  next[which * 2] = round(clamp((point.time - t0) / dt, 0, 1))
  next[which * 2 + 1] = round((point.value - v0) / dv)
  return next
}

/** Three decimals, which is what the timeline stores everywhere else. */
const round = (n: number) => Math.round(n * 1000) / 1000

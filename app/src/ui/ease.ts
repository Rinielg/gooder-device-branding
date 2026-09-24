import gsap from 'gsap'
import type { TrackKey } from '../engine/types'

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

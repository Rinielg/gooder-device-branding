import type { Track } from '../engine/types'
import { easeFn } from './ease'

/** Samples per segment. Enough that a strong ease reads as a curve, not a chord. */
const STEPS = 24

export interface CurveSegment {
  /**
   * The key this segment arrives at — the one that owns the easing, which is
   * the same thing the lanes select. Null for the hold before the first key,
   * which no key owns and nothing can be done to.
   */
  keyId: string | null
  d: string
}

/**
 * A channel's curve, cut at each key rather than drawn as one path.
 *
 * One path per segment is what makes a segment clickable, and clicking a
 * segment is the only way to reach its easing from the graph — the lanes are
 * not on screen while the graph is. Segments share their end points, so the
 * cut is invisible.
 *
 * Sampled through the same ease function playback uses, so an overshoot is
 * drawn as an overshoot rather than inferred from the ease's name.
 */
export function segmentPaths(
  track: Track,
  channel: string,
  xFor: (t: number) => number,
  yFor: (v: number) => number,
): CurveSegment[] {
  const keys = track.keys
  if (keys.length === 0) return []

  // Before the first key the value holds, which is what playback does.
  const first = yFor(keys[0].value[channel])
  const out: CurveSegment[] = [{ keyId: null, d: `M${xFor(0)},${first} L${xFor(keys[0].time)},${first}` }]

  for (let i = 1; i < keys.length; i++) {
    const prev = keys[i - 1]
    const cur = keys[i]
    const from = prev.value[channel]
    const to = cur.value[channel]
    const ease = easeFn(cur)
    const parts = [`M${xFor(prev.time)},${yFor(from)}`]
    for (let s = 1; s <= STEPS; s++) {
      const p = s / STEPS
      const t = prev.time + (cur.time - prev.time) * p
      parts.push(`L${xFor(t).toFixed(2)},${yFor(from + (to - from) * ease(p)).toFixed(2)}`)
    }
    out.push({ keyId: cur.id, d: parts.join(' ') })
  }
  return out
}

/** Breathing room above and below the data, as a fraction of its range. */
const PAD = 0.18

/**
 * The graph's value axis, from everything that will be drawn on it.
 *
 * It takes plain numbers rather than reading the track, because a selected
 * transition's bezier handles belong on the axis too and they are not key
 * values. A handle drawn outside the axis is a control that cannot be reached,
 * which is how the fixed margin on the transition preview went wrong.
 */
export function valueScale(values: readonly number[]): { lo: number; hi: number } {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 }
  // A flat channel would give a zero-height box and divide by nothing.
  if (hi - lo < 1e-6) return { lo: lo - 0.5, hi: hi + 0.5 }
  const pad = (hi - lo) * PAD
  return { lo: lo - pad, hi: hi + pad }
}

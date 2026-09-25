import { quantise } from '../engine/tracks'

/**
 * Where a pointer lands on the ruler, in seconds.
 *
 * `limit` is what separates the two callers. The playhead is clamped to the
 * clip, because it cannot sit outside one. The grip that *sets* the clip's
 * length is not, because clamping it to the current duration means the clip
 * can only ever be shortened — drag right and the value you ask for is the
 * value you already had.
 */
export function rulerTime(offsetX: number, pxPerSec: number, gutter: number, limit?: number): number {
  const t = quantise((offsetX - gutter) / pxPerSec)
  return limit === undefined ? t : Math.min(t, limit)
}

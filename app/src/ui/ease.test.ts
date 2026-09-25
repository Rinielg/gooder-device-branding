import { describe, expect, it } from 'vitest'
import { bezierFromHandle, bezierHandles, cubicBezier, curveBox } from './ease'
import { springEase } from './spring'

/**
 * The drawing box for an easing preview.
 *
 * A fixed margin was the bug: a spring that overshoots past it draws a correct
 * value as a cropped picture. The box has to be measured from the curve.
 */
describe('curveBox', () => {
  it('is the unit box for an ease that never leaves it', () => {
    expect(curveBox((x) => x)).toEqual({ lo: 0, hi: 1 })
  })

  it('never reports tighter than the unit box', () => {
    // Half an ease still needs the full 0..1 axis drawn around it.
    expect(curveBox((x) => x * 0.5)).toEqual({ lo: 0, hi: 1 })
  })

  it('contains a spring that overshoots well past the old fixed margin', () => {
    // This spring overshoots to ~1.36 — outside the 1.28 the fixed margin gave.
    const ease = springEase({ stiffness: 180, damping: 8, mass: 1, velocity: 0 })
    const box = curveBox(ease)
    let peak = 0
    for (let i = 0; i <= 200; i++) peak = Math.max(peak, ease(i / 200))
    expect(peak).toBeGreaterThan(1.28)
    expect(box.hi).toBeGreaterThanOrEqual(peak)
  })

  it('contains an anticipation that dips below zero', () => {
    const box = curveBox(cubicBezier([0.6, -0.4, 0.4, 1]))
    expect(box.lo).toBeLessThan(0)
  })
})

/**
 * Bezier handles on the value graph.
 *
 * The graph is in seconds and property units; a bezier is normalised to the
 * segment. These two convert between them, and refuse the conversion the
 * segment cannot express.
 */
const anchor = { t0: 1, v0: 10, t1: 3, v1: 30 }

describe('bezierHandles', () => {
  it('places each control point inside the segment box', () => {
    expect(bezierHandles([0.5, 0, 1, 1], anchor)).toEqual([
      { time: 2, value: 10 },
      { time: 3, value: 30 },
    ])
  })

  it('places an overshooting handle beyond the segment value', () => {
    const [, second] = bezierHandles([0, 0, 0.5, 1.5], anchor)
    expect(second).toEqual({ time: 2, value: 40 })
  })
})

describe('bezierFromHandle', () => {
  const seed: [number, number, number, number] = [0.42, 0, 0.58, 1]

  it('round-trips a handle through graph space', () => {
    const point = bezierHandles(seed, anchor)[0]
    const next = bezierFromHandle(0, point, anchor, seed)
    expect(next![0]).toBeCloseTo(seed[0], 6)
    expect(next![1]).toBeCloseTo(seed[1], 6)
  })

  it('leaves the other control point alone', () => {
    const next = bezierFromHandle(0, { time: 2, value: 20 }, anchor, seed)
    expect(next![2]).toBe(seed[2])
    expect(next![3]).toBe(seed[3])
  })

  it('clamps time to the segment, so the curve stays a function of time', () => {
    expect(bezierFromHandle(1, { time: 9, value: 30 }, anchor, seed)![2]).toBe(1)
    expect(bezierFromHandle(0, { time: -9, value: 10 }, anchor, seed)![0]).toBe(0)
  })

  it('reads a descending segment the same way round', () => {
    // Dragging above the start of a falling segment is anticipation: y < 0.
    const falling = { t0: 0, v0: 30, t1: 1, v1: 10 }
    expect(bezierFromHandle(0, { time: 0.5, value: 40 }, falling, seed)![1]).toBeCloseTo(-0.5, 6)
  })

  it('stores the bezier at the precision the rest of the timeline uses', () => {
    // A pointer lands wherever it lands; a third of a segment is 0.333, not
    // 0.3333333333333333 written into the project file and the ease's id.
    const thirds = { t0: 0, v0: 0, t1: 3, v1: 3 }
    expect(bezierFromHandle(0, { time: 1, value: 1 }, thirds, seed)).toEqual([0.333, 0.333, 0.58, 1])
  })

  it('refuses a segment whose value never changes', () => {
    // No value axis to express the handle on; the caller draws no handles.
    expect(bezierFromHandle(0, { time: 2, value: 10 }, { t0: 1, v0: 10, t1: 3, v1: 10 }, seed)).toBeNull()
  })

  it('refuses a segment of no duration', () => {
    expect(bezierFromHandle(0, { time: 1, value: 20 }, { t0: 1, v0: 10, t1: 1, v1: 30 }, seed)).toBeNull()
  })
})

import { describe, expect, test } from 'vitest'
import { DEFAULT_SPRING, springEase } from './spring'

describe('springEase', () => {
  test('starts at rest and arrives exactly on the target', () => {
    const ease = springEase(DEFAULT_SPRING)

    expect(ease(0)).toBe(0)
    // A keyframe must be reached: an ease that lands at 0.98 leaves the
    // property short of the value the key says it has.
    expect(ease(1)).toBeCloseTo(1, 3)
  })

  test('a slow spring still finishes inside the segment', () => {
    // Left to its own clock this one takes about six seconds to settle. The
    // segment is the segment, so the shape is mapped onto it — without that,
    // the value would still be climbing at the far end and jump onto the key.
    const slow = springEase({ stiffness: 8, damping: 4, mass: 3, velocity: 0 })

    expect(slow(0.99)).toBeCloseTo(1, 2)
    expect(slow(0.5)).toBeGreaterThan(0.5)
  })

  test('overshoots past the target when it is underdamped', () => {
    const bouncy = springEase({ stiffness: 200, damping: 6, mass: 1, velocity: 0 })

    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => bouncy((i + 1) / 100)))

    expect(peak).toBeGreaterThan(1)
  })

  test('never passes the target when it is overdamped', () => {
    const stiff = springEase({ stiffness: 120, damping: 60, mass: 1, velocity: 0 })

    for (let i = 0; i <= 100; i++) expect(stiff(i / 100)).toBeLessThanOrEqual(1)
  })

  test('rises monotonically when it is critically damped', () => {
    // damping = 2*sqrt(k*m) is the boundary: fastest approach with no overshoot.
    const critical = springEase({ stiffness: 100, damping: 20, mass: 1, velocity: 0 })

    let prev = -1
    for (let i = 0; i <= 100; i++) {
      const v = critical(i / 100)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  test('an initial velocity launches it further on the first swing', () => {
    const still = springEase({ stiffness: 200, damping: 10, mass: 1, velocity: 0 })
    const thrown = springEase({ stiffness: 200, damping: 10, mass: 1, velocity: 8 })

    const peak = (e: (p: number) => number) =>
      Math.max(...Array.from({ length: 99 }, (_, i) => e((i + 1) / 100)))

    expect(peak(thrown)).toBeGreaterThan(peak(still))
  })

  test('a heavier mass bounces more, because it damps the same spring less', () => {
    const light = springEase({ stiffness: 200, damping: 12, mass: 1, velocity: 0 })
    const heavy = springEase({ stiffness: 200, damping: 12, mass: 4, velocity: 0 })

    // The shape is normalised to its own settle time, so mass does not make the
    // segment longer — it lowers the damping ratio, and that shows as overshoot.
    const peak = (e: (p: number) => number) =>
      Math.max(...Array.from({ length: 99 }, (_, i) => e((i + 1) / 100)))

    expect(peak(heavy)).toBeGreaterThan(peak(light))
  })

  test('survives degenerate settings rather than returning NaN', () => {
    for (const s of [
      { stiffness: 0, damping: 0, mass: 0, velocity: 0 },
      { stiffness: -5, damping: -5, mass: -5, velocity: 0 },
    ]) {
      const ease = springEase(s)
      for (let i = 0; i <= 10; i++) expect(Number.isFinite(ease(i / 10))).toBe(true)
    }
  })
})

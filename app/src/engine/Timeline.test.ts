import { beforeEach, describe, expect, test } from 'vitest'
import { CompositionTimeline } from './Timeline'
import { DEFAULT_TRANSFORM, type Composition, type Track, type TrackKey } from './types'

const key = (id: string, time: number, y: number, ease: TrackKey['ease'] = 'none'): TrackKey =>
  ({ id, time, ease, value: { x: 0, y, z: 0 } })

const rotation = (keys: TrackKey[], enabled = true): Composition => ({
  schemaVersion: 1,
  duration: 0,
  tracks: { rotation: { id: 'rotation', enabled, keys } as Track },
})

let tl: CompositionTimeline
beforeEach(() => { tl = new CompositionTimeline() })

describe('CompositionTimeline', () => {
  test('interpolates linearly between two keys with no easing', () => {
    tl.build(rotation([key('a', 0, 0), key('b', 2, 100)]))

    expect(tl.sample(1).rotation?.y).toBeCloseTo(50, 5)
  })

  test('holds the first value before the first key', () => {
    // A track that starts at 1s is not undefined at 0s; it holds.
    tl.build(rotation([key('a', 1, 30), key('b', 3, 90)]))

    expect(tl.sample(0).rotation?.y).toBeCloseTo(30, 5)
    expect(tl.sample(0.5).rotation?.y).toBeCloseTo(30, 5)
  })

  test('holds the last value past the last key', () => {
    tl.build(rotation([key('a', 0, 0), key('b', 1, 40)]))

    expect(tl.sample(9).rotation?.y).toBeCloseTo(40, 5)
  })

  test('eases according to the key it arrives at', () => {
    tl.build(rotation([key('a', 0, 0), key('b', 2, 100, 'power2.inOut')]))

    // Symmetric about the midpoint, and not linear either side of it.
    expect(tl.sample(1).rotation?.y).toBeCloseTo(50, 3)
    expect(tl.sample(0.5).rotation?.y).toBeLessThan(25)
    expect(tl.sample(1.5).rotation?.y).toBeGreaterThan(75)
  })

  test('a custom bezier can overshoot its end value', () => {
    tl.build(rotation([
      key('a', 0, 0),
      { id: 'b', time: 1, ease: 'custom', bezier: [0.3, 1.6, 0.7, 1], value: { x: 0, y: 0, z: 100 } },
    ]))

    const peak = Math.max(...[0.2, 0.3, 0.4, 0.5].map((t) => tl.sample(t).rotation?.z ?? 0))
    expect(peak).toBeGreaterThan(100)
  })

  test('duration is the last key, not the clip length', () => {
    tl.build(rotation([key('a', 0, 0), key('b', 2.5, 10)]))
    expect(tl.duration).toBe(2.5)
  })

  test('a muted track is excluded from the sample and from the duration', () => {
    tl.build(rotation([key('a', 0, 0), key('b', 4, 10)], false))

    expect(tl.sample(2).rotation).toBeUndefined()
    expect(tl.duration).toBe(0)
    expect(tl.animated).toBe(false)
  })

  test('an empty composition drives nothing', () => {
    tl.build({ schemaVersion: 1, duration: 0, tracks: {} })

    expect(tl.animated).toBe(false)
    expect(tl.sample(1)).toEqual({})
  })

  test('sampleTransform holds every channel the composition does not drive', () => {
    tl.build(rotation([key('a', 0, 0), key('b', 2, 90)]))
    const base = { ...DEFAULT_TRANSFORM, posX: 0.8, scale: 1.5 }

    const pose = tl.sampleTransform(1, base)

    expect(pose.rotY).toBeCloseTo(45, 5)
    expect(pose.posX).toBe(0.8)
    expect(pose.scale).toBe(1.5)
  })

  test('rebuilding replaces the previous composition', () => {
    tl.build(rotation([key('a', 0, 0), key('b', 2, 100)]))
    tl.build(rotation([key('c', 0, 0), key('d', 2, 20)]))

    expect(tl.sample(1).rotation?.y).toBeCloseTo(10, 5)
  })

  test('sampling is the same whichever order the times are asked for', () => {
    tl.build(rotation([key('a', 0, 0), key('b', 2, 100, 'power3.inOut')]))

    const forwards = [0.4, 0.8, 1.2].map((t) => tl.sample(t).rotation?.y)
    const backwards = [1.2, 0.8, 0.4].map((t) => tl.sample(t).rotation?.y).reverse()

    // Export depends on this: a frame must not depend on the frame before it.
    expect(backwards).toEqual(forwards)
  })

  test('a spring overshoots in playback, not only in the preview', () => {
    tl.build(rotation([
      key('a', 0, 0),
      {
        id: 'b', time: 1, ease: 'spring', value: { x: 0, y: 100, z: 0 },
        spring: { stiffness: 200, damping: 6, mass: 1, velocity: 0 },
      },
    ]))

    const peak = Math.max(...Array.from({ length: 40 }, (_, i) => tl.sample((i + 1) / 40).rotation?.y ?? 0))

    expect(peak).toBeGreaterThan(100)
  })

  test('a spring still lands exactly on its key', () => {
    tl.build(rotation([
      key('a', 0, 0),
      {
        id: 'b', time: 1, ease: 'spring', value: { x: 0, y: 100, z: 0 },
        spring: { stiffness: 200, damping: 6, mass: 1, velocity: 0 },
      },
    ]))

    expect(tl.sample(1).rotation?.y).toBeCloseTo(100, 3)
  })
})

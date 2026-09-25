import { describe, expect, it } from 'vitest'
import { segmentPaths, valueScale } from './curvePaths'
import type { Track, TrackKey } from '../engine/types'

const key = (id: string, time: number, v: number, ease: TrackKey['ease'] = 'none'): TrackKey =>
  ({ id, time, ease, value: { x: v } })

const track = (...keys: TrackKey[]): Track => ({ id: 'position', enabled: true, keys })

// Identity mappings keep the assertions about structure, not arithmetic.
const xFor = (t: number) => t
const yFor = (v: number) => v

describe('segmentPaths', () => {
  it('draws nothing for a track with no keys', () => {
    expect(segmentPaths(track(), 'x', xFor, yFor)).toEqual([])
  })

  it('holds a single key flat across the composition, with nothing to select', () => {
    const [only, ...rest] = segmentPaths(track(key('a', 2, 5)), 'x', xFor, yFor)
    expect(rest).toEqual([])
    expect(only.keyId).toBeNull()
    expect(only.d).toBe('M0,5 L2,5')
  })

  it('names each segment after the key it arrives at', () => {
    const paths = segmentPaths(track(key('a', 0, 0), key('b', 1, 10), key('c', 2, 20)), 'x', xFor, yFor)
    expect(paths.map((p) => p.keyId)).toEqual([null, 'b', 'c'])
  })

  it('starts each segment where the one before it ended', () => {
    const paths = segmentPaths(track(key('a', 1, 4), key('b', 3, 9)), 'x', xFor, yFor)
    // The lead-in holds the first value from t=0; the segment picks it up there.
    expect(paths[0].d).toBe('M0,4 L1,4')
    expect(paths[1].d.startsWith('M1,4')).toBe(true)
  })

  it('ends a segment exactly on the arriving key', () => {
    const paths = segmentPaths(track(key('a', 0, 0), key('b', 2, 10)), 'x', xFor, yFor)
    const last = paths[1].d.split(' ').pop()!
    expect(last).toBe('L2.00,10.00')
  })

  it('draws an overshoot outside the two values it runs between', () => {
    const paths = segmentPaths(track(key('a', 0, 0), key('b', 1, 10, 'back.out(1.7)')), 'x', xFor, yFor)
    const ys = paths[1].d.match(/,(-?[\d.]+)/g)!.map((m) => Number(m.slice(1)))
    expect(Math.max(...ys)).toBeGreaterThan(10)
  })
})

/**
 * The graph's value axis.
 *
 * Everything that gets drawn has to be passed in, including a selected
 * transition's bezier handles — a handle that shapes the curve from outside
 * the axis is a control the user cannot reach.
 */
describe('valueScale', () => {
  it('falls back to a unit axis when there is nothing to draw', () => {
    expect(valueScale([])).toEqual({ lo: 0, hi: 1 })
  })

  it('gives a flat channel an axis to sit in the middle of', () => {
    expect(valueScale([5, 5, 5])).toEqual({ lo: 4.5, hi: 5.5 })
  })

  it('pads a real spread so the extremes are not on the edge', () => {
    const { lo, hi } = valueScale([0, 10])
    expect(lo).toBeCloseTo(-1.8, 6)
    expect(hi).toBeCloseTo(11.8, 6)
  })

  it('ignores values that are not numbers', () => {
    expect(valueScale([0, 10, NaN, Infinity])).toEqual(valueScale([0, 10]))
  })

  it('stretches to contain a handle beyond every key', () => {
    const keysOnly = valueScale([0, 10])
    const withHandle = valueScale([0, 10, 14])
    expect(withHandle.hi).toBeGreaterThan(14)
    expect(withHandle.hi).toBeGreaterThan(keysOnly.hi)
  })
})

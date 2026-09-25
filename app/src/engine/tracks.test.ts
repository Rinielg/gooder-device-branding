import { describe, expect, test } from 'vitest'
import { hasAnimation, lastKeyTime, liveTracks, mergeTransform, shiftKeys } from './tracks'
import { DEFAULT_TRANSFORM, type Composition, type Track, type TrackKey } from './types'

const key = (id: string, time: number): TrackKey =>
  ({ id, time, ease: 'power2.inOut', value: { x: 0, y: 0, z: 0 } })

describe('shiftKeys', () => {
  test('moves the named keys and leaves the others where they are', () => {
    const keys = [key('a', 0), key('b', 1), key('c', 2)]

    const out = shiftKeys(keys, ['b', 'c'], 0.5)

    expect(out.map((k) => [k.id, k.time])).toEqual([['a', 0], ['b', 1.5], ['c', 2.5]])
  })

  test('stops the group at zero instead of squashing it', () => {
    const keys = [key('a', 0.5), key('b', 2)]

    // Far enough left that 'a' would land at -1.5 if each key moved alone.
    const out = shiftKeys(keys, ['a', 'b'], -2)

    expect(out.map((k) => k.time)).toEqual([0, 1.5])
  })

  test('lands times on the millisecond grid the rest of the timeline uses', () => {
    const keys = [key('a', 0.1)]

    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point, and a time
    // that is not on the grid never compares equal to the playhead again.
    const out = shiftKeys(keys, ['a'], 0.2)

    expect(out[0].time).toBe(0.3)
  })
})

/* ------------------------------------------------------------------ */
/* Characterisation: written after the fact, each checked by breaking   */
/* the function and confirming the test went red.                       */
/* ------------------------------------------------------------------ */

const track = (id: Track['id'], times: number[], enabled = true): Track =>
  ({ id, enabled, keys: times.map((t, i) => key(`${id}${i}`, t)) })

const comp = (...tracks: Track[]): Composition => ({
  schemaVersion: 1,
  duration: 0,
  tracks: Object.fromEntries(tracks.map((t) => [t.id, t])),
})

describe('mergeTransform', () => {
  test('lays the sampled slices over the base pose', () => {
    const out = mergeTransform(DEFAULT_TRANSFORM, {
      rotation: { x: 10, y: 20, z: 30 },
    })

    expect([out.rotX, out.rotY, out.rotZ]).toEqual([10, 20, 30])
  })

  test('holds every channel no slice drives', () => {
    const base = { ...DEFAULT_TRANSFORM, posX: 0.7, scale: 1.4 }

    const out = mergeTransform(base, { rotation: { x: 0, y: 0, z: 0 } })

    // This is what lets rotation animate while the framing stays put.
    expect(out.posX).toBe(0.7)
    expect(out.scale).toBe(1.4)
  })

  test('takes all three transform families when all are present', () => {
    const out = mergeTransform(DEFAULT_TRANSFORM, {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 4, y: 5, z: 6 },
      scale: { uniform: 2 },
    })

    expect(out).toEqual({ posX: 1, posY: 2, posZ: 3, rotX: 4, rotY: 5, rotZ: 6, scale: 2 })
  })

  test('ignores a slice that is not part of the pose', () => {
    const out = mergeTransform(DEFAULT_TRANSFORM, { camera: { fov: 50, distance: 4 } })
    expect(out).toEqual(DEFAULT_TRANSFORM)
  })
})

describe('liveTracks', () => {
  test('skips a track that exists but holds no keys', () => {
    const c = comp(track('rotation', [0, 1]), track('position', []))
    expect(liveTracks(c).map((t) => t.id)).toEqual(['position', 'rotation'].filter((id) => id === 'rotation'))
  })

  test('returns tracks in registration order, not insertion order', () => {
    const c = comp(track('scale', [0]), track('position', [0]), track('rotation', [0]))
    expect(liveTracks(c).map((t) => t.id)).toEqual(['position', 'rotation', 'scale'])
  })
})

describe('hasAnimation', () => {
  test('one key still counts, because it pins the property', () => {
    expect(hasAnimation(comp(track('rotation', [0])))).toBe(true)
  })

  test('is false for an empty composition', () => {
    expect(hasAnimation(comp())).toBe(false)
  })

  test('is false when every track is muted', () => {
    expect(hasAnimation(comp(track('rotation', [0, 1], false)))).toBe(false)
  })

  test('is true when any track is live', () => {
    expect(hasAnimation(comp(track('rotation', [0], false), track('position', [0])))).toBe(true)
  })
})

describe('lastKeyTime', () => {
  test('is the furthest key across every track', () => {
    expect(lastKeyTime(comp(track('rotation', [0, 3]), track('position', [0, 1])))).toBe(3)
  })

  test('is zero when nothing is keyed', () => {
    expect(lastKeyTime(comp())).toBe(0)
  })

  test('counts a muted track, so muting cannot shorten the clip under its own keys', () => {
    expect(lastKeyTime(comp(track('rotation', [0, 5], false)))).toBe(5)
  })
})

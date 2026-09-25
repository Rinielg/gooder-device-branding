import { describe, expect, test } from 'vitest'
import { dropKeys, hasAnimation, lastKeyTime, liveTracks, mergeTransform, shiftKeys, shiftSelected } from './tracks'
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

/* ------------------------------------------------------------------ */

const withTracks = (tracks: Record<string, TrackKey[]>): Composition => ({
  schemaVersion: 1,
  duration: 0,
  tracks: Object.fromEntries(
    Object.entries(tracks).map(([id, keys]) => [id, { id, enabled: true, keys } as Track]),
  ),
})

/**
 * Moving a shift-selected group.
 *
 * Per-track shifting is not enough once a selection can cross tracks: the
 * clamp has to be worked out over the whole group, or the earliest key pins at
 * zero while the rest keep going and the spacing collapses.
 */
describe('shiftSelected', () => {
  test('moves keys in different tracks by the same amount', () => {
    const c = withTracks({ position: [key('a', 0), key('b', 1)], rotation: [key('c', 2)] })

    const out = shiftSelected(c, [{ track: 'position', key: 'b' }, { track: 'rotation', key: 'c' }], 0.5)

    expect(out.tracks.position!.keys.map((k) => k.time)).toEqual([0, 1.5])
    expect(out.tracks.rotation!.keys.map((k) => k.time)).toEqual([2.5])
  })

  test('clamps on the earliest selected key across every track', () => {
    const c = withTracks({ position: [key('a', 0.5)], rotation: [key('b', 2)] })

    // 'a' would land at -1.5 alone; the group can only move back by 0.5.
    const out = shiftSelected(c, [{ track: 'position', key: 'a' }, { track: 'rotation', key: 'b' }], -2)

    expect(out.tracks.position!.keys[0].time).toBe(0)
    expect(out.tracks.rotation!.keys[0].time).toBe(1.5)
  })

  test('leaves keys that are not selected alone', () => {
    const c = withTracks({ position: [key('a', 0), key('b', 1)] })

    const out = shiftSelected(c, [{ track: 'position', key: 'b' }], 1)

    expect(out.tracks.position!.keys.map((k) => [k.id, k.time])).toEqual([['a', 0], ['b', 2]])
  })

  test('lands on the millisecond grid', () => {
    const c = withTracks({ position: [key('a', 0.1)] })

    expect(shiftSelected(c, [{ track: 'position', key: 'a' }], 0.2).tracks.position!.keys[0].time).toBe(0.3)
  })

  test('ignores a reference to something that is not there', () => {
    const c = withTracks({ position: [key('a', 1)] })

    const out = shiftSelected(c, [{ track: 'rotation', key: 'x' }, { track: 'position', key: 'ghost' }], 1)

    expect(out.tracks.position!.keys[0].time).toBe(1)
  })

  test('keeps the keys of each track in time order', () => {
    const c = withTracks({ position: [key('a', 0), key('b', 1)] })

    // 'a' overtakes 'b'.
    const out = shiftSelected(c, [{ track: 'position', key: 'a' }], 2)

    expect(out.tracks.position!.keys.map((k) => [k.id, k.time])).toEqual([['b', 1], ['a', 2]])
  })
})

describe('dropKeys', () => {
  test('removes every named key', () => {
    const c = withTracks({ position: [key('a', 0), key('b', 1), key('c', 2)] })

    const out = dropKeys(c, [{ track: 'position', key: 'a' }, { track: 'position', key: 'c' }])

    expect(out.tracks.position!.keys.map((k) => k.id)).toEqual(['b'])
  })

  test('drops a track whose last key goes, rather than leaving an empty row', () => {
    const c = withTracks({ position: [key('a', 0)], rotation: [key('b', 0)] })

    const out = dropKeys(c, [{ track: 'position', key: 'a' }])

    expect(Object.keys(out.tracks)).toEqual(['rotation'])
  })

  test('removes across tracks in one pass', () => {
    const c = withTracks({ position: [key('a', 0), key('b', 1)], rotation: [key('c', 0), key('d', 1)] })

    const out = dropKeys(c, [{ track: 'position', key: 'b' }, { track: 'rotation', key: 'c' }])

    expect(out.tracks.position!.keys.map((k) => k.id)).toEqual(['a'])
    expect(out.tracks.rotation!.keys.map((k) => k.id)).toEqual(['d'])
  })

  test('leaves the composition alone when nothing matches', () => {
    const c = withTracks({ position: [key('a', 0)] })

    expect(dropKeys(c, [{ track: 'position', key: 'ghost' }])).toEqual(c)
  })
})

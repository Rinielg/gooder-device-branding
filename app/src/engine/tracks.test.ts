import { describe, expect, test } from 'vitest'
import { shiftKeys } from './tracks'
import type { TrackKey } from './types'

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

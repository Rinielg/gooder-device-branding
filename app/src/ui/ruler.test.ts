import { describe, expect, it } from 'vitest'
import { rulerTime } from './ruler'

/**
 * Where a pointer lands on the ruler, in seconds.
 *
 * The limit is the point: the playhead is clamped to the clip because it
 * cannot sit outside it, but the grip that *sets* the clip's length must be
 * free to go past the current end — otherwise the clip can only ever shrink.
 */
describe('rulerTime', () => {
  it('maps a pixel offset to seconds, allowing for the gutter', () => {
    expect(rulerTime(248, 120, 8)).toBe(2)
  })

  it('never returns a negative time', () => {
    expect(rulerTime(-400, 120, 8)).toBe(0)
  })

  it('lands on the millisecond grid', () => {
    // A third of a second is 0.3333333333333333, and a time that is not on the
    // grid never compares equal to the playhead again. The divisor has to be
    // one that does not come out even, or the assertion cannot fail.
    expect(rulerTime(9, 3, 8)).toBe(0.333)
  })

  it('clamps to the limit when one is given', () => {
    expect(rulerTime(2000, 120, 8, 4)).toBe(4)
  })

  it('runs past the clip when no limit is given, so it can be extended', () => {
    // The bug this pins: clamping to the current duration meant the length
    // grip could shrink a clip and never grow one.
    expect(rulerTime(1208, 120, 8)).toBe(10)
  })
})

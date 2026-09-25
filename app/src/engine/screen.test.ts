import { describe, expect, it } from 'vitest'
import { padHeight, screenCrop } from './screen'

/** The iPhone 18 Pro Max display, measured from the source asset. */
const DISPLAY = 0.4599

describe('screenCrop', () => {
  it('shows the whole width at zoom 1, whatever shape the image is', () => {
    // The point of the change: an uploaded UI goes edge to edge, never cropped
    // at the sides, because the sides are where a UI puts its layout.
    for (const aspect of [0.4, 0.4599, 0.5, 1, 1.78]) {
      expect(screenCrop(aspect, DISPLAY, 1, 0, 0).repeat[0]).toBe(1)
    }
  })

  it('anchors the top of the image to the top of the display', () => {
    // Measured: with flipY false, v = 0 is the image's first row and the
    // display's top edge, so top alignment is offset.y = 0.
    for (const aspect of [0.4, 0.5, 1]) {
      expect(screenCrop(aspect, DISPLAY, 1, 0, 0).offset[1]).toBe(0)
    }
  })

  it('keeps the image undistorted, by scaling height against the aspect', () => {
    // An image the display's own shape fills it exactly.
    const exact = screenCrop(DISPLAY, DISPLAY, 1, 0, 0)
    expect(exact.repeat[0]).toBeCloseTo(1, 6)
    expect(exact.repeat[1]).toBeCloseTo(1, 6)

    // A wider image is relatively shorter, so fitting its width leaves the
    // bottom of the display past the end of it.
    expect(screenCrop(0.5, DISPLAY, 1, 0, 0).repeat[1]).toBeGreaterThan(1)

    // A narrower image is relatively taller, so its bottom is cropped.
    expect(screenCrop(0.4, DISPLAY, 1, 0, 0).repeat[1]).toBeLessThan(1)
  })

  it('scales both axes together when zoomed, so zoom does not stretch', () => {
    const one = screenCrop(0.5, DISPLAY, 1, 0, 0)
    const two = screenCrop(0.5, DISPLAY, 2, 0, 0)
    expect(two.repeat[0]).toBeCloseTo(one.repeat[0] / 2, 6)
    expect(two.repeat[1]).toBeCloseTo(one.repeat[1] / 2, 6)
  })

  it('keeps the top pinned when zoomed, matching how it frames at zoom 1', () => {
    expect(screenCrop(0.5, DISPLAY, 3, 0, 0).offset[1]).toBe(0)
  })

  it('recentres horizontally when zoomed in', () => {
    const { repeat, offset } = screenCrop(0.5, DISPLAY, 2, 0, 0)
    expect(offset[0]).toBeCloseTo((1 - repeat[0]) / 2, 6)
  })

  it('pans with the offsets, keeping the sign the controls already use', () => {
    const base = screenCrop(0.5, DISPLAY, 1, 0, 0)
    expect(screenCrop(0.5, DISPLAY, 1, 0.1, 0).offset[0]).toBeCloseTo(base.offset[0] + 0.1, 6)
    expect(screenCrop(0.5, DISPLAY, 1, 0, 0.1).offset[1]).toBeCloseTo(base.offset[1] - 0.1, 6)
  })

  it('refuses a zoom of zero rather than dividing by it', () => {
    expect(Number.isFinite(screenCrop(0.5, DISPLAY, 0, 0, 0).repeat[0])).toBe(true)
  })

  it('survives an image whose dimensions are not known yet', () => {
    const { repeat, offset } = screenCrop(0, DISPLAY, 1, 0, 0)
    expect(repeat.every(Number.isFinite)).toBe(true)
    expect(offset.every(Number.isFinite)).toBe(true)
  })
})

/**
 * Filling the shortfall.
 *
 * Fitting the width means an image proportionally shorter than the display
 * runs out before the bottom. Clamp-to-edge repeats its last row of pixels
 * down the gap, which streaks whenever that row is not one colour — the
 * shipped wallpaper's last row runs from #000000 to #341719, so it streaks.
 */
describe('padHeight', () => {
  it('asks for nothing when the image is exactly the display shape', () => {
    expect(padHeight(460, 1000, 0.46)).toBeNull()
  })

  it('asks for nothing when the image is taller than the display', () => {
    // It overflows instead, and the bottom is simply cropped.
    expect(padHeight(400, 1000, 0.4599)).toBeNull()
  })

  it('extends a short image down to the display shape, at its own width', () => {
    // 1024 x 2048 is the shipped wallpaper: 0.5 against a 0.4599 display.
    expect(padHeight(1024, 2048, 0.4599)).toBe(Math.round(1024 / 0.4599))
  })

  it('returns a height that makes the padded image the display aspect', () => {
    const h = padHeight(1200, 2400, 0.4599)!
    expect(1200 / h).toBeCloseTo(0.4599, 3)
  })

  it('ignores an image whose size is not known yet', () => {
    expect(padHeight(0, 0, 0.4599)).toBeNull()
  })
})

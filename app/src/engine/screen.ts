/**
 * How an uploaded image sits on the display.
 *
 * Width edge to edge, top aligned, never distorted. A UI screenshot puts its
 * layout at the edges — a nav bar, a title, a card's margins — so cropping the
 * sides to fill the height throws away the part that was designed. Fitting the
 * width instead means the only thing that can fall outside the display is the
 * bottom, which is where a scrolling UI already continues past the fold.
 *
 * Returns three.js texture `repeat` and `offset`. The sampled window is
 * `[offset, offset + repeat]`, and — measured, with `flipY` false — v = 0 is
 * both the image's first row and the display's top edge, so top alignment is
 * an offset of zero.
 */
/**
 * The top of the image in texture v.
 *
 * Measured rather than reasoned about: with `flipY` false, sampling `[0, 0.5]`
 * of a half-red, half-blue image put the red half — its first rows — across
 * the whole display. Unary negation of a zero offset would give `-0`, so this
 * is subtracted from rather than negated.
 */
const TOP_V = 0

export function screenCrop(
  texAspect: number,
  screenAspect: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): { repeat: [number, number]; offset: [number, number] } {
  const z = Math.max(zoom, 0.05)
  const aspect = texAspect > 0 && Number.isFinite(texAspect) ? texAspect : screenAspect

  const rx = 1 / z
  // Height follows from the width: sampling this much of the image's height
  // against the full width gives back the image's own proportions.
  const ry = aspect / screenAspect / z

  return {
    repeat: [rx, ry],
    offset: [
      // Horizontally centred, which at zoom 1 is simply the user's own pan.
      (1 - rx) / 2 + offsetX,
      // Pinned to the top at every zoom, so zooming in frames the same edge
      // the default framing does.
      TOP_V - offsetY,
    ],
  }
}

/**
 * The canvas height an image needs to reach the display's shape, or null when
 * it already reaches it.
 *
 * Only images that fall *short* are padded. One that overruns is cropped at
 * the bottom, which is what a UI does below the fold anyway.
 */
export function padHeight(texW: number, texH: number, screenAspect: number): number | null {
  if (!(texW > 0) || !(texH > 0) || !(screenAspect > 0)) return null
  const needed = Math.round(texW / screenAspect)
  return needed > texH ? needed : null
}

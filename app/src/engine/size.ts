/** Encoders reject odd dimensions, so every export size is rounded to even. */
export function evenSize(w: number, h: number, scale: number) {
  const round = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2)
  return { width: round(w), height: round(h) }
}

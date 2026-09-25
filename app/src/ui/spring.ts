export interface SpringSettings {
  stiffness: number
  damping: number
  mass: number
  /** Initial velocity, in progress units per second. */
  velocity: number
}

export const DEFAULT_SPRING: SpringSettings = {
  stiffness: 180, damping: 12, mass: 1, velocity: 0,
}

/** How close to the target counts as settled. */
const TOLERANCE = 1e-4
const STEP = 1 / 240
const CAP = 20

/**
 * A damped spring, as an easing function.
 *
 * A spring has no natural duration — it runs until it settles — but a keyframe
 * does, and the value at the far end has to be the one the key says it is. So
 * the settle time is found once and the segment is mapped onto it: the shape
 * fills the segment however long the segment is, and lands exactly.
 */
export function springEase(s: SpringSettings): (p: number) => number {
  const position = solver(s)
  const settle = settleTime(position)
  return (p) => {
    if (p <= 0) return 0
    if (p >= 1) return 1
    return position(p * settle)
  }
}

/** Position of a unit step response at time `t`, from 0 heading to 1. */
function solver({ stiffness, damping, mass, velocity }: SpringSettings) {
  // Floored, not trusted: a saved project or a scrubbed field can hand this
  // anything, and a negative damping makes sqrt(1 - zeta^2) imaginary. A zero
  // damping is just as bad in a different way — it rings for ever and never
  // reaches the key.
  const k = Math.max(stiffness, 0.01)
  const m = Math.max(mass, 0.01)
  const c = Math.max(damping, 0.01)
  const w0 = Math.sqrt(k / m)
  const zeta = c / (2 * Math.sqrt(k * m))

  if (zeta < 1) {
    // Underdamped: it overshoots and rings, which is the reason to want one.
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    const b = (velocity - zeta * w0) / wd
    return (t: number) =>
      1 + Math.exp(-zeta * w0 * t) * (-Math.cos(wd * t) + b * Math.sin(wd * t))
  }

  if (zeta === 1) {
    const b = velocity - w0
    return (t: number) => 1 + (-1 + b * t) * Math.exp(-w0 * t)
  }

  // Overdamped: two real roots, no overshoot.
  const root = w0 * Math.sqrt(zeta * zeta - 1)
  const r1 = -zeta * w0 + root
  const r2 = -zeta * w0 - root
  const c1 = (velocity + r2) / (r1 - r2)
  const c2 = -1 - c1
  return (t: number) => 1 + c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t)
}

/** The last moment the spring is still visibly moving. */
function settleTime(position: (t: number) => number): number {
  let last = STEP
  for (let t = 0; t <= CAP; t += STEP) {
    if (Math.abs(position(t) - 1) >= TOLERANCE) last = t
  }
  return last + STEP
}

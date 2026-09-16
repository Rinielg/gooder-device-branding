import type { Stage } from './Stage'
import type { KeyframeTimeline } from './Timeline'

/**
 * A tiny module-level handle so panels (export, saved views) can reach the
 * renderer without threading it through React context on every frame.
 */
export const engine: {
  stage: Stage | null
  timeline: KeyframeTimeline | null
  /** Render at `t` and return a small data: URL, for view thumbnails. */
  thumbnail: ((t: number) => string) | null
} = { stage: null, timeline: null, thumbnail: null }

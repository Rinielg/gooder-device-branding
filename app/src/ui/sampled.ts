import { useStore } from '../state/store'
import type { TrackId } from '../engine/types'

/**
 * What a control should display.
 *
 * While a property is animated the timeline owns it, so showing the project's
 * own value would mean the slider disagreeing with the picture. Reading the
 * sampled value instead keeps the panel honest while scrubbing.
 *
 * The selector returns a number, so a control only re-renders when its own
 * channel moves — an animated light does not wake the frame controls, and an
 * idle playhead wakes nothing at all.
 */
export function useChannel(track: TrackId, channel: string, base: number): number {
  return useStore((s) => s.sampled?.[track]?.[channel] ?? base)
}

/** Is this property being driven by the timeline right now? */
export function useAnimated(track: TrackId): boolean {
  return useStore((s) => s.sampled?.[track] !== undefined)
}

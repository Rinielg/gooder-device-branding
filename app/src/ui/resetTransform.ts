import { useStore } from '../state/store'
import { DEFAULT_STAGE, DEFAULT_TRANSFORM } from '../engine/types'

/** Resets the pose and camera only — lighting has its own reset in the Light tab. */
export function resetTransform() {
  useStore.getState().setTransform({ ...DEFAULT_TRANSFORM })
  useStore.getState().setStage({ ...DEFAULT_STAGE })
}

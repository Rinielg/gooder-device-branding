import { useStore } from '../state/store'
import { DEFAULT_STAGE, DEFAULT_TRANSFORM } from '../engine/types'

export function resetTransform() {
  useStore.getState().setTransform({ ...DEFAULT_TRANSFORM })
  useStore.getState().setStage({ ...DEFAULT_STAGE })
}

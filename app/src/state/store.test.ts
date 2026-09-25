import { beforeEach, describe, expect, test } from 'vitest'
import { useStore } from './store'
import { DEFAULT_COMPOSITION } from '../engine/types'

const st = () => useStore.getState()

beforeEach(() => {
  useStore.setState({
    composition: structuredClone(DEFAULT_COMPOSITION),
    playhead: 0, past: [], future: [], selection: null,
  })
})

describe('shiftTrackKeys', () => {
  test('moves a segment’s two keys together, leaving the third alone', () => {
    st().setTransform({ rotY: 0 })
    st().keyTrack('rotation')
    useStore.setState({ playhead: 1 })
    st().setTransform({ rotY: 40 })
    useStore.setState({ playhead: 2 })
    st().setTransform({ rotY: 90 })

    const keys = st().composition.tracks.rotation!.keys
    expect(keys.map((k) => k.time)).toEqual([0, 1, 2])

    st().shiftTrackKeys('rotation', [keys[1].id, keys[2].id], 0.5)

    expect(st().composition.tracks.rotation!.keys.map((k) => k.time)).toEqual([0, 1.5, 2.5])
  })
})

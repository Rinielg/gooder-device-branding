import { beforeEach, describe, expect, test } from 'vitest'
import { MIN_COMPOSITION, compositionDuration, useStore } from './store'
import {
  DEFAULT_COMPOSITION, DEFAULT_LIGHTING, DEFAULT_TRANSFORM,
  type Composition, type Track,
} from '../engine/types'

const st = () => useStore.getState()

beforeEach(() => {
  // Through an action first, not only setState: the undo coalescing window is
  // module state, so a test that resets the stack by hand still inherits the
  // previous test's open run and its next edit silently folds into nothing.
  useStore.setState({ transform: { ...DEFAULT_TRANSFORM } })
  st().clearComposition()
  useStore.setState({
    composition: structuredClone(DEFAULT_COMPOSITION),
    playhead: 0, past: [], future: [], selection: null, presets: [],
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

/* ------------------------------------------------------------------ */
/* Characterisation: written after the fact, each checked by breaking   */
/* the code and confirming the test went red.                          */
/* ------------------------------------------------------------------ */

const comp = (tracks: Track[] = [], duration = 0): Composition => ({
  schemaVersion: 1,
  duration,
  tracks: Object.fromEntries(tracks.map((t) => [t.id, t])),
})

const rot = (times: number[]): Track => ({
  id: 'rotation',
  enabled: true,
  keys: times.map((t, i) => ({ id: `k${i}`, time: t, ease: 'none', value: { x: 0, y: 0, z: 0 } })),
})

describe('compositionDuration', () => {
  test('an explicit length wins over a longer background', () => {
    expect(compositionDuration(comp([], 5), 20)).toBe(5)
  })

  test('keys still extend an explicit length, rather than being clipped', () => {
    expect(compositionDuration(comp([rot([0, 8])], 5), 20)).toBe(8)
  })

  test('with nothing keyed the background sets the length', () => {
    expect(compositionDuration(comp(), 20)).toBe(20)
  })

  test('once keyed, the clip follows the keys and not the background', () => {
    // Otherwise a 20s gradient shows a 3s animation as three marks.
    expect(compositionDuration(comp([rot([0, 3])]), 20)).toBe(MIN_COMPOSITION)
  })

  test('keeps headroom past the last key so the clip can be extended', () => {
    expect(compositionDuration(comp([rot([0, 9])]), 0)).toBe(10)
  })

  test('never goes below the floor', () => {
    expect(compositionDuration(comp(), 0)).toBe(MIN_COMPOSITION)
  })
})

describe('migration', () => {
  test('a project saved as flat keyframes opens as three tracks', () => {
    st().importProject({
      keyframes: [
        { id: 'a', time: 0, ease: 'none', transform: { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1 } },
        { id: 'b', time: 1.5, ease: 'expo.out', transform: { posX: 1, posY: 0, posZ: 0, rotX: 0, rotY: 90, rotZ: 0, scale: 2 } },
      ],
    })

    const tracks = st().composition.tracks
    expect(Object.keys(tracks).sort()).toEqual(['position', 'rotation', 'scale'])
    expect(tracks.rotation!.keys.map((k) => [k.time, k.ease])).toEqual([[0, 'none'], [1.5, 'expo.out']])
    expect(tracks.scale!.keys.map((k) => k.value.uniform)).toEqual([1, 2])
  })

  test('saved views become pose-scoped presets, names and thumbnails intact', () => {
    st().importProject({
      views: [{
        id: 'v1', name: 'Hero shot', thumb: 'data:image/gif;base64,AAA', createdAt: 1,
        transform: { posX: 0.3, posY: 0, posZ: 0, rotX: -6, rotY: -28, rotZ: 0, scale: 1.2 },
      }],
    })

    expect(st().presets).toHaveLength(1)
    expect(st().presets[0]).toMatchObject({
      name: 'Hero shot', thumb: 'data:image/gif;base64,AAA',
      tracks: ['position', 'rotation', 'scale'],
      description: '',
    })
  })

  test('a file carrying no animation leaves the current one alone', () => {
    st().setTransform({ rotY: 10 })
    st().keyTrack('rotation')
    const before = st().composition.tracks.rotation!.keys.length

    st().importProject({ variant: 'Plum' })

    expect(st().composition.tracks.rotation!.keys).toHaveLength(before)
  })
})

describe('deep merge of nested settings', () => {
  test('a leaf edit survives rather than falling back to the default', () => {
    // The bug this pins made the whole lighting panel inert.
    st().setLighting({ environment: { exposure: 1.8 } })

    expect(st().lighting.environment.exposure).toBe(1.8)
  })

  test('sibling keys in the same nested object are kept', () => {
    st().setLighting({ environment: { exposure: 1.8 } })
    st().setLighting({ environment: { intensity: 2.2 } })

    expect(st().lighting.environment.exposure).toBe(1.8)
    expect(st().lighting.environment.intensity).toBe(2.2)
  })

  test('untouched slices keep their defaults', () => {
    st().setLighting({ environment: { exposure: 1.8 } })

    expect(st().lighting.shadows).toEqual(DEFAULT_LIGHTING.shadows)
  })
})

describe('auto-key', () => {
  test('posing with nothing animated does not start an animation', () => {
    useStore.setState({ playhead: 2 })

    st().setTransform({ rotY: 45 })

    expect(Object.keys(st().composition.tracks)).toEqual([])
  })

  test('once anything is animated, another property joins in with a key at zero', () => {
    st().setTransform({ rotY: 0 })
    st().keyTrack('rotation')
    useStore.setState({ playhead: 2 })

    st().setTransform({ posX: 0.6 })

    // A key at 0 holding the old value, so it animates rather than pinning.
    expect(st().composition.tracks.position!.keys.map((k) => [k.time, k.value.x])).toEqual([[0, 0], [2, 0.6]])
  })

  test('keys only the property that moved', () => {
    st().setTransform({ rotY: 0 })
    st().keyTrack('rotation')
    useStore.setState({ playhead: 2 })

    st().setTransform({ rotY: 90 })

    expect(Object.keys(st().composition.tracks)).toEqual(['rotation'])
  })

  test('arming a property part-way along gives it a clip, not a pin', () => {
    st().setTransform({ rotY: 0 })
    st().keyTrack('rotation')
    useStore.setState({ playhead: 3 })

    st().keyTrack('camera')

    expect(st().composition.tracks.camera!.keys.map((k) => k.time)).toEqual([0, 3])
  })
})

describe('history', () => {
  test('a run of edits to one property is one undo step', () => {
    st().setTransform({ rotY: 10 })
    st().setTransform({ rotY: 20 })
    st().setTransform({ rotY: 30 })

    expect(st().past).toHaveLength(1)
  })

  test('undo returns the value from before the run', () => {
    const before = st().transform.rotY
    st().setTransform({ rotY: 42 })

    st().undo()

    expect(st().transform.rotY).toBe(before)
  })

  test('redo puts it back', () => {
    st().setTransform({ rotY: 42 })
    st().undo()

    st().redo()

    expect(st().transform.rotY).toBe(42)
  })

  test('a derived sync marked silent takes no history slot', () => {
    st().silently(() => st().setScreen({ brightness: 2 }))

    expect(st().past).toHaveLength(0)
    expect(st().screen.brightness).toBe(2)
  })
})

import { describe, expect, test } from 'vitest'
import { TRACKS, TRACK_ORDER, applySampled, type TrackSource, type TrackTarget } from './tracks'
import {
  DEFAULT_BACKGROUND, DEFAULT_LIGHTING, DEFAULT_SCREEN, DEFAULT_STAGE, DEFAULT_TRANSFORM,
  type LightId, type Sample, type TrackValue, type Transform,
} from './types'

const source = (): TrackSource => ({
  transform: { ...DEFAULT_TRANSFORM },
  stage: { ...DEFAULT_STAGE },
  lighting: structuredClone(DEFAULT_LIGHTING),
  screen: { ...DEFAULT_SCREEN },
  background: structuredClone(DEFAULT_BACKGROUND),
})

/** Records what the registry sent where, so routing can be asserted directly. */
function spy() {
  const calls: Record<string, unknown[]> = {}
  const log = (name: string) => (...args: unknown[]) => { (calls[name] ??= []).push(args) }
  const target: TrackTarget = {
    setPose: log('setPose') as (t: Transform) => void,
    setCamera: log('setCamera') as (fov: number, d: number) => void,
    setLightSample: log('setLightSample') as (id: LightId, v: TrackValue) => void,
    setEnvironmentSample: log('setEnvironmentSample') as (v: TrackValue) => void,
    setShadowSample: log('setShadowSample') as (v: TrackValue) => void,
    setScreenSample: log('setScreenSample') as (v: TrackValue) => void,
    setBackgroundSample: log('setBackgroundSample') as (v: TrackValue) => void,
    commit: log('commit') as () => void,
  }
  return { target, calls }
}

describe('the registry', () => {
  test('registers eleven tracks across four groups', () => {
    // Registration order is row order in the timeline and grouping order in the
    // Animate menu, so it is worth pinning: environment, then the three lights,
    // then shadow reads as the lighting chain in the order you would set it up.
    expect(TRACK_ORDER).toEqual([
      'position', 'rotation', 'scale',
      'camera',
      'environment', 'keyLight', 'fillLight', 'rimLight', 'shadow',
      'screen', 'background',
    ])
    expect(new Set(TRACK_ORDER.map((id) => TRACKS[id]!.group)))
      .toEqual(new Set(['Transform', 'Camera', 'Light', 'Look']))
  })

  test('every track reads a finite value for every channel it declares', () => {
    const s = source()
    for (const id of TRACK_ORDER) {
      const def = TRACKS[id]!
      const value = def.read(s)
      for (const ch of def.channels) {
        expect(Number.isFinite(value[ch.key]), `${id}.${ch.key}`).toBe(true)
      }
    }
  })

  test('no track is inert — each one either folds into the pose or drives the engine', () => {
    for (const id of TRACK_ORDER) {
      const def = TRACKS[id]!
      expect(Boolean(def.write || def.apply), `${id} does nothing`).toBe(true)
    }
  })

  test('the three light tracks name the light they drive', () => {
    expect(TRACKS.keyLight!.light).toBe('key')
    expect(TRACKS.fillLight!.light).toBe('fill')
    expect(TRACKS.rimLight!.light).toBe('rim')
  })
})

describe('applySampled', () => {
  test('routes each family to its own setter', () => {
    const { target, calls } = spy()

    applySampled(target, source(), null)

    expect(calls.setCamera).toHaveLength(1)
    expect(calls.setEnvironmentSample).toHaveLength(1)
    expect(calls.setShadowSample).toHaveLength(1)
    expect(calls.setScreenSample).toHaveLength(1)
    expect(calls.setBackgroundSample).toHaveLength(1)
    // One call per light, each told which light it is.
    expect(calls.setLightSample?.map((c) => (c as [LightId])[0])).toEqual(['key', 'fill', 'rim'])
  })

  test('applies the project’s own values when nothing is animated', () => {
    const { target, calls } = spy()
    const s = source()
    s.stage.fov = 33
    s.stage.distance = 4.2

    applySampled(target, s, null)

    expect(calls.setCamera?.[0]).toEqual([33, 4.2])
  })

  test('lays a sampled slice over the project’s value', () => {
    const { target, calls } = spy()
    const sample: Sample = { camera: { fov: 55, distance: 6 } }

    applySampled(target, source(), sample)

    expect(calls.setCamera?.[0]).toEqual([55, 6])
  })

  test('a track the sample does not drive falls back to the project', () => {
    const { target, calls } = spy()
    const s = source()
    s.screen.brightness = 2.5

    // This is what makes deleting a track restore the value the panels show,
    // with nothing having to notice the deletion.
    applySampled(target, s, { camera: { fov: 55, distance: 6 } })

    expect(calls.setScreenSample?.[0]).toEqual([{ brightness: 2.5 }])
  })

  test('folds the transform slices into a single pose', () => {
    const { target, calls } = spy()

    applySampled(target, source(), {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 4, y: 5, z: 6 },
      scale: { uniform: 2 },
    })

    expect(calls.setPose).toHaveLength(1)
    expect(calls.setPose?.[0]).toEqual([
      { posX: 1, posY: 2, posZ: 3, rotX: 4, rotY: 5, rotZ: 6, scale: 2 },
    ])
  })

  test('commits once, however many slices were applied', () => {
    const { target, calls } = spy()

    applySampled(target, source(), {
      rotation: { x: 0, y: 90, z: 0 },
      camera: { fov: 40, distance: 3 },
      keyLight: { intensity: 2, x: 1, y: 1, z: 1 },
    })

    // Everything derived — the shadow catcher, the light frustum — is
    // recomputed in commit, so a second call would double the per-frame cost.
    expect(calls.commit).toHaveLength(1)
  })
})

import { describe, expect, test } from 'vitest'
import {
  BUILT_INS, isPresetActive, nearestAngle, readPreset, sanitisePreset, scopeOf,
  shortestPath, tracksForScope,
} from './presets'
import { DEFAULT_BACKGROUND, DEFAULT_LIGHTING, DEFAULT_SCREEN, DEFAULT_STAGE, DEFAULT_TRANSFORM } from './types'
import type { TrackSource } from './tracks'

const source = (over: Partial<TrackSource['transform']> = {}): TrackSource => ({
  transform: { ...DEFAULT_TRANSFORM, ...over },
  stage: DEFAULT_STAGE,
  lighting: DEFAULT_LIGHTING,
  screen: DEFAULT_SCREEN,
  background: DEFAULT_BACKGROUND,
})

describe('nearestAngle', () => {
  test('turns the short way to the back from the default pose', () => {
    // −22 → +180 is 202 degrees; −22 → −180 is 158. Take the near one.
    expect(nearestAngle(180, -22)).toBe(-180)
  })

  test('turns the other short way when already past centre', () => {
    expect(nearestAngle(180, 150)).toBe(180)
  })

  test('leaves an angle alone when it is already nearest', () => {
    expect(nearestAngle(-90, 0)).toBe(-90)
  })

  test('crosses the wrap rather than unwinding a whole turn', () => {
    expect(nearestAngle(0, 350)).toBe(360)
  })

  test('is exactly 180 away at the ambiguous point', () => {
    expect(Math.abs(nearestAngle(180, 0))).toBe(180)
  })
})

describe('shortestPath', () => {
  test('rewrites only the rotation slice', () => {
    const value = {
      rotation: { x: 0, y: 180, z: 0 },
      position: { x: 1, y: 2, z: 3 },
    }

    const out = shortestPath(value, { ...DEFAULT_TRANSFORM, rotY: -22 })

    expect(out.rotation).toEqual({ x: 0, y: -180, z: 0 })
    expect(out.position).toEqual({ x: 1, y: 2, z: 3 })
  })

  test('passes a sample with no rotation straight through', () => {
    const value = { camera: { fov: 30, distance: 3 } }
    expect(shortestPath(value, DEFAULT_TRANSFORM)).toBe(value)
  })
})

describe('built-ins', () => {
  test('are six elevations that also centre and unscale', () => {
    expect(BUILT_INS.map((p) => p.name)).toEqual(['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom'])
    for (const p of BUILT_INS) {
      expect(p.value.position).toEqual({ x: 0, y: 0, z: 0 })
      expect(p.value.scale).toEqual({ uniform: 1 })
    }
  })

  test('every one carries a description, because matching depends on it', () => {
    for (const p of BUILT_INS) expect(p.description.length).toBeGreaterThan(10)
  })

  test('Front is the identity rotation', () => {
    expect(BUILT_INS[0].value.rotation).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('isPresetActive', () => {
  const front = BUILT_INS[0]
  const back = BUILT_INS[1]

  test('is true when the scene already sits there', () => {
    expect(isPresetActive(front, source({ rotX: 0, rotY: 0, rotZ: 0, posX: 0, posY: 0, posZ: 0, scale: 1 }))).toBe(true)
  })

  test('is false when the pose differs', () => {
    expect(isPresetActive(front, source({ rotY: -22 }))).toBe(false)
  })

  test('treats 180 and −180 as the same view', () => {
    const at = source({ rotX: 0, rotY: -180, rotZ: 0, posX: 0, posY: 0, posZ: 0, scale: 1 })
    expect(isPresetActive(back, at)).toBe(true)
  })

  test('is false when only the framing differs', () => {
    const turned = source({ rotX: 0, rotY: 0, rotZ: 0, posX: 0.5, posY: 0, posZ: 0, scale: 1 })
    expect(isPresetActive(front, turned)).toBe(false)
  })
})

describe('scopes', () => {
  test('angle is rotation alone', () => {
    expect(tracksForScope('angle')).toEqual(['rotation'])
  })

  test('pose is the three transform tracks', () => {
    expect(tracksForScope('pose')).toEqual(['position', 'rotation', 'scale'])
  })

  test('scene is every registered track', () => {
    expect(tracksForScope('scene').length).toBeGreaterThan(tracksForScope('pose').length)
  })

  test('round-trips back to its own name', () => {
    for (const scope of ['angle', 'pose', 'scene'] as const) {
      expect(scopeOf(tracksForScope(scope))).toBe(scope)
    }
  })
})

describe('readPreset', () => {
  test('reads only the tracks asked for', () => {
    const out = readPreset(source({ rotY: 45 }), ['rotation'])
    expect(Object.keys(out)).toEqual(['rotation'])
    expect(out.rotation).toEqual({ x: -8, y: 45, z: 0 })
  })
})

describe('sanitisePreset', () => {
  test('keeps a well-formed preset', () => {
    const out = sanitisePreset({
      id: 'p1', name: 'Hero', description: 'a shot', createdAt: 5,
      value: { rotation: { x: 1, y: 2, z: 3 } },
    })
    expect(out).toMatchObject({ id: 'p1', name: 'Hero', tracks: ['rotation'] })
  })

  // Guaranteed structurally — the output is built by walking the registry, not
  // the input — so this guards the refactor that would walk the input instead.
  test('builds its output from the registry, so an unknown track cannot leak in', () => {
    const out = sanitisePreset({
      name: 'Hero',
      value: { rotation: { x: 0, y: 0, z: 0 }, unicorn: { horn: 1 } },
    })
    expect(out?.tracks).toEqual(['rotation'])
  })

  test('drops a track missing one of its channels', () => {
    const out = sanitisePreset({
      name: 'Hero',
      value: { rotation: { x: 0, y: 0, z: 0 }, position: { x: 1, y: 2 } },
    })
    expect(out?.tracks).toEqual(['rotation'])
  })

  test('refuses a preset whose channels are all unusable', () => {
    expect(sanitisePreset({ name: 'Hero', value: { rotation: { x: 'nope' } } })).toBeNull()
  })

  test.each([[null], [undefined], ['a string'], [{ value: {} }]])(
    'refuses %s', (raw) => { expect(sanitisePreset(raw)).toBeNull() },
  )

  test('supplies an empty description when one is missing', () => {
    const out = sanitisePreset({ name: 'Hero', value: { rotation: { x: 0, y: 0, z: 0 } } })
    expect(out?.description).toBe('')
  })
})

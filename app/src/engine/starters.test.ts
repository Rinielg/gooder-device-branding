import { describe, expect, test } from 'vitest'
import { STARTERS, buildStarter } from './starters'
import {
  DEFAULT_BACKGROUND, DEFAULT_LIGHTING, DEFAULT_SCREEN, DEFAULT_STAGE, DEFAULT_TRANSFORM,
} from './types'
import type { TrackSource } from './tracks'

const source = (): TrackSource => ({
  transform: { ...DEFAULT_TRANSFORM, posX: 0.3, rotY: -22, scale: 1.2 },
  stage: { ...DEFAULT_STAGE },
  lighting: structuredClone(DEFAULT_LIGHTING),
  screen: { ...DEFAULT_SCREEN },
  background: structuredClone(DEFAULT_BACKGROUND),
})

describe('starters', () => {
  test('offers a handful of named starting animations', () => {
    expect(STARTERS.length).toBeGreaterThanOrEqual(4)
    for (const s of STARTERS) expect(s.name.length).toBeGreaterThan(2)
  })

  test('every one produces a track with something to animate between', () => {
    for (const s of STARTERS) {
      const tracks = buildStarter(s.id, source())
      const entries = Object.values(tracks)
      expect(entries.length, s.id).toBeGreaterThan(0)
      expect(Math.max(...entries.map((k) => k!.length)), s.id).toBeGreaterThan(1)
    }
  })

  test('every one starts at zero', () => {
    for (const s of STARTERS) {
      for (const keys of Object.values(buildStarter(s.id, source()))) {
        expect(keys![0].time, s.id).toBe(0)
      }
    }
  })

  test('every one ends on the pose you set up, so it animates into your shot', () => {
    const src = source()
    for (const s of STARTERS) {
      const tracks = buildStarter(s.id, src)
      if (tracks.position) {
        const last = tracks.position[tracks.position.length - 1]
        expect([last.value.x, last.value.y, last.value.z], s.id)
          .toEqual([src.transform.posX, src.transform.posY, src.transform.posZ])
      }
      if (tracks.scale) {
        const last = tracks.scale[tracks.scale.length - 1]
        expect(last.value.uniform, s.id).toBe(src.transform.scale)
      }
      if (tracks.rotation) {
        const last = tracks.rotation[tracks.rotation.length - 1]
        expect(last.value.y, s.id).toBe(src.transform.rotY)
      }
    }
  })

  test('an unknown starter builds nothing rather than throwing', () => {
    expect(buildStarter('nope', source())).toEqual({})
  })
})

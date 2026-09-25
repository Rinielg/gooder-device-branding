import { describe, expect, it } from 'vitest'
import { coerceShape, sanitiseProject } from './project'
import {
  DEFAULT_BACKGROUND, DEFAULT_FRAME, DEFAULT_LIGHTING, DEFAULT_SCREEN,
  DEFAULT_STAGE, DEFAULT_TRANSFORM, FRAME_LIMITS,
} from '../engine/types'

/**
 * Coercion against a default.
 *
 * The default is the schema: a field added later is covered without anyone
 * remembering to add a rule for it.
 */
describe('coerceShape', () => {
  it('keeps the default when the value is missing', () => {
    expect(coerceShape({ a: 1 }, {})).toEqual({ a: 1 })
    expect(coerceShape(5, undefined)).toBe(5)
  })

  it('keeps the default when a number arrives as a string', () => {
    expect(coerceShape({ posY: 0 }, { posY: 'abc' })).toEqual({ posY: 0 })
  })

  it('keeps the default when a number is not finite', () => {
    expect(coerceShape(1, Infinity)).toBe(1)
    expect(coerceShape(1, NaN)).toBe(1)
  })

  it('keeps the default when a number arrives as null', () => {
    expect(coerceShape({ scale: 1 }, { scale: null })).toEqual({ scale: 1 })
  })

  it('takes a value of the right type', () => {
    expect(coerceShape({ posY: 0 }, { posY: -2.5 })).toEqual({ posY: -2.5 })
    expect(coerceShape({ kind: 'mesh' }, { kind: 'colour' })).toEqual({ kind: 'colour' })
    expect(coerceShape({ on: false }, { on: true })).toEqual({ on: true })
  })

  it('does not take a string where a boolean belongs', () => {
    expect(coerceShape({ on: false }, { on: 'true' })).toEqual({ on: false })
  })

  it('does not take a number where a string belongs', () => {
    expect(coerceShape({ color: '#fff' }, { color: 255 })).toEqual({ color: '#fff' })
  })

  it('recurses, and drops keys the default does not have', () => {
    const base = { env: { intensity: 1, mode: 'studio' } }
    expect(coerceShape(base, { env: { intensity: 2, rogue: 9 }, extra: 1 }))
      .toEqual({ env: { intensity: 2, mode: 'studio' } })
  })

  it('treats a null default as a nullable string', () => {
    expect(coerceShape({ url: null }, { url: '/a.png' })).toEqual({ url: '/a.png' })
    expect(coerceShape({ url: null }, { url: null })).toEqual({ url: null })
    expect(coerceShape({ url: null }, { url: 7 })).toEqual({ url: null })
  })

  it('takes an array of the same length and element types', () => {
    expect(coerceShape([0, 0, 0], [1, 2, 3])).toEqual([1, 2, 3])
  })

  it('refuses an array of the wrong length, which the shaders size to', () => {
    expect(coerceShape([0, 0, 0], [1, 2])).toEqual([0, 0, 0])
    expect(coerceShape([0, 0, 0], [1, 2, 3, 4])).toEqual([0, 0, 0])
  })

  it('refuses an array whose elements are the wrong type', () => {
    expect(coerceShape([0, 0, 0], [1, '2', 3])).toEqual([0, 0, 0])
  })

  it('refuses an object where an array belongs, and the reverse', () => {
    expect(coerceShape([0, 0, 0], { 0: 1, 1: 2, 2: 3 })).toEqual([0, 0, 0])
    expect(coerceShape({ a: 1 }, [1])).toEqual({ a: 1 })
  })
})

/* ------------------------------------------------------------------ */

const base = {
  device: 'iphone-18-pro-max' as const,
  variant: 'Black',
  frame: DEFAULT_FRAME,
  stage: DEFAULT_STAGE,
  lighting: DEFAULT_LIGHTING,
  transform: DEFAULT_TRANSFORM,
  background: DEFAULT_BACKGROUND,
  screen: DEFAULT_SCREEN,
}

/**
 * A project file is a boundary: it can come from another version, another
 * person, or a hand-edited file. Both measured failures below put the app in a
 * state a reload could not recover from, because it persists.
 */
describe('sanitiseProject', () => {
  it('falls back when the device is not one we have', () => {
    expect(sanitiseProject({ device: 'Nokia 3310' }, base).device).toBe(base.device)
  })

  it('keeps a device we do have', () => {
    expect(sanitiseProject({ device: 'iphone-18-pro' }, base).device).toBe('iphone-18-pro')
  })

  it('lifts a collapsed frame to the smallest one that can render', () => {
    const { frame } = sanitiseProject({ frame: { width: 0, height: 0 } }, base)
    expect(frame.width).toBe(FRAME_LIMITS.min)
    expect(frame.height).toBe(FRAME_LIMITS.min)
  })

  it('holds a frame to the size the encoder can take', () => {
    const { frame } = sanitiseProject({ frame: { width: 100000, height: 100000 } }, base)
    expect(frame.width).toBe(FRAME_LIMITS.max)
    expect(frame.height).toBe(FRAME_LIMITS.max)
  })

  it('rounds a fractional frame, since pixels are whole', () => {
    expect(sanitiseProject({ frame: { width: 1920.6 } }, base).frame.width).toBe(1921)
  })

  it('rejects a bad value deep in the lighting rig', () => {
    const out = sanitiseProject({ lighting: { lights: { key: { intensity: 'bright' } } } }, base)
    expect(out.lighting.lights.key.intensity).toBe(DEFAULT_LIGHTING.lights.key.intensity)
  })

  it('takes a good value deep in the lighting rig', () => {
    const out = sanitiseProject({ lighting: { lights: { key: { intensity: 2.5 } } } }, base)
    expect(out.lighting.lights.key.intensity).toBe(2.5)
  })

  it('returns the defaults for anything that is not an object', () => {
    for (const junk of [null, 'nope', 42, [], undefined]) {
      expect(sanitiseProject(junk, base)).toEqual(base)
    }
  })

  it('leaves a project it wrote itself untouched', () => {
    expect(sanitiseProject(JSON.parse(JSON.stringify(base)), base)).toEqual(base)
  })
})

import { describe, expect, it } from 'vitest'
import { fingerprint, projectColumns } from './projectRow'
import { DEFAULT_COMPOSITION } from '../engine/types'
import type { Project } from './store'

const project = (over: Partial<Project> = {}): Project => ({
  device: 'iphone-18-pro-max',
  variant: 'Black',
  frame: { width: 1920, height: 1080, radius: 0 },
  stage: { fov: 28, distance: 3.1 },
  lighting: {} as Project['lighting'],
  transform: {} as Project['transform'],
  background: {} as Project['background'],
  screen: {} as Project['screen'],
  composition: DEFAULT_COMPOSITION,
  presets: [],
  ...over,
})

const withKeys = (duration: number, times: number[]) => ({
  ...DEFAULT_COMPOSITION,
  duration,
  tracks: {
    position: {
      id: 'position' as const,
      enabled: true,
      keys: times.map((t, i) => ({ id: `k${i}`, time: t, ease: 'none' as const, value: { x: 0, y: 0, z: 0 } })),
    },
  },
})

/**
 * The columns lifted out of the document so a list of projects can be drawn
 * without reading every document in it.
 */
describe('projectColumns', () => {
  it('carries the device, so a card can show the model', () => {
    expect(projectColumns(project()).device).toBe('iphone-18-pro-max')
  })

  it('takes an explicit clip length over the keys', () => {
    expect(projectColumns(project({ composition: withKeys(9, [0, 2]) })).duration_seconds).toBe(9)
  })

  it('falls back to where the animation ends when no length was set', () => {
    expect(projectColumns(project({ composition: withKeys(0, [0, 2.5]) })).duration_seconds).toBe(2.5)
  })

  it('is zero for a project with no animation at all', () => {
    expect(projectColumns(project()).duration_seconds).toBe(0)
  })

  it('carries the schema version, so a reader knows what it is holding', () => {
    expect(projectColumns(project()).schema_version).toBe(DEFAULT_COMPOSITION.schemaVersion)
  })
})

/**
 * Whether anything actually changed.
 *
 * An autosave that fires on every render is a write amplifier and a history of
 * identical versions, so the sync compares before it sends.
 */
describe('fingerprint', () => {
  it('does not care what order the keys came in', () => {
    // Two code paths can build the same project object differently; a save
    // triggered by key order would be a save triggered by nothing.
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }))
  })

  it('changes when a leaf changes, however deep', () => {
    const a = { one: { two: { three: [1, 2, 3] } } }
    const b = { one: { two: { three: [1, 2, 4] } } }
    expect(fingerprint(a)).not.toBe(fingerprint(b))
  })

  it('keeps array order, because order is meaning there', () => {
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]))
  })

  it('tells apart values that stringify alike', () => {
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: '1' }))
    expect(fingerprint(null)).not.toBe(fingerprint('null'))
  })

  it('is stable across calls', () => {
    const v = { z: [1, { y: 2 }], a: null }
    expect(fingerprint(v)).toBe(fingerprint(v))
  })
})

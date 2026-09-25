import { describe, expect, it } from 'vitest'
import { describeChanges } from './changes'
import {
  DEFAULT_BACKGROUND, DEFAULT_COMPOSITION, DEFAULT_LIGHTING, DEFAULT_SCREEN,
  DEFAULT_STAGE, DEFAULT_TRANSFORM, type Track, type TrackKey,
} from '../engine/types'
import type { Project } from './store'

const base = (): Project => ({
  device: 'iphone-18-pro-max',
  variant: 'Black',
  frame: { width: 1920, height: 1080, radius: 0 },
  stage: { ...DEFAULT_STAGE },
  lighting: structuredClone(DEFAULT_LIGHTING),
  transform: { ...DEFAULT_TRANSFORM },
  background: structuredClone(DEFAULT_BACKGROUND),
  screen: { ...DEFAULT_SCREEN },
  composition: structuredClone(DEFAULT_COMPOSITION),
  presets: [],
})

const key = (id: string, time: number): TrackKey =>
  ({ id, time, ease: 'none', value: { x: 0, y: 0, z: 0 } })
const track = (id: string, keys: TrackKey[]): Track =>
  ({ id: id as Track['id'], enabled: true, keys })

const details = (a: Project, b: Project) => describeChanges(a, b).changes.map((c) => c.detail)

/**
 * What changed between two saved versions, in the words the undo stack
 * already uses — "Pose device", "Change lighting", "Move keyframes". The
 * history panel and the undo tooltip should not describe the same edit two
 * different ways.
 */
describe('describeChanges', () => {
  it('says nothing changed when nothing did', () => {
    const s = describeChanges(base(), base())
    expect(s.changes).toEqual([])
    expect(s.headline).toBe('No changes')
  })

  it('names the device and the colourway', () => {
    const after = { ...base(), device: 'iphone-18-pro' as const, variant: 'Silver' }
    expect(details(base(), after)).toEqual([
      'iPhone 18 Pro Max → iPhone 18 Pro',
      'Black → Silver',
    ])
  })

  it('gives the frame its numbers', () => {
    const after = { ...base(), frame: { width: 1080, height: 1350, radius: 0 } }
    expect(details(base(), after)).toEqual(['1920 × 1080 → 1080 × 1350'])
  })

  it('separates moving, rotating and scaling', () => {
    const b = base()
    expect(details(b, { ...b, transform: { ...b.transform, posX: 1.5 } })).toEqual(['Moved'])
    expect(details(b, { ...b, transform: { ...b.transform, rotY: 45 } })).toEqual(['Rotated'])
    expect(details(b, { ...b, transform: { ...b.transform, scale: 1.4 } })).toEqual(['Scaled'])
  })

  it('reports one pose change when all three moved together', () => {
    const b = base()
    const after = { ...b, transform: { ...b.transform, posX: 1, rotY: 45, scale: 2 } }
    expect(details(b, after)).toEqual(['Moved, rotated and scaled'])
  })

  it('counts keyframes added and removed', () => {
    const b = base()
    const one = { ...b, composition: { ...b.composition, tracks: { position: track('position', [key('a', 0)]) } } }
    const three = { ...b, composition: { ...b.composition, tracks: { position: track('position', [key('a', 0), key('b', 1), key('c', 2)]) } } }
    expect(details(one, three)).toEqual(['2 keyframes added'])
    expect(details(three, one)).toEqual(['2 keyframes removed'])
  })

  it('names a property that started or stopped animating', () => {
    const b = base()
    const withTrack = { ...b, composition: { ...b.composition, tracks: { rotation: track('rotation', [key('a', 0)]) } } }
    expect(details(b, withTrack)).toEqual(['Rotation animated', '1 keyframe added'])
    expect(details(withTrack, b)).toEqual(['Rotation no longer animated', '1 keyframe removed'])
  })

  it('reports the clip length', () => {
    const b = base()
    const after = { ...b, composition: { ...b.composition, duration: 6 } }
    expect(details(b, after)).toEqual(['Clip 0s → 6s'])
  })

  it('notices the screen and the background changing', () => {
    const b = base()
    const screen = { ...b, screen: { ...b.screen, name: 'pura-home.png', assetId: 'a1' } }
    expect(details(b, screen)).toEqual(['Screen content → pura-home.png'])
    const bg = { ...b, background: { ...b.background, kind: 'colour' as never } }
    expect(details(b, bg)).toEqual(['Background mesh → colour'])
  })

  it('notices lighting without listing every dial', () => {
    const b = base()
    const after = structuredClone(b)
    after.lighting.lights.key.intensity = 3
    after.lighting.environment.mode = 'hdri'
    expect(details(b, after)).toEqual(['Environment studio → hdri', 'Key light adjusted'])
  })

  it('counts saved angles', () => {
    const b = base()
    const after = { ...b, presets: [{ id: 'p1', name: 'Hero', description: '', value: {}, tracks: [] } as never] }
    expect(details(b, after)).toEqual(['1 angle saved'])
  })

  it('writes a headline from the first changes, and counts the rest', () => {
    const b = base()
    const after = {
      ...b,
      device: 'iphone-18-pro' as const,
      variant: 'Silver',
      frame: { width: 1080, height: 1350, radius: 0 },
      transform: { ...b.transform, rotY: 45 },
    }
    const s = describeChanges(b, after)
    expect(s.changes).toHaveLength(4)
    expect(s.headline).toBe('iPhone 18 Pro Max → iPhone 18 Pro, Black → Silver and 2 more')
  })

  it('reads a single change as itself, with no tail', () => {
    const b = base()
    expect(describeChanges(b, { ...b, variant: 'Plum' }).headline).toBe('Black → Plum')
  })

  it('ignores a resolved asset URL, which nobody edited', () => {
    // Opening a project swaps signed URLs in. That is not a change anyone made
    // and must not fill the history with noise.
    const b = base()
    const after = { ...b, screen: { ...b.screen, url: 'https://signed/other' } }
    expect(details(b, after)).toEqual([])
  })
})

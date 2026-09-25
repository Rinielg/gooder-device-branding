import { describe, expect, it } from 'vitest'
import {
  ASSET_SLOTS, extensionFor, pendingAssets, slotFor, storagePath, stripRuntimeUrls, unsavedUploads,
} from './assets'
import {
  DEFAULT_BACKGROUND, DEFAULT_COMPOSITION, DEFAULT_LIGHTING, DEFAULT_SCREEN,
} from '../engine/types'
import type { Project } from './store'

const project = (over: Partial<Project> = {}): Project => ({
  device: 'iphone-18-pro-max',
  variant: 'Black',
  frame: { width: 1920, height: 1080, radius: 0 },
  stage: { fov: 28, distance: 3.1 },
  lighting: DEFAULT_LIGHTING,
  transform: {} as Project['transform'],
  background: DEFAULT_BACKGROUND,
  screen: DEFAULT_SCREEN,
  composition: DEFAULT_COMPOSITION,
  presets: [],
  ...over,
})

describe('the slot registry', () => {
  it('covers every place a document can point at an uploaded file', () => {
    expect(ASSET_SLOTS.map((s) => s.key).sort()).toEqual([
      'background.image', 'background.mesh', 'background.video',
      'environment.hdri', 'screen',
    ])
  })

  it('gives each slot a kind the assets table knows', () => {
    expect(ASSET_SLOTS.map((s) => s.kind).sort()).toEqual([
      'background_image', 'background_video', 'hdri', 'lottie', 'screen_image',
    ])
  })

  it('finds a slot by key, and refuses one it does not have', () => {
    expect(slotFor('screen')?.kind).toBe('screen_image')
    expect(slotFor('nonsense')).toBeUndefined()
  })

  it('patches the id, the url and the name together', () => {
    // They travel as one: an id without a url cannot be drawn, and a url
    // without an id cannot survive a reload.
    const patch = slotFor('screen')!.patch('a1', 'https://signed', 'hero.png')
    expect(patch.screen).toMatchObject({ assetId: 'a1', url: 'https://signed', name: 'hero.png' })
  })
})

/**
 * What has to be resolved on load, and what will not survive one.
 */
describe('pendingAssets', () => {
  it('is empty for a project that uses only shipped files', () => {
    expect(pendingAssets(project())).toEqual([])
  })

  it('names the slots carrying an id', () => {
    const p = project({
      screen: { ...DEFAULT_SCREEN, assetId: 'sc1' },
      background: { ...DEFAULT_BACKGROUND, imageAssetId: 'bg1' },
    })
    expect(pendingAssets(p).map((s) => [s.slot.key, s.id]))
      .toEqual([['screen', 'sc1'], ['background.image', 'bg1']])
  })
})

describe('unsavedUploads', () => {
  it('finds work that will be lost, and only that', () => {
    // A blob: URL dies with the page. With an id behind it, it does not.
    const p = project({
      screen: { ...DEFAULT_SCREEN, url: 'blob:x', assetId: null },
      background: { ...DEFAULT_BACKGROUND, imageUrl: 'blob:y', imageAssetId: 'saved' },
    })
    expect(unsavedUploads(p).map((s) => s.key)).toEqual(['screen'])
  })

  it('does not count a shipped file as unsaved', () => {
    expect(unsavedUploads(project())).toEqual([])
  })
})

describe('storagePath', () => {
  it('puts the owner first, which is what the storage policy compares', () => {
    expect(storagePath('user-1', 'asset-2', 'image/png')).toBe('user-1/asset-2.png')
  })

  it('knows the types this editor actually takes', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('image/webp')).toBe('webp')
    expect(extensionFor('video/mp4')).toBe('mp4')
    expect(extensionFor('video/webm')).toBe('webm')
    expect(extensionFor('application/json')).toBe('json')
    expect(extensionFor('image/vnd.radiance')).toBe('hdr')
  })

  it('falls back to something harmless for a type it does not know', () => {
    // The extension is a convenience; the row carries the real mime type.
    expect(extensionFor('application/x-made-up')).toBe('bin')
    expect(storagePath('u', 'a', '')).toBe('u/a.bin')
  })
})

describe('a slot that takes more than one kind', () => {
  it('lets the decision pick the kind, not the file', () => {
    const screen = slotFor('screen')!
    expect(screen.kindOf!(true)).toBe('screen_video')
    expect(screen.kindOf!(false)).toBe('screen_image')
  })

  it('is the only slot that needs to choose', () => {
    expect(ASSET_SLOTS.filter((s) => s.kindOf).map((s) => s.key)).toEqual(['screen'])
  })
})

/**
 * What gets written into a saved project.
 *
 * Measured the hard way: a signed URL persisted into the document was still
 * there on the next boot, hours later, expired. The screen texture failed, the
 * boot sequence aborted at `setScreen`, and the app sat on "Loading model…"
 * for ever. The id is durable; the URL is not, and it does not belong in a
 * document that outlives it.
 */
describe('stripRuntimeUrls', () => {
  it('drops the url from a slot that has an id to resolve', () => {
    const p = project({
      screen: { ...DEFAULT_SCREEN, assetId: 'a1', url: 'https://signed/expires' },
    })
    const out = stripRuntimeUrls(p)
    expect(out.screen.assetId).toBe('a1')
    expect(out.screen.url).toBe(DEFAULT_SCREEN.url)
  })

  it('nulls a nullable one rather than defaulting it', () => {
    const p = project({
      background: { ...DEFAULT_BACKGROUND, imageAssetId: 'b1', imageUrl: 'https://signed' },
    })
    expect(stripRuntimeUrls(p).background.imageUrl).toBeNull()
  })

  it('leaves a shipped file alone, because it has no id and does not expire', () => {
    const out = stripRuntimeUrls(project())
    expect(out.screen.url).toBe(DEFAULT_SCREEN.url)
    expect(out.background.meshUrl).toBe(DEFAULT_BACKGROUND.meshUrl)
  })

  it('leaves an upload that never reached an account alone', () => {
    // It will not survive the reload either way, but blanking it would lose
    // the picture in this session as well.
    const p = project({ screen: { ...DEFAULT_SCREEN, url: 'blob:local', assetId: null } })
    expect(stripRuntimeUrls(p).screen.url).toBe('blob:local')
  })

  it('does not touch the original', () => {
    const p = project({ screen: { ...DEFAULT_SCREEN, assetId: 'a1', url: 'https://signed' } })
    stripRuntimeUrls(p)
    expect(p.screen.url).toBe('https://signed')
  })
})

import { DEFAULT_BACKGROUND, DEFAULT_SCREEN } from '../engine/types'
import type { DeepPartial, Project } from './store'
import type { Database } from './database.types'

export type AssetKind = Database['public']['Enums']['asset_kind']

/**
 * One place a document can point at an uploaded file.
 *
 * A registry rather than five hand-written cases, for the reason `tracks.ts`
 * is one: upload, resolve-on-load and warn-if-unsaved all have to agree about
 * the same set, and three lists that must agree is two lists that will not.
 */
export interface AssetSlot {
  /** Stable, and used as a key in the resolve map. */
  key: string
  kind: AssetKind
  label: string
  /** True when this slot's file is decoded rather than displayed. */
  video?: boolean
  /**
   * When one slot takes more than one kind of file, which one this is.
   *
   * It takes the decision rather than the file, because the screen's two
   * buttons are the decision — the file's own type is a second opinion.
   */
  kindOf?(isVideo: boolean): AssetKind
  idOf(p: Project): string | null
  urlOf(p: Project): string | null
  /**
   * What the url should be in a saved document — the shipped default, or null
   * where the field allows it. Never a signed URL: those expire, and one that
   * expired between sessions used to take the whole boot down with it.
   */
  restingUrl: string | null
  /**
   * The patch that puts a file in this slot.
   *
   * Id, url and name travel together: an id with no url cannot be drawn, and a
   * url with no id cannot survive a reload.
   */
  patch(id: string | null, url: string | null, name?: string): DeepPartial<Project>
}

export const ASSET_SLOTS: AssetSlot[] = [
  {
    key: 'screen',
    restingUrl: DEFAULT_SCREEN.url,
    // The screen takes either, and `screen.kind` says which. The row's kind is
    // set from the file when it is uploaded, not from here.
    kind: 'screen_image',
    label: 'Screen content',
    kindOf: (isVideo) => (isVideo ? 'screen_video' : 'screen_image'),
    idOf: (p) => p.screen.assetId,
    urlOf: (p) => p.screen.url,
    patch: (assetId, url, name) => ({
      screen: { assetId, ...(url ? { url } : {}), ...(name ? { name } : {}), followVariant: false },
    }),
  },
  {
    key: 'background.image',
    restingUrl: null,
    kind: 'background_image',
    label: 'Background image',
    idOf: (p) => p.background.imageAssetId,
    urlOf: (p) => p.background.imageUrl,
    patch: (imageAssetId, imageUrl, imageName) => ({
      background: { imageAssetId, imageUrl, ...(imageName ? { imageName } : {}) },
    }),
  },
  {
    key: 'background.video',
    restingUrl: null,
    kind: 'background_video',
    label: 'Background video',
    video: true,
    idOf: (p) => p.background.videoAssetId,
    urlOf: (p) => p.background.videoUrl,
    patch: (videoAssetId, videoUrl, videoName) => ({
      background: { videoAssetId, videoUrl, ...(videoName ? { videoName } : {}) },
    }),
  },
  {
    key: 'background.mesh',
    restingUrl: DEFAULT_BACKGROUND.meshUrl,
    kind: 'lottie',
    label: 'Mesh gradient',
    idOf: (p) => p.background.meshAssetId,
    urlOf: (p) => p.background.meshUrl,
    patch: (meshAssetId, meshUrl, meshName) => ({
      background: { meshAssetId, ...(meshUrl ? { meshUrl } : {}), ...(meshName ? { meshName } : {}) },
    }),
  },
  {
    key: 'environment.hdri',
    restingUrl: null,
    kind: 'hdri',
    label: 'HDRI',
    idOf: (p) => p.lighting.environment.hdriAssetId,
    urlOf: (p) => p.lighting.environment.hdriUrl,
    patch: (hdriAssetId, hdriUrl, hdriName) => ({
      lighting: { environment: { hdriAssetId, hdriUrl, ...(hdriName ? { hdriName } : {}) } },
    }),
  },
]

export const slotFor = (key: string) => ASSET_SLOTS.find((s) => s.key === key)

/** The slots holding a durable id, which a signed URL has to be fetched for. */
export function pendingAssets(p: Project): { slot: AssetSlot; id: string }[] {
  const out: { slot: AssetSlot; id: string }[] = []
  for (const slot of ASSET_SLOTS) {
    const id = slot.idOf(p)
    if (id) out.push({ slot, id })
  }
  return out
}

/**
 * Uploads that will not survive a reload.
 *
 * A `blob:` URL dies with the page. One with an id behind it does not, and a
 * file this app ships was never at risk.
 */
export function unsavedUploads(p: Project): AssetSlot[] {
  return ASSET_SLOTS.filter((s) => !s.idOf(p) && (s.urlOf(p) ?? '').startsWith('blob:'))
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'application/json': 'json',
  'image/vnd.radiance': 'hdr',
}

/** The extension is a convenience; the row carries the real type. */
export const extensionFor = (mime: string) => EXTENSIONS[mime] ?? 'bin'

/**
 * Where a file goes in the bucket.
 *
 * The owner's id is the first segment because that is exactly what the storage
 * policy compares — a string comparison rather than a join.
 */
export const storagePath = (userId: string, assetId: string, mime: string) =>
  `${userId}/${assetId}.${extensionFor(mime)}`

/**
 * A document fit to be saved.
 *
 * A resolved URL is a runtime value that outlives nothing: signed links expire
 * and object URLs die with the page. Writing one into a saved project means
 * the next session loads a dead link — which, when it was the screen texture,
 * took the whole boot sequence down with it.
 *
 * Slots with no id keep whatever they have: a shipped path is durable, and a
 * blob URL is at least still the picture on screen in this session.
 */
export function stripRuntimeUrls(p: Project): Project {
  let out = p
  for (const slot of ASSET_SLOTS) {
    if (!slot.idOf(p)) continue
    out = mergeInto(out, slot.patch(slot.idOf(p), slot.restingUrl, undefined))
  }
  return out
}

/** A shallow-per-slice merge, which is all the patches above ever need. */
function mergeInto(p: Project, patch: DeepPartial<Project>): Project {
  const next: Project = { ...p }
  if (patch.screen) next.screen = { ...p.screen, ...patch.screen } as Project['screen']
  if (patch.background) next.background = { ...p.background, ...patch.background } as Project['background']
  if (patch.lighting?.environment) {
    next.lighting = {
      ...p.lighting,
      environment: { ...p.lighting.environment, ...patch.lighting.environment },
    } as Project['lighting']
  }
  return next
}

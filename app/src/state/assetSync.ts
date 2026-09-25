import { supabase } from './supabase'
import { useCloud, markSynced } from './cloud'
import { useStore, type DeepPartial, type Project } from './store'
import { ASSET_SLOTS, pendingAssets, slotFor, storagePath, type AssetSlot } from './assets'
import type { BackgroundState, LightingState, ScreenState } from '../engine/types'

/** Long enough for a working session; the document holds the id, not this. */
const SIGNED_URL_SECONDS = 60 * 60 * 8

/** Route a slot's patch to the setter that owns that part of the state. */
function applyPatch(patch: DeepPartial<Project>, blob: Blob | null | undefined) {
  const s = useStore.getState()
  if (patch.screen) s.setScreen(patch.screen as Partial<ScreenState>, blob)
  if (patch.background) s.setBackground(patch.background as Partial<BackgroundState>, blob)
  if (patch.lighting) s.setLighting(patch.lighting as DeepPartial<LightingState>)
}

/** The blob the exporter will need, or null to clear a stale one. */
function blobFor(slot: AssetSlot, file: Blob | null, isVideo: boolean) {
  if (slot.video) return file
  // Switching the screen from a video to an image has to drop the old blob,
  // or the exporter decodes a video nobody can see any more.
  if (slot.key === 'screen') return isVideo ? file : null
  return undefined
}

/**
 * Put a file in a slot.
 *
 * Locally always, so it shows immediately whether or not there is an account
 * behind it, and in the account when there is one. The upload does not block
 * the picture: the object URL is applied first and the id lands after.
 */
export async function attach(
  slotKey: string,
  file: File,
  opts: { kind?: 'image' | 'video' } = {},
): Promise<void> {
  const slot = slotFor(slotKey)
  if (!slot) return

  const store = useStore.getState()
  const previous = slot.urlOf(store as unknown as Project)
  if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous)

  // The screen's two buttons say which this is; everywhere else the file does.
  const isVideo = opts.kind ? opts.kind === 'video' : file.type.startsWith('video/')
  const objectUrl = URL.createObjectURL(file)

  let patch = slot.patch(null, objectUrl, file.name)
  if (slot.key === 'screen') {
    patch = { screen: { ...patch.screen, kind: isVideo ? 'video' : 'image' } }
  }
  applyPatch(patch, blobFor(slot, file, isVideo))

  const { userId } = useCloud.getState()
  if (!supabase || !userId) return

  try {
    const id = crypto.randomUUID()
    const path = storagePath(userId, id, file.type)

    const up = await supabase.storage.from('assets').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (up.error) throw up.error

    const row = await supabase.from('assets').insert({
      id,
      owner_id: userId,
      kind: slot.kindOf ? slot.kindOf(isVideo) : slot.kind,
      bucket: 'assets',
      storage_path: path,
      original_name: file.name.slice(0, 255),
      mime_type: file.type || 'application/octet-stream',
      byte_size: file.size,
    }).select('id').single()
    if (row.error) {
      // Leaving the object behind would be a file nothing points at, which is
      // a bucket that grows and a bill nobody can explain.
      await supabase.storage.from('assets').remove([path])
      throw row.error
    }

    // The object URL still works and is faster than a signed one; only the id
    // needs recording, so the file survives the next reload.
    //
    // Deliberately NOT marked as synced: the id is the edit that matters, and
    // suppressing its save is how an upload ends up in the bucket and nowhere
    // in the project that points at it.
    applyPatch(slot.patch(id, null, undefined), undefined)
  } catch (e) {
    useStore.getState().setError(
      `${file.name} is on screen but not saved to your account — ${(e as Error).message}`,
    )
  }
}

/**
 * Turn the ids a document carries back into something the renderer can load.
 *
 * Run after opening a project. Nothing here counts as an edit: the URLs are
 * runtime values, and treating them as changes would save a signed URL back
 * into the row and burn a revision every time a project was opened.
 */
export async function resolveAssets(): Promise<void> {
  const client = supabase
  if (!client) return
  const project = useStore.getState().exportProject()
  const pending = pendingAssets(project)
  if (pending.length === 0) return

  const { data: rows, error } = await client
    .from('assets')
    .select('id,bucket,storage_path,mime_type')
    .in('id', pending.map((p) => p.id))

  if (error || !rows) return
  const byId = new Map(rows.map((r) => [r.id, r]))

  await Promise.all(pending.map(async ({ slot, id }) => {
    const row = byId.get(id)
    if (!row) {
      // The row is gone — deleted, or belonging to somebody else. Say so once
      // rather than rendering a hole and leaving it to be discovered.
      useStore.getState().setError(`${slot.label} could not be found in your files.`)
      return
    }

    const signed = await client.storage
      .from(row.bucket)
      .createSignedUrl(row.storage_path, SIGNED_URL_SECONDS)
    if (signed.error || !signed.data) return

    // Export decodes a video from its bytes, never by scrubbing an element, so
    // a reopened project needs the file itself and not only a URL for it.
    let blob: Blob | null | undefined = undefined
    if (slot.video || (slot.key === 'screen' && row.mime_type.startsWith('video/'))) {
      try { blob = await (await fetch(signed.data.signedUrl)).blob() } catch { blob = undefined }
    }

    useStore.getState().silently(() => {
      applyPatch(slot.patch(id, signed.data.signedUrl, undefined), blob)
    })
  }))

  // The document now holds fresh URLs. That is not an edit anybody made.
  markSynced()
}

/** Slots whose file is still only in this browser. Used to warn before it is lost. */
export function unsavedSlots(): AssetSlot[] {
  const project = useStore.getState().exportProject()
  return ASSET_SLOTS.filter((s) => !s.idOf(project) && (s.urlOf(project) ?? '').startsWith('blob:'))
}

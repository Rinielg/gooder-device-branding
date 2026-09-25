import { create } from 'zustand'
import { supabase } from './supabase'
import { useStore, type Project } from './store'
import { fingerprint, projectColumns } from './projectRow'
import { stripRuntimeUrls } from './assets'
import { describeChanges, type Change } from './changes'
import { DEFAULT_COMPOSITION } from '../engine/types'
import type { Json } from './database.types'

/** Where the binding is remembered, so a reload reopens what you were editing. */
const BOUND_KEY = 'gooder-device-branding.cloud'

/** How long after the last edit an autosave goes out. */
const AUTOSAVE_MS = 2500

/**
 * How often a save also appends to the history.
 *
 * Every save would give a row per keystroke; only on demand would give a
 * history with holes in it. A minute is roughly one entry per train of
 * thought, which is what the panel is for.
 */
const VERSION_MS = 60_000

export interface VersionRow {
  id: string
  created_at: string
  label: string | null
  summary: string | null
  changes: Change[]
  is_autosave: boolean
}

export interface ProjectSummary {
  id: string
  name: string
  status: 'draft' | 'active' | 'archived'
  device: string | null
  updated_at: string
  revision: number
}

export type SyncStatus = 'offline' | 'idle' | 'saving' | 'saved' | 'conflict' | 'error'

interface CloudState {
  /** False until the first auth check has come back. */
  ready: boolean
  userId: string | null
  email: string | null

  projects: ProjectSummary[]
  listing: boolean

  /** The row this editor is bound to. Null means the project is local only. */
  boundId: string | null
  boundName: string | null
  /** The revision last read. Every save carries it; a mismatch is a conflict. */
  revision: number

  status: SyncStatus
  message: string | null

  /** History for the bound project, newest first. */
  versions: VersionRow[]
  loadingVersions: boolean

  init(): void
  sendLink(email: string): Promise<boolean>
  signOut(): Promise<void>
  refresh(): Promise<void>
  open(id: string): Promise<void>
  saveAs(name: string): Promise<void>
  /** Start a fresh project from the defaults, and bind to it. */
  newProject(name: string): Promise<void>
  loadVersions(): Promise<void>
  /** Put an earlier version back on screen, and save it as the newest one. */
  restoreVersion(id: string): Promise<void>
  saveNow(opts?: { force?: boolean; label?: string }): Promise<void>
  rename(id: string, name: string): Promise<void>
  remove(id: string): Promise<void>
  unbind(): void
  snapshot(label: string): Promise<void>
}

const readBound = (): { id: string; revision: number } | null => {
  try {
    const raw = localStorage.getItem(BOUND_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    return typeof v?.id === 'string' ? { id: v.id, revision: Number(v.revision) || 1 } : null
  } catch {
    return null
  }
}

const writeBound = (id: string | null, revision: number) => {
  try {
    if (id) localStorage.setItem(BOUND_KEY, JSON.stringify({ id, revision }))
    else localStorage.removeItem(BOUND_KEY)
  } catch { /* blocked, or full */ }
}

/** The last document sent, so an autosave can tell changed from re-rendered. */
let lastSent: string | null = null
/**
 * And the document itself, so a save can say what it changed.
 *
 * Kept rather than re-read from the row: describing a change needs both sides,
 * and the side being replaced is the one already in this tab's hands.
 */
let lastDocument: Project | null = null
/**
 * The document as of the last history entry — which is not the same as the
 * last save.
 *
 * Saves happen every couple of seconds and versions about once a minute, so
 * diffing a version against the previous *save* describes only the last few
 * seconds of work and silently drops everything the throttle skipped over.
 * Measured: a version that followed a device swap, a reframe and two keyframes
 * read "Rotated", because rotating was all that happened since the save
 * before it.
 */
let lastVersionDocument: Project | null = null
/** When this tab last appended to the history. */
let lastVersionAt = 0

/**
 * Treat the document as already saved.
 *
 * Resolving an asset id into a signed URL changes the document without anybody
 * editing anything. Without this each open would save the fresh URLs straight
 * back and burn a revision for nothing.
 */
export function markSynced() {
  lastDocument = stripRuntimeUrls(useStore.getState().exportProject())
  // The history baseline moves too: after opening a project, the next version
  // should describe what changed since it opened, not since some other one.
  lastVersionDocument = lastDocument
  lastSent = fingerprint(lastDocument)
}
let timer: ReturnType<typeof setTimeout> | undefined

export const useCloud = create<CloudState>((set, get) => ({
  ready: !supabase,
  userId: null,
  email: null,
  projects: [],
  listing: false,
  boundId: null,
  boundName: null,
  revision: 1,
  status: supabase ? 'idle' : 'offline',
  message: null,
  versions: [],
  loadingVersions: false,

  init: () => {
    if (!supabase) return

    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      const wasSignedIn = get().userId !== null
      set({ ready: true, userId: user?.id ?? null, email: user?.email ?? null })

      if (!user) {
        // Signing out leaves the work on screen and in localStorage. Wiping it
        // would be a surprising amount of destruction for a menu item.
        get().unbind()
        set({ projects: [] })
        return
      }

      void get().refresh()
      // Only follow the remembered binding on the first sign-in of a session,
      // or a token refresh would reload the project out from under an edit.
      if (!wasSignedIn) {
        const bound = readBound()
        if (bound) void get().open(bound.id)
      }
    })

    // A tab opened with no session still has to stop saying "checking".
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) set({ ready: true })
    })
  },

  sendLink: async (email) => {
    if (!supabase) return false
    set({ message: null })
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      set({ message: error.message, status: 'error' })
      return false
    }
    set({ message: `Check ${email} for a sign-in link.` })
    return true
  },

  signOut: async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  },

  refresh: async () => {
    if (!supabase || !get().userId) return
    set({ listing: true })
    const { data, error } = await supabase
      .from('projects')
      .select('id,name,status,device,updated_at,revision')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(100)
    set({
      listing: false,
      projects: (data ?? []) as ProjectSummary[],
      message: error ? error.message : get().message,
    })
  },

  open: async (id) => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('projects')
      .select('id,name,document,revision')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) {
      set({ status: 'error', message: error?.message ?? 'That project could not be opened.' })
      return
    }

    // A row is not safer than a file: it was written by some version of this
    // app, and possibly not this one. `importProject` is the validated door.
    useStore.getState().importProject(data.document as unknown as Project)
    markSynced()
    writeBound(data.id, data.revision)
    set({
      boundId: data.id, boundName: data.name, revision: data.revision,
      status: 'saved', message: null,
    })
    // Ids in the document are not pictures yet.
    void import('./assetSync').then((m) => m.resolveAssets())
    void get().loadVersions()
  },

  newProject: async (name) => {
    if (!supabase || !get().userId) return
    // A fresh project is the defaults, not a copy of what is on screen —
    // "save this as" is a different action and already exists.
    useStore.getState().importProject({
      composition: structuredClone(DEFAULT_COMPOSITION),
      presets: [],
    } as never)
    get().unbind()
    await get().saveAs(name.trim() || 'Untitled')
  },

  loadVersions: async () => {
    const { boundId } = get()
    if (!supabase || !boundId) { set({ versions: [] }); return }
    set({ loadingVersions: true })
    const { data, error } = await supabase
      .from('project_versions')
      .select('id,created_at,label,summary,changes,is_autosave')
      .eq('project_id', boundId)
      .order('created_at', { ascending: false })
      .limit(60)
    set({
      loadingVersions: false,
      versions: (data ?? []) as unknown as VersionRow[],
      message: error ? error.message : get().message,
    })
  },

  restoreVersion: async (id) => {
    const { boundId } = get()
    if (!supabase || !boundId) return
    const { data, error } = await supabase
      .from('project_versions')
      .select('document,created_at')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) {
      set({ status: 'error', message: error?.message ?? 'That version could not be read.' })
      return
    }

    // Through the validated door, exactly as opening a project does: an old
    // row was written by an older build and is no safer than a file.
    useStore.getState().importProject(data.document as unknown as Project)
    void import('./assetSync').then((m) => m.resolveAssets())

    // Restoring saves forward rather than deleting what came after. Nothing in
    // the history is ever destroyed, which is the only reason it is safe to
    // press — including the restore itself, which can be undone by restoring
    // the version it replaced.
    lastVersionAt = 0
    await get().saveNow({ force: true, label: `Restored the version from ${when(data.created_at)}` })
    await get().loadVersions()
  },

  saveAs: async (name) => {
    if (!supabase || !get().userId) return
    set({ status: 'saving', message: null })
    const document = stripRuntimeUrls(useStore.getState().exportProject())
    const { data, error } = await supabase
      .from('projects')
      .insert({
        owner_id: get().userId!,
        name: name.trim() || 'Untitled',
        document: document as unknown as Json,
        ...projectColumns(document),
      })
      .select('id,name,revision')
      .single()

    if (error || !data) {
      set({ status: 'error', message: error?.message ?? 'Could not create that project.' })
      return
    }
    lastDocument = document
    lastVersionDocument = document
    lastSent = fingerprint(document)
    lastVersionAt = Date.now()
    writeBound(data.id, data.revision)
    set({ boundId: data.id, boundName: data.name, revision: data.revision, status: 'saved', versions: [] })

    // A starting point, so the oldest entry is the project as it was created
    // rather than the first edit after it.
    await supabase.from('project_versions').insert({
      project_id: data.id,
      document: document as unknown as Json,
      schema_version: projectColumns(document).schema_version,
      label: 'Created',
      summary: 'Project created',
      changes: [],
      is_autosave: false,
      created_by: get().userId!,
    })
    void get().refresh()
    void get().loadVersions()
  },

  saveNow: async ({ force, label } = {}) => {
    const { boundId, revision, userId } = get()
    if (!supabase || !userId || !boundId) return

    const document = stripRuntimeUrls(useStore.getState().exportProject())
    const print = fingerprint(document)
    if (!force && print === lastSent) { set({ status: 'saved' }); return }

    set({ status: 'saving' })
    const patch = {
      document: document as unknown as Json,
      revision: revision + 1,
      ...projectColumns(document),
    }

    // The revision predicate is the whole concurrency story: the update only
    // lands if nobody else has saved since this tab read the row. Forcing
    // drops the predicate, which is what "overwrite theirs" means.
    let query = supabase.from('projects').update(patch).eq('id', boundId)
    if (!force) query = query.eq('revision', revision)
    const { data, error } = await query.select('revision')

    if (error) { set({ status: 'error', message: error.message }); return }
    if (!data || data.length === 0) {
      // Zero rows is not an error. Somebody else got there first, and saying so
      // beats overwriting whichever tab the user was not looking at.
      set({ status: 'conflict', message: 'This project changed somewhere else since you opened it.' })
      return
    }

    // Against the last entry in the history, so a version accounts for every
    // edit since the previous one rather than only the most recent save.
    const previous = lastVersionDocument ?? lastDocument
    lastDocument = document
    lastSent = print
    writeBound(boundId, data[0].revision)
    set({ revision: data[0].revision, status: 'saved', message: null })

    // The history is the same edits seen from further away, so it is written
    // from the same save rather than from a second code path that could
    // disagree with it.
    const due = label != null || Date.now() - lastVersionAt > VERSION_MS
    if (due && previous) {
      lastVersionAt = Date.now()
      lastVersionDocument = document
      const described = describeChanges(previous, document)
      await supabase.from('project_versions').insert({
        project_id: boundId,
        document: document as unknown as Json,
        schema_version: projectColumns(document).schema_version,
        label: label ?? null,
        summary: described.headline,
        changes: described.changes as unknown as Json,
        is_autosave: label == null,
        created_by: userId,
      })
      void get().loadVersions()
    }
  },

  snapshot: async (label) => {
    const { boundId, userId } = get()
    if (!supabase || !userId || !boundId) return
    const document = stripRuntimeUrls(useStore.getState().exportProject())
    const baseline = lastVersionDocument ?? lastDocument
    const described = baseline ? describeChanges(baseline, document) : null
    await supabase.from('project_versions').insert({
      project_id: boundId,
      document: document as unknown as Json,
      schema_version: projectColumns(document).schema_version,
      label: label.trim() || null,
      summary: described?.headline ?? 'Saved by hand',
      changes: (described?.changes ?? []) as unknown as Json,
      is_autosave: false,
      created_by: userId,
    })
    lastVersionAt = Date.now()
    lastVersionDocument = document
    set({ message: `Saved a version${label.trim() ? ` — ${label.trim()}` : ''}.` })
    void get().loadVersions()
  },

  rename: async (id, name) => {
    if (!supabase) return
    const { error } = await supabase.from('projects').update({ name: name.trim() || 'Untitled' }).eq('id', id)
    if (error) { set({ status: 'error', message: error.message }); return }
    if (get().boundId === id) set({ boundName: name.trim() || 'Untitled' })
    void get().refresh()
  },

  remove: async (id) => {
    if (!supabase) return
    // Soft delete: the row stays, so this is undoable and a trash view is a
    // query rather than a backup restore.
    const { error } = await supabase
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { set({ status: 'error', message: error.message }); return }
    if (get().boundId === id) get().unbind()
    void get().refresh()
  },

  unbind: () => {
    lastSent = null
    lastDocument = null
    lastVersionDocument = null
    lastVersionAt = 0
    set({ versions: [] })
    writeBound(null, 1)
    set({ boundId: null, boundName: null, revision: 1, status: supabase ? 'idle' : 'offline' })
  },
}))

/**
 * Autosave.
 *
 * Debounced like the local persist, only longer: 400ms is fine for a write to
 * localStorage and rude to a server. A conflict stops the timer rather than
 * retrying, because retrying a conflict is how you overwrite somebody.
 */
export function initCloud() {
  const cloud = useCloud.getState()
  cloud.init()
  if (!supabase) return

  useStore.subscribe(() => {
    const { boundId, userId, status } = useCloud.getState()
    if (!boundId || !userId || status === 'conflict') return
    clearTimeout(timer)
    timer = setTimeout(() => { void useCloud.getState().saveNow() }, AUTOSAVE_MS)
  })
}

/** A timestamp as a person would say it. */
export function when(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleString()
}

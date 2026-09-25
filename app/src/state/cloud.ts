import { create } from 'zustand'
import { supabase } from './supabase'
import { useStore, type Project } from './store'
import { fingerprint, projectColumns } from './projectRow'
import type { Json } from './database.types'

/** Where the binding is remembered, so a reload reopens what you were editing. */
const BOUND_KEY = 'gooder-device-branding.cloud'

/** How long after the last edit an autosave goes out. */
const AUTOSAVE_MS = 2500

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

  init(): void
  sendLink(email: string): Promise<boolean>
  signOut(): Promise<void>
  refresh(): Promise<void>
  open(id: string): Promise<void>
  saveAs(name: string): Promise<void>
  saveNow(opts?: { force?: boolean }): Promise<void>
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
    lastSent = fingerprint(useStore.getState().exportProject())
    writeBound(data.id, data.revision)
    set({
      boundId: data.id, boundName: data.name, revision: data.revision,
      status: 'saved', message: null,
    })
  },

  saveAs: async (name) => {
    if (!supabase || !get().userId) return
    set({ status: 'saving', message: null })
    const document = useStore.getState().exportProject()
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
    lastSent = fingerprint(document)
    writeBound(data.id, data.revision)
    set({ boundId: data.id, boundName: data.name, revision: data.revision, status: 'saved' })
    void get().refresh()
  },

  saveNow: async ({ force } = {}) => {
    const { boundId, revision, userId } = get()
    if (!supabase || !userId || !boundId) return

    const document = useStore.getState().exportProject()
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

    lastSent = print
    writeBound(boundId, data[0].revision)
    set({ revision: data[0].revision, status: 'saved', message: null })
  },

  snapshot: async (label) => {
    const { boundId, userId } = get()
    if (!supabase || !userId || !boundId) return
    const document = useStore.getState().exportProject()
    await supabase.from('project_versions').insert({
      project_id: boundId,
      document: document as unknown as Json,
      schema_version: projectColumns(document).schema_version,
      label: label.trim() || null,
      is_autosave: false,
      created_by: userId,
    })
    set({ message: `Saved a version${label.trim() ? ` — ${label.trim()}` : ''}.` })
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

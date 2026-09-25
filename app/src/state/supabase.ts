import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * The client, or null when this build has not been given a database.
 *
 * Null is a supported state rather than a failure. Without the two variables
 * the editor behaves exactly as it did before any of this existed — one
 * project, in localStorage — which is what keeps a deployed build working
 * while its database is still being set up, and what a first-time visitor
 * gets before they have signed in to anything.
 */
export const supabase: SupabaseClient<Database> | null =
  url && key
    ? createClient<Database>(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null

export const cloudEnabled = supabase !== null

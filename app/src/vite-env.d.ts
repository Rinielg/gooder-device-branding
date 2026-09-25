/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absent in a build with no database; see `state/supabase.ts`. */
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

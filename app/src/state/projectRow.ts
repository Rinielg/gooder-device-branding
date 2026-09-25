import { lastKeyTime } from '../engine/tracks'
import type { Project } from './store'

/**
 * The columns lifted out of the document.
 *
 * The document is one jsonb blob and nothing queries inside it, so a list of
 * projects would otherwise have to read every document to draw a card. These
 * few are duplicated into columns; the document stays the truth.
 */
export interface ProjectColumns {
  device: string
  duration_seconds: number
  schema_version: number
}

export function projectColumns(document: Project): ProjectColumns {
  const c = document.composition
  return {
    device: document.device,
    // An explicit length wins, exactly as it does in the editor.
    duration_seconds: c.duration > 0 ? c.duration : lastKeyTime(c),
    schema_version: c.schemaVersion,
  }
}

/**
 * A stable string for a value, for telling "changed" from "re-rendered".
 *
 * Key order is normalised because two code paths can build the same project
 * with their keys in different orders, and a save triggered by key order is a
 * save triggered by nothing. Array order is kept, because there it is meaning.
 *
 * Types are written into the string as well, so `1` and `'1'` cannot agree.
 */
export function fingerprint(value: unknown): string {
  if (value === null) return 'n'
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${k}:${fingerprint(v)}`).join(',')}}`
  }
  return `${typeof value}:${String(value)}`
}

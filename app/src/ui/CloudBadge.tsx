import { useCloud } from '../state/cloud'
import { cloudEnabled } from '../state/supabase'

/**
 * Whether the work is safe, in the top bar.
 *
 * Autosave that says nothing is autosave you cannot trust — the whole point of
 * it is that you stop thinking about saving, and you only stop thinking about
 * it once you have seen it say so. A conflict is a button, because it is the
 * one state that needs a decision.
 */
export function CloudBadge({ onOpen }: { onOpen: () => void }) {
  const email = useCloud((s) => s.email)
  const boundId = useCloud((s) => s.boundId)
  const boundName = useCloud((s) => s.boundName)
  const status = useCloud((s) => s.status)

  if (!cloudEnabled || !email) return null

  const text = !boundId ? 'Local only'
    : status === 'saving' ? 'Saving…'
    : status === 'conflict' ? 'Changed elsewhere'
    : status === 'error' ? 'Not saved'
    : boundName ?? 'Saved'

  return (
    <button
      type="button" className={`cloud-badge ${status}`} onClick={onOpen}
      title={boundId ? 'Open the projects panel' : 'This project is not in your account yet'}
    >
      <i aria-hidden />
      {text}
    </button>
  )
}

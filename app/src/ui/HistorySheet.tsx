import { useEffect, useState } from 'react'
import { useCloud, when } from '../state/cloud'
import type { Change } from '../state/changes'

/**
 * Everything this project has been.
 *
 * Built on the undo stack's vocabulary on purpose: the same edit should not be
 * called one thing in a tooltip and another here. This is that history seen
 * from further away — fifty entries either way, one kept per minute of work
 * rather than one per keystroke.
 *
 * Restoring is not destructive. It puts an old document back on screen and
 * saves it as the newest version, so the thing you restored *from* is still
 * there to go back to. That is the only reason the button is safe to press.
 */
export function HistorySheet({ onClose }: { onClose: () => void }) {
  const versions = useCloud((s) => s.versions)
  const loading = useCloud((s) => s.loadingVersions)
  const boundName = useCloud((s) => s.boundName)
  const boundId = useCloud((s) => s.boundId)

  const [open, setOpen] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => { void useCloud.getState().loadVersions() }, [])

  return (
    <div className="sheet-scrim" onPointerDown={onClose}>
      <div
        className="sheet" role="dialog" aria-modal="true" aria-label="History"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="sheet-search">
          <strong style={{ flex: 1, fontSize: 14 }}>History</strong>
          {boundName && <span className="note">{boundName}</span>}
          <button type="button" className="insp-close" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <div className="sheet-body">
          {!boundId ? (
            <p className="note" style={{ padding: 10 }}>
              This project is not in your account yet, so nothing is being kept.
              Save it from the Projects panel and its history starts there.
            </p>
          ) : loading && versions.length === 0 ? (
            <p className="note" style={{ padding: 10 }}>Loading…</p>
          ) : versions.length === 0 ? (
            <p className="note" style={{ padding: 10 }}>No versions yet. Keep working — one is kept every minute or so.</p>
          ) : (
            versions.map((v, i) => {
              const expanded = open === v.id
              const changes = (v.changes ?? []) as Change[]
              return (
                <div key={v.id} className={i === 0 ? 'ver current' : 'ver'}>
                  <button
                    type="button" className="ver-head"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : v.id)}
                  >
                    <span className="ver-when">
                      {when(v.created_at)}
                      {i === 0 && <em>current</em>}
                      {!v.is_autosave && <i title="Saved by hand">★</i>}
                    </span>
                    <span className="ver-summary">{v.label ?? v.summary ?? 'Saved'}</span>
                    <span className="ver-chevron" aria-hidden>{expanded ? '▾' : '▸'}</span>
                  </button>

                  {expanded && (
                    <div className="ver-body">
                      {v.label && v.summary && v.label !== v.summary && (
                        <p className="note">{v.summary}</p>
                      )}
                      {changes.length === 0 ? (
                        <p className="note">Nothing recorded for this one.</p>
                      ) : (
                        <ul className="ver-changes">
                          {changes.map((c, n) => (
                            <li key={`${c.area}${n}`}>
                              <b>{c.area}</b>
                              {c.detail}
                            </li>
                          ))}
                        </ul>
                      )}

                      {i !== 0 && (
                        confirming === v.id ? (
                          <div className="cloud-row">
                            <span className="note">
                              Put this version back? Nothing is lost — the current one stays in the history.
                            </span>
                            <button
                              type="button" className="btn small" disabled={busy}
                              onClick={async () => {
                                setBusy(true)
                                await useCloud.getState().restoreVersion(v.id)
                                setBusy(false)
                                setConfirming(null)
                                setOpen(null)
                              }}
                            >{busy ? 'Restoring…' : 'Yes, restore it'}</button>
                            <button type="button" className="btn small ghost" onClick={() => setConfirming(null)}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button type="button" className="btn small" onClick={() => setConfirming(v.id)}>
                            Restore this version
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

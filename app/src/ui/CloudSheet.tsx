import { useEffect, useState } from 'react'
import { useCloud } from '../state/cloud'
import { cloudEnabled } from '../state/supabase'

/**
 * Signing in, and the projects behind it.
 *
 * Sign-in is a link in an email rather than a password: there is nothing here
 * worth building a password field for, and a field that takes a password is a
 * field that can leak one.
 */
export function CloudSheet({ onClose }: { onClose: () => void }) {
  const ready = useCloud((s) => s.ready)
  const email = useCloud((s) => s.email)
  const projects = useCloud((s) => s.projects)
  const listing = useCloud((s) => s.listing)
  const boundId = useCloud((s) => s.boundId)
  const boundName = useCloud((s) => s.boundName)
  const status = useCloud((s) => s.status)
  const message = useCloud((s) => s.message)

  const [address, setAddress] = useState('')
  const [name, setName] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => { if (email) void useCloud.getState().refresh() }, [email])

  return (
    <div className="sheet-scrim" onPointerDown={onClose}>
      <div
        className="sheet" role="dialog" aria-modal="true" aria-label="Projects"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="sheet-search">
          <strong style={{ flex: 1, fontSize: 14 }}>Projects</strong>
          {email && <span className="note">{email}</span>}
          <button type="button" className="insp-close" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <div className="sheet-body">
          {!cloudEnabled ? (
            <p className="note" style={{ padding: 10 }}>
              This build has no database attached, so projects live in this browser
              only. Save and load them as files from the Angles tab.
            </p>
          ) : !ready ? (
            <p className="note" style={{ padding: 10 }}>Checking…</p>
          ) : !email ? (
            <form
              className="cloud-form"
              onSubmit={async (e) => {
                e.preventDefault()
                setSending(true)
                await useCloud.getState().sendLink(address)
                setSending(false)
              }}
            >
              <h4>Sign in</h4>
              <p className="note">
                A link arrives by email. Nothing you have made is lost by signing in —
                what is open stays open, and you can put it in your account afterwards.
              </p>
              <div className="cloud-row">
                <input
                  className="textfield" type="email" required
                  autoComplete="email" placeholder="you@example.com"
                  value={address} onChange={(e) => setAddress(e.target.value)}
                />
                <button type="submit" className="btn" disabled={sending}>
                  {sending ? 'Sending…' : 'Send a link'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <section className="cloud-current">
                <h4>This project</h4>
                {boundId ? (
                  <>
                    <div className="cloud-row">
                      <strong>{boundName}</strong>
                      <span className={`cloud-status ${status}`}>{label(status)}</span>
                    </div>
                    {status === 'conflict' ? (
                      <div className="cloud-conflict">
                        <p className="note">{message}</p>
                        <div className="cloud-row">
                          <button type="button" className="btn small" onClick={() => void useCloud.getState().open(boundId)}>
                            Load the other version
                          </button>
                          <button type="button" className="btn small danger" onClick={() => void useCloud.getState().saveNow({ force: true })}>
                            Overwrite it with this one
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="cloud-row">
                        <button type="button" className="btn small" onClick={() => void useCloud.getState().saveNow({ force: true })}>
                          Save now
                        </button>
                        <button
                          type="button" className="btn small"
                          onClick={() => {
                            const label = prompt('Name this version')
                            if (label !== null) void useCloud.getState().snapshot(label)
                          }}
                        >
                          Keep a version
                        </button>
                        <button type="button" className="btn small ghost" onClick={() => useCloud.getState().unbind()}>
                          Work on it locally
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <form
                    className="cloud-row"
                    onSubmit={(e) => { e.preventDefault(); void useCloud.getState().saveAs(name); setName('') }}
                  >
                    <input
                      className="textfield" placeholder="Name this project"
                      value={name} onChange={(e) => setName(e.target.value)}
                    />
                    <button type="submit" className="btn">Save to my account</button>
                  </form>
                )}
              </section>

              <h4>All projects</h4>
              {listing && projects.length === 0 && <p className="note" style={{ padding: '0 10px' }}>Loading…</p>}
              {!listing && projects.length === 0 && (
                <p className="note" style={{ padding: '0 10px' }}>Nothing saved yet.</p>
              )}
              {projects.map((p) => (
                <div key={p.id} className={p.id === boundId ? 'sheet-row on' : 'sheet-row'}>
                  <span>
                    {p.name}
                    <em>{p.device ?? 'no device'} · {when(p.updated_at)}</em>
                  </span>
                  <span className="cloud-row">
                    <button type="button" className="btn small" onClick={() => void useCloud.getState().open(p.id)}>
                      {p.id === boundId ? 'Reload' : 'Open'}
                    </button>
                    <button
                      type="button" className="btn small ghost"
                      onClick={() => {
                        const next = prompt('Rename this project', p.name)
                        if (next !== null) void useCloud.getState().rename(p.id, next)
                      }}
                    >Rename</button>
                    <button
                      type="button" className="btn small ghost danger"
                      onClick={() => {
                        if (confirm(`Move “${p.name}” to the trash?`)) void useCloud.getState().remove(p.id)
                      }}
                    >Delete</button>
                  </span>
                </div>
              ))}

              <div className="cloud-row" style={{ padding: 10 }}>
                <button type="button" className="btn small ghost" onClick={() => void useCloud.getState().signOut()}>
                  Sign out
                </button>
              </div>
            </>
          )}

          {message && status !== 'conflict' && <p className="note ok" style={{ padding: 10 }}>{message}</p>}
        </div>
      </div>
    </div>
  )
}

const label = (s: string) =>
  s === 'saving' ? 'Saving…' : s === 'saved' ? 'Saved' : s === 'conflict' ? 'Changed elsewhere'
  : s === 'error' ? 'Not saved' : 'Local'

function when(iso: string) {
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  return new Date(iso).toLocaleDateString()
}

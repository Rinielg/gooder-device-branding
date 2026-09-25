import { Component, type ErrorInfo, type ReactNode } from 'react'
import { STORAGE_KEY } from '../state/store'

/**
 * The last line of defence: a render that throws must not be a blank page.
 *
 * Settings persist, so a value the app cannot render is a value it reloads
 * into — the failure repeats on every boot and the only way out is clearing
 * site data, which is not something a user should have to know. Validation at
 * the boundary is what stops a bad value getting in; this is what stops one
 * that did from being permanent.
 *
 * It does not clear anything by itself. A transient error is not a reason to
 * throw away someone's work, so the choice stays theirs.
 */
export class Recover extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render failed', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="recover">
        <div className="recover-card">
          <h1>Something in this project could not be drawn</h1>
          <p>
            The rest of the app is fine. Reloading will land back here if the
            problem is in the saved project rather than a one-off.
          </p>
          <pre>{error.message}</pre>
          <div className="recover-actions">
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              type="button" className="btn danger"
              onClick={() => {
                // Deliberately narrow: this key only, never the whole origin.
                try { localStorage.removeItem(STORAGE_KEY) } catch { /* blocked */ }
                window.location.reload()
              }}
            >
              Discard the saved project and start fresh
            </button>
          </div>
          <p className="note">
            Discarding removes the pose, lighting, frame and animation saved in
            this browser. Export the project first if you can still open it in
            another tab.
          </p>
        </div>
      </div>
    )
  }
}

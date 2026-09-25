import { useEffect } from 'react'
import { Viewport } from './ui/Viewport'
import { Dials } from './ui/Dials'
import { Gizmo } from './ui/Gizmo'
import { resetTransform } from './ui/resetTransform'
import {
  BackgroundPanel, DevicePanel, FramePanel, ProjectPanel, ScreenPanel,
} from './ui/Panels'
import { PresetsPanel } from './ui/PresetsPanel'
import {
  EnvironmentPanel, LightingHelpersPanel, LightsPanel, ShadowPanel,
} from './ui/LightingPanel'
import { TimelinePanel } from './ui/TimelinePanel'
import { InspectorTiming } from './ui/InspectorTiming'
import { ExportPanel } from './ui/ExportPanel'
import { useStore, type InspectorTab } from './state/store'
import './styles.css'

const TABS: InspectorTab[] = ['Stage', 'Look', 'Light', 'Control', 'Angles', 'Export']

export default function App() {
  // The active tab lives in the store: selecting a keyframe moves it, so it is
  // not this component's private business.
  const tab = useStore((s) => s.inspectorTab)
  const setTab = useStore((s) => s.setInspectorTab)
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const ready = useStore((s) => s.ready)
  const status = useStore((s) => s.status)
  const error = useStore((s) => s.error)
  const setError = useStore((s) => s.setError)
  const past = useStore((s) => s.past)
  const future = useStore((s) => s.future)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const selection = useStore((s) => s.selection)
  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 8000)
    return () => clearTimeout(id)
  }, [error, setError])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const undoish = (e.metaKey || e.ctrlKey) && (e.code === 'KeyZ' || e.code === 'KeyY')
      if (!undoish) return
      // Text fields have their own undo, and taking it would be worse than
      // not offering one.
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      if (e.code === 'KeyY' || e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [redo, undo])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <strong>Gooder Device Branding</strong>
          <em>iPhone 18 Pro · iPhone 18 Pro Max</em>
        </div>

        <div className="topbar-right">
          {status && <span className="status">{status}</span>}
          {!ready && !status && <span className="status">Loading model…</span>}
          <div className="history">
            <button
              type="button" className="btn icon" onClick={undo} disabled={past.length === 0}
              title={past.length ? `Undo ${past[past.length - 1].label.toLowerCase()} (${past.length} step${past.length === 1 ? '' : 's'})` : 'Nothing to undo'}
            >↶</button>
            <button
              type="button" className="btn icon" onClick={redo} disabled={future.length === 0}
              title={future.length ? `Redo ${future[0].label.toLowerCase()}` : 'Nothing to redo'}
            >↷</button>
          </div>
          <button
            type="button" className="btn icon" onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
          >{theme === 'dark' ? '☀' : '☾'}</button>
        </div>
      </header>

      <main className="main">
        <Viewport>
          <Gizmo />
        </Viewport>

        {/* The inspector sits beside the viewport and stops above the timeline,
            which spans the window. Time belongs to the whole scene, not to the
            viewport, so the ruler gets the full width to spend on it. */}
        {/* Selecting something on the timeline takes the inspector over: the
            thing being edited and the controls for it belong in one place, and
            the timeline stays a timeline. */}
        <aside className="inspector">
          {selection ? (
            <InspectorTiming />
          ) : (
            <>
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t} type="button" className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>

          <div className="panels">
            {tab === 'Stage' && (<><DevicePanel /><FramePanel /></>)}
            {tab === 'Look' && (<><BackgroundPanel /><ScreenPanel /></>)}
            {tab === 'Light' && (
              <><EnvironmentPanel /><LightsPanel /><ShadowPanel /><LightingHelpersPanel /></>
            )}
            {tab === 'Control' && (
              <section className="section">
                <header className="section-head">
                  <h3>Transform</h3>
                  <button type="button" className="btn small ghost" onClick={resetTransform}>Reset</button>
                </header>
                <div className="section-body no-pad">
                  <Dials />
                </div>
                <p className="note pad">
                  Drag the model in the frame to rotate it, shift-drag to pan, scroll to scale.
                  These dials stay in step with whatever you do there, and with the timeline.
                </p>
              </section>
            )}
            {tab === 'Angles' && (<><PresetsPanel /><ProjectPanel /></>)}
            {tab === 'Export' && <ExportPanel />}
          </div>
            </>
          )}
        </aside>
      </main>

      <TimelinePanel />

      {error && (
        <div className="toast" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>×</button>
        </div>
      )}
    </div>
  )
}

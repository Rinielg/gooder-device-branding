import { useEffect, useState } from 'react'
import { Viewport } from './ui/Viewport'
import { Dials } from './ui/Dials'
import { resetTransform } from './ui/resetTransform'
import {
  BackgroundPanel, DevicePanel, FramePanel, ProjectPanel, ScreenPanel, ViewsPanel,
} from './ui/Panels'
import {
  EnvironmentPanel, LightingHelpersPanel, LightsPanel, ShadowPanel,
} from './ui/LightingPanel'
import { TimelinePanel } from './ui/TimelinePanel'
import { ExportPanel } from './ui/ExportPanel'
import { useStore } from './state/store'
import './styles.css'

const TABS = ['Stage', 'Look', 'Light', 'Control', 'Views', 'Export'] as const
type Tab = typeof TABS[number]

export default function App() {
  const [tab, setTab] = useState<Tab>('Stage')
  const ready = useStore((s) => s.ready)
  const status = useStore((s) => s.status)
  const error = useStore((s) => s.error)
  const setError = useStore((s) => s.setError)
  const past = useStore((s) => s.past)
  const future = useStore((s) => s.future)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)

  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 8000)
    return () => clearTimeout(id)
  }, [error, setError])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.code !== 'KeyZ') {
        if (!((e.metaKey || e.ctrlKey) && e.code === 'KeyY')) return
      }
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
        </div>
      </header>

      <main className="main">
        <Viewport />

        <aside className="sidebar">
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
                  These dials stay in step with whatever you do there.
                </p>
              </section>
            )}
            {tab === 'Views' && (<><ViewsPanel /><ProjectPanel /></>)}
            {tab === 'Export' && <ExportPanel />}
          </div>
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

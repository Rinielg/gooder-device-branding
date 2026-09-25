import { useEffect, useRef, useState } from 'react'
import { useStore, type InspectorTab } from '../state/store'
import { resetTransform } from './resetTransform'
import { pickProjectFile, saveProjectFile } from './projectFile'
import { keyLabel } from './shortcuts'
import { useCloud } from '../state/cloud'
import { cloudEnabled } from '../state/supabase'

const TABS: InspectorTab[] = ['Stage', 'Look', 'Light', 'Control', 'Angles', 'Export']

/**
 * The side menu.
 *
 * Deliberately only what the app can actually do — a menu that lists a feature
 * the platform does not have is a bug report waiting to be filed. Everything
 * here maps to a real store action or panel.
 */
export function SideMenu({ onShortcuts, onProjects }: {
  onShortcuts: () => void
  onProjects: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const setTab = useStore((s) => s.setInspectorTab)
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const past = useStore((s) => s.past)
  const future = useStore((s) => s.future)
  const keyPose = useStore((s) => s.keyPose)
  const clearComposition = useStore((s) => s.clearComposition)
  const showHelpers = useStore((s) => s.showLightHelpers)
  const setShowHelpers = useStore((s) => s.setShowLightHelpers)
  const setStatus = useStore((s) => s.setStatus)
  const email = useCloud((s) => s.email)
  const boundName = useCloud((s) => s.boundName)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  const run = (fn: () => void) => () => { setOpen(false); fn() }

  return (
    <div className="sidemenu" ref={ref}>
      <button
        type="button" className="btn icon"
        aria-haspopup="menu" aria-expanded={open}
        title="Menu" onClick={() => setOpen(!open)}
      >☰</button>

      {open && (
        <div className="sidemenu-sheet" role="menu">
          {cloudEnabled && (
            <Group>
              <Item onClick={run(onProjects)}>
                {!email ? 'Sign in' : boundName ? `Projects — ${boundName}` : 'Projects'}
              </Item>
            </Group>
          )}

          <Group>
            <Item onClick={run(() => setStatus(`Saved ${saveProjectFile()}`))}>Save project to a file</Item>
            <Item onClick={run(() => pickProjectFile((ok) =>
              setStatus(ok ? 'Project loaded' : 'That file could not be read as a project')))}
            >Open a project file</Item>
          </Group>

          <Group>
            <Item onClick={run(undo)} disabled={past.length === 0} hint={[keyLabel('⌘'), 'Z']}>Undo</Item>
            <Item onClick={run(redo)} disabled={future.length === 0} hint={[keyLabel('⌘'), keyLabel('⇧'), 'Z']}>Redo</Item>
          </Group>

          <Group>
            <Item onClick={run(keyPose)} hint={['K']}>Key the whole pose</Item>
            <Item onClick={run(clearComposition)}>Clear the animation</Item>
          </Group>

          <Group>
            {TABS.map((t) => (
              <Item key={t} onClick={run(() => setTab(t))}>{t}</Item>
            ))}
          </Group>

          <Group>
            <Item onClick={run(resetTransform)}>Reset the pose and camera</Item>
            <Item onClick={run(() => setShowHelpers(!showHelpers))}>
              {showHelpers ? 'Hide the light helpers' : 'Show the light helpers'}
            </Item>
            <Item onClick={run(toggleTheme)}>
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </Item>
          </Group>

          <Group>
            <Item onClick={run(onShortcuts)} hint={['?']}>Keyboard shortcuts</Item>
          </Group>
        </div>
      )}
    </div>
  )
}

const Group = ({ children }: { children: React.ReactNode }) => (
  <div className="sidemenu-group">{children}</div>
)

function Item({ children, onClick, disabled, hint }: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  hint?: string[]
}) {
  return (
    <button type="button" role="menuitem" className="sidemenu-item" onClick={onClick} disabled={disabled}>
      <span>{children}</span>
      {hint && <span className="sheet-keys">{hint.map((k, i) => <kbd key={`${k}${i}`}>{k}</kbd>)}</span>}
    </button>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { BUILT_INS } from '../engine/presets'
import { PresetCard } from './PresetsPanel'

/**
 * Angles, reachable from the thing they turn.
 *
 * A popover rather than a permanent bar: the frame is the work, and a row of
 * buttons parked over it costs frame space on every crop to save one click on
 * some of them. It sits under the gizmo because the gizmo already snaps to the
 * same six orientations by dragging its handles — this is the labelled version
 * of the same idea, and both write the same values.
 *
 * It stays open after applying, so Front / Back / Left can be compared in three
 * clicks rather than nine.
 */
export function PresetPopover() {
  const presets = useStore((s) => s.presets)
  const setInspectorTab = useStore((s) => s.setInspectorTab)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  return (
    <div
      className="angles" ref={ref}
      // The canvas below listens for drags to rotate; this is chrome, not stage.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Labelled rather than an icon: the whole reason this exists alongside
          the gizmo is that the gizmo's handles are unlabelled. */}
      <button
        type="button"
        className={open ? 'btn small on' : 'btn small'}
        title="Jump the device to a named angle"
        onClick={() => setOpen(!open)}
      >Angles ▾</button>

      {open && (
        <div className="angles-pop" role="menu">
          <div className="angle-grid">
            {BUILT_INS.map((p) => <PresetCard key={p.id} preset={p} density="compact" />)}
          </div>

          {presets.length > 0 && (
            <>
              <hr className="rule" />
              <div className="angle-grid mini">
                {presets.map((p) => <PresetCard key={p.id} preset={p} density="mini" />)}
              </div>
            </>
          )}

          <p className="note">
            Alt-click turns without changing the framing · shift-click keys it at the playhead.
          </p>
          <button
            type="button" className="link"
            onClick={() => { setInspectorTab('Angles'); setOpen(false) }}
          >Manage angles…</button>
        </div>
      )}
    </div>
  )
}

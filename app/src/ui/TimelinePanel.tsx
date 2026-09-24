import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore, compositionDuration } from '../state/store'
import { engine } from '../engine/handle'
import { TRACKS, TRACK_ORDER, hasAnimation, quantise, trackDef } from '../engine/tracks'
import type { Composition, Track, TrackId } from '../engine/types'
import { TransitionPanel } from './TransitionPanel'

const ROW_H = 30
const MIN_PPS = 8
const MAX_PPS = 800
/** How close, in pixels, a dragged key has to get before it snaps. */
const SNAP_PX = 7
/** Gutter either side of the lanes, so a key at 0s is not half cut off. */
const LANE_PAD = 8

/** Tracks that exist, in registration order — the order rows appear in. */
function rowsOf(c: Composition): Track[] {
  const out: Track[] = []
  for (const id of TRACK_ORDER) {
    const t = c.tracks[id]
    if (t) out.push(t)
  }
  return out
}

export function TimelinePanel() {
  const composition = useStore((s) => s.composition)
  const playhead = useStore((s) => s.playhead)
  const playing = useStore((s) => s.playing)
  const loop = useStore((s) => s.loop)
  const selection = useStore((s) => s.selection)
  const backgroundDuration = useStore((s) => s.backgroundDuration)
  const setPlayhead = useStore((s) => s.setPlayhead)
  const setPlaying = useStore((s) => s.setPlaying)
  const setLoop = useStore((s) => s.setLoop)
  const selectKey = useStore((s) => s.selectKey)
  const keyPose = useStore((s) => s.keyPose)
  const keyTrack = useStore((s) => s.keyTrack)
  const moveKey = useStore((s) => s.moveKey)
  const removeKey = useStore((s) => s.removeKey)
  const removeTrack = useStore((s) => s.removeTrack)
  const setTrackEnabled = useStore((s) => s.setTrackEnabled)
  const setCompositionLength = useStore((s) => s.setCompositionLength)
  const clearComposition = useStore((s) => s.clearComposition)

  const rows = useMemo(() => rowsOf(composition), [composition])
  const duration = compositionDuration(composition, backgroundDuration)

  /* ---------------- zoom ---------------- */
  // Positions are pixels, not percentages: a percentage cannot zoom, which is
  // why the old single row could never show more than the whole composition.
  const [pxPerSec, setPxPerSec] = useState(120)
  const [userZoomed, setUserZoomed] = useState(false)
  const viewRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fit = useCallback(() => {
    const w = viewRef.current?.clientWidth ?? 0
    if (w > 0 && duration > 0) setPxPerSec(clamp((w - LANE_PAD * 2 - 4) / duration, MIN_PPS, MAX_PPS))
    setUserZoomed(false)
  }, [duration])

  useLayoutEffect(() => {
    const el = viewRef.current
    if (!el) return
    const ro = new ResizeObserver(() => { if (!userZoomed) fit() })
    ro.observe(el)
    if (!userZoomed) fit()
    return () => ro.disconnect()
  }, [fit, userZoomed])

  /** Zoom about the pointer, so the frame under the cursor stays put. */
  const zoomAt = useCallback((factor: number, clientX?: number) => {
    const view = viewRef.current
    const scroll = scrollRef.current
    if (!view || !scroll) return
    const rect = view.getBoundingClientRect()
    const anchorPx = clientX === undefined ? rect.width / 2 : clientX - rect.left
    setPxPerSec((prev) => {
      const next = clamp(prev * factor, MIN_PPS, MAX_PPS)
      const tAtAnchor = (view.scrollLeft + anchorPx - LANE_PAD) / prev
      requestAnimationFrame(() => { view.scrollLeft = tAtAnchor * next + LANE_PAD - anchorPx })
      return next
    })
    setUserZoomed(true)
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const onWheel = (e: WheelEvent) => {
      // Plain scrolling pans, as it does anywhere else; the modifier zooms.
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX)
    }
    view.addEventListener('wheel', onWheel, { passive: false })
    return () => view.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  /* ---------------- time <-> pixels ---------------- */
  const timeAt = useCallback((clientX: number) => {
    const el = scrollRef.current
    if (!el) return 0
    const x = clientX - el.getBoundingClientRect().left - LANE_PAD
    return clamp(quantise(x / pxPerSec), 0, duration)
  }, [pxPerSec, duration])

  /** Move the playhead and bring the pose with it. */
  const scrubTo = useCallback((t: number) => {
    setPlayhead(t)
    const tl = engine.timeline
    const st = useStore.getState()
    if (tl && hasAnimation(st.composition)) {
      st.setTransform(tl.sampleTransform(t, st.transform))
    }
  }, [setPlayhead])

  /* ---------------- dragging ---------------- */
  type Drag =
    | { kind: 'playhead' }
    | { kind: 'key'; track: TrackId; key: string; snapTo: number[] }
  const drag = useRef<Drag | null>(null)

  /**
   * Times worth snapping to: every key on every *other* track, plus the
   * playhead and zero. Aligning across tracks is the reason the rows exist, so
   * it has to be easy to hit exactly.
   */
  const snapTargets = useCallback((except: TrackId) => {
    const st = useStore.getState()
    const out = new Set<number>([0, quantise(st.playhead)])
    for (const t of rowsOf(st.composition)) {
      if (t.id === except) continue
      for (const k of t.keys) out.add(k.time)
    }
    return [...out]
  }, [])

  const startKeyDrag = useCallback((track: TrackId, key: string) => {
    drag.current = { kind: 'key', track, key, snapTo: snapTargets(track) }
  }, [snapTargets])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const t = timeAt(e.clientX)
      if (d.kind === 'playhead') { scrubTo(t); return }
      // Alt suspends snapping, for when a key genuinely belongs off the grid.
      const snapped = e.altKey ? t : snap(t, d.snapTo, SNAP_PX / pxPerSec)
      moveKey(d.track, d.key, snapped)
    }
    const up = () => { drag.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [moveKey, pxPerSec, scrubTo, timeAt])

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const st = useStore.getState()
      if (e.code === 'Space') { e.preventDefault(); setPlaying(!st.playing) }
      else if (e.code === 'KeyK') { e.preventDefault(); keyPose() }
      else if ((e.code === 'Delete' || e.code === 'Backspace') && st.selection) {
        e.preventDefault()
        removeKey(st.selection.track, st.selection.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyPose, removeKey, setPlaying])

  const ticks = useMemo(() => buildTicks(duration, pxPerSec), [duration, pxPerSec])
  const contentWidth = duration * pxPerSec + LANE_PAD * 2
  const at = (t: number) => LANE_PAD + t * pxPerSec

  return (
    <div className="tl">
      <div className="tl-transport">
        <button type="button" className="btn icon" onClick={() => { setPlaying(false); scrubTo(0) }} title="Go to start">⏮</button>
        <button type="button" className="btn icon primary" onClick={() => setPlaying(!playing)} title="Play / pause (space)">
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" className={loop ? 'btn icon on' : 'btn icon'} onClick={() => setLoop(!loop)} title="Loop">⟳</button>
        <span className="clock">{playhead.toFixed(2)}s <em>/ {duration.toFixed(2)}s</em></span>

        <AnimateMenu present={rows.map((r) => r.id)} onPick={keyTrack} />
        <button type="button" className="btn" onClick={keyPose} title="Key the whole pose at the playhead (K)">
          Key pose
        </button>

        <span className="spacer" />

        <label className="tl-length" title="Fixed composition length. Leave blank to follow the keys and the background.">
          Length
          <input
            className="textfield tiny" type="number" min={0} step={0.5}
            value={composition.duration || ''}
            placeholder={duration.toFixed(1)}
            onChange={(e) => setCompositionLength(Number(e.target.value) || 0)}
          />
        </label>
        <div className="tl-zoom">
          <button type="button" className="btn icon" onClick={() => zoomAt(1 / 1.3)} title="Zoom out">−</button>
          <button type="button" className="btn icon" onClick={() => zoomAt(1.3)} title="Zoom in">+</button>
          <button type="button" className="btn small ghost" onClick={fit} title="Fit the whole composition">Fit</button>
        </div>
        {rows.length > 0 && (
          <button type="button" className="btn ghost small" onClick={clearComposition}>Clear all</button>
        )}
      </div>

      <div className="tl-body">
        <div className="tl-heads">
          <div className="tl-head-spacer" />
          {rows.map((track) => {
            const def = trackDef(track.id)
            if (!def) return null
            return (
              <div key={track.id} className={`tl-head${track.enabled ? '' : ' off'}`} style={{ height: ROW_H }}>
                <button
                  type="button"
                  className="tl-mute"
                  title={track.enabled ? 'Mute this track' : 'Unmute this track'}
                  onClick={() => setTrackEnabled(track.id, !track.enabled)}
                >
                  {track.enabled ? '◉' : '○'}
                </button>
                <span className="tl-head-label">{def.label}</span>
                <span className="tl-chips">
                  {def.channels.map((ch) => (
                    <i key={ch.key} style={{ background: ch.colour }} title={ch.label} />
                  ))}
                </span>
                <button
                  type="button" className="tl-head-btn"
                  title={`Key ${def.label.toLowerCase()} at the playhead`}
                  onClick={() => keyTrack(track.id)}
                >◆</button>
                <button
                  type="button" className="tl-head-btn danger"
                  title={`Stop animating ${def.label.toLowerCase()}`}
                  onClick={() => removeTrack(track.id)}
                >×</button>
              </div>
            )
          })}
        </div>

        <div className="tl-view" ref={viewRef}>
          <div className="tl-scroll" ref={scrollRef} style={{ width: contentWidth }}>
            <div
              className="tl-ruler"
              onPointerDown={(e) => {
                setPlaying(false)
                drag.current = { kind: 'playhead' }
                scrubTo(timeAt(e.clientX))
              }}
            >
              {ticks.map((t) => (
                <span key={t} className="tl-tick" style={{ left: at(t) }}>
                  <em>{formatTick(t)}</em>
                </span>
              ))}
            </div>

            {rows.map((track) => {
              const def = trackDef(track.id)
              if (!def) return null
              const colour = def.channels[0].colour
              return (
                <div
                  key={track.id}
                  className={`tl-lane${track.enabled ? '' : ' off'}`}
                  style={{ height: ROW_H }}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest('.tl-key')) return
                    setPlaying(false)
                    drag.current = { kind: 'playhead' }
                    scrubTo(timeAt(e.clientX))
                  }}
                  onDoubleClick={() => keyTrack(track.id)}
                >
                  {ticks.map((t) => (
                    <span key={t} className="tl-lane-tick" style={{ left: at(t) }} />
                  ))}

                  {track.keys.length > 1 && (
                    <span
                      className="tl-span"
                      style={{
                        left: at(track.keys[0].time),
                        width: (track.keys[track.keys.length - 1].time - track.keys[0].time) * pxPerSec,
                        background: colour,
                      }}
                    />
                  )}

                  {track.keys.map((k) => {
                    const on = selection?.track === track.id && selection.key === k.id
                    return (
                      <button
                        key={k.id}
                        type="button"
                        className={`tl-key${on ? ' on' : ''}`}
                        style={{ left: at(k.time) }}
                        title={`${def.label} · ${k.time.toFixed(2)}s · ${k.ease}`}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          setPlaying(false)
                          selectKey({ track: track.id, key: k.id })
                          startKeyDrag(track.id, k.id)
                          scrubTo(k.time)
                        }}
                      />
                    )
                  })}
                </div>
              )
            })}

            {/* Hoisted out of the rows so one playhead spans every track. */}
            <div className="tl-playhead" style={{ left: at(playhead) }} />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="note tl-empty">
          Pose the device, then <strong>Key pose</strong> to animate the whole transform — or pick a
          single property from <strong>Animate</strong> to give it its own row.
        </p>
      ) : (
        <TransitionPanel />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function AnimateMenu({ present, onPick }: { present: TrackId[]; onPick: (id: TrackId) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open])

  const groups = useMemo(() => {
    const out = new Map<string, TrackId[]>()
    for (const id of TRACK_ORDER) {
      const def = TRACKS[id]
      if (!def) continue
      out.set(def.group, [...(out.get(def.group) ?? []), id])
    }
    return [...out]
  }, [])

  return (
    <div className="tl-menu" ref={ref}>
      <button type="button" className="btn" onClick={() => setOpen(!open)} title="Give one property its own row">
        Animate ▾
      </button>
      {open && (
        <div className="tl-menu-pop" role="menu">
          {groups.map(([group, ids]) => (
            <div key={group} className="tl-menu-group">
              <span className="tl-menu-title">{group}</span>
              {ids.map((id) => {
                const def = TRACKS[id]
                if (!def) return null
                const already = present.includes(id)
                return (
                  <button
                    key={id} type="button" role="menuitem"
                    onClick={() => { onPick(id); setOpen(false) }}
                    title={already ? 'Add another key at the playhead' : 'Start animating this property'}
                  >
                    <span className="tl-chips">
                      {def.channels.map((ch) => <i key={ch.key} style={{ background: ch.colour }} />)}
                    </span>
                    {def.label}
                    {already && <em>keyed</em>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

function snap(t: number, targets: number[], tolerance: number) {
  let best = t
  let bestGap = tolerance
  for (const target of targets) {
    const gap = Math.abs(target - t)
    if (gap < bestGap) { best = target; bestGap = gap }
  }
  return best
}

/** Tick spacing follows the zoom, so labels never collide or thin out. */
function buildTicks(duration: number, pxPerSec: number) {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60]
  const step = steps.find((s) => s * pxPerSec >= 64) ?? steps[steps.length - 1]
  const out: number[] = []
  for (let t = 0; t <= duration + 1e-6; t += step) out.push(Math.round(t * 1000) / 1000)
  return out
}

const formatTick = (t: number) => (Number.isInteger(t) ? `${t}s` : `${t.toFixed(2).replace(/0$/, '')}s`)

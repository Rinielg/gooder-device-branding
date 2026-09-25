import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore, animationEnd, compositionDuration } from '../state/store'
import { engine } from '../engine/handle'
import { TRACKS, TRACK_ORDER, hasAnimation, quantise, trackDef } from '../engine/tracks'
import type { Composition, Track, TrackId } from '../engine/types'
import { CurveEditor } from './CurveEditor'
import { ScrubField } from './ScrubField'
import { STARTERS } from '../engine/starters'

const ROW_H = 28
/** How tall the value graph stands when it replaces the lanes. */
const CURVE_H = 168
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
  const shiftTrackKeys = useStore((s) => s.shiftTrackKeys)
  const removeKey = useStore((s) => s.removeKey)
  const removeKeysAt = useStore((s) => s.removeKeysAt)
  const removeTrack = useStore((s) => s.removeTrack)
  const setTrackEnabled = useStore((s) => s.setTrackEnabled)
  const setCompositionLength = useStore((s) => s.setCompositionLength)
  const clearComposition = useStore((s) => s.clearComposition)
  const applyStarter = useStore((s) => s.applyStarter)

  const rows = useMemo(() => rowsOf(composition), [composition])

  /**
   * Curves replace the lanes rather than sitting beside them, so they inherit
   * the ruler, the zoom, the scroll position and the playhead. A graph on its
   * own time axis would be a second thing to keep in step.
   */
  const [curves, setCurves] = useState(false)
  const [curveTrack, setCurveTrack] = useState<TrackId | null>(null)
  const [hiddenChannels, setHiddenChannels] = useState<ReadonlySet<string>>(new Set())

  // The graph always has something to draw: the selection, else what was picked,
  // else the first row.
  const shown = selection?.track ?? curveTrack ?? rows[0]?.id ?? null
  const shownTrack = shown ? composition.tracks[shown] ?? null : null

  /** Right-click target: which key, and how many others share its instant. */
  const [menu, setMenu] = useState<
    { x: number; y: number; track: TrackId; key: string; time: number; atTime: number } | null
  >(null)
  useEffect(() => {
    if (!menu) return
    const away = () => setMenu(null)
    window.addEventListener('pointerdown', away)
    window.addEventListener('blur', away)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('blur', away)
    }
  }, [menu])
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
    if (w > 0 && duration > 0) {
      setPxPerSec(clamp((w - LANE_PAD * 2 - 4) / (duration * 1.18), MIN_PPS, MAX_PPS))
    }
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
    // Clamped to the clip: the ruler runs past it, the playhead does not.
    return clamp(quantise(x / pxPerSec), 0, duration)
  }, [pxPerSec, duration])

  /** Move the playhead and bring the pose with it. */
  const scrubTo = useCallback((t: number) => {
    setPlayhead(t)
    const tl = engine.timeline
    const st = useStore.getState()
    if (tl && hasAnimation(st.composition)) {
      st.setTransform(tl.sampleTransform(t, st.transform), { silent: true })
    }
  }, [setPlayhead])

  /**
   * Play from the top when the playhead is already sitting at the end.
   *
   * Keying a pose leaves the playhead on the last key, so without this the
   * first press of play runs the tail of the clip, where by definition nothing
   * moves — which reads exactly like a broken timeline.
   */
  const togglePlay = useCallback(() => {
    const st = useStore.getState()
    if (!st.playing) {
      const end = animationEnd(st.composition)
      const stop = end > 0 ? end : compositionDuration(st.composition, st.backgroundDuration)
      if (st.playhead >= stop - 1e-3) scrubTo(0)
    }
    setPlaying(!st.playing)
  }, [scrubTo, setPlaying])

  /* ---------------- dragging ---------------- */
  type Drag =
    | { kind: 'playhead' }
    | { kind: 'key'; track: TrackId; key: string; snapTo: number[] }
    /** Dragging the bar between two keys carries both, keeping the gap. */
    | { kind: 'segment'; track: TrackId; keys: string[]; from: number }
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
      if (d.kind === 'segment') {
        shiftTrackKeys(d.track, d.keys, t - d.from)
        // The pointer's own anchor moves with the drag, or every frame would
        // re-apply the whole delta from where the drag began.
        d.from = t
        return
      }
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
  }, [moveKey, pxPerSec, scrubTo, shiftTrackKeys, timeAt])

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const st = useStore.getState()
      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      else if (e.code === 'KeyK') { e.preventDefault(); keyPose() }
      else if ((e.code === 'Delete' || e.code === 'Backspace') && st.selection?.kind === 'key') {
        e.preventDefault()
        removeKey(st.selection.track, st.selection.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyPose, removeKey, togglePlay])

  /**
   * The ruler runs past the clip so its end reads as a boundary rather than as
   * the edge of the panel — and so there is somewhere to drag a key to when you
   * want to lengthen the clip.
   */
  const rulerEnd = duration * 1.18
  const ticks = useMemo(() => buildTicks(rulerEnd, pxPerSec), [rulerEnd, pxPerSec])
  const contentWidth = rulerEnd * pxPerSec + LANE_PAD * 2
  const at = (t: number) => LANE_PAD + t * pxPerSec

  return (
    <div className="tl">
      <div className="tl-transport">
        <button type="button" className="btn icon" onClick={() => { setPlaying(false); scrubTo(0) }} title="Go to start">⏮</button>
        <button type="button" className="btn icon primary" onClick={togglePlay} title="Play / pause (space)">
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
          <ScrubField
            value={composition.duration || duration} min={0} step={0.1} handle="S" suffix="s" width={92}
            title="Fixed clip length. Drag S, or type — 0 follows the keys."
            onChange={setCompositionLength}
          />
        </label>
        <div className="tl-zoom">
          <button type="button" className="btn icon" onClick={() => zoomAt(1 / 1.3)} title="Zoom out">−</button>
          <button type="button" className="btn icon" onClick={() => zoomAt(1.3)} title="Zoom in">+</button>
          <button type="button" className="btn small ghost" onClick={fit} title="Fit the whole composition">Fit</button>
        </div>
        {rows.length > 0 && (
          <button
            type="button" className={curves ? 'btn small on' : 'btn small'}
            onClick={() => setCurves(!curves)}
            title={curves ? 'Back to the keyframe lanes' : 'Show the value graph'}
          >Curves</button>
        )}
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
              <div
                key={track.id}
                className={`tl-head${track.enabled ? '' : ' off'}${curves && shown === track.id ? ' graphed' : ''}`}
                style={{ height: ROW_H }}
                onPointerDown={() => { if (curves) { setCurveTrack(track.id); setHiddenChannels(new Set()) } }}
              >
                <button
                  type="button"
                  className="tl-mute"
                  title={track.enabled ? 'Mute this track' : 'Unmute this track'}
                  onClick={() => setTrackEnabled(track.id, !track.enabled)}
                >
                  {track.enabled ? '◉' : '○'}
                </button>
                <span className="tl-head-label" title={def.label}>{def.label}</span>
                <span className="tl-chips">
                  {def.channels.map((ch) => (
                    <i key={ch.key} style={{ background: ch.colour }} title={ch.label} />
                  ))}
                </span>
                {(() => {
                  const here = track.keys.find((k) => Math.abs(k.time - playhead) < 1e-3)
                  return (
                    <button
                      type="button" className={`tl-head-btn key${here ? ' on' : ''}`}
                      title={here
                        ? `Remove the ${def.label.toLowerCase()} key at the playhead`
                        : `Key ${def.label.toLowerCase()} at the playhead`}
                      onClick={() => (here ? removeKey(track.id, here.id) : keyTrack(track.id))}
                    >{here ? '◆' : '◇'}</button>
                  )
                })()}
                <button
                  type="button" className="tl-head-btn danger"
                  title={`Stop animating ${def.label.toLowerCase()}`}
                  onClick={() => removeTrack(track.id)}
                >×</button>
              </div>
            )
          })}

          {curves && shownTrack && (
            <div className="tl-channels">
              {(trackDef(shownTrack.id)?.channels ?? []).map((ch) => {
                const off = hiddenChannels.has(ch.key)
                return (
                  <button
                    key={ch.key} type="button"
                    className={off ? 'tl-chan off' : 'tl-chan'}
                    onClick={() => setHiddenChannels((prev) => {
                      const next = new Set(prev)
                      if (next.has(ch.key)) next.delete(ch.key)
                      // Hiding the last visible channel would leave an empty graph.
                      else if (next.size < (trackDef(shownTrack.id)?.channels.length ?? 1) - 1) next.add(ch.key)
                      return next
                    })}
                  >
                    <i style={{ background: ch.colour }} />
                    {ch.label}
                  </button>
                )
              })}
            </div>
          )}
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

            {!curves && rows.map((track) => {
              const def = trackDef(track.id)
              if (!def) return null
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

                  {/* One lone key pins the property; there is no segment to ease. */}
                  {track.keys.length === 1 && (
                    <span className="tl-pin" style={{ left: at(track.keys[0].time) }} />
                  )}

                  {/* A segment per gap, because a transition is a thing you select. */}
                  {track.keys.slice(1).map((k, i) => {
                    const prev = track.keys[i]
                    const on = selection?.kind === 'segment'
                      && selection.track === track.id && selection.key === k.id
                    return (
                      <button
                        key={`seg:${k.id}`}
                        type="button"
                        className={`tl-seg${on ? ' on' : ''}`}
                        style={{ left: at(prev.time), width: (k.time - prev.time) * pxPerSec }}
                        title={`${def.label} · ${prev.time.toFixed(2)}s → ${k.time.toFixed(2)}s · ${k.ease}`}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          setPlaying(false)
                          selectKey({ track: track.id, key: k.id, kind: 'segment' })
                          drag.current = {
                            kind: 'segment', track: track.id,
                            keys: [prev.id, k.id], from: timeAt(e.clientX),
                          }
                        }}
                      />
                    )
                  })}

                  {track.keys.map((k) => {
                    const on = selection?.kind === 'key'
                      && selection.track === track.id && selection.key === k.id
                    return (
                      <button
                        key={k.id}
                        type="button"
                        className={`tl-key${on ? ' on' : ''}`}
                        style={{ left: at(k.time) }}
                        title={`${def.label} · ${k.time.toFixed(2)}s`}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          if (e.button === 2) return
                          setMenu(null)
                          setPlaying(false)
                          selectKey({ track: track.id, key: k.id, kind: 'key' })
                          startKeyDrag(track.id, k.id)
                          scrubTo(k.time)
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          selectKey({ track: track.id, key: k.id, kind: 'key' })
                          setMenu({
                            x: e.clientX, y: e.clientY, track: track.id, key: k.id, time: k.time,
                            atTime: rows.reduce(
                              (n, r) => n + r.keys.filter((o) => Math.abs(o.time - k.time) < 1e-3).length, 0,
                            ),
                          })
                        }}
                      />
                    )
                  })}
                </div>
              )
            })}

            {curves && shownTrack && (
              <div className="tl-curve" style={{ height: CURVE_H }}>
                <CurveEditor
                  track={shownTrack} pxPerSec={pxPerSec} gutter={LANE_PAD}
                  height={CURVE_H} hidden={hiddenChannels}
                />
              </div>
            )}

            {/* Past the clip's own length, so the length reads as a boundary. */}
            <div className="tl-beyond" style={{ left: at(duration) }} />

            {/* Hoisted out of the rows so one playhead spans every track. */}
            <div className="tl-playhead" style={{ left: at(playhead) }} />
          </div>
        </div>
      </div>

      {menu && (
        <div
          className="tl-ctx" role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => { removeKey(menu.track, menu.key); setMenu(null) }}>
            Delete this keyframe
          </button>
          {menu.atTime > 1 && (
            <button type="button" role="menuitem" onClick={() => { removeKeysAt(menu.time); setMenu(null) }}>
              Delete all {menu.atTime} at {menu.time.toFixed(2)}s
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => { removeTrack(menu.track); setMenu(null) }}>
            Stop animating {trackDef(menu.track)?.label.toLowerCase()}
          </button>
        </div>
      )}

      {rows.length === 0 && (
        <div className="tl-start">
          <p className="note">
            Pose the device, then start from one of these — each animates <em>into</em> the shot you
            have set up, and you can take it apart afterwards. Or <strong>Key pose</strong> and build
            it yourself.
          </p>
          <div className="tl-starters">
            {STARTERS.map((s) => (
              <button
                key={s.id} type="button" className="tl-starter"
                title={s.description}
                onClick={() => applyStarter(s.id)}
              >
                <strong>{s.name}</strong>
                <em>{s.description}</em>
              </button>
            ))}
          </div>
        </div>
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

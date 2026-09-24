import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useStore, compositionDuration } from '../state/store'
import { engine } from '../engine/handle'
import { hasAnimation, liveTracks } from '../engine/tracks'
import { EASES, type Composition, type EaseName, type TrackId } from '../engine/types'

/**
 * One key per instant, gathering every track that has a key there.
 *
 * Transitional: the model underneath is per-track, but this panel still draws
 * a single row, so keys that share a time are shown and edited as one. The
 * per-property rows replace this wholesale.
 */
interface PoseKey {
  time: number
  ease: EaseName | 'custom'
  entries: { track: TrackId; key: string }[]
}

function groupByTime(c: Composition): PoseKey[] {
  const byTime = new Map<number, PoseKey>()
  for (const track of liveTracks(c)) {
    for (const k of track.keys) {
      const group = byTime.get(k.time) ?? { time: k.time, ease: k.ease, entries: [] }
      group.entries.push({ track: track.id, key: k.id })
      byTime.set(k.time, group)
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time)
}

export function TimelinePanel() {
  const composition = useStore((s) => s.composition)
  const playhead = useStore((s) => s.playhead)
  const playing = useStore((s) => s.playing)
  const loop = useStore((s) => s.loop)
  const selection = useStore((s) => s.selection)
  const setPlayhead = useStore((s) => s.setPlayhead)
  const setPlaying = useStore((s) => s.setPlaying)
  const setLoop = useStore((s) => s.setLoop)
  const selectKey = useStore((s) => s.selectKey)
  const keyPose = useStore((s) => s.keyPose)
  const removeKey = useStore((s) => s.removeKey)
  const moveKey = useStore((s) => s.moveKey)
  const updateKey = useStore((s) => s.updateKey)
  const recaptureKey = useStore((s) => s.recaptureKey)
  const clearComposition = useStore((s) => s.clearComposition)
  const backgroundDuration = useStore((s) => s.backgroundDuration)

  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<PoseKey | null>(null)

  const keys = useMemo(() => groupByTime(composition), [composition])
  const duration = compositionDuration(composition, backgroundDuration)
  const sel = selection
    ? keys.find((g) => g.entries.some((e) => e.track === selection.track && e.key === selection.key)) ?? null
    : null

  /** Move the playhead and bring the pose with it. */
  const scrubTo = useCallback((t: number) => {
    setPlayhead(t)
    const tl = engine.timeline
    const st = useStore.getState()
    if (tl && hasAnimation(st.composition)) {
      st.setTransform(tl.sampleTransform(t, st.transform))
    }
  }, [setPlayhead])

  const timeAt = useCallback((clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const pct = Math.min(Math.max((clientX - r.left) / r.width, 0), 1)
    return Math.round(pct * duration * 1000) / 1000
  }, [duration])

  /** Retime every track that has a key at this instant, so they stay together. */
  const moveGroup = useCallback((group: PoseKey, time: number) => {
    for (const e of group.entries) moveKey(e.track, e.key, time)
  }, [moveKey])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const group = dragging.current
      if (!group) return
      const time = timeAt(e.clientX)
      moveGroup(group, time)
      // The group is rebuilt from the store on every render, so the drag has to
      // carry its own copy forward or the next move would look up a stale time.
      dragging.current = { ...group, time }
    }
    const up = () => { dragging.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [moveGroup, timeAt])

  // Space toggles playback unless a field has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space') { e.preventDefault(); setPlaying(!useStore.getState().playing) }
      if (e.code === 'KeyK') { e.preventDefault(); keyPose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyPose, setPlaying])

  const ticks = buildTicks(duration)

  return (
    <div className="timeline">
      <div className="transport">
        <button type="button" className="btn icon" onClick={() => { setPlaying(false); scrubTo(0) }} title="Go to start">⏮</button>
        <button type="button" className="btn icon primary" onClick={() => setPlaying(!playing)} title="Play / pause (space)">
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button" className={loop ? 'btn icon on' : 'btn icon'}
          onClick={() => setLoop(!loop)} title="Loop"
        >⟳</button>
        <span className="clock">{playhead.toFixed(2)}s <em>/ {duration.toFixed(2)}s</em></span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={keyPose} title="Key the pose at the playhead (K)">
          + Keyframe
        </button>
        {keys.length > 0 && (
          <button type="button" className="btn ghost" onClick={clearComposition}>
            Clear
          </button>
        )}
      </div>

      <div
        className="track" ref={trackRef}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('.kf')) return
          setPlaying(false)
          scrubTo(timeAt(e.clientX))
        }}
      >
        <div className="ruler">
          {ticks.map((t) => (
            <span key={t} className="tick" style={{ left: `${(t / duration) * 100}%` }}>
              <em>{t}s</em>
            </span>
          ))}
        </div>

        {keys.length > 1 && (
          <div
            className="span"
            style={{
              left: `${(keys[0].time / duration) * 100}%`,
              width: `${((keys[keys.length - 1].time - keys[0].time) / duration) * 100}%`,
            }}
          />
        )}

        {keys.map((g) => (
          <button
            key={`${g.entries[0].track}:${g.entries[0].key}`}
            type="button"
            className={`kf${g === sel ? ' on' : ''}`}
            style={{ left: `${(g.time / duration) * 100}%` }}
            title={`${g.time.toFixed(2)}s · ${g.ease}`}
            onPointerDown={(e) => {
              e.stopPropagation()
              dragging.current = g
              selectKey(g.entries[0])
              setPlaying(false)
              scrubTo(g.time)
            }}
          />
        ))}

        <div className="playhead" style={{ left: `${(playhead / duration) * 100}%` }} />
      </div>

      <div className="kf-detail">
        {sel ? (
          <>
            <span className="kf-title">Keyframe at</span>
            <input
              className="textfield tiny" type="number" step={0.05} min={0} value={sel.time}
              onChange={(e) => moveGroup(sel, Number(e.target.value))}
            />
            <span className="kf-title">s · ease in</span>
            <select
              className="textfield" value={sel.ease}
              onChange={(e) => {
                const ease = e.target.value as EaseName
                for (const en of sel.entries) updateKey(en.track, en.key, { ease })
              }}
            >
              {EASES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <button
              type="button" className="btn small"
              onClick={() => { for (const e of sel.entries) recaptureKey(e.track, e.key) }}
            >
              Update to current pose
            </button>
            <button
              type="button" className="btn small danger"
              onClick={() => { for (const e of sel.entries) removeKey(e.track, e.key) }}
            >
              Delete
            </button>
          </>
        ) : (
          <span className="note">
            {keys.length === 0
              ? 'Pose the device, then add a keyframe. With two or more, the pose animates between them.'
              : 'Select a keyframe to change its time or easing. Drag one along the track to retime it.'}
          </span>
        )}
      </div>
    </div>
  )
}

function buildTicks(duration: number) {
  const step = duration <= 5 ? 1 : duration <= 12 ? 2 : duration <= 30 ? 5 : 10
  const out: number[] = []
  for (let t = 0; t <= duration + 1e-6; t += step) out.push(Math.round(t * 100) / 100)
  return out
}

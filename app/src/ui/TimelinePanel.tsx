import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore, compositionDuration } from '../state/store'
import { engine } from '../engine/handle'
import { EASES, type EaseName } from '../engine/types'

export function TimelinePanel() {
  const keyframes = useStore((s) => s.keyframes)
  const playhead = useStore((s) => s.playhead)
  const playing = useStore((s) => s.playing)
  const loop = useStore((s) => s.loop)
  const setPlayhead = useStore((s) => s.setPlayhead)
  const setPlaying = useStore((s) => s.setPlaying)
  const setLoop = useStore((s) => s.setLoop)
  const addKeyframe = useStore((s) => s.addKeyframe)
  const removeKeyframe = useStore((s) => s.removeKeyframe)
  const moveKeyframe = useStore((s) => s.moveKeyframe)
  const updateKeyframe = useStore((s) => s.updateKeyframe)
  const recaptureKeyframe = useStore((s) => s.recaptureKeyframe)
  const clearKeyframes = useStore((s) => s.clearKeyframes)
  const backgroundDuration = useStore((s) => s.backgroundDuration)

  const trackRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const dragging = useRef<string | null>(null)

  const duration = compositionDuration(keyframes, backgroundDuration)
  const sel = keyframes.find((k) => k.id === selected) ?? null

  /** Move the playhead and bring the pose with it. */
  const scrubTo = useCallback((t: number) => {
    setPlayhead(t)
    const tl = engine.timeline
    if (tl && useStore.getState().keyframes.length > 0) {
      useStore.getState().setTransform(tl.sample(t))
    }
  }, [setPlayhead])

  const timeAt = useCallback((clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const pct = Math.min(Math.max((clientX - r.left) / r.width, 0), 1)
    return Math.round(pct * duration * 1000) / 1000
  }, [duration])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return
      moveKeyframe(dragging.current, timeAt(e.clientX))
    }
    const up = () => { dragging.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [moveKeyframe, timeAt])

  // Space toggles playback unless a field has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space') { e.preventDefault(); setPlaying(!useStore.getState().playing) }
      if (e.code === 'KeyK') { e.preventDefault(); addKeyframe() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addKeyframe, setPlaying])

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
        <button type="button" className="btn" onClick={addKeyframe} title="Add a keyframe at the playhead (K)">
          + Keyframe
        </button>
        {keyframes.length > 0 && (
          <button type="button" className="btn ghost" onClick={() => { clearKeyframes(); setSelected(null) }}>
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

        {keyframes.length > 1 && (
          <div
            className="span"
            style={{
              left: `${(keyframes[0].time / duration) * 100}%`,
              width: `${((keyframes[keyframes.length - 1].time - keyframes[0].time) / duration) * 100}%`,
            }}
          />
        )}

        {keyframes.map((k) => (
          <button
            key={k.id}
            type="button"
            className={`kf${k.id === selected ? ' on' : ''}`}
            style={{ left: `${(k.time / duration) * 100}%` }}
            title={`${k.time.toFixed(2)}s · ${k.ease}`}
            onPointerDown={(e) => {
              e.stopPropagation()
              dragging.current = k.id
              setSelected(k.id)
              setPlaying(false)
              scrubTo(k.time)
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
              onChange={(e) => moveKeyframe(sel.id, Number(e.target.value))}
            />
            <span className="kf-title">s · ease in</span>
            <select
              className="textfield" value={sel.ease}
              onChange={(e) => updateKeyframe(sel.id, { ease: e.target.value as EaseName })}
            >
              {EASES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <button type="button" className="btn small" onClick={() => recaptureKeyframe(sel.id)}>
              Update to current pose
            </button>
            <button type="button" className="btn small danger" onClick={() => { removeKeyframe(sel.id); setSelected(null) }}>
              Delete
            </button>
          </>
        ) : (
          <span className="note">
            {keyframes.length === 0
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

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../state/store'
import { trackDef } from '../engine/tracks'
import { SEED_BEZIER, clamp, easeFn } from './ease'
import { ScrubField } from './ScrubField'
import { EASES, type EaseName } from '../engine/types'

const CURVE_W = 104
const CURVE_H = 104
/** Room above and below the unit square for eases that overshoot, like back. */
const OVERSHOOT = 0.28

/**
 * What the inspector shows while something on the timeline is selected.
 *
 * Two panels, because easing belongs to the *segment* between two keys and not
 * to either end of it: selecting a key offers its time and values, selecting a
 * segment offers the transition. Selecting the thing you are editing beats
 * selecting a proxy for it.
 */
export function InspectorTiming() {
  const selection = useStore((s) => s.selection)
  const composition = useStore((s) => s.composition)
  const updateKey = useStore((s) => s.updateKey)
  const moveKey = useStore((s) => s.moveKey)
  const removeKey = useStore((s) => s.removeKey)
  const recaptureKey = useStore((s) => s.recaptureKey)
  const selectKey = useStore((s) => s.selectKey)

  const track = selection ? composition.tracks[selection.track] : undefined
  const def = selection ? trackDef(selection.track) : undefined
  const index = track && selection ? track.keys.findIndex((k) => k.id === selection.key) : -1
  const key = index >= 0 ? track!.keys[index] : null
  const prev = index > 0 ? track!.keys[index - 1] : null

  const ease = useMemo(() => (key ? easeFn(key) : null), [key])

  if (!selection || !track || !def || !key) return null

  const isCustom = key.ease === 'custom'
  const segment = selection.kind === 'segment'

  return (
    <div className="insp-timing">
      <header className="insp-timing-head">
        <h3>{segment ? 'Edit Transition' : 'Edit Keyframe'}</h3>
        <button type="button" className="tl-head-btn" title="Close" onClick={() => selectKey(null)}>×</button>
      </header>
      <p className="note">
        {def.label}
        {segment && prev ? ` · ${prev.time.toFixed(2)}s → ${key.time.toFixed(2)}s` : ` · ${key.time.toFixed(2)}s`}
      </p>

      <div className="tr">
      {segment && <BezierCurve
        ease={ease}
        bezier={isCustom ? key.bezier ?? SEED_BEZIER : null}
        onChange={(bezier) => updateKey(selection.track, key.id, { ease: 'custom', bezier })}
      />}

      <div className="tr-cols">
        <div className="tr-col">
          <span className="tr-title">Timing</span>
          <label className="tr-field">
            <span>Time</span>
            <ScrubField
              value={key.time} step={0.05} min={0} handle="S" suffix="s" width={92}
              onChange={(t) => moveKey(selection.track, key.id, t)}
            />
          </label>
          {segment && prev ? (
            <label className="tr-field">
              <span>Duration</span>
              <ScrubField
                value={Math.round((key.time - prev.time) * 1000) / 1000}
                step={0.05} min={0.05} handle="S" suffix="s" width={92}
                // Duration is the gap, so changing it moves this key, not the
                // one before it — the transition grows to the right.
                onChange={(d) => moveKey(selection.track, key.id, prev.time + Math.max(0.05, d))}
              />
            </label>
          ) : !prev ? (
            <span className="note">First key — nothing eases into it.</span>
          ) : null}
        </div>

        {segment && <div className="tr-col">
          <span className="tr-title">Transition</span>
          <label className="tr-field">
            <span>Ease</span>
            <select
              className="textfield" value={key.ease}
              disabled={!prev}
              onChange={(e) => {
                const value = e.target.value
                updateKey(selection.track, key.id, value === 'custom'
                  ? { ease: 'custom', bezier: key.bezier ?? SEED_BEZIER }
                  : { ease: value as EaseName })
              }}
            >
              {EASES.map((e) => <option key={e} value={e}>{e}</option>)}
              <option value="custom">custom…</option>
            </select>
          </label>
          {isCustom && (
            <span className="note">
              cubic-bezier({(key.bezier ?? SEED_BEZIER).map((n) => n.toFixed(2)).join(', ')})
            </span>
          )}
        </div>}

        <div className="tr-col grow">
          <span className="tr-title">Value</span>
          <div className="tr-values">
            {def.channels.map((ch) => (
              <ScrubField
                key={ch.key}
                value={round(key.value[ch.key])}
                step={ch.step}
                handle={ch.label}
                colour={ch.colour}
                suffix={ch.unit}
                title={`Drag ${ch.label} to change it, or click to type`}
                onChange={(n) => updateKey(selection.track, key.id, { value: { ...key.value, [ch.key]: n } })}
              />
            ))}
          </div>
        </div>

        <div className="tr-col">
          <button
            type="button" className="btn small"
            title="Replace this key's values with the current pose"
            onClick={() => recaptureKey(selection.track, key.id)}
          >
            Capture
          </button>
          <button
            type="button" className="btn small danger"
            onClick={() => removeKey(selection.track, key.id)}
          >
            Delete
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

/**
 * The easing curve, sampled rather than drawn from its parameters.
 *
 * Sampling is what lets one preview serve every preset: `back` and `expo` are
 * not cubic beziers, so a bezier-shaped preview would quietly misrepresent
 * them. Only a custom curve gets draggable handles.
 */
function BezierCurve({
  ease, bezier, onChange,
}: {
  ease: ((x: number) => number) | null
  bezier: [number, number, number, number] | null
  onChange: (b: [number, number, number, number]) => void
}) {
  const ref = useRef<SVGSVGElement>(null)
  const dragging = useRef<0 | 1 | null>(null)

  /**
   * Curve space has y running up from 0 at the bottom, which is how an easing
   * graph is read, and the overshoot margin is folded into the unit box rather
   * than stretching the viewBox — a non-square viewBox would turn the drag
   * handles into ellipses.
   */
  const Y = useCallback((y: number) => (1 + OVERSHOOT - y) / (1 + OVERSHOOT * 2), [])

  const path = useMemo(() => {
    if (!ease) return ''
    const pts: string[] = []
    for (let i = 0; i <= 48; i++) {
      const x = i / 48
      pts.push(`${x.toFixed(4)},${Y(ease(x)).toFixed(4)}`)
    }
    return `M${pts.join(' L')}`
  }, [Y, ease])

  const pointAt = useCallback((e: PointerEvent | React.PointerEvent) => {
    const svg = ref.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    const raw = 1 - (e.clientY - r.top) / r.height
    return {
      // x stays inside the segment; y may overshoot, which is how an
      // anticipation or an overshoot gets drawn by hand.
      x: clamp((e.clientX - r.left) / r.width, 0, 1),
      y: clamp(raw * (1 + OVERSHOOT * 2) - OVERSHOOT, -OVERSHOOT, 1 + OVERSHOOT),
    }
  }, [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const which = dragging.current
      if (which === null || !bezier) return
      const p = pointAt(e)
      if (!p) return
      const next = [...bezier] as [number, number, number, number]
      next[which * 2] = round(p.x)
      next[which * 2 + 1] = round(p.y)
      onChange(next)
    }
    const up = () => { dragging.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [bezier, onChange, pointAt])

  return (
    <svg
      ref={ref} className="tr-curve" width={CURVE_W} height={CURVE_H} viewBox="0 0 1 1"
    >
      <rect x={0} y={Y(1)} width={1} height={Y(0) - Y(1)} className="tr-curve-box" />
      {bezier && (
        <>
          <line x1={0} y1={Y(0)} x2={bezier[0]} y2={Y(bezier[1])} className="tr-curve-arm" />
          <line x1={1} y1={Y(1)} x2={bezier[2]} y2={Y(bezier[3])} className="tr-curve-arm" />
        </>
      )}
      <path d={path} className="tr-curve-line" />
      {bezier && ([0, 1] as const).map((i) => (
        <circle
          key={i} cx={bezier[i * 2]} cy={Y(bezier[i * 2 + 1])} r={0.05}
          className="tr-curve-handle"
          onPointerDown={(e) => { e.stopPropagation(); dragging.current = i }}
        />
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ */

const round = (n: number) => Math.round(n * 1000) / 1000

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { trackDef } from '../engine/tracks'
import type { Track } from '../engine/types'
import { easeFn } from './ease'

/** Samples per segment. Enough that a strong ease reads as a curve, not a chord. */
const STEPS = 24
/** Breathing room above and below the data, as a fraction of its range. */
const PAD = 0.18

interface Props {
  track: Track
  /** Seconds -> pixels, shared with the lane view so the ruler still lines up. */
  pxPerSec: number
  gutter: number
  height: number
  /** Which channels are drawn. */
  hidden: ReadonlySet<string>
}

/**
 * The value graph: what each channel is worth over time, rather than merely
 * when it changes.
 *
 * It replaces the lanes rather than sitting beside them, so it inherits the
 * ruler, the zoom, the scroll position and the playhead — a graph on its own
 * time axis would be a second thing to keep in sync.
 *
 * Curves are sampled through the same ease function playback uses, so what is
 * drawn is what happens. Points drag in both axes: sideways retimes the key,
 * up and down changes its value.
 */
export function CurveEditor({ track, pxPerSec, gutter, height, hidden }: Props) {
  const def = trackDef(track.id)
  const selection = useStore((s) => s.selection)
  const selectKey = useStore((s) => s.selectKey)
  const updateKey = useStore((s) => s.updateKey)
  const setPlaying = useStore((s) => s.setPlaying)

  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ key: string; channel: string } | null>(null)
  const [, force] = useState(0)

  const channels = useMemo(
    () => (def?.channels ?? []).filter((c) => !hidden.has(c.key)),
    [def, hidden],
  )

  /** One scale for every channel, so their relative movement stays readable. */
  const scale = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const key of track.keys) {
      for (const ch of channels) {
        const v = key.value[ch.key]
        if (!Number.isFinite(v)) continue
        lo = Math.min(lo, v)
        hi = Math.max(hi, v)
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 }
    // A flat channel would give a zero-height box and divide by nothing.
    if (hi - lo < 1e-6) return { lo: lo - 0.5, hi: hi + 0.5 }
    const pad = (hi - lo) * PAD
    return { lo: lo - pad, hi: hi + pad }
  }, [track.keys, channels])

  const yFor = useCallback(
    (v: number) => height - ((v - scale.lo) / (scale.hi - scale.lo)) * height,
    [height, scale],
  )
  const valueAt = useCallback(
    (y: number) => scale.hi - (y / height) * (scale.hi - scale.lo),
    [height, scale],
  )
  const xFor = useCallback((t: number) => gutter + t * pxPerSec, [gutter, pxPerSec])

  /* ---------------- dragging a point ---------------- */
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      const svg = svgRef.current
      if (!d || !svg) return
      const r = svg.getBoundingClientRect()
      const key = track.keys.find((k) => k.id === d.key)
      if (!key) return
      const time = Math.max(0, Math.round(((e.clientX - r.left - gutter) / pxPerSec) * 1000) / 1000)
      const value = round(valueAt(e.clientY - r.top))
      // Both axes in one write. Two calls would carry two coalesce keys, which
      // break each other's run and put a history entry on every pointermove.
      // Alt holds the time, so a value can be tuned without nudging the rhythm.
      updateKey(track.id, d.key, {
        ...(e.altKey ? {} : { time }),
        value: { ...key.value, [d.channel]: value },
      })
      force((n) => n + 1)
    }
    const up = () => { drag.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [gutter, pxPerSec, track.id, track.keys, updateKey, valueAt])

  if (!def) return null

  return (
    <svg
      ref={svgRef} className="cv" height={height}
      style={{ width: '100%' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Value gridlines, labelled at the extremes and the middle. */}
      {[0, 0.5, 1].map((f) => {
        const v = scale.lo + (scale.hi - scale.lo) * (1 - f)
        return (
          <g key={f}>
            <line x1={0} x2="100%" y1={f * height} y2={f * height} className="cv-grid" />
            <text x={4} y={f * height} className="cv-label" dominantBaseline={f === 0 ? 'hanging' : f === 1 ? 'auto' : 'central'}>
              {formatValue(v)}{def.channels[0].unit ?? ''}
            </text>
          </g>
        )
      })}

      {channels.map((ch) => (
        <path key={ch.key} d={pathFor(track, ch.key, xFor, yFor)} className="cv-line" stroke={ch.colour} />
      ))}

      {channels.map((ch) =>
        track.keys.map((k) => {
          const on = selection?.track === track.id && selection.key === k.id
          return (
            <circle
              key={`${ch.key}:${k.id}`}
              cx={xFor(k.time)} cy={yFor(k.value[ch.key])} r={on ? 5.5 : 4}
              className="cv-point" fill={ch.colour}
              onPointerDown={(e) => {
                e.stopPropagation()
                setPlaying(false)
                selectKey({ track: track.id, key: k.id })
                drag.current = { key: k.id, channel: ch.key }
              }}
            >
              <title>{`${ch.label} ${formatValue(k.value[ch.key])} at ${k.time.toFixed(2)}s`}</title>
            </circle>
          )
        }),
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ */

function pathFor(
  track: Track,
  channel: string,
  xFor: (t: number) => number,
  yFor: (v: number) => number,
): string {
  const keys = track.keys
  if (keys.length === 0) return ''
  if (keys.length === 1) {
    // One key pins the property for the whole composition: a flat line says so.
    const y = yFor(keys[0].value[channel])
    return `M${xFor(0)},${y} L${xFor(keys[0].time)},${y}`
  }

  const parts: string[] = []
  // Before the first key the value holds, which is what playback does.
  parts.push(`M${xFor(0)},${yFor(keys[0].value[channel])}`)
  parts.push(`L${xFor(keys[0].time)},${yFor(keys[0].value[channel])}`)

  for (let i = 1; i < keys.length; i++) {
    const prev = keys[i - 1]
    const cur = keys[i]
    const from = prev.value[channel]
    const to = cur.value[channel]
    const ease = easeFn(cur)
    for (let s = 1; s <= STEPS; s++) {
      const p = s / STEPS
      const t = prev.time + (cur.time - prev.time) * p
      parts.push(`L${xFor(t).toFixed(2)},${yFor(from + (to - from) * ease(p)).toFixed(2)}`)
    }
  }
  return parts.join(' ')
}

const round = (n: number) => Math.round(n * 1000) / 1000

function formatValue(v: number) {
  const a = Math.abs(v)
  if (a >= 100) return v.toFixed(0)
  if (a >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

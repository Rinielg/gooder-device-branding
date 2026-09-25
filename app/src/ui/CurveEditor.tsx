import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { trackDef } from '../engine/tracks'
import type { Track, TrackKey } from '../engine/types'
import { SEED_BEZIER, bezierFromHandle, bezierHandles, type Anchor } from './ease'
import { segmentPaths, valueScale } from './curvePaths'

interface Props {
  track: Track
  /** Seconds -> pixels, shared with the lane view so the ruler still lines up. */
  pxPerSec: number
  gutter: number
  height: number
  /** Which channels are drawn. */
  hidden: ReadonlySet<string>
}

type Drag =
  | { kind: 'point'; key: string; channel: string }
  | { kind: 'handle'; key: string; channel: string; which: 0 | 1 }

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
 * up and down changes its value. Clicking the curve between two points selects
 * that transition, and a custom one can then be shaped by its handles here,
 * on the curve, instead of in a separate unit square.
 */
export function CurveEditor({ track, pxPerSec, gutter, height, hidden }: Props) {
  const def = trackDef(track.id)
  const selection = useStore((s) => s.selection)
  const selectKey = useStore((s) => s.selectKey)
  const updateKey = useStore((s) => s.updateKey)
  const setPlaying = useStore((s) => s.setPlaying)

  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const [, force] = useState(0)

  const channels = useMemo(
    () => (def?.channels ?? []).filter((c) => !hidden.has(c.key)),
    [def, hidden],
  )

  /* ---------------- the handles of the selected transition ---------------- */

  /**
   * Handles hang off one channel, not all of them. A track's bezier is shared
   * by its channels, so three sets of handles would be three ways to drive one
   * value — the first channel that actually moves gets them, since a channel
   * that ends where it started has no value axis to place them on.
   */
  const shaping = useMemo(() => {
    if (!selection || selection.kind !== 'segment' || selection.track !== track.id) return null
    const i = track.keys.findIndex((k) => k.id === selection.key)
    if (i < 1) return null
    const cur = track.keys[i]
    const prev = track.keys[i - 1]
    if (cur.ease !== 'custom') return null
    const ch = channels.find((c) => Math.abs(cur.value[c.key] - prev.value[c.key]) > 1e-9)
    if (!ch) return null
    const anchor: Anchor = {
      t0: prev.time, v0: prev.value[ch.key],
      t1: cur.time, v1: cur.value[ch.key],
    }
    return { key: cur, prev, channel: ch, anchor, bezier: cur.bezier ?? SEED_BEZIER }
  }, [selection, track.id, track.keys, channels])

  /* ---------------- the value axis ---------------- */

  /**
   * One axis for every channel, so their relative movement stays readable, and
   * wide enough to hold the handles as well as the keys.
   */
  const live = useMemo(() => {
    const values: number[] = []
    for (const key of track.keys) for (const ch of channels) values.push(key.value[ch.key])
    if (shaping) for (const p of bezierHandles(shaping.bezier, shaping.anchor)) values.push(p.value)
    return valueScale(values)
  }, [track.keys, channels, shaping])

  /**
   * The axis holds still for the length of a drag.
   *
   * It is derived from what is drawn, so without this a handle dragged upward
   * would stretch the axis it is measured against and drift away from the
   * pointer — the drag would fight itself.
   */
  const [frozen, setFrozen] = useState<{ lo: number; hi: number } | null>(null)
  const scale = frozen ?? live

  const yFor = useCallback(
    (v: number) => height - ((v - scale.lo) / (scale.hi - scale.lo)) * height,
    [height, scale],
  )
  const valueAt = useCallback(
    (y: number) => scale.hi - (y / height) * (scale.hi - scale.lo),
    [height, scale],
  )
  const xFor = useCallback((t: number) => gutter + t * pxPerSec, [gutter, pxPerSec])
  const timeAt = useCallback((x: number) => (x - gutter) / pxPerSec, [gutter, pxPerSec])

  /* ---------------- dragging ---------------- */
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      const svg = svgRef.current
      if (!d || !svg) return
      const r = svg.getBoundingClientRect()
      const key = track.keys.find((k) => k.id === d.key)
      if (!key) return
      const time = timeAt(e.clientX - r.left)
      const value = round(valueAt(e.clientY - r.top))

      if (d.kind === 'handle') {
        const i = track.keys.indexOf(key)
        const prev = track.keys[i - 1]
        if (!prev) return
        const bezier = bezierFromHandle(
          d.which, { time, value },
          { t0: prev.time, v0: prev.value[d.channel], t1: key.time, v1: key.value[d.channel] },
          key.bezier ?? SEED_BEZIER,
        )
        if (bezier) updateKey(track.id, d.key, { ease: 'custom', bezier })
      } else {
        // Both axes in one write. Two calls would carry two coalesce keys, which
        // break each other's run and put a history entry on every pointermove.
        // Alt holds the time, so a value can be tuned without nudging the rhythm.
        updateKey(track.id, d.key, {
          ...(e.altKey ? {} : { time: Math.max(0, round(time)) }),
          value: { ...key.value, [d.channel]: value },
        })
      }
      force((n) => n + 1)
    }
    const up = () => { drag.current = null; setFrozen(null) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [track.id, track.keys, updateKey, valueAt, timeAt])

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

      {channels.map((ch) =>
        segmentPaths(track, ch.key, xFor, yFor).map((seg, i) => {
          const on = seg.keyId != null
            && selection?.track === track.id && selection.key === seg.keyId
            && selection.kind === 'segment'
          return (
            <g key={`${ch.key}:${seg.keyId ?? 'lead'}:${i}`}>
              <path d={seg.d} className={on ? 'cv-line on' : 'cv-line'} stroke={ch.colour} />
              {seg.keyId && (
                <path
                  d={seg.d} className="cv-hit"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setPlaying(false)
                    selectKey({ track: track.id, key: seg.keyId!, kind: 'segment' })
                  }}
                >
                  <title>Click to edit this transition</title>
                </path>
              )}
            </g>
          )
        }),
      )}

      {shaping && bezierHandles(shaping.bezier, shaping.anchor).map((p, i) => (
        <g key={`handle${i}`}>
          <line
            className="cv-arm"
            x1={xFor(i === 0 ? shaping.anchor.t0 : shaping.anchor.t1)}
            y1={yFor(i === 0 ? shaping.anchor.v0 : shaping.anchor.v1)}
            x2={xFor(p.time)} y2={yFor(p.value)}
          />
          <circle
            cx={xFor(p.time)} cy={yFor(p.value)} r={5}
            className="cv-handle"
            onPointerDown={(e) => {
              e.stopPropagation()
              setPlaying(false)
              setFrozen(live)
              drag.current = { kind: 'handle', key: shaping.key.id, channel: shaping.channel.key, which: i as 0 | 1 }
            }}
          >
            <title>Drag to shape this transition</title>
          </circle>
        </g>
      ))}

      {channels.map((ch) =>
        track.keys.map((k: TrackKey) => {
          const on = selection?.track === track.id && selection.key === k.id
          return (
            <circle
              key={`${ch.key}:${k.id}`}
              cx={xFor(k.time)} cy={yFor(k.value[ch.key])} r={on ? 5.5 : 4}
              className="cv-point" fill={ch.colour}
              onPointerDown={(e) => {
                e.stopPropagation()
                setPlaying(false)
                selectKey({ track: track.id, key: k.id, kind: 'key' })
                setFrozen(live)
                drag.current = { kind: 'point', key: k.id, channel: ch.key }
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

const round = (n: number) => Math.round(n * 1000) / 1000

function formatValue(v: number) {
  const a = Math.abs(v)
  if (a >= 100) return v.toFixed(0)
  if (a >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

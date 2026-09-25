import { useCallback, useEffect, useRef, useState } from 'react'
import { evaluate } from './expr'

/**
 * A number field with a drag handle on its left edge.
 *
 * The handle scrubs, the body types. That split is the whole idea: a field that
 * tries to be both — click to focus, drag to adjust — has to guess which one you
 * meant from how far you moved, and guesses wrong often enough to be annoying.
 * Two hit areas, no guessing. Spline puts the axis letter in the handle, which
 * is why the letter is the label here rather than decoration.
 *
 * `step` is the change per pixel dragged, not an arrow-key increment: 1 for
 * degrees, 0.01 for a scale factor. Shift multiplies it by ten, alt divides it
 * by ten. Those two are ours — the audit could not confirm what Spline uses.
 */
export function ScrubField({
  value, onChange, handle, colour, step = 1, min, max, suffix, title, width,
}: {
  value: number
  onChange: (v: number) => void
  /** Text in the drag zone — an axis letter, or a unit. */
  handle?: string
  /** Tints the handle, so a channel's colour reaches its field. */
  colour?: string
  /** Units per pixel dragged. */
  step?: number
  min?: number
  max?: number
  suffix?: string
  title?: string
  width?: number
}) {
  const [text, setText] = useState<string | null>(null)
  const drag = useRef<{ x: number; from: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const clamp = useCallback((n: number) => {
    if (min !== undefined && n < min) return min
    if (max !== undefined && n > max) return max
    return n
  }, [min, max])

  /* ---------------- scrubbing ---------------- */
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      e.preventDefault()
      const rate = step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1)
      const next = d.from + (e.clientX - d.x) * rate
      // Rounded to the rate's own precision, so a 0.01/px drag does not
      // produce 1.0300000000000002.
      onChange(clamp(Math.round(next / rate) * rate))
    }
    const up = () => {
      if (!drag.current) return
      drag.current = null
      document.body.classList.remove('scrubbing')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [clamp, onChange, step])

  /* ---------------- typing ---------------- */
  const commit = useCallback((raw: string) => {
    const n = evaluate(raw)
    // Unparseable input reverts rather than erroring: there is nowhere sensible
    // to put an error message on a 60px field, and the old value is right there.
    if (n !== null) onChange(clamp(n))
    setText(null)
  }, [clamp, onChange])

  const shown = text ?? format(value)

  return (
    <span className="scrub" style={width ? { width } : undefined} title={title}>
      {handle && (
        <button
          type="button"
          className="scrub-handle"
          style={colour ? { color: colour } : undefined}
          tabIndex={-1}
          aria-label={`Drag to change ${handle}`}
          onPointerDown={(e) => {
            e.preventDefault()
            drag.current = { x: e.clientX, from: value }
            document.body.classList.add('scrubbing')
          }}
        >{handle}</button>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={shown}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commit(e.currentTarget.value); e.currentTarget.select() }
          else if (e.key === 'Escape') { setText(null); e.currentTarget.blur() }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const dir = e.key === 'ArrowUp' ? 1 : -1
            const inc = step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1)
            onChange(clamp(Math.round((value + dir * inc) / inc) * inc))
            setText(null)
          }
        }}
      />
      {suffix && <em>{suffix}</em>}
    </span>
  )
}


const format = (n: number) => String(Math.round(n * 1000) / 1000)

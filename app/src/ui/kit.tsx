import { useRef, type ReactNode } from 'react'
import { round } from './format'

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h3>{title}</h3>
        {aside}
      </header>
      <div className="section-body">{children}</div>
    </section>
  )
}

export function Row({ label, children, hint, stack, animated }: {
  label: string; children: ReactNode; hint?: string; stack?: boolean
  /** Marks a control the timeline is driving, so a moving slider has a reason. */
  animated?: boolean
}) {
  return (
    <label className={stack ? 'row stack' : 'row'}>
      <span className="row-label">
        {label}
        {animated && <i className="row-keyed" title="Animated on the timeline" />}
        {hint && <em>{hint}</em>}
      </span>
      <span className="row-control">{children}</span>
    </label>
  )
}

export function Slider({
  value, min, max, step = 0.01, onChange, format,
}: {
  value: number; min: number; max: number; step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <span className="slider">
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{format ? format(value) : round(value)}</output>
    </span>
  )
}

export function NumberInput({
  value, min, max, step = 1, onChange, suffix,
}: {
  value: number; min?: number; max?: number; step?: number
  onChange: (v: number) => void; suffix?: string
}) {
  return (
    <span className="numfield">
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
      {suffix && <em>{suffix}</em>}
    </span>
  )
}

export function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <span className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  )
}

export function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="colorfield">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <code>{value.toUpperCase()}</code>
    </span>
  )
}

export function FileButton({
  accept, label, onFile, compact,
}: { accept: string; label: string; onFile: (file: File) => void; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" className={compact ? 'btn small' : 'btn'} onClick={() => ref.current?.click()}>
        {label}
      </button>
      <input
        ref={ref} type="file" accept={accept} hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </>
  )
}


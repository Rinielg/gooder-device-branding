/**
 * Arithmetic, so `50*2` and `10+5` work in a field.
 *
 * Hand-written rather than handed to `Function`, which would turn a number
 * field into an eval surface for anything that can put text in it — a pasted
 * value, an imported project, a future automation writing a preset.
 */
export function evaluate(src: string): number | null {
  let i = 0
  const s = src.trim()
  if (!s) return null

  const ws = () => { while (i < s.length && s[i] === ' ') i++ }

  const factor = (): number | null => {
    ws()
    if (s[i] === '-') { i++; const v = factor(); return v === null ? null : -v }
    if (s[i] === '+') { i++; return factor() }
    if (s[i] === '(') {
      i++
      const v = expr()
      ws()
      if (s[i] !== ')') return null
      i++
      return v
    }
    const start = i
    while (i < s.length && /[0-9.]/.test(s[i])) i++
    if (i === start) return null
    const n = Number(s.slice(start, i))
    return Number.isFinite(n) ? n : null
  }

  const term = (): number | null => {
    let v = factor()
    if (v === null) return null
    for (;;) {
      ws()
      const op = s[i]
      if (op !== '*' && op !== '/') return v
      i++
      const r = factor()
      if (r === null) return null
      if (op === '/' && r === 0) return null
      v = op === '*' ? v * r : v / r
    }
  }

  const expr = (): number | null => {
    let v = term()
    if (v === null) return null
    for (;;) {
      ws()
      const op = s[i]
      if (op !== '+' && op !== '-') return v
      i++
      const r = term()
      if (r === null) return null
      v = op === '+' ? v + r : v - r
    }
  }

  const out = expr()
  ws()
  // Trailing junk means the whole thing was not an expression.
  return i === s.length && out !== null && Number.isFinite(out) ? out : null
}

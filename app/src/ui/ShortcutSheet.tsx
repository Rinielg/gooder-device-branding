import { useEffect, useMemo, useRef, useState } from 'react'
import { SHORTCUT_GROUPS, keyLabel, matchShortcuts } from './shortcuts'

/**
 * The shortcut sheet.
 *
 * Searchable because the list is long enough that reading it is slower than
 * asking it a question, and because the thing people usually want is one
 * answer — "how do I delete a keyframe" — not the whole catalogue.
 */
export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const groups = useMemo(() => matchShortcuts(SHORTCUT_GROUPS, query), [query])

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-scrim" onPointerDown={onClose}>
      <div
        className="sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="sheet-search">
          <span aria-hidden>⌕</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Search for the shortcut here…"
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="insp-close" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <div className="sheet-body">
          {groups.map((g) => (
            <section key={g.title}>
              <h4>{g.title}</h4>
              {g.items.map((i) => (
                <div key={`${g.title}:${i.action}`} className="sheet-row">
                  <span>
                    {i.action}
                    {i.note && <em>{i.note}</em>}
                  </span>
                  <span className="sheet-keys">
                    {i.keys.map((k, n) => <kbd key={`${k}${n}`}>{keyLabel(k)}</kbd>)}
                  </span>
                </div>
              ))}
            </section>
          ))}
          {groups.length === 0 && <p className="note">No shortcut matches “{query}”.</p>}
        </div>
      </div>
    </div>
  )
}

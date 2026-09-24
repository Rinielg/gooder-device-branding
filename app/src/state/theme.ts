export type Theme = 'light' | 'dark'

/**
 * Kept in its own key rather than in the project.
 *
 * A theme belongs to the workstation, not to the artwork: it must not travel
 * inside an exported project, and it must not become an undo step.
 */
const KEY = 'gooder-device-branding.theme'

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* private mode */ }
  return 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem(KEY, theme) } catch { /* quota */ }
}

// Applied at import, before React renders, so the first paint is already right.
applyTheme(readTheme())

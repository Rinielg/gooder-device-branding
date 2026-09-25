import { useStore } from '../state/store'

/**
 * Save and load, in one place.
 *
 * Both the Angles tab and the side menu offer them, and a second copy of the
 * download dance is a second thing to keep right.
 */
export function saveProjectFile(): string {
  const name = 'mockup-project.json'
  const blob = new Blob([JSON.stringify(useStore.getState().exportProject(), null, 2)], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return name
}

/** True when the file was readable as a project. */
export async function loadProjectFile(file: File): Promise<boolean> {
  try {
    useStore.getState().importProject(JSON.parse(await file.text()))
    return true
  } catch {
    return false
  }
}

/** Ask for a file without a visible input, for menus that have no room for one. */
export function pickProjectFile(onDone: (ok: boolean) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = async () => {
    const f = input.files?.[0]
    if (f) onDone(await loadProjectFile(f))
  }
  input.click()
}

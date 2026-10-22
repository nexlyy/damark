import { lazy, type ComponentType } from 'react'

const FLAG = 'damark-reloaded-for-update'

function once(): boolean {
  try {
    if (sessionStorage.getItem(FLAG)) return false
    sessionStorage.setItem(FLAG, '1')
    return true
  } catch {
    return false
  }
}

// After a new version is published, a page opened earlier asks for script
// files that no longer exist. Reload once to pick up the new version rather
// than leave the screen stuck; a second failure is a real error and is shown.
export function lazyPage<T extends ComponentType>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().then(
      (mod) => {
        try {
          sessionStorage.removeItem(FLAG)
        } catch {
          // storage unavailable: nothing to clear
        }
        return mod
      },
      (error) => {
        if (once()) {
          location.reload()
          return new Promise<never>(() => {})
        }
        throw error
      },
    ),
  )
}

window.addEventListener('vite:preloadError', (event) => {
  if (once()) {
    event.preventDefault()
    location.reload()
  }
})

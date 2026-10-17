// Android Chrome announces once, early, that the page can be installed. Keep
// that announcement until the admin screen that offers the button is open.

export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
}

type Listener = (event: InstallPromptEvent | null) => void

const listeners = new Set<Listener>()

export const installPrompt = {
  event: null as InstallPromptEvent | null,
  listen(fn: Listener) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPrompt.event = e as InstallPromptEvent
  listeners.forEach((fn) => fn(installPrompt.event))
})

window.addEventListener('appinstalled', () => {
  installPrompt.event = null
  listeners.forEach((fn) => fn(null))
})

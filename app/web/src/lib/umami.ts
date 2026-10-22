// Shop statistics in Umami: page views come by themselves (Umami follows
// the address as the app changes pages); these name the steps that matter.

declare global {
  interface Window {
    umami?: { track: (name: string, data?: Record<string, string | number>) => void }
  }
}

export function loadUmami(websiteId: string) {
  if (document.querySelector('script[data-website-id]')) return
  const s = document.createElement('script')
  s.defer = true
  s.src = 'https://cloud.umami.is/script.js'
  s.dataset.websiteId = websiteId
  document.head.appendChild(s)
}

export function track(name: string, data?: Record<string, string | number>) {
  try {
    window.umami?.track(name, data)
  } catch {
    /* blocked or not loaded */
  }
}

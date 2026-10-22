// Line icons, 24×24, drawn with currentColor.

const paths: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.2-4.2',
  heart: 'M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z',
  bag: 'M5 8h14l-1 12H6L5 8Zm4 0V7a3 3 0 0 1 6 0v1',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  left: 'm15 5-7 7 7 7',
  right: 'm9 5 7 7-7 7',
  down: 'm5 9 7 7 7-7',
  up: 'm5 15 7-7 7 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M5 7h14M10 7V5h4v2m-7 0 1 13h8l1-13',
  check: 'm5 12 5 5 9-10',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4',
  truck: 'M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z',
  box: 'M4 8 12 4l8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4M12 12v8',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a5.5 5.5 0 0 1 3 5.5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-1.6.6 2-2 2-1.9-.8a7 7 0 0 1-1.6.9L14 20h-4l-.5-2.5a7 7 0 0 1-1.6-.9l-1.9.8-2-2 .6-2a7 7 0 0 1 0-2.8l-.6-2 2-2 1.9.8a7 7 0 0 1 1.6-.9L10 4h4l.5 2.5a7 7 0 0 1 1.6.9l1.9-.8 2 2-.6 2a7 7 0 0 1 0 2.8Z',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H3',
  star: 'm12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6L12 4Z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  photo: 'M4 6h16v13H4zM4 15l4-4 4 4 3-3 5 5M15.5 9.5a1 1 0 1 0 0-.01',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  filter: 'M4 6h16M7 12h10M10 18h4',
  alert: 'M12 3 2.5 20h19L12 3Zm0 6v5m0 3v.01',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  cash: 'M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 10v.01M18 14v.01',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2',
  tag: 'M3 12V4h8l9 9-8 8-9-9Zm5-4.5a1 1 0 1 0 0 .01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  doc: 'M6 3h9l4 4v14H6V3Zm9 0v4h4M9 12h7M9 16h7',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
}

export function Icon({ name, size = 22, filled = false, className }: { name: string; size?: number; filled?: boolean; className?: string }) {
  if (name === 'telegram')
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path fill="currentColor" d="M21.4 4.3 18.3 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7 8.6-7.8c.4-.3-.1-.5-.6-.2L6.5 12.9 2 11.5c-1-.3-1-1 .2-1.5l17.6-6.8c.8-.3 1.5.2 1.6 1.1Z" />
      </svg>
    )
  if (name === 'instagram')
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" className={className}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r=".8" fill="currentColor" />
      </svg>
    )
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={paths[name] ?? ''} />
    </svg>
  )
}

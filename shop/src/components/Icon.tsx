const c = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`

const PATHS = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  box: 'M3 7.5 12 3l9 4.5-9 4.5-9-4.5ZM3 7.5V17l9 4.5 9-4.5V7.5M12 12v9.5',
  live: c(12, 12, 2) + 'M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2',
  orders: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h3',
  users: 'M15.5 20v-1a4 4 0 0 0-4-4h-5a4 4 0 0 0-4 4v1' + c(9, 7.5, 3.5) + 'M21.5 20v-1a4 4 0 0 0-3-3.9M15.5 4.1a3.5 3.5 0 0 1 0 6.8',
  layers: 'M12 3 21 8l-9 5-9-5 9-5ZM3 12.5l9 5 9-5M3 17l9 5 9-5',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9' + c(15, 7, 2) + c(9, 17, 2),
  plus: 'M12 5v14M5 12h14',
  search: c(11, 11, 7) + 'M16 16l4.5 4.5',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4V8Z' + c(12, 13, 3.5),
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Z',
  back: 'm15 18-6-6 6-6',
  chevron: 'm9 6 6 6-6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  check: 'm5 12 5 5 9-10',
  store: 'M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9h16M9.5 20v-6h5v6',
  alert: 'M12 3.5 22 20H2L12 3.5ZM12 10v4.5M12 17.2v.3',
  truck: 'M2.5 6h11.5v10H2.5zM14 9.5h4l3.5 3.5v3H14' + c(6.5, 18, 1.8) + c(17.5, 18, 1.8),
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4' + c(15.5, 9, 1.5),
  close: 'M6 6l12 12M18 6 6 18',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  menu: 'M4 7h16M4 12h16M4 17h16',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

export function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.9 4.3 18.8 19.4c-.2 1-.9 1.3-1.8.8l-4.8-3.6-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8.1c.4-.3-.1-.5-.6-.2L6.5 13.1l-4.7-1.5c-1-.3-1-1 .2-1.5L20.6 3c.9-.3 1.6.2 1.3 1.3Z" />
    </svg>
  )
}

import { useState, type ReactNode } from 'react'
import { Sheet, toast } from '../components/ui'
import { copyText, inApp, menuDots } from '../lib/inapp'

// A link to the manager in Telegram. Inside TikTok (and often Instagram)
// t.me does not open, so there it explains the way round instead: the
// browser menu, or the nick copied to paste into Telegram's search.
export function TelegramLink({ nick, text, className, children }: { nick: string; text?: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const href = `https://t.me/${nick}${text ? `?text=${encodeURIComponent(text)}` : ''}`
  return (
    <>
      <a
        href={href}
        className={className}
        onClick={(e) => {
          if (!inApp) return
          e.preventDefault()
          setOpen(true)
        }}
      >
        {children}
      </a>
      {open && (
        <Sheet title="Telegram тут не відкриється" onClose={() => setOpen(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            {inApp} не пускає в Telegram. Два способи:
          </p>
          <ol style={{ paddingLeft: 20, display: 'grid', gap: 8, margin: '0 0 16px' }}>
            <li>
              Натисніть <b>{menuDots}</b> у правому верхньому куті й оберіть <b>«Відкрити в браузері»</b>.
            </li>
            <li>
              Або скопіюйте нік, відкрийте Telegram і вставте його в пошук.
            </li>
          </ol>
          <button
            className="btn main block"
            onClick={async () => {
              if (await copyText(`@${nick}`)) toast(`Скопійовано @${nick}`)
              else window.prompt('Скопіюйте:', `@${nick}`)
            }}
          >
            Скопіювати @{nick}
          </button>
          {inApp !== 'TikTok' && (
            <a className="btn ghost block" style={{ marginTop: 8 }} href={href}>
              Все одно спробувати тут
            </a>
          )}
        </Sheet>
      )}
    </>
  )
}

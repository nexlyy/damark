import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { Badge } from '../components/ui'
import { installPrompt, type InstallPromptEvent } from '../lib/install'

// The admin on the phone's home screen, opening full-screen like an app.
// Android Chrome offers a real install button; on an iPhone it is done from
// the Share menu, so the card says where to tap.
export function InstallCard() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(installPrompt.event)
  const installed = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)

  useEffect(() => installPrompt.listen(setPrompt), [])

  return (
    <section className="card form-section">
      <div className="spread">
        <h2>Адмінка на телефоні</h2>
        {installed && <Badge tone="good">Встановлено</Badge>}
      </div>
      {installed ? (
        <p className="faint">Адмінка відкривається з іконки на екрані, як застосунок.</p>
      ) : prompt ? (
        <>
          <p className="faint">Додайте адмінку на головний екран — відкриватиметься однією іконкою, без браузера.</p>
          <button
            className="btn"
            type="button"
            style={{ justifySelf: 'start' }}
            onClick={async () => {
              await prompt.prompt()
              setPrompt(null)
            }}
          >
            <Icon name="plus" />
            Встановити
          </button>
        </>
      ) : ios ? (
        <p className="faint">
          У Safari натисніть <b>Поділитися</b> (квадрат зі стрілкою) → <b>На екран «Додому»</b>. Іконка DaMark відкриватиме
          одразу адмінку.
        </p>
      ) : (
        <p className="faint">
          У Chrome натисніть <b>⋮</b> → <b>Додати на головний екран</b> або <b>Встановити застосунок</b>.
        </p>
      )}
    </section>
  )
}

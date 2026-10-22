import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Icon } from '../components/Icon'
import { CopyButton, Empty, ErrorText, Sheet, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { dateTime, money } from '../lib/format'
import { useAction, useFetch, useTitle } from '../lib/hooks'
import { copyText, inApp, menuDots } from '../lib/inapp'
import { useShop } from '../lib/shop'
import type { PublicOrder } from '../lib/types'
import { TelegramLink } from './TelegramLink'

export function OrderPage() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const shop = useShop()
  const { data: o, error } = useFetch<PublicOrder>(`/api/orders/${token}`)
  useTitle(o ? `Замовлення №${o.number}` : 'Замовлення')
  if (error) return <Empty icon="search" title="Замовлення не знайдено" />
  if (!o) return <Spinner />
  const fresh = params.get('new') === '1'

  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div className="order-head">
        {fresh && (
          <span className="ok-mark">
            <Icon name="check" size={32} />
          </span>
        )}
        <h1 style={{ margin: 0 }}>{fresh ? `Дякуємо! Замовлення №${o.number}` : `Замовлення №${o.number}`}</h1>
        <span className={`status-pill ${o.status}`}>{o.statusLabel}</span>
        <span className="muted small">від {dateTime(o.createdAt)}</span>
      </div>

      {o.payment && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Оплатіть {money(o.payment.amount)}</h2>
          {o.reservedUntil && (
            <p className="muted" style={{ marginTop: 0 }}>
              Речі заброньовані до <b>{dateTime(o.reservedUntil)}</b>. Після оплати надішліть квитанцію менеджеру.
            </p>
          )}
          <Req label="Отримувач" value={o.payment.recipient} />
          <Req label="IBAN" value={o.payment.iban} shown={o.payment.iban.replace(/(.{4})/g, '$1 ').trim()} />
          <Req label="ІПН / ЄДРПОУ" value={o.payment.taxId} />
          <Req label="Призначення платежу" value={o.payment.purpose} />
          <Req label="Сума" value={String(o.payment.amount)} shown={money(o.payment.amount)} />
          <button
            className="btn block"
            style={{ marginTop: 6 }}
            onClick={async () => {
              const p = o.payment!
              await copyText([`Отримувач: ${p.recipient}`, `IBAN: ${p.iban}`, `ІПН / ЄДРПОУ: ${p.taxId}`, `Призначення: ${p.purpose}`, `Сума: ${p.amount}`].join('\n'))
            }}
          >
            <Icon name="copy" size={18} /> Скопіювати всі реквізити
          </button>
          <div className="warning">
            <Icon name="alert" size={18} />
            <span>Оплачуйте лише на рахунок {o.payment.recipient}. Якщо вам надіслали інші реквізити — це шахраї.</span>
          </div>
        </section>
      )}

      <section className="card" style={{ marginTop: 12 }}>
        <h2>Що далі</h2>
        <div className="stack">
          <TelegramLink nick={shop.shop.managerTelegram} text={`Вітаю! Замовлення №${o.number}`} className="btn tg block">
            <Icon name="telegram" /> Написати менеджеру
          </TelegramLink>
          {shop.botUsername && !o.telegramLinked && <FollowButton token={token!} />}
          {o.telegramLinked && <p className="note-ok">Статуси замовлення приходитимуть вам у Telegram.</p>}
        </div>
      </section>

      {o.ttn && (
        <section className="card" style={{ marginTop: 12 }}>
          <h2>Посилка</h2>
          <Req label="ТТН Нової пошти" value={o.ttn} />
          {o.npStatus && <p className="muted" style={{ margin: '6px 0 0' }}>{o.npStatus}</p>}
          <a className="btn ghost block" style={{ marginTop: 10 }} href={`https://novaposhta.ua/tracking/?cargo_number=${o.ttn}`} target="_blank" rel="noreferrer">
            Відстежити на сайті Нової пошти <Icon name="external" size={16} />
          </a>
        </section>
      )}

      <section className="card" style={{ marginTop: 12 }}>
        <h2>Склад замовлення</h2>
        {o.items.map((i, n) => (
          <div className="cart-line" key={n}>
            {i.image ? <img src={i.image} alt="" loading="lazy" /> : <div className="noimg" />}
            <div className="meta">
              <span style={{ fontWeight: 600 }}>{i.title}</span>
              <span className="opts">{[i.size, i.color, `${i.qty} шт.`].filter(Boolean).join(' · ')}</span>
              <b>{money(i.price * i.qty)}</b>
            </div>
          </div>
        ))}
        <div className="totals" style={{ marginTop: 8 }}>
          {o.discount > 0 && (
            <div>
              <span>Знижка</span>
              <span>−{money(o.discount)}</span>
            </div>
          )}
          <div className="grand">
            <span>Разом</span>
            <span>{money(o.total)}</span>
          </div>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          {o.name}, {o.phone}
          <br />
          {o.city}, {o.warehouse}
        </p>
      </section>

      <p className="hint" style={{ textAlign: 'center' }}>
        Збережіть цю сторінку — за посиланням завжди видно статус. <Link to="/catalog">Повернутися до каталогу</Link>
      </p>
    </div>
  )
}

function Req({ label, value, shown }: { label: string; value: string; shown?: string }) {
  return (
    <div className="req-row">
      <div>
        <span>{label}</span>
        <b>{shown ?? value}</b>
      </div>
      <CopyButton text={value} label={label} />
    </div>
  )
}

function FollowButton({ token }: { token: string }) {
  const { busy, error, run } = useAction()
  const [link, setLink] = useState<string | null>(null)
  return (
    <>
      <button
        className="btn block"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const { url } = await api.post<{ url: string }>(`/api/orders/${token}/telegram`)
            if (inApp) setLink(url)
            else location.href = url
          })
        }
      >
        <Icon name="telegram" /> Отримувати статус у Telegram
      </button>
      <ErrorText>{error}</ErrorText>
      {link && (
        <Sheet title="Відкрийте в браузері" onClose={() => setLink(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            {inApp} не відкриває Telegram. Натисніть <b>{menuDots}</b> угорі праворуч → <b>«Відкрити в браузері»</b> і натисніть кнопку ще раз. Або скопіюйте посилання
            і відкрийте його в Chrome чи Safari.
          </p>
          <button className="btn main block" onClick={() => copyText(link)}>
            Скопіювати посилання
          </button>
        </Sheet>
      )}
    </>
  )
}

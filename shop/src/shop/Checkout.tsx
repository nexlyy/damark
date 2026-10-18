import { useState, type FormEvent } from 'react'
import { Icon, TelegramIcon } from '../components/Icon'
import { Sheet } from '../components/ui'
import { newId, nextOrderNumber, saveOrder, snapshot } from '../lib/store'
import { telegramLink, uah } from '../lib/format'
import type { Order, Product, ShopSettings } from '../lib/types'

// The buyer's own order form. It books the thing at once and asks the buyer
// to write to the manager with the number: the shop still never writes first,
// so a message "from the shop" stays a sign of a scam.
export function CheckoutSheet({ product, settings, onClose }: { product: Product; settings: ShopSettings; onClose: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [telegram, setTelegram] = useState('')
  const [city, setCity] = useState('')
  const [branch, setBranch] = useState('')
  const [size, setSize] = useState(product.sizes[0]?.size ?? '')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [placed, setPlaced] = useState<Order | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const gaps = [
      !name.trim() && 'ПІБ',
      phone.replace(/\D/g, '').length < 10 && 'телефон',
      !city.trim() && 'місто',
      !branch.trim() && 'відділення',
    ].filter(Boolean)
    if (gaps.length) return setError('Заповніть: ' + gaps.join(', '))

    // Someone may have taken it while the form was open.
    const now = snapshot().products.find((p) => p.id === product.id)
    if (!now || now.status !== 'available') return setError('Цю річ щойно забронювали. Напишіть менеджеру — можливо, є схожа.')

    const order: Order = {
      id: newId(),
      number: nextOrderNumber(),
      createdAt: new Date().toISOString(),
      status: 'new',
      source: 'site',
      customer: { name: name.trim(), phone: phone.trim(), telegram: telegram.trim() },
      items: [{ productId: product.id, title: product.title, size, price: product.price, cost: product.cost }],
      delivery: { city: city.trim(), branch: branch.trim() },
      ttn: '',
      note: note.trim(),
    }
    saveOrder(order)
    setPlaced(order)
  }

  if (placed) {
    return (
      <Sheet title="Замовлення оформлено" onClose={onClose}>
        <div className="stack">
          <div className="card stack" style={{ boxShadow: 'none', background: 'var(--brand-soft)', gap: 4, textAlign: 'center' }}>
            <span className="muted">Номер замовлення</span>
            <b className="num" style={{ fontSize: 32 }}>№{placed.number}</b>
            <span className="muted">Річ заброньовано на {settings.reserveHours} год</span>
          </div>
          <p>
            <b>Останній крок:</b> напишіть менеджеру <b>@{settings.managerTelegram}</b> номер замовлення — у відповідь прийдуть
            реквізити для оплати.
          </p>
          <a className="btn btn-telegram btn-block" href={telegramLink(settings.managerTelegram)}>
            <TelegramIcon />
            Написати «Замовлення №{placed.number}»
          </a>
          <div className="safe-note">
            <Icon name="alert" />
            <span>
              Оплата — тільки на рахунок <b>{settings.fopName}</b>. Якщо вам надіслали інші реквізити — це шахраї.
            </span>
          </div>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title="Оформлення замовлення" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit} onInput={() => error && setError('')} noValidate>
        <div className="row" style={{ gap: 12 }}>
          <div className="grow">
            <b>{product.title}</b>
            <div className="faint">{product.code}</div>
          </div>
          <b className="num nowrap">{uah(product.price)}</b>
        </div>

        {product.sizes.length > 1 && (
          <label className="field">
            <span>Розмір</span>
            <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>
              {product.sizes.map((s) => (
                <option key={s.size}>{s.size}</option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>Прізвище, ім’я та по батькові</span>
          <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Телефон</span>
            <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="+380…" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="field">
            <span>Telegram</span>
            <input className="input" placeholder="@нік, якщо є" value={telegram} onChange={(e) => setTelegram(e.target.value)} />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Місто</span>
            <input className="input" autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label className="field">
            <span>Відділення НП</span>
            <input className="input" placeholder="№ або поштомат" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Коментар</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Необов’язково" />
        </label>

        {error && (
          <p role="alert" style={{ color: 'var(--critical-ink)', fontWeight: 600 }}>
            {error}
          </p>
        )}

        <button className="btn btn-block" type="submit">
          <Icon name="check" />
          Забронювати за {uah(product.price)}
        </button>
        <p className="faint" style={{ textAlign: 'center' }}>
          Оплата після підтвердження менеджером, тільки на рахунок ФОП.
        </p>
      </form>
    </Sheet>
  )
}

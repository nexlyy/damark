import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Icon } from '../components/Icon'
import { NpPicker, type NpValue } from '../components/NpPicker'
import { ErrorText, Field, Qty } from '../components/ui'
import { api } from '../lib/api'
import { money } from '../lib/format'
import { useAction } from '../lib/hooks'
import { Top } from './AdminApp'
import { VariantPicker, type VariantHit } from './VariantPicker'

type Line = VariantHit & { qty: number }

// An order taken in Instagram or Telegram, or an exchange for a received
// order: same stock rules as the site.
export function OrderNew() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const exchange = Number(params.get('exchange')) || null
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [phone, setPhone] = useState('')
  const [telegram, setTelegram] = useState('')
  const [np, setNp] = useState<NpValue>({ city: null, warehouse: null })
  const [lines, setLines] = useState<Line[]>([])
  const [discount, setDiscount] = useState('')
  const [note, setNote] = useState('')
  const [exchangeNumber, setExchangeNumber] = useState<number | null>(null)
  const { busy, error, run } = useAction()

  // An exchange starts from the original order's buyer and address.
  useEffect(() => {
    if (!exchange) return
    api
      .get<{ number: number; name: string; phone: string; telegram: string; city_name: string; city_ref: string; warehouse_name: string; warehouse_ref: string; warehouse_kind: 'branch' | 'postomat' }>(
        `/api/admin/orders/${exchange}`,
      )
      .then((o) => {
        const [last, ...first] = o.name.split(' ')
        setLastName(last)
        setFirstName(first.join(' '))
        setPhone(o.phone)
        setTelegram(o.telegram)
        setNp({ city: { ref: o.city_ref, name: o.city_name }, warehouse: { ref: o.warehouse_ref, name: o.warehouse_name, kind: o.warehouse_kind } })
        setExchangeNumber(o.number)
      })
      .catch(() => undefined)
  }, [exchange])

  const sum = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const add = (v: VariantHit) => setLines((ls) => (ls.some((l) => l.variantId === v.variantId) ? ls.map((l) => (l.variantId === v.variantId ? { ...l, qty: Math.min(l.qty + 1, v.stock) } : l)) : [...ls, { ...v, qty: 1 }]))

  const submit = () =>
    run(async () => {
      if (!np.city || !np.warehouse) throw new Error('Оберіть місто й відділення.')
      const { id } = await api.post<{ id: number }>('/api/admin/orders', {
        lastName,
        firstName,
        phone,
        telegram,
        cityName: np.city.name,
        cityRef: np.city.ref,
        warehouseName: np.warehouse.name,
        warehouseRef: np.warehouse.ref,
        warehouseKind: np.warehouse.kind,
        items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
        discount: Number(discount) || 0,
        note,
        exchangeOf: exchange,
      })
      navigate(`/admin/orders/${id}`, { replace: true })
    })

  return (
    <>
      <Top title={exchangeNumber ? `Обмін до №${exchangeNumber}` : 'Нове замовлення'} back="/admin/orders" />
      <div className="cols2">
        <div className="stack">
          <section className="card">
            <h2>Товари</h2>
            <VariantPicker onPick={add} />
            {lines.map((l) => (
              <div className="cart-line" key={l.variantId}>
                {l.image ? <img src={l.image} alt="" /> : <div className="noimg" />}
                <div className="meta">
                  <b>{l.title}</b>
                  <span className="opts">
                    {[l.size, l.color].filter(Boolean).join(' · ')} · в наявності {l.stock}
                  </span>
                  <div className="ctl">
                    <Qty small value={l.qty} max={Math.max(l.stock, 1)} onChange={(n) => setLines((ls) => ls.map((x) => (x.variantId === l.variantId ? { ...x, qty: n } : x)))} />
                    <span>{money(l.price * l.qty)}</span>
                    <button className="icon-btn" aria-label="Прибрати" onClick={() => setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div className="row" style={{ marginTop: 12 }}>
              <Field label="Знижка, ₴" hint={exchange ? 'Для обміну — сума, яку вже сплатили' : undefined}>
                <input inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/\D/g, ''))} />
              </Field>
              <div className="totals" style={{ alignSelf: 'end', marginBottom: 14 }}>
                <div className="grand">
                  <span>Разом</span>
                  <span>{money(Math.max(0, sum - (Number(discount) || 0)))}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
        <div className="stack">
          <section className="card">
            <h2>Покупець і доставка</h2>
            <div className="row">
              <Field label="Прізвище">
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
              <Field label="Імʼя">
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
            </div>
            <div className="row">
              <Field label="Телефон">
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="067 123 45 67" />
              </Field>
              <Field label="Telegram">
                <input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@nick" />
              </Field>
            </div>
            <NpPicker value={np} onChange={setNp} />
            <Field label="Нотатка для команди">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ minHeight: 64 }} placeholder="Звідки замовлення, домовленості…" />
            </Field>
          </section>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="sticky-save">
        <button className="btn main" disabled={busy || !lines.length} onClick={submit}>
          Створити замовлення
        </button>
      </div>
    </>
  )
}

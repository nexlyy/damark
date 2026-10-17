import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Badge, Sheet } from '../components/ui'
import { copyText, shippedMessage } from '../lib/messages'
import { createWaybill, draftFor, missing, trackingLink, type WaybillDraft } from '../lib/novaPoshta'
import { saveOrder, snapshot, useShop } from '../lib/store'
import { uah } from '../lib/format'
import type { Order } from '../lib/types'

// One waybill for one paid order: check what Nova Poshta needs, create it,
// and the order becomes "Відправлено" with the number filled in.
export function TtnSheet({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (text: string) => void }) {
  const data = useShop()
  const [draft, setDraft] = useState<WaybillDraft>(() => draftFor(order, data.products))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState<Order | null>(null)

  const set = <K extends keyof WaybillDraft>(key: K, value: WaybillDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const gaps = missing(draft)

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      const { ttn, demo } = await createWaybill(draft, data.settings.novaPoshta)
      const current = snapshot().orders.find((o) => o.id === order.id) ?? order
      const next: Order = {
        ...current,
        status: 'shipped',
        ttn,
        ttnDemo: demo,
        shippedAt: new Date().toISOString(),
        customer: { ...current.customer, name: current.customer.name || draft.recipientName, phone: draft.recipientPhone },
        delivery: { city: draft.city, branch: draft.branch },
      }
      saveOrder(next)
      setMade(next)
      onDone(`ТТН для №${order.number} створено`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (made) {
    return (
      <Sheet title={`ТТН для №${made.number}`} onClose={onClose}>
        <div className="stack">
          <div className="card stack" style={{ boxShadow: 'none', background: 'var(--surface-2)', gap: 6, textAlign: 'center' }}>
            <span className="faint">Номер накладної</span>
            <b className="num" style={{ fontSize: 26, letterSpacing: '.04em' }}>{made.ttn}</b>
            {made.ttnDemo && (
              <span style={{ justifySelf: 'center' }}>
                <Badge tone="warning">Демо-номер</Badge>
              </span>
            )}
          </div>
          {made.ttnDemo && (
            <p className="faint">
              У робочій версії тут буде справжня ТТН з кабінету Нової пошти, а посилка з’явиться у вас у списку відправлень.
            </p>
          )}
          <button
            className="btn"
            type="button"
            onClick={async () => onDone((await copyText(shippedMessage(made))) ? 'Повідомлення з ТТН скопійовано' : 'Не вдалося скопіювати')}
          >
            <Icon name="copy" />
            Скопіювати повідомлення клієнту
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Готово
          </button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title={`Створити ТТН · №${order.number}`} onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="form-section">
          <h2>Отримувач</h2>
          <label className="field">
            <span>ПІБ</span>
            <input className="input" value={draft.recipientName} onChange={(e) => set('recipientName', e.target.value)} />
          </label>
          <label className="field">
            <span>Телефон</span>
            <input className="input" type="tel" inputMode="tel" value={draft.recipientPhone} onChange={(e) => set('recipientPhone', e.target.value)} placeholder="+380…" />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Місто</span>
              <input className="input" value={draft.city} onChange={(e) => set('city', e.target.value)} />
            </label>
            <label className="field">
              <span>Відділення</span>
              <input className="input" value={draft.branch} onChange={(e) => set('branch', e.target.value)} placeholder="№ або поштомат" />
            </label>
          </div>
        </div>

        <div className="form-section">
          <h2>Посилка</h2>
          <div className="grid-2">
            <label className="field">
              <span>Вага, кг</span>
              <input className="input" type="number" min={0.1} step={0.1} inputMode="decimal" value={draft.weightKg || ''} onChange={(e) => set('weightKg', Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Вартість, ₴</span>
              <input className="input" type="number" min={0} inputMode="numeric" value={draft.declaredValue || ''} onChange={(e) => set('declaredValue', Number(e.target.value))} />
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Доставку оплачує</span>
              <select className="input" value={draft.payer} onChange={(e) => set('payer', e.target.value as WaybillDraft['payer'])}>
                <option value="Recipient">Отримувач</option>
                <option value="Sender">Магазин</option>
              </select>
            </label>
            <label className="field">
              <span>Опис</span>
              <input className="input" value={draft.description} onChange={(e) => set('description', e.target.value)} />
            </label>
          </div>
          <label className="row" style={{ gap: 10 }}>
            <input
              type="checkbox"
              checked={draft.cashOnDelivery > 0}
              onChange={(e) => set('cashOnDelivery', e.target.checked ? draft.declaredValue : 0)}
              style={{ width: 20, height: 20 }}
            />
            <span>Накладений платіж {draft.cashOnDelivery > 0 && <b className="num">{uah(draft.cashOnDelivery)}</b>}</span>
          </label>
        </div>

        {!data.settings.novaPoshta.senderPhone && (
          <p className="faint">
            Дані відправника ще не заповнені — <Link to="/admin/settings">Налаштування → Нова пошта</Link>. У демо ТТН створиться й без них.
          </p>
        )}

        {(error || gaps.length > 0) && (
          <p role="alert" style={{ color: 'var(--critical-ink)', fontWeight: 600 }}>
            {error || 'Не вистачає: ' + gaps.join(', ')}
          </p>
        )}

        <button className="btn" type="button" onClick={create} disabled={busy || gaps.length > 0}>
          <Icon name="truck" />
          {busy ? 'Створюємо…' : 'Створити ТТН'}
        </button>
      </div>
    </Sheet>
  )
}

// Every paid order at once, with the details already on them. Orders that are
// missing something are left for a hand to finish.
export async function waybillsForPaid(onProgress: (done: number) => void): Promise<{ made: number; skipped: Order[] }> {
  const { orders, products, settings } = snapshot()
  const paid = orders.filter((o) => o.status === 'paid')
  const skipped: Order[] = []
  let made = 0
  for (const o of paid) {
    const draft = draftFor(o, products)
    if (missing(draft).length) {
      skipped.push(o)
      continue
    }
    const { ttn, demo } = await createWaybill(draft, settings.novaPoshta)
    const current = snapshot().orders.find((x) => x.id === o.id) ?? o
    saveOrder({ ...current, status: 'shipped', ttn, ttnDemo: demo, shippedAt: new Date().toISOString() })
    made += 1
    onProgress(made)
  }
  return { made, skipped }
}

export function TrackLink({ ttn }: { ttn: string }) {
  return (
    <a href={trackingLink(ttn)} target="_blank" rel="noreferrer" className="num">
      ТТН {ttn}
    </a>
  )
}

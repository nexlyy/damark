import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Badge, Empty, OrderBadge, Sheet, useToast } from '../components/ui'
import { copyText, paymentMessage, shippedMessage } from '../lib/messages'
import { deleteOrder, newId, nextOrderNumber, saveOrder, setOrderStatus, useShop } from '../lib/store'
import { dateTime, uah } from '../lib/format'
import { orderTotal } from '../lib/stats'
import { ORDER_STATUS_LABEL, type Order, type OrderStatus } from '../lib/types'

const TABS: (OrderStatus | '')[] = ['', 'new', 'awaiting_payment', 'paid', 'shipped', 'done', 'refused', 'cancelled']

// The one button each order shows: the step that usually comes next.
const NEXT: Partial<Record<OrderStatus, [OrderStatus, string]>> = {
  new: ['awaiting_payment', 'Реквізити надіслано'],
  awaiting_payment: ['paid', 'Оплату отримано'],
  paid: ['shipped', 'Відправлено'],
  shipped: ['done', 'Отримано'],
}

export function Orders() {
  const data = useShop()
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') ?? '') as OrderStatus | ''
  const openId = params.get('open')
  const [editing, setEditing] = useState<Order | 'new' | null>(null)
  const [toast, say] = useToast()

  const opened = editing ?? (openId ? data.orders.find((o) => o.id === openId) ?? null : null)
  const close = () => {
    setEditing(null)
    if (openId) {
      params.delete('open')
      setParams(params, { replace: true })
    }
  }

  const shown = data.orders.filter((o) => !status || o.status === status)
  const black = new Set(data.settings.blacklist)

  const advance = (o: Order) => {
    const next = NEXT[o.status]
    if (!next) return
    if (next[0] === 'shipped' && !o.ttn) {
      setEditing({ ...o, status: 'shipped' })
      say('Вкажіть ТТН і збережіть')
      return
    }
    setOrderStatus(o.id, next[0])
  }

  const copy = async (text: string, what: string) => say((await copyText(text)) ? `${what} скопійовано` : 'Не вдалося скопіювати')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Замовлення</h1>
          <p className="muted">Бронь → оплата → відправка. Статус товару змінюється сам.</p>
        </div>
        <button className="btn" type="button" onClick={() => setEditing('new')}>
          <Icon name="plus" />
          Нове замовлення
        </button>
      </div>

      <div className="tabs" role="group" aria-label="Статус">
        {TABS.map((t) => (
          <button
            key={t || 'all'}
            className="chip"
            type="button"
            aria-pressed={status === t}
            onClick={() => {
              if (t) params.set('status', t)
              else params.delete('status')
              setParams(params, { replace: true })
            }}
          >
            {t ? ORDER_STATUS_LABEL[t] : 'Усі'}
            <span className="faint"> {t ? data.orders.filter((o) => o.status === t).length : data.orders.length}</span>
          </button>
        ))}
      </div>

      {data.orders.length === 0 ? (
        <Empty
          icon="orders"
          title="Замовлень ще немає"
          action={
            <button className="btn" type="button" onClick={() => setEditing('new')}>
              <Icon name="plus" />
              Внести замовлення
            </button>
          }
        >
          Бронюйте речі прямо в режимі ефіру або вносьте замовлення з Telegram і Viber тут.
        </Empty>
      ) : shown.length === 0 ? (
        <Empty icon="orders" title="Тут порожньо" />
      ) : (
        <div className="card card-flush">
          {shown.map((o) => {
            const next = NEXT[o.status]
            const blacklisted = [o.customer.phone, o.customer.telegram].some((c) => c && black.has(c))
            return (
              <div key={o.id} className="order-card">
                <div className="spread">
                  <button type="button" className="row" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontWeight: 700 }} onClick={() => setEditing(o)}>
                    №{o.number} · {o.customer.name || o.customer.telegram || 'Без імені'}
                  </button>
                  <OrderBadge status={o.status} />
                </div>
                <div className="faint">
                  {dateTime(o.createdAt)}
                  {o.customer.telegram && ` · ${o.customer.telegram}`}
                  {o.customer.phone && ` · ${o.customer.phone}`}
                </div>
                {blacklisted && <Badge tone="critical">У чорному списку</Badge>}
                <div>
                  {o.items.map((i) => (
                    <div key={i.productId} className="spread">
                      <span>
                        {i.title}
                        {i.size && <span className="faint"> · {i.size}</span>}
                      </span>
                      <span className="num nowrap">{uah(i.price)}</span>
                    </div>
                  ))}
                </div>
                <div className="spread">
                  <span className="faint">
                    {[o.delivery.city, o.delivery.branch].filter(Boolean).join(', ') || 'Доставка не вказана'}
                    {o.ttn && ` · ТТН ${o.ttn}`}
                  </span>
                  <b className="num nowrap">{uah(orderTotal(o))}</b>
                </div>
                <div className="row-wrap">
                  {next && (
                    <button className="btn btn-sm" type="button" onClick={() => advance(o)}>
                      <Icon name="check" />
                      {next[1]}
                    </button>
                  )}
                  {(o.status === 'new' || o.status === 'awaiting_payment') && (
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => copy(paymentMessage(o, data.settings), 'Реквізити')}>
                      <Icon name="copy" />
                      Реквізити
                    </button>
                  )}
                  {o.status === 'shipped' && (
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => copy(shippedMessage(o), 'Повідомлення з ТТН')}>
                      <Icon name="copy" />
                      ТТН клієнту
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(o)}>
                    <Icon name="edit" />
                    Змінити
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {opened && <OrderSheet key={opened === 'new' ? 'new' : opened.id} initial={opened} onClose={close} onSaved={say} />}
      {toast}
    </>
  )
}

function OrderSheet({
  initial,
  onClose,
  onSaved,
}: {
  initial: Order | 'new'
  onClose: () => void
  onSaved: (text: string) => void
}) {
  const data = useShop()
  const [o, setO] = useState<Order>(() =>
    initial === 'new'
      ? {
          id: newId(),
          number: nextOrderNumber(),
          createdAt: new Date().toISOString(),
          status: 'new',
          customer: { name: '', phone: '', telegram: '' },
          items: [],
          delivery: { city: '', branch: '' },
          ttn: '',
          note: '',
        }
      : initial,
  )
  const [pick, setPick] = useState('')
  const [error, setError] = useState('')

  const inOrder = new Set(o.items.map((i) => i.productId))
  const pickable = data.products.filter((p) => !inOrder.has(p.id) && p.status === 'available')

  const addItem = () => {
    const p = data.products.find((x) => x.id === pick)
    if (!p) return
    setO({ ...o, items: [...o.items, { productId: p.id, title: p.title, size: p.sizes[0]?.size ?? '', price: p.price, cost: p.cost }] })
    setPick('')
  }

  const save = () => {
    if (!o.items.length) return setError('Додайте хоча б одну річ')
    if (!o.customer.name && !o.customer.telegram && !o.customer.phone) return setError('Вкажіть клієнта: ім’я, @нік або телефон')
    const now = new Date().toISOString()
    saveOrder({
      ...o,
      paidAt: ['paid', 'shipped', 'done'].includes(o.status) ? o.paidAt ?? now : o.paidAt,
      shippedAt: ['shipped', 'done'].includes(o.status) ? o.shippedAt ?? now : o.shippedAt,
    })
    onSaved(initial === 'new' ? `Замовлення №${o.number} створено` : 'Збережено')
    onClose()
  }

  const remove = () => {
    if (initial === 'new' || !confirm('Видалити замовлення? Товари повернуться в наявність.')) return
    deleteOrder(o.id)
    onClose()
  }

  const cust = (key: keyof Order['customer'], value: string) => setO({ ...o, customer: { ...o.customer, [key]: value } })

  return (
    <Sheet title={initial === 'new' ? 'Нове замовлення' : `Замовлення №${o.number}`} onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="form-section">
          <h2>Клієнт</h2>
          <div className="grid-2">
            <label className="field">
              <span>Ім’я</span>
              <input className="input" value={o.customer.name} onChange={(e) => cust('name', e.target.value)} />
            </label>
            <label className="field">
              <span>Telegram</span>
              <input className="input" value={o.customer.telegram} onChange={(e) => cust('telegram', e.target.value)} placeholder="@нік" />
            </label>
          </div>
          <label className="field">
            <span>Телефон</span>
            <input className="input" type="tel" inputMode="tel" value={o.customer.phone} onChange={(e) => cust('phone', e.target.value)} placeholder="+380…" />
          </label>
        </div>

        <div className="form-section">
          <h2>Речі</h2>
          {o.items.map((i) => (
            <div key={i.productId} className="spread">
              <span className="grow">
                {i.title}
                {i.size && <span className="faint"> · {i.size}</span>}
              </span>
              <span className="num">{uah(i.price)}</span>
              <button className="icon-btn" type="button" aria-label="Прибрати" onClick={() => setO({ ...o, items: o.items.filter((x) => x.productId !== i.productId) })}>
                <Icon name="trash" />
              </button>
            </div>
          ))}
          <div className="row">
            <select className="input grow" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Товар">
              <option value="">{pickable.length ? 'Оберіть товар у наявності…' : 'Немає вільних товарів'}</option>
              {pickable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.title} · {p.sizes.map((s) => s.size).join('/')} · {uah(p.price)}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost" type="button" onClick={addItem} disabled={!pick}>
              <Icon name="plus" />
            </button>
          </div>
          {o.items.length > 0 && (
            <div className="spread">
              <b>Разом</b>
              <b className="num">{uah(orderTotal(o))}</b>
            </div>
          )}
        </div>

        <div className="form-section">
          <h2>Доставка</h2>
          <div className="grid-2">
            <label className="field">
              <span>Місто</span>
              <input className="input" value={o.delivery.city} onChange={(e) => setO({ ...o, delivery: { ...o.delivery, city: e.target.value } })} />
            </label>
            <label className="field">
              <span>Відділення / поштомат</span>
              <input className="input" value={o.delivery.branch} onChange={(e) => setO({ ...o, delivery: { ...o.delivery, branch: e.target.value } })} />
            </label>
          </div>
          <label className="field">
            <span>ТТН Нової пошти</span>
            <input className="input num" inputMode="numeric" value={o.ttn} onChange={(e) => setO({ ...o, ttn: e.target.value })} placeholder="20450…" />
            <small>У робочій версії ТТН створюється кнопкою через API Нової пошти.</small>
          </label>
        </div>

        <div className="form-section">
          <h2>Статус</h2>
          <div className="grid-2">
            <label className="field">
              <span>Статус</span>
              <select className="input" value={o.status} onChange={(e) => setO({ ...o, status: e.target.value as OrderStatus })}>
                {Object.entries(ORDER_STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Ефір</span>
              <select className="input" value={o.liveId ?? ''} onChange={(e) => setO({ ...o, liveId: e.target.value || undefined })}>
                <option value="">— не з ефіру —</option>
                {data.lives.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Нотатка</span>
            <textarea className="input" style={{ minHeight: 64 }} value={o.note} onChange={(e) => setO({ ...o, note: e.target.value })} />
          </label>
        </div>

        {error && <p role="alert" style={{ color: 'var(--critical-ink)', fontWeight: 600 }}>{error}</p>}

        <div className="row">
          <button className="btn grow" type="button" onClick={save}>
            <Icon name="check" />
            Зберегти
          </button>
          {initial !== 'new' && (
            <button className="btn btn-danger" type="button" onClick={remove} aria-label="Видалити замовлення">
              <Icon name="trash" />
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Icon } from '../components/Icon'
import { NpPicker, type NpValue } from '../components/NpPicker'
import { CopyButton, ErrorText, Field, Sheet, Spinner, toast } from '../components/ui'
import { api } from '../lib/api'
import { dateTime, money, phoneLink, prettyPhone } from '../lib/format'
import { useAction, useFetch } from '../lib/hooks'
import type { OrderStatus } from '../lib/types'
import { Top, useCounts, useMe } from './AdminApp'
import { StatusPill } from './Orders'

type Item = { id: number; product_id: number | null; title: string; size: string; color: string; image: string; price: number; cost?: number | null; qty: number; returned_qty: number }
type Order = {
  id: number
  number: number
  token: string
  status: OrderStatus
  source: 'site' | 'admin'
  name: string
  phone: string
  telegram: string
  city_name: string
  city_ref: string
  warehouse_name: string
  warehouse_ref: string
  warehouse_kind: 'branch' | 'postomat'
  discount: number
  total: number
  refund: number
  buyer_note: string
  note: string
  reserved_until: string | null
  paid_at: string | null
  shipped_at: string | null
  ttn: string
  np_status: string
  np_checked_at: string | null
  tg_chat_id: number | null
  created_at: string
  overdue: boolean
  next: OrderStatus[]
  manager: { id: number; name: string } | null
  exchangeOf: { id: number; number: number } | null
  exchanges: Array<{ id: number; number: number }>
  items: Item[]
  cost?: number
  customer: { id: number; name: string; phone: string; telegram: string; note: string; blacklisted: number; orders: number; refused: number; spent: number }
  events: Array<{ at: string; text: string; user: string | null }>
}

type Settings = { payment: { recipient: string; iban: string; taxId: string; purpose: string } }

export function OrderDetail() {
  const { id } = useParams()
  const { me } = useMe()
  const { refresh } = useCounts()
  const { data: o, reload, error: loadError } = useFetch<Order>(`/api/admin/orders/${id}`)
  const shop = useFetch<Settings>('/api/shop').data
  const { busy, error, run } = useAction()
  const [note, setNote] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | 'ttn' | 'return' | 'delivery' | 'cancel'>(null)

  useEffect(() => {
    if (o) setNote(o.note)
  }, [o])

  if (loadError) return <p className="error">{loadError}</p>
  if (!o) return <Spinner />

  const act = (fn: () => Promise<unknown>, done?: string) =>
    run(async () => {
      await fn()
      if (done) toast(done)
      reload()
      refresh()
    })
  const status = (s: OrderStatus, msg: string) => act(() => api.post(`/api/admin/orders/${o.id}/status`, { status: s }), msg)
  const paymentText = shop
    ? [
        `Замовлення №${o.number}, до сплати ${o.total} грн`,
        `Отримувач: ${shop.payment.recipient}`,
        `IBAN: ${shop.payment.iban}`,
        `ІПН / ЄДРПОУ: ${shop.payment.taxId}`,
        `Призначення: ${shop.payment.purpose.replace('{number}', String(o.number))}`,
        `Статус замовлення: ${location.origin}/order/${o.token}`,
      ].join('\n')
    : ''

  return (
    <>
      <Top title={`№${o.number}`} back="/admin/orders">
        <StatusPill status={o.status} overdue={o.overdue} />
      </Top>

      {o.overdue && (
        <div className="warning" style={{ marginTop: 0, marginBottom: 12 }}>
          <Icon name="clock" size={18} />
          <span>Бронь минула {dateTime(o.reserved_until)}, оплати немає. Продовжте бронь або скасуйте — речі повернуться в продаж.</span>
        </div>
      )}

      <div className="cols2">
        <div className="stack">
          <section className="card">
            <div className="section-title">
              <h2>Дії</h2>
              <span className="muted small">
                {o.source === 'admin' ? 'Створено в адмінці' : 'З сайту'} · {dateTime(o.created_at)}
              </span>
            </div>
            <div className="actions">
              {o.status === 'new' && (
                <>
                  <button className="btn main" disabled={busy} onClick={() => status('paid', 'Позначено оплату')}>
                    <Icon name="check" size={18} /> Оплату отримано
                  </button>
                  <button className="btn" disabled={busy} onClick={() => act(() => api.post(`/api/admin/orders/${o.id}/extend`), 'Бронь продовжено')}>
                    <Icon name="clock" size={18} /> Продовжити бронь
                  </button>
                </>
              )}
              {o.status === 'paid' && (
                <button className="btn main" disabled={busy} onClick={() => setDialog('ttn')}>
                  <Icon name="truck" size={18} /> Створити ТТН
                </button>
              )}
              {['shipped', 'arrived'].includes(o.status) && (
                <>
                  <button className="btn" disabled={busy} onClick={() => act(() => api.post(`/api/admin/orders/${o.id}/track`), 'Статус оновлено')}>
                    Оновити з Нової пошти
                  </button>
                  <button className="btn ok" disabled={busy} onClick={() => status('received', 'Отримано')}>
                    Отримано
                  </button>
                  <button className="btn danger" disabled={busy} onClick={() => status('refused', 'Позначено відмову')}>
                    Відмова
                  </button>
                </>
              )}
              {o.status === 'refused' && (
                <button className="btn" disabled={busy} onClick={() => status('returned', 'Речі повернулись на склад')}>
                  <Icon name="undo" size={18} /> Посилка повернулась — на склад
                </button>
              )}
              {o.status === 'received' && (
                <>
                  <button className="btn" disabled={busy} onClick={() => setDialog('return')}>
                    <Icon name="undo" size={18} /> Повернення
                  </button>
                  <Link className="btn ghost" to={`/admin/orders/new?exchange=${o.id}`}>
                    Обмін
                  </Link>
                </>
              )}
              {['new', 'paid'].includes(o.status) && (
                <button className="btn danger" disabled={busy} onClick={() => setDialog('cancel')}>
                  Скасувати
                </button>
              )}
            </div>
            {o.status === 'paid' && o.next.includes('new') && (
              <button className="link-btn small" style={{ marginTop: 10 }} onClick={() => status('new', 'Оплату знято')}>
                Оплату позначили помилково
              </button>
            )}
            <ErrorText>{error}</ErrorText>
          </section>

          <section className="card">
            <h2>Товари</h2>
            {o.items.map((i) => (
              <div className="cart-line" key={i.id}>
                {i.image ? <img src={i.image} alt="" /> : <div className="noimg" />}
                <div className="meta">
                  {i.product_id ? <Link to={`/admin/products/${i.product_id}`}>{i.title}</Link> : <span>{i.title}</span>}
                  <span className="opts">{[i.size, i.color].filter(Boolean).join(' · ')}</span>
                  <span>
                    {i.qty} × {money(i.price)}
                    {i.returned_qty > 0 && <span className="pill alarm" style={{ marginLeft: 8 }}>повернено {i.returned_qty}</span>}
                  </span>
                  {me.can.finance && i.cost !== undefined && <span className="faint small">собівартість {i.cost === null ? '—' : money(i.cost)}</span>}
                </div>
              </div>
            ))}
            <div className="totals" style={{ marginTop: 6 }}>
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
              {o.refund > 0 && (
                <div className="field-error">
                  <span>Повернено покупцю</span>
                  <span>{money(o.refund)}</span>
                </div>
              )}
              {me.can.finance && o.cost !== undefined && (
                <div className="muted small">
                  <span>Собівартість / прибуток</span>
                  <span>{o.items.some((i) => i.cost === null) ? 'собівартість невідома' : `${money(o.cost)} / ${money(o.total - o.refund - o.cost)}`}</span>
                </div>
              )}
            </div>
            {o.exchangeOf && (
              <p className="small">
                Обмін до <Link to={`/admin/orders/${o.exchangeOf.id}`}>№{o.exchangeOf.number}</Link>
              </p>
            )}
            {o.exchanges.map((x) => (
              <p className="small" key={x.id}>
                Обмін: <Link to={`/admin/orders/${x.id}`}>№{x.number}</Link>
              </p>
            ))}
          </section>

          {o.status === 'new' && shop && (
            <section className="card">
              <div className="section-title">
                <h2>Реквізити для покупця</h2>
                <CopyButton text={paymentText} label="реквізити" />
              </div>
              <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
                {paymentText}
              </pre>
            </section>
          )}

          <section className="card">
            <h2>Історія</h2>
            <ul className="timeline">
              {o.events.map((e, i) => (
                <li key={i}>
                  <time>{dateTime(e.at)}</time>
                  <span>
                    {e.text}
                    {e.user ? <span className="faint"> — {e.user}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="section-title">
              <h2>Покупець</h2>
              <Link to={`/admin/customers/${o.customer.id}`} className="link-btn small">
                Картка
              </Link>
            </div>
            <dl className="kv">
              <dt>Імʼя</dt>
              <dd>{o.name}</dd>
              <dt>Телефон</dt>
              <dd>
                <a href={phoneLink(o.phone)}>{prettyPhone(o.phone)}</a>
              </dd>
              {o.telegram && (
                <>
                  <dt>Telegram</dt>
                  <dd>
                    <a href={`https://t.me/${o.telegram}`} target="_blank" rel="noreferrer">
                      @{o.telegram}
                    </a>
                  </dd>
                </>
              )}
              <dt>Замовлень</dt>
              <dd>
                {o.customer.orders}
                {o.customer.refused ? <span className="field-error"> · відмов {o.customer.refused}</span> : null}
              </dd>
              <dt>Статуси</dt>
              <dd>{o.tg_chat_id ? 'отримує в Telegram' : 'не підписаний'}</dd>
            </dl>
            {o.customer.blacklisted ? <p className="warning">⚠️ Клієнт у чорному списку{o.customer.note ? `: ${o.customer.note}` : ''}</p> : null}
            {o.buyer_note && (
              <p className="note-ok" style={{ marginTop: 10, background: 'var(--soft)', color: 'var(--ink)' }}>
                💬 {o.buyer_note}
              </p>
            )}
          </section>

          <section className="card">
            <div className="section-title">
              <h2>Доставка</h2>
              {['new', 'paid'].includes(o.status) && (
                <button className="link-btn small" onClick={() => setDialog('delivery')}>
                  Змінити
                </button>
              )}
            </div>
            <dl className="kv">
              <dt>Місто</dt>
              <dd>{o.city_name}</dd>
              <dt>{o.warehouse_kind === 'postomat' ? 'Поштомат' : 'Відділення'}</dt>
              <dd>{o.warehouse_name}</dd>
              {o.ttn && (
                <>
                  <dt>ТТН</dt>
                  <dd style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {o.ttn} <CopyButton text={o.ttn} label="ТТН" />
                  </dd>
                  <dt>Нова пошта</dt>
                  <dd>{o.np_status || '—'}</dd>
                </>
              )}
            </dl>
            {!o.city_ref && <p className="hint">Адресу введено вручну — для ТТН через API оберіть місто й відділення зі списку.</p>}
          </section>

          <section className="card">
            <h2>Робота</h2>
            <Field label="Відповідальний">
              <ManagerSelect value={o.manager?.id ?? null} onChange={(v) => act(() => api.patch(`/api/admin/orders/${o.id}`, { managerId: v }))} />
            </Field>
            <Field label="Нотатка (бачить лише команда)">
              <textarea value={note ?? ''} onChange={(e) => setNote(e.target.value)} rows={3} />
            </Field>
            {note !== o.note && (
              <button className="btn sm" disabled={busy} onClick={() => act(() => api.patch(`/api/admin/orders/${o.id}`, { note }), 'Нотатку збережено')}>
                Зберегти нотатку
              </button>
            )}
            <a className="btn ghost sm block" style={{ marginTop: 10 }} href={`/order/${o.token}`} target="_blank" rel="noreferrer">
              Сторінка замовлення для покупця <Icon name="external" size={16} />
            </a>
          </section>
        </div>
      </div>

      {dialog === 'ttn' && <TtnDialog order={o} onClose={() => setDialog(null)} onDone={() => (setDialog(null), reload(), refresh())} />}
      {dialog === 'return' && <ReturnDialog order={o} onClose={() => setDialog(null)} onDone={() => (setDialog(null), reload())} />}
      {dialog === 'delivery' && <DeliveryDialog order={o} onClose={() => setDialog(null)} onDone={() => (setDialog(null), reload())} />}
      {dialog === 'cancel' && (
        <Sheet title={`Скасувати №${o.number}?`} onClose={() => setDialog(null)}>
          <p>Речі повернуться в продаж.{o.paid_at ? ' Замовлення оплачене — сума запишеться як повернена покупцю.' : ''}</p>
          <div className="row">
            <button className="btn ghost" onClick={() => setDialog(null)}>
              Ні
            </button>
            <button className="btn danger" disabled={busy} onClick={() => status('cancelled', 'Скасовано').then(() => setDialog(null))}>
              Скасувати замовлення
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function ManagerSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const { me } = useMe()
  const users = useFetch<Array<{ id: number; name: string; disabled: number }>>(me.can.staff ? '/api/admin/users' : null).data
  const options = users ? users.filter((u) => !u.disabled) : [{ id: me.user.id, name: me.user.name }]
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">Ніхто</option>
      {options.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
      {value && !options.some((u) => u.id === value) && <option value={value}>(інший)</option>}
    </select>
  )
}

function TtnDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const [manual, setManual] = useState(false)
  const [ttn, setTtn] = useState('')
  const { busy, error, run } = useAction()
  return (
    <Sheet title="ТТН Нової пошти" onClose={onClose}>
      {!manual ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Створимо накладну у вашому кабінеті Нової пошти: {order.name}, {order.city_name}, {order.warehouse_name}. Оголошена вартість {money(order.total)}, доставку
            оплачує одержувач.
          </p>
          <ErrorText>{error}</ErrorText>
          <button
            className="btn main block big"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const res = await api.post<{ ttn: string }>(`/api/admin/orders/${order.id}/ttn`)
                toast(`ТТН ${res.ttn}`)
                onDone()
              })
            }
          >
            {busy ? 'Створюємо…' : 'Створити ТТН'}
          </button>
          <button className="link-btn" style={{ marginTop: 12 }} onClick={() => setManual(true)}>
            У мене вже є номер ТТН
          </button>
        </>
      ) : (
        <>
          <Field label="Номер ТТН (14 цифр)">
            <input value={ttn} inputMode="numeric" onChange={(e) => setTtn(e.target.value.replace(/\D/g, '').slice(0, 14))} autoFocus />
          </Field>
          <ErrorText>{error}</ErrorText>
          <button
            className="btn main block"
            disabled={busy || ttn.length !== 14}
            onClick={() =>
              run(async () => {
                await api.post(`/api/admin/orders/${order.id}/ttn`, { ttn })
                onDone()
              })
            }
          >
            Зберегти й позначити відправленим
          </button>
        </>
      )}
    </Sheet>
  )
}

function ReturnDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState<Record<number, number>>({})
  const suggested = order.items.reduce((s, i) => s + (qty[i.id] ?? 0) * i.price, 0)
  const [refund, setRefund] = useState<string>('')
  const { busy, error, run } = useAction()
  return (
    <Sheet title="Повернення" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Оберіть, що повернули. Ці речі повернуться на склад.
      </p>
      {order.items.map((i) => {
        const left = i.qty - i.returned_qty
        return (
          <div key={i.id} className="list-row" style={{ padding: '8px 0' }}>
            <span className="grow">
              <b>{i.title}</b>
              <span className="muted small">{[i.size, i.color].filter(Boolean).join(' · ')} · можна {left}</span>
            </span>
            <select value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })} style={{ width: 80 }} disabled={!left}>
              {Array.from({ length: left + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )
      })}
      <Field label="Повернули покупцю, ₴" hint={suggested ? `За речі: ${money(suggested)}` : undefined}>
        <input inputMode="numeric" value={refund} placeholder={String(suggested)} onChange={(e) => setRefund(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <button
        className="btn main block"
        disabled={busy}
        onClick={() =>
          run(async () => {
            await api.post(`/api/admin/orders/${order.id}/return`, {
              items: Object.entries(qty).map(([itemId, q]) => ({ itemId: Number(itemId), qty: q })),
              refund: refund === '' ? suggested : Number(refund),
            })
            toast('Повернення записано')
            onDone()
          })
        }
      >
        Записати повернення
      </button>
    </Sheet>
  )
}

function DeliveryDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const [last, ...firstParts] = order.name.split(' ')
  const [lastName, setLastName] = useState(last ?? '')
  const [firstName, setFirstName] = useState(firstParts.join(' '))
  const [phone, setPhone] = useState(order.phone)
  const [telegram, setTelegram] = useState(order.telegram)
  const [np, setNp] = useState<NpValue>({
    city: { ref: order.city_ref, name: order.city_name },
    warehouse: { ref: order.warehouse_ref, name: order.warehouse_name, kind: order.warehouse_kind },
  })
  const { busy, error, run } = useAction()
  return (
    <Sheet title="Дані доставки" onClose={onClose}>
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
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Telegram">
          <input value={telegram} onChange={(e) => setTelegram(e.target.value)} />
        </Field>
      </div>
      <NpPicker value={np} onChange={setNp} />
      <ErrorText>{error}</ErrorText>
      <button
        className="btn main block"
        disabled={busy}
        onClick={() =>
          run(async () => {
            if (!np.city || !np.warehouse) throw new Error('Оберіть місто й відділення.')
            await api.patch(`/api/admin/orders/${order.id}`, {
              delivery: {
                lastName,
                firstName,
                phone,
                telegram,
                cityName: np.city.name,
                cityRef: np.city.ref,
                warehouseName: np.warehouse.name,
                warehouseRef: np.warehouse.ref,
                warehouseKind: np.warehouse.kind,
              },
            })
            onDone()
          })
        }
      >
        Зберегти
      </button>
    </Sheet>
  )
}


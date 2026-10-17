import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty, LiveBadge, OrderBadge, Photo, ProductBadge, Sheet, useToast } from '../components/ui'
import { copyText, lotsMessage } from '../lib/messages'
import { deleteLive, newId, nextOrderNumber, saveLive, saveOrder, setOrderStatus, useShop } from '../lib/store'
import { dateTime, plural, uah } from '../lib/format'
import { orderTotal } from '../lib/stats'
import type { Live, Product } from '../lib/types'

export function Lives() {
  const { lives, orders } = useShop()
  const [creating, setCreating] = useState(false)
  const sorted = [...lives].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ефіри</h1>
          <p className="muted">Підготуйте лоти заздалегідь, бронюйте в один дотик під час ефіру.</p>
        </div>
        <button className="btn" type="button" onClick={() => setCreating(true)}>
          <Icon name="plus" />
          Новий ефір
        </button>
      </div>

      {sorted.length === 0 ? (
        <Empty
          icon="live"
          title="Ефірів ще немає"
          action={
            <button className="btn" type="button" onClick={() => setCreating(true)}>
              <Icon name="plus" />
              Запланувати ефір
            </button>
          }
        >
          Оберіть речі для ефіру — кожна отримає номер лота. Покупці пишуть «беру №7», ви тиснете на лот і вносите нік.
        </Empty>
      ) : (
        <div className="card card-flush">
          <ul className="list">
            {sorted.map((l) => {
              const sold = orders.filter((o) => o.liveId === l.id && o.status !== 'cancelled' && o.status !== 'refused')
              return (
                <li key={l.id}>
                  <Link to={`/admin/lives/${l.id}`} className="list-row">
                    <span className="attn-icon">
                      <Icon name="live" />
                    </span>
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{l.title}</div>
                      <div className="faint">
                        {dateTime(l.date)} · {l.lots.length} {plural(l.lots.length, 'лот', 'лоти', 'лотів')} · {sold.length}{' '}
                        {plural(sold.length, 'замовлення', 'замовлення', 'замовлень')} · {uah(sold.reduce((s, o) => s + orderTotal(o), 0))}
                      </div>
                    </div>
                    <LiveBadge status={l.status} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {creating && <NewLiveSheet onClose={() => setCreating(false)} />}
    </>
  )
}

function NewLiveSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const tomorrow = new Date(Date.now() + 864e5)
  tomorrow.setHours(19, 0, 0, 0)
  const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 6e4).toISOString().slice(0, 16)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(local)

  const create = () => {
    const start = new Date(date)
    const live: Live = {
      id: newId(),
      title: title.trim() || 'Ефір',
      date: (Number.isNaN(start.getTime()) ? tomorrow : start).toISOString(),
      status: 'planned',
      lots: [],
    }
    saveLive(live)
    navigate(`/admin/lives/${live.id}`)
  }

  return (
    <Sheet title="Новий ефір" onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Назва</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Напр.: Взуття з Італії" />
        </label>
        <label className="field">
          <span>Початок</span>
          <input className="input" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn" type="button" onClick={create}>
          Створити і вибрати лоти
        </button>
      </div>
    </Sheet>
  )
}

export function LiveMode() {
  const { id } = useParams()
  const data = useShop()
  const navigate = useNavigate()
  const live = data.lives.find((l) => l.id === id)
  const [picking, setPicking] = useState(false)
  const [lot, setLot] = useState<number | null>(null)
  const [toast, say] = useToast()

  if (!live) {
    return <Empty icon="live" title="Ефір не знайдено" action={<Link className="btn" to="/admin/lives">До ефірів</Link>} />
  }

  const byId = new Map(data.products.map((p) => [p.id, p]))
  const lots = live.lots.map((pid) => byId.get(pid)).filter((p): p is Product => Boolean(p))
  const liveOrders = data.orders.filter((o) => o.liveId === live.id && o.status !== 'cancelled')
  const reservedSum = liveOrders.reduce((s, o) => s + orderTotal(o), 0)

  const setStatus = (status: Live['status']) => saveLive({ ...live, status })

  const copyLots = async () => say((await copyText(lotsMessage(live, data.products))) ? 'Список лотів скопійовано — вставте в групу' : 'Не вдалося скопіювати')

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/admin/lives" className="row faint" style={{ textDecoration: 'none' }}>
            <Icon name="back" size={16} /> Ефіри
          </Link>
          <h1 style={{ marginTop: 6 }} className="row">
            {live.status === 'live' && <span className="live-dot" aria-hidden="true" />}
            {live.title}
          </h1>
          <p className="faint">{dateTime(live.date)}</p>
        </div>
        <div className="row-wrap">
          {live.status === 'planned' && (
            <button className="btn" type="button" onClick={() => setStatus('live')}>
              Почати ефір
            </button>
          )}
          {live.status === 'live' && (
            <button className="btn" type="button" onClick={() => setStatus('done')}>
              Завершити
            </button>
          )}
          <LiveBadge status={live.status} />
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <span className="kpi-label">Лотів</span>
          <span className="kpi-value">{lots.length}</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">Заброньовано</span>
          <span className="kpi-value">{lots.filter((p) => p.status === 'reserved').length}</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">Оплачено</span>
          <span className="kpi-value">{lots.filter((p) => p.status === 'sold').length}</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">Сума замовлень</span>
          <span className="kpi-value">{uah(reservedSum)}</span>
        </div>
      </div>

      <div className="toolbar">
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPicking(true)}>
          <Icon name="plus" />
          Додати лоти
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={copyLots} disabled={!lots.length}>
          <Icon name="copy" />
          Список для Telegram
        </button>
        <span className="grow" />
        <button
          className="btn btn-danger btn-sm"
          type="button"
          onClick={() => {
            if (confirm('Видалити ефір? Товари й замовлення залишаться.')) {
              deleteLive(live.id)
              navigate('/admin/lives')
            }
          }}
        >
          <Icon name="trash" />
          Видалити
        </button>
      </div>

      {lots.length === 0 ? (
        <Empty
          icon="box"
          title="Лотів ще немає"
          action={
            <button className="btn" type="button" onClick={() => setPicking(true)}>
              Вибрати товари
            </button>
          }
        >
          Додайте речі, які покажете на ефірі. Номер лота = порядок у списку.
        </Empty>
      ) : (
        <div className="lots">
          {lots.map((p, i) => (
            <button key={p.id} type="button" className="lot" data-status={p.status} onClick={() => setLot(i)}>
              <span className="lot-no num">{i + 1}</span>
              <Photo src={p.photos[0]} alt={p.title} />
              <b style={{ fontSize: 14, lineHeight: 1.25 }}>{p.title}</b>
              <span className="spread">
                <span className="faint">{p.sizes.map((s) => s.size).join('/')}</span>
                <b className="num" style={{ fontSize: 14 }}>{uah(p.price)}</b>
              </span>
              <ProductBadge status={p.status} />
            </button>
          ))}
        </div>
      )}

      {picking && <PickLots live={live} onClose={() => setPicking(false)} />}
      {lot !== null && lots[lot] && <ReserveSheet live={live} product={lots[lot]} lotNo={lot + 1} onClose={() => setLot(null)} onDone={say} />}
      {toast}
    </>
  )
}

function PickLots({ live, onClose }: { live: Live; onClose: () => void }) {
  const { products } = useShop()
  const [chosen, setChosen] = useState<string[]>(live.lots)
  const candidates = products.filter((p) => p.status === 'available' || live.lots.includes(p.id))

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  return (
    <Sheet title="Лоти ефіру" onClose={onClose}>
      {candidates.length === 0 ? (
        <Empty icon="box" title="Немає товарів у наявності" action={<Link className="btn" to="/admin/products/new">Додати товар</Link>} />
      ) : (
        <div className="stack">
          <p className="faint">Номер лота — порядок, у якому ви відмічаєте речі.</p>
          <ul className="list">
            {candidates.map((p) => {
              const n = chosen.indexOf(p.id)
              return (
                <li key={p.id}>
                  <label className="list-row" style={{ padding: '10px 0' }}>
                    <input type="checkbox" checked={n >= 0} onChange={() => toggle(p.id)} style={{ width: 20, height: 20 }} />
                    <Photo src={p.photos[0]} alt={p.title} className="thumb" />
                    <span className="grow">
                      <b>{p.title}</b>
                      <br />
                      <span className="faint">{p.code} · {p.sizes.map((s) => s.size).join('/')} · {uah(p.price)}</span>
                    </span>
                    {n >= 0 && <span className="lot-no num" style={{ position: 'static' }}>{n + 1}</span>}
                  </label>
                </li>
              )
            })}
          </ul>
          <button
            className="btn"
            type="button"
            onClick={() => {
              saveLive({ ...live, lots: chosen })
              onClose()
            }}
          >
            Зберегти · {chosen.length} {plural(chosen.length, 'лот', 'лоти', 'лотів')}
          </button>
        </div>
      )}
    </Sheet>
  )
}

function ReserveSheet({
  live,
  product,
  lotNo,
  onClose,
  onDone,
}: {
  live: Live
  product: Product
  lotNo: number
  onClose: () => void
  onDone: (text: string) => void
}) {
  const data = useShop()
  const [telegram, setTelegram] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const order = data.orders.find((o) => o.items.some((i) => i.productId === product.id) && o.status !== 'cancelled' && o.status !== 'refused')
  const black = new Set(data.settings.blacklist)
  const warn = [telegram.trim(), phone.trim()].some((c) => c && black.has(c))

  const reserve = () => {
    if (!telegram.trim() && !name.trim() && !phone.trim()) return
    const number = nextOrderNumber()
    saveOrder({
      id: newId(),
      number,
      createdAt: new Date().toISOString(),
      status: 'new',
      customer: { name: name.trim(), phone: phone.trim(), telegram: telegram.trim() },
      items: [{ productId: product.id, title: product.title, size: product.sizes[0]?.size ?? '', price: product.price, cost: product.cost }],
      delivery: { city: '', branch: '' },
      ttn: '',
      liveId: live.id,
      note: `Лот №${lotNo}`,
    })
    onDone(`Лот №${lotNo} заброньовано · замовлення №${number}`)
    onClose()
  }

  return (
    <Sheet title={`Лот №${lotNo}`} onClose={onClose}>
      <div className="stack">
        <div className="row">
          <Photo src={product.photos[0]} alt={product.title} className="thumb" />
          <div className="grow">
            <b>{product.title}</b>
            <div className="faint">{product.code} · {product.sizes.map((s) => s.size).join('/')} · {uah(product.price)}</div>
          </div>
          <ProductBadge status={product.status} />
        </div>

        {order ? (
          <div className="card stack" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
            <div className="spread">
              <b>Замовлення №{order.number}</b>
              <OrderBadge status={order.status} />
            </div>
            <span className="muted">{order.customer.telegram || order.customer.name} {order.customer.phone}</span>
            <div className="row-wrap">
              <Link className="btn btn-ghost btn-sm" to={`/admin/orders?open=${order.id}`}>Відкрити</Link>
              {(order.status === 'new' || order.status === 'awaiting_payment') && (
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  onClick={() => {
                    setOrderStatus(order.id, 'cancelled')
                    onDone(`Бронь зняли — лот №${lotNo} знову вільний`)
                    onClose()
                  }}
                >
                  Зняти бронь
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <label className="field">
              <span>Нік у TikTok / Telegram</span>
              <input className="input" autoFocus value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@нік з коментаря" />
            </label>
            <div className="grid-2">
              <label className="field">
                <span>Ім’я</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field">
                <span>Телефон</span>
                <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
            </div>
            {warn && <p role="alert" style={{ color: 'var(--critical-ink)', fontWeight: 600 }}>Цей клієнт у чорному списку (відмовлявся від посилок).</p>}
            <button className="btn" type="button" onClick={reserve} disabled={!telegram.trim() && !name.trim() && !phone.trim()}>
              Забронювати
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}

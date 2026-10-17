import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { RevenueChart } from '../components/RevenueChart'
import { LiveBadge, OrderBadge } from '../components/ui'
import { demoData } from '../lib/demo'
import { replaceAll, useShop } from '../lib/store'
import { dateTime, plural, uah } from '../lib/format'
import { needsAttention, orderTotal, revenueByDay, summary, type AttentionKind } from '../lib/stats'
import { ORDER_FLOW, ORDER_STATUS_LABEL } from '../lib/types'

const RANGES = [7, 30] as const

const ATTN_ICON: Record<AttentionKind, IconName> = {
  blacklist: 'alert',
  overdue: 'alert',
  ship: 'truck',
  refused: 'users',
}

export function Dashboard() {
  const data = useShop()
  const [days, setDays] = useState<(typeof RANGES)[number]>(7)

  const empty = !data.products.length && !data.orders.length && !data.lives.length
  if (empty) return <GettingStarted />

  const s = summary(data, days)
  const series = revenueByDay(data, days === 7 ? 14 : 30)
  const attention = needsAttention(data)
  const nextLive = data.lives
    .filter((l) => l.status !== 'done')
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const delta = s.previousRevenue ? Math.round(((s.revenue - s.previousRevenue) / s.previousRevenue) * 100) : null

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Огляд</h1>
          <p className="muted">Гроші, замовлення та що треба зробити сьогодні.</p>
        </div>
        <div className="range" role="group" aria-label="Період">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={days === r} onClick={() => setDays(r)}>
              {r} днів
            </button>
          ))}
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi hero-kpi">
          <span className="kpi-label">Виручка за {days} днів</span>
          <span className="kpi-value">{uah(s.revenue)}</span>
          {delta !== null && (
            <span className="kpi-delta" data-dir={delta >= 0 ? 'up' : 'down'}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% до попередніх {days} днів
            </span>
          )}
          <div className="hero-split">
            <span>
              Прибуток <b className="nowrap">{uah(s.profit)}</b>
            </span>
            <span>
              {s.paidOrders} {plural(s.paidOrders, 'продаж', 'продажі', 'продажів')} · виручка мінус закупівля
            </span>
          </div>
        </div>
        <Link to="/admin/orders?status=awaiting_payment" className="card kpi">
          <span className="kpi-label">Чекають оплату</span>
          <span className="kpi-value">{s.awaitingPayment}</span>
          <span className="kpi-delta">{s.reserved} {plural(s.reserved, 'річ', 'речі', 'речей')} у броні</span>
        </Link>
        <Link to="/admin/orders?status=paid" className="card kpi">
          <span className="kpi-label">Треба відправити</span>
          <span className="kpi-value">{s.toShip}</span>
          <span className="kpi-delta">{s.inStock} {plural(s.inStock, 'річ', 'речі', 'речей')} в наявності</span>
        </Link>
      </div>

      <div className="dash-grid">
        <div className="stack" style={{ gap: 16 }}>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Виручка по днях</h2>
                <p className="faint">За днем оплати, останні {series.length} днів</p>
              </div>
            </div>
            <RevenueChart days={series} />
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Замовлення за етапами</h2>
              <Link to="/admin/orders" className="faint">Усі →</Link>
            </div>
            <div className="flow">
              {ORDER_FLOW.map((st) => (
                <Link key={st} to={`/admin/orders?status=${st}`}>
                  <b className="num">{data.orders.filter((o) => o.status === st).length}</b>
                  <span>{ORDER_STATUS_LABEL[st]}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <section className="card">
            <div className="card-head">
              <h2>Потребує уваги</h2>
              <span className="faint">{attention.length}</span>
            </div>
            {attention.length === 0 ? (
              <p className="muted">Усе під контролем 👌</p>
            ) : (
              <ul className="list stack" style={{ gap: 12 }}>
                {attention.slice(0, 6).map((a) => (
                  <li key={a.kind + a.order.id} className="attn" data-kind={a.kind} style={{ borderTop: 0 }}>
                    <span className="attn-icon">
                      <Icon name={ATTN_ICON[a.kind]} />
                    </span>
                    <div className="grow">
                      <Link to={`/admin/orders?open=${a.order.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>
                        №{a.order.number} · {a.order.customer.name || a.order.customer.telegram}
                      </Link>
                      <div className="faint">{a.text}</div>
                    </div>
                    <span className="num faint">{uah(orderTotal(a.order))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Наступний ефір</h2>
              <Link to="/admin/lives" className="faint">Усі →</Link>
            </div>
            {nextLive ? (
              <Link to={`/admin/lives/${nextLive.id}`} className="stack" style={{ gap: 6, textDecoration: 'none' }}>
                <div className="spread">
                  <b>{nextLive.title}</b>
                  <LiveBadge status={nextLive.status} />
                </div>
                <span className="muted">
                  {dateTime(nextLive.date)} · {nextLive.lots.length} {plural(nextLive.lots.length, 'лот', 'лоти', 'лотів')}
                </span>
              </Link>
            ) : (
              <Link to="/admin/lives" className="btn btn-ghost btn-block">
                <Icon name="plus" />
                Запланувати ефір
              </Link>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Останні замовлення</h2>
            </div>
            <ul className="list">
              {data.orders.slice(0, 4).map((o) => (
                <li key={o.id} className="spread" style={{ padding: '8px 0' }}>
                  <span className="grow">
                    №{o.number} · {o.customer.name || o.customer.telegram}
                  </span>
                  <OrderBadge status={o.status} />
                </li>
              ))}
              {!data.orders.length && <li className="muted">Ще немає замовлень</li>}
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}

function GettingStarted() {
  const { settings } = useShop()
  const steps: [string, string, string][] = [
    ['/admin/batches', 'Внесіть закупівлю', 'Скільки коштував мішок чи партія — щоб бачити прибуток.'],
    ['/admin/products/new', 'Додайте товари', 'Фото, розміри, заміри, ціна. Одразу з’являться на сайті.'],
    ['/admin/lives', 'Сплануйте ефір', 'Оберіть речі — вони отримають номери лотів.'],
    ['/admin/orders', 'Ведіть замовлення', 'Бронь → оплата → ТТН. Дашборд порахує все сам.'],
  ]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Огляд</h1>
          <p className="muted">Тут буде виручка, прибуток і що треба зробити сьогодні.</p>
        </div>
      </div>

      <section className="card">
        <h2 style={{ marginBottom: 4 }}>З чого почати</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Шаблон порожній. Пройдіть ці кроки — і дашборд оживе.</p>
        <ol className="list">
          {steps.map(([to, title, text], i) => (
            <li key={to}>
              <Link to={to} className="list-row" style={{ padding: '12px 0' }}>
                <span className="attn-icon num" style={{ fontWeight: 700 }}>{i + 1}</span>
                <span className="grow">
                  <b>{title}</b>
                  <br />
                  <span className="faint">{text}</span>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="card stack">
        <div>
          <h3>Хочете побачити, як виглядає з даними?</h3>
          <p className="faint">Завантажить вигадані товари й замовлення. Очистити можна в Налаштуваннях.</p>
        </div>
        <button className="btn btn-ghost" type="button" style={{ justifySelf: 'start' }} onClick={() => replaceAll(demoData(settings))}>
          Заповнити прикладом
        </button>
      </section>
    </>
  )
}

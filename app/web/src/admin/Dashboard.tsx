import { Link } from 'react-router'
import { Spinner } from '../components/ui'
import { dateTime, money } from '../lib/format'
import { useFetch } from '../lib/hooks'
import { Top, useMe } from './AdminApp'
import { StatusPill } from './Orders'
import type { OrderStatus } from '../lib/types'

type Data = {
  awaitingPayment: number
  overdue: number
  toShip: number
  inTransit: number
  atBranch: number
  unassigned: number
  pendingReviews: number
  products: number
  drafts: number
  soldOut: number
  today: { orders: number; total?: number }
  daily: Array<{ day: string; orders: number; revenue: number }>
  months: Array<{ month: string; revenue: number; profit: number; orders: number }>
  recent: Array<{ id: number; number: number; status: OrderStatus; name: string; total: number; created_at: string; overdue: number }>
  lowStock: Array<{ id: number; title: string; size: string; color: string; stock: number }>
}

export function Dashboard() {
  const { me } = useMe()
  const { data } = useFetch<Data>('/api/admin/dashboard')
  if (!data) return <Spinner />
  const month = data.months[0]
  const max = Math.max(1, ...data.daily.map((d) => d.revenue))
  return (
    <>
      <Top title={`Вітаємо, ${me.user.name}`}>
        <Link to="/admin/products/new" className="btn main sm">
          + Товар
        </Link>
      </Top>
      <div className="tiles">
        <Link to="/admin/orders?status=new" className={`tile${data.overdue ? ' alarm' : ''}`}>
          <b>{data.awaitingPayment}</b>
          <span>Чекають оплату{data.overdue ? ` · ${data.overdue} простр.` : ''}</span>
        </Link>
        <Link to="/admin/orders?status=paid" className="tile">
          <b>{data.toShip}</b>
          <span>Треба відправити</span>
        </Link>
        <Link to="/admin/orders?status=shipped" className="tile">
          <b>{data.inTransit}</b>
          <span>У дорозі</span>
        </Link>
        <Link to="/admin/orders?status=arrived" className="tile">
          <b>{data.atBranch}</b>
          <span>У відділенні</span>
        </Link>
        <div className="tile">
          <b>{data.today.orders}</b>
          <span>Замовлень сьогодні{data.today.total !== undefined ? ` · ${money(data.today.total)}` : ''}</span>
        </div>
        <Link to="/admin/orders?status=active" className={`tile${data.unassigned ? ' alarm' : ''}`}>
          <b>{data.unassigned}</b>
          <span>Без відповідального</span>
        </Link>
        <Link to="/admin/products" className="tile">
          <b>{data.products}</b>
          <span>
            Товарів у продажу{data.drafts ? ` · ${data.drafts} чернеток` : ''}
          </span>
        </Link>
        <Link to="/admin/reviews" className={`tile${data.pendingReviews ? ' alarm' : ''}`}>
          <b>{data.pendingReviews}</b>
          <span>Відгуків на перевірку</span>
        </Link>
      </div>

      <div className="cols2">
        <section className="card">
          <div className="section-title">
            <h2>Останні замовлення</h2>
            <Link to="/admin/orders" className="link-btn">
              Усі
            </Link>
          </div>
          <div className="list">
            {data.recent.map((o) => (
              <Link key={o.id} to={`/admin/orders/${o.id}`} className="list-row">
                <div className="grow">
                  <b>
                    №{o.number} · {o.name}
                  </b>
                  <span className="muted small">{dateTime(o.created_at)}</span>
                </div>
                <div className="side">
                  <b>{money(o.total)}</b>
                  <StatusPill status={o.status} overdue={!!o.overdue} />
                </div>
              </Link>
            ))}
            {!data.recent.length && <p className="muted">Замовлень ще немає.</p>}
          </div>
        </section>
        <div className="stack">
          {me.can.finance && (
            <section className="card">
              <div className="section-title">
                <h2>Виручка, 30 днів</h2>
                <Link to="/admin/finance" className="link-btn">
                  Фінанси
                </Link>
              </div>
              {data.daily.length ? (
                <div className="bars" aria-label="Виручка по днях">
                  {data.daily.map((d) => (
                    <div key={d.day} style={{ height: `${Math.max(4, (d.revenue / max) * 100)}%` }} title={`${d.day}: ${money(d.revenue)}`} />
                  ))}
                </div>
              ) : (
                <p className="muted">Оплачених замовлень ще немає.</p>
              )}
              {month && (
                <dl className="kv" style={{ marginTop: 12 }}>
                  <dt>Цей місяць</dt>
                  <dd>
                    {money(month.revenue)} · {month.orders} замовл.
                  </dd>
                  <dt>Прибуток</dt>
                  <dd>{money(month.profit)}</dd>
                </dl>
              )}
            </section>
          )}
          <section className="card">
            <h2>Закінчуються</h2>
            {data.soldOut > 0 && <p className="muted small">Повністю розпродано: {data.soldOut}</p>}
            <div className="list">
              {data.lowStock.map((v, i) => (
                <Link key={i} to={`/admin/products/${v.id}`} className="list-row">
                  <span className="grow">
                    <b>{v.title}</b>
                    <span className="muted small">{[v.size, v.color].filter(Boolean).join(' · ') || 'без розміру'}</span>
                  </span>
                  <span className={`pill${v.stock ? ' new' : ' alarm'}`}>{v.stock} шт.</span>
                </Link>
              ))}
              {!data.lowStock.length && <p className="muted">Усього вдосталь.</p>}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

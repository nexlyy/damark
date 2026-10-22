import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Empty, Spinner } from '../components/ui'
import { query } from '../lib/api'
import { dateTime, money, prettyPhone } from '../lib/format'
import { useDebounced, useFetch } from '../lib/hooks'
import type { OrderStatus } from '../lib/types'
import { Top } from './AdminApp'

export const statusLabels: Record<OrderStatus, string> = {
  new: 'Чекає оплату',
  paid: 'Оплачено',
  shipped: 'Відправлено',
  arrived: 'У відділенні',
  received: 'Отримано',
  cancelled: 'Скасовано',
  refused: 'Відмова',
  returned: 'Повернено',
}

export function StatusPill({ status, overdue }: { status: OrderStatus; overdue?: boolean }) {
  return <span className={`pill ${overdue ? 'alarm' : status}`}>{overdue ? 'Бронь минула' : statusLabels[status]}</span>
}

type Row = {
  id: number
  number: number
  status: OrderStatus
  source: string
  name: string
  phone: string
  telegram: string
  city_name: string
  total: number
  refund: number
  ttn: string
  np_status: string
  created_at: string
  manager: string | null
  blacklisted: number
  pieces: number
  image: string | null
  overdue: number
}

const tabs: Array<[string, string]> = [
  ['active', 'Активні'],
  ['new', 'Чекають оплату'],
  ['overdue', 'Бронь минула'],
  ['paid', 'Відправити'],
  ['shipped', 'У дорозі'],
  ['arrived', 'У відділенні'],
  ['mine', 'Мої'],
  ['received', 'Отримані'],
  ['refused', 'Відмови'],
  ['cancelled', 'Скасовані'],
  ['all', 'Усі'],
]

export function Orders() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'active'
  const [q, setQ] = useState('')
  const debounced = useDebounced(q)
  const { data, loading } = useFetch<{ items: Row[]; counts: Array<{ status: string; n: number; overdue: number }> }>(
    `/api/admin/orders${query({ status: debounced ? 'all' : status, q: debounced })}`,
  )
  const count = (s: string) => {
    const c = data?.counts ?? []
    if (s === 'active') return c.reduce((x, r) => x + r.n, 0)
    if (s === 'overdue') return c.reduce((x, r) => x + (r.overdue ?? 0), 0)
    return c.find((r) => r.status === s)?.n ?? 0
  }
  return (
    <>
      <Top title="Замовлення">
        <Link to="/admin/orders/new" className="btn main sm">
          + Нове
        </Link>
      </Top>
      <div className="searchbar">
        <input type="search" placeholder="Номер, телефон, ТТН, імʼя, @нік" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Пошук замовлень" />
      </div>
      {!debounced && (
        <div className="tabs-row" role="tablist">
          {tabs.map(([v, label]) => (
            <button key={v} role="tab" aria-selected={status === v} onClick={() => setParams({ status: v }, { replace: true })}>
              {label}
              {['active', 'new', 'overdue', 'paid', 'shipped', 'arrived'].includes(v) && count(v) > 0 && <span className="n">{count(v)}</span>}
            </button>
          ))}
        </div>
      )}
      <section className="card">
        {!data && loading && <Spinner />}
        {data && !data.items.length && <Empty icon="bag" title="Тут порожньо" />}
        <div className="list">
          {data?.items.map((o) => (
            <Link key={o.id} to={`/admin/orders/${o.id}`} className="list-row">
              {o.image ? <img className="thumb" src={o.image} alt="" loading="lazy" /> : <span className="thumb" />}
              <div className="grow">
                <b>
                  №{o.number} · {o.name}
                  {o.blacklisted ? ' ⚠️' : ''}
                </b>
                <span className="muted small">
                  {prettyPhone(o.phone)} · {o.city_name}
                </span>
                <span className="faint small">
                  {dateTime(o.created_at)} · {o.pieces} шт.{o.manager ? ` · ${o.manager}` : ''}
                  {o.ttn ? ` · ТТН ${o.ttn}` : ''}
                </span>
              </div>
              <div className="side">
                <b>{money(o.total)}</b>
                <StatusPill status={o.status} overdue={!!o.overdue} />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}

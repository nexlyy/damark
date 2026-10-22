import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Empty, ErrorText, Field, Spinner, toast } from '../components/ui'
import { api, query } from '../lib/api'
import { date, dateTime, money, phoneLink, prettyPhone } from '../lib/format'
import { useAction, useDebounced, useFetch } from '../lib/hooks'
import type { OrderStatus } from '../lib/types'
import { Top } from './AdminApp'
import { StatusPill } from './Orders'

type Row = { id: number; name: string; phone: string; telegram: string; blacklisted: number; note: string; orders: number; last_order: string | null; spent: number; refused: number }

export function Customers() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const debounced = useDebounced(q)
  const black = params.get('blacklisted') === '1'
  const { data, loading } = useFetch<Row[]>(`/api/admin/customers${query({ q: debounced, blacklisted: black })}`)
  return (
    <>
      <Top title="Клієнти" />
      <div className="searchbar">
        <input type="search" placeholder="Імʼя, телефон, @нік" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Пошук клієнтів" />
      </div>
      <div className="tabs-row" role="tablist">
        <button role="tab" aria-selected={!black} onClick={() => setParams({}, { replace: true })}>
          Усі
        </button>
        <button role="tab" aria-selected={black} onClick={() => setParams({ blacklisted: '1' }, { replace: true })}>
          Чорний список
        </button>
      </div>
      <section className="card">
        {!data && loading && <Spinner />}
        {data && !data.length && <Empty icon="users" title="Нікого не знайдено" />}
        <div className="list">
          {data?.map((c) => (
            <Link key={c.id} to={`/admin/customers/${c.id}`} className="list-row">
              <div className="grow">
                <b>
                  {c.name}
                  {c.blacklisted ? ' ⚠️' : ''}
                </b>
                <span className="muted small">
                  {prettyPhone(c.phone)}
                  {c.telegram ? ` · @${c.telegram}` : ''}
                </span>
                <span className="faint small">{c.last_order ? `Останнє: ${date(c.last_order)}` : 'Без замовлень'}</span>
              </div>
              <div className="side">
                <b>{money(c.spent)}</b>
                <span className="small muted">
                  {c.orders} замовл.{c.refused ? ` · ${c.refused} відм.` : ''}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}

type Customer = {
  id: number
  name: string
  phone: string
  telegram: string
  note: string
  blacklisted: number
  tg_chat_id: number | null
  created_at: string
  orders: Array<{ id: number; number: number; status: OrderStatus; total: number; refund: number; created_at: string; ttn: string }>
}

export function CustomerDetail() {
  const { id } = useParams()
  const { data: c, reload } = useFetch<Customer>(`/api/admin/customers/${id}`)
  const [form, setForm] = useState<{ name: string; telegram: string; note: string; blacklisted: boolean } | null>(null)
  const { busy, error, run } = useAction()
  useEffect(() => {
    if (c) setForm({ name: c.name, telegram: c.telegram, note: c.note, blacklisted: !!c.blacklisted })
  }, [c])
  if (!c || !form) return <Spinner />
  const spent = c.orders.filter((o) => !['new', 'cancelled'].includes(o.status)).reduce((s, o) => s + o.total - o.refund, 0)
  return (
    <>
      <Top title={c.name} back="/admin/customers" />
      <div className="cols2">
        <section className="card">
          <h2>Замовлення</h2>
          <div className="list">
            {c.orders.map((o) => (
              <Link key={o.id} to={`/admin/orders/${o.id}`} className="list-row">
                <div className="grow">
                  <b>№{o.number}</b>
                  <span className="muted small">{dateTime(o.created_at)}</span>
                </div>
                <div className="side">
                  <b>{money(o.total)}</b>
                  <StatusPill status={o.status} />
                </div>
              </Link>
            ))}
          </div>
          <Link to="/admin/orders/new" className="btn sm" style={{ marginTop: 10 }}>
            + Нове замовлення
          </Link>
        </section>
        <section className="card">
          <dl className="kv" style={{ marginBottom: 14 }}>
            <dt>Телефон</dt>
            <dd>
              <a href={phoneLink(c.phone)}>{prettyPhone(c.phone)}</a>
            </dd>
            <dt>Купив на</dt>
            <dd>{money(spent)}</dd>
            <dt>Клієнт з</dt>
            <dd>{date(c.created_at)}</dd>
            <dt>Telegram-бот</dt>
            <dd>{c.tg_chat_id ? 'підписаний' : '—'}</dd>
          </dl>
          <Field label="Імʼя">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Telegram">
            <input value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
          </Field>
          <Field label="Нотатка">
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={3} placeholder="Наприклад: двічі не забрала посилку" />
          </Field>
          <label className="check" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={form.blacklisted} onChange={(e) => setForm({ ...form, blacklisted: e.target.checked })} />
            <span>Чорний список — команда бачитиме попередження в кожному замовленні</span>
          </label>
          <ErrorText>{error}</ErrorText>
          <button
            className="btn main block"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.patch(`/api/admin/customers/${c.id}`, form)
                toast('Збережено')
                reload()
              })
            }
          >
            Зберегти
          </button>
        </section>
      </div>
    </>
  )
}

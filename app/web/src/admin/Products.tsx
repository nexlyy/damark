import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Empty, Spinner } from '../components/ui'
import { query } from '../lib/api'
import { money } from '../lib/format'
import { useDebounced, useFetch } from '../lib/hooks'
import type { Category } from '../lib/types'
import { Top } from './AdminApp'

type Row = {
  id: number
  slug: string
  title: string
  price: number
  old_price: number | null
  status: 'draft' | 'active' | 'archived'
  is_new: number
  is_hit: number
  category: string | null
  brand: string | null
  stock: number
  sold_out_variants: number
  image: string | null
}

const statusLabel = { draft: 'Чернетка', active: 'У продажу', archived: 'Архів' }

export function Products() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const debounced = useDebounced(q)
  const status = params.get('status') ?? ''
  const category = params.get('category') ?? ''
  const low = params.get('low') === '1'
  const { data, loading } = useFetch<Row[]>(`/api/admin/products${query({ q: debounced, status, category, low })}`)
  const cats = useFetch<Category[]>('/api/admin/categories').data
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }
  return (
    <>
      <Top title="Товари">
        <Link to="/admin/products/new" className="btn main sm">
          + Додати
        </Link>
      </Top>
      <div className="tabs-row" role="tablist">
        {[
          ['', 'Усі'],
          ['active', 'У продажу'],
          ['draft', 'Чернетки'],
          ['archived', 'Архів'],
        ].map(([v, label]) => (
          <button key={v} role="tab" aria-selected={status === v && !low} onClick={() => (set('low', ''), set('status', v))}>
            {label}
          </button>
        ))}
        <button role="tab" aria-selected={low} onClick={() => set('low', low ? '' : '1')}>
          Закінчуються
        </button>
      </div>
      <div className="searchbar">
        <input type="search" placeholder="Назва, бренд, артикул" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Пошук товарів" />
        {cats && cats.length > 0 && (
          <select value={category} onChange={(e) => set('category', e.target.value)} style={{ width: 'auto' }} aria-label="Категорія">
            <option value="">Усі категорії</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <section className="card">
        {!data && loading && <Spinner />}
        {data && !data.length && (
          <Empty icon="tag" title="Товарів не знайдено">
            <Link to="/admin/products/new" className="btn main">
              Додати перший товар
            </Link>
          </Empty>
        )}
        <div className="list">
          {data?.map((p) => (
            <Link key={p.id} to={`/admin/products/${p.id}`} className="list-row">
              {p.image ? <img className="thumb" src={p.image} alt="" loading="lazy" /> : <span className="thumb" />}
              <div className="grow">
                <b>{p.title}</b>
                <span className="muted small">{[p.category, p.brand].filter(Boolean).join(' · ') || 'Без категорії'}</span>
                <span className="small">
                  {money(p.price)}
                  {p.old_price ? <s className="faint"> {money(p.old_price)}</s> : null}
                  {p.is_new ? ' · Новинка' : ''}
                  {p.is_hit ? ' · Хіт' : ''}
                </span>
              </div>
              <div className="side">
                <span className={`pill ${p.status}`}>{statusLabel[p.status]}</span>
                <span className={`small${p.stock === 0 ? ' field-error' : ' muted'}`}>{p.stock} шт.</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}

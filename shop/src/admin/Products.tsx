import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty, Photo, ProductBadge } from '../components/ui'
import { useShop } from '../lib/store'
import { uah } from '../lib/format'
import { PRODUCT_STATUS_LABEL, type ProductStatus } from '../lib/types'

const FILTERS: (ProductStatus | '')[] = ['', 'available', 'reserved', 'sold', 'draft']

export function Products() {
  const { products } = useShop()
  const [status, setStatus] = useState<ProductStatus | ''>('')
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const shown = products.filter(
    (p) =>
      (!status || p.status === status) &&
      (!q || [p.title, p.brand, p.code].some((v) => v.toLowerCase().includes(q))),
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Товари</h1>
          <p className="muted">{products.length ? `${products.length} у базі` : 'Фото, розміри, ціни — усе тут'}</p>
        </div>
        <Link className="btn" to="/admin/products/new">
          <Icon name="plus" />
          Додати товар
        </Link>
      </div>

      {products.length > 0 && (
        <div className="toolbar">
          <label className="search" style={{ position: 'relative' }}>
            <span className="sr-only">Пошук</span>
            <input className="input" type="search" placeholder="Назва, бренд або код" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="chips" role="group" aria-label="Статус">
            {FILTERS.map((f) => (
              <button key={f || 'all'} className="chip" type="button" aria-pressed={status === f} onClick={() => setStatus(f)}>
                {f ? PRODUCT_STATUS_LABEL[f] : 'Усі'}
                <span className="faint"> {f ? products.filter((p) => p.status === f).length : products.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {products.length === 0 ? (
        <Empty
          icon="box"
          title="Товарів ще немає"
          action={
            <Link className="btn" to="/admin/products/new">
              <Icon name="camera" />
              Додати перший товар
            </Link>
          }
        >
          Сфотографуйте річ, вкажіть розмір і ціну — і вона з’явиться на сайті.
        </Empty>
      ) : shown.length === 0 ? (
        <Empty icon="search" title="Нічого не знайшлося" />
      ) : (
        <div className="card card-flush">
          <ul className="list">
            {shown.map((p) => (
              <li key={p.id}>
                <Link to={`/admin/products/${p.id}`} className="list-row">
                  <Photo src={p.photos[0]} alt={p.title} className="thumb" />
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{p.title}</div>
                    <div className="faint">
                      {p.code} · {p.sizes.map((s) => s.size).join(', ') || 'без розміру'} · {p.category}
                    </div>
                  </div>
                  <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
                    <span className="num" style={{ fontWeight: 700 }}>{uah(p.price)}</span>
                    <ProductBadge status={p.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

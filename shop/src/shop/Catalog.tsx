import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, TelegramIcon } from '../components/Icon'
import { Empty, Photo, ProductBadge } from '../components/ui'
import { useShop } from '../lib/store'
import { telegramLink, uah } from '../lib/format'
import { CATEGORIES, type Category } from '../lib/types'

export function Catalog() {
  const { products, settings } = useShop()
  const [category, setCategory] = useState<Category | ''>('')
  const [size, setSize] = useState('')
  const [query, setQuery] = useState('')

  // Drafts never reach the site; sold things drop off it.
  const onSale = products.filter((p) => p.status === 'available' || p.status === 'reserved')

  const sizes = useMemo(
    () => [...new Set(onSale.flatMap((p) => p.sizes.map((s) => s.size)))].sort((a, b) => a.localeCompare(b, 'uk', { numeric: true })),
    [onSale],
  )

  const q = query.trim().toLowerCase()
  const shown = onSale.filter(
    (p) =>
      (!category || p.category === category) &&
      (!size || p.sizes.some((s) => s.size === size)) &&
      (!q || [p.title, p.brand, p.code].some((v) => v.toLowerCase().includes(q))),
  )

  return (
    <main className="shop-wrap">
      <section className="shop-hero">
        <h1>{settings.shopName} 💙</h1>
        <p>Брендове взуття, одяг та аксесуари зі стоку. Нові надходження — на ефірах у TikTok.</p>
        <div className="row-wrap">
          <a className="btn btn-telegram" href={telegramLink(settings.managerTelegram)}>
            <TelegramIcon />
            Замовити в Telegram
          </a>
          <a className="btn btn-ghost" href={telegramLink(settings.stockGroup)}>
            Група наявності
          </a>
        </div>
      </section>

      <div className="filters">
        <label className="search">
          <Icon name="search" />
          <span className="sr-only">Пошук</span>
          <input
            className="input"
            type="search"
            placeholder="Пошук: назва, бренд або код DM-…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="chips" role="group" aria-label="Категорія">
          <button className="chip" type="button" aria-pressed={!category} onClick={() => setCategory('')}>
            Усе
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} className="chip" type="button" aria-pressed={category === c} onClick={() => setCategory(category === c ? '' : c)}>
              {c}
            </button>
          ))}
        </div>
        {sizes.length > 0 && (
          <div className="chips" role="group" aria-label="Розмір">
            <span className="faint" style={{ alignSelf: 'center', flex: 'none' }}>Розмір:</span>
            {sizes.map((s) => (
              <button key={s} className="chip" type="button" aria-pressed={size === s} onClick={() => setSize(size === s ? '' : s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {onSale.length === 0 ? (
        <Empty
          icon="store"
          title="Тут з’являться товари"
          action={
            <Link className="btn" to="/admin/products/new">
              <Icon name="plus" />
              Додати перший товар
            </Link>
          }
        >
          Щойно ви додасте товар в адмін-панелі, він одразу буде на сайті.
        </Empty>
      ) : shown.length === 0 ? (
        <Empty icon="search" title="Нічого не знайшлося">
          Спробуйте іншу категорію чи розмір.
        </Empty>
      ) : (
        <div className="grid-products">
          {shown.map((p) => (
            <Link key={p.id} to={`/item/${p.id}`} className="p-card">
              <div style={{ position: 'relative' }}>
                <Photo src={p.photos[0]} alt={p.title} />
                {p.status === 'reserved' && <ProductBadge status="reserved" />}
              </div>
              <div className="p-card-title">{p.title}</div>
              <div className="p-card-meta">
                {[p.brand, p.sizes.map((s) => s.size).join(', ')].filter(Boolean).join(' · ')}
              </div>
              <div className="price">
                {uah(p.price)}
                {p.oldPrice ? <s>{uah(p.oldPrice)}</s> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
      <div style={{ height: 32 }} />
    </main>
  )
}

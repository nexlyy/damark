import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Icon } from '../components/Icon'
import { Empty, Img, Sheet, Spinner, Stars, toast } from '../components/ui'
import { useFetch, useTitle } from '../lib/hooks'
import { useShop } from '../lib/shop'
import { addToCart, cart } from '../lib/store'
import type { Product } from '../lib/types'
import { track } from '../lib/umami'
import { FavButton, Price } from './ProductCard'
import { TelegramLink } from './TelegramLink'

export function ProductPage() {
  const { slug } = useParams()
  const shop = useShop()
  const { data: p, error } = useFetch<Product>(`/api/products/${slug}`)
  useTitle(p ? `${p.title} · ${shop.shop.name}` : null)

  if (error) return <Empty icon="search" title="Товар не знайдено">{<Link to="/catalog" className="btn">До каталогу</Link>}</Empty>
  if (!p) return <Spinner />
  return (
    <div className="wrap">
      <nav className="crumbs" aria-label="Шлях">
        <Link to="/catalog">Каталог</Link>
        {p.category && (
          <>
            <span>/</span>
            <Link to={`/c/${p.category.slug}`}>{p.category.name}</Link>
          </>
        )}
      </nav>
      <div className="product">
        <Gallery p={p} />
        <Info p={p} />
      </div>
      <Reviews p={p} />
    </div>
  )
}

function Gallery({ p }: { p: Product }) {
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState<number | null>(null)
  const slides = useRef<HTMLDivElement>(null)

  const go = (i: number) => {
    const el = slides.current
    if (el) el.scrollTo({ left: el.clientWidth * i, behavior: 'smooth' })
  }
  if (!p.photos.length) return <div className="gallery"><div className="slides"><button aria-hidden="true" tabIndex={-1} /></div></div>
  return (
    <div className="gallery">
      <div
        className="slides"
        ref={slides}
        onScroll={(e) => {
          const el = e.currentTarget
          setIndex(Math.round(el.scrollLeft / el.clientWidth))
        }}
      >
        {p.photos.map((ph, i) => (
          <button key={ph.id} type="button" onClick={() => setZoom(i)} aria-label={`Фото ${i + 1} з ${p.photos.length}, збільшити`}>
            <Img photo={ph} sizes="(min-width: 900px) 600px, 100vw" alt={i === 0 ? p.title : ''} eager={i === 0} />
          </button>
        ))}
      </div>
      <FavButton id={p.id} />
      {p.photos.length > 1 && (
        <>
          <div className="dots-row">
            {p.photos.map((ph, i) => (
              <button key={ph.id} aria-label={`Фото ${i + 1}`} aria-current={i === index} onClick={() => go(i)} />
            ))}
          </div>
          <div className="thumbs">
            {p.photos.map((ph, i) => (
              <button key={ph.id} aria-label={`Фото ${i + 1}`} aria-current={i === index} onClick={() => go(i)}>
                <img src={ph.s} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
      {zoom !== null && <Zoom p={p} start={zoom} onClose={() => setZoom(null)} />}
    </div>
  )
}

function Zoom({ p, start, onClose }: { p: Product; start: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollLeft = el.clientWidth * start
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', key)
      document.body.style.overflow = ''
    }
  }, [start, onClose])
  return (
    <div className="zoom" ref={ref} role="dialog" aria-label="Фото">
      <button className="icon-btn close" onClick={onClose} aria-label="Закрити">
        <Icon name="close" />
      </button>
      {p.photos.map((ph) => (
        <img key={ph.id} src={ph.l} alt="" />
      ))}
    </div>
  )
}

function Info({ p }: { p: Product }) {
  const shop = useShop()
  const navigate = useNavigate()
  const items = cart.use()
  const colors = useMemo(() => [...new Set(p.variants.map((v) => v.color).filter(Boolean))], [p])
  const [color, setColor] = useState<string>(() => (colors.length === 1 ? colors[0] : colors.find((c) => p.variants.some((v) => v.color === c && v.stock > 0)) ?? ''))
  const [variantId, setVariantId] = useState<number | null>(null)
  const [chartOpen, setChartOpen] = useState(false)
  const [askSize, setAskSize] = useState(false)
  // With sizes the buyer picks one; without, the colour (or the only
  // variant) is the choice.
  const hasSizes = p.variants.some((v) => v.size)
  const forColor = colors.length ? p.variants.filter((v) => v.color === color) : p.variants
  const variant = hasSizes
    ? (forColor.find((v) => v.id === variantId) ?? null)
    : forColor.length === 1 && forColor[0].stock > 0
      ? forColor[0]
      : null
  const inCart = variant ? (items.find((i) => i.variantId === variant.id)?.qty ?? 0) : 0
  const anyStock = p.variants.some((v) => v.stock > 0)

  const add = () => {
    if (!variant) {
      setAskSize(true)
      return
    }
    if (inCart >= variant.stock) {
      toast('Більше немає в наявності')
      return
    }
    addToCart({
      variantId: variant.id,
      productId: p.id,
      slug: p.slug,
      title: p.title,
      size: variant.size,
      color: variant.color,
      price: p.price,
      image: p.photos[0]?.s ?? null,
      qty: 1,
      stock: variant.stock,
    })
    track('Додали в кошик', { product: p.title, price: p.price })
    toast('Додано в кошик')
  }

  const rating = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : 0

  return (
    <div className="info">
      {p.brand && (
        <Link to={`/catalog?brand=${p.brand.slug}`} className="brand-link">
          {p.brand.name}
        </Link>
      )}
      <h1>{p.title}</h1>
      {p.reviews.length > 0 && (
        <a href="#reviews" className="small muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', textDecoration: 'none' }}>
          <Stars value={rating} size={15} /> {p.reviews.length} відгуків
        </a>
      )}
      <Price price={p.price} oldPrice={p.oldPrice} />

      {p.archived || !anyStock ? (
        <div className="card" style={{ marginTop: 16 }}>
          <b>Немає в наявності</b>
          <p className="muted small" style={{ margin: '4px 0 12px' }}>
            Напишіть менеджеру — підкажемо, чи буде ще, або підберемо схожу річ.
          </p>
          <TelegramLink nick={shop.shop.managerTelegram} text={`Вітаю! Цікавить «${p.title}»`} className="btn tg block">
            <Icon name="telegram" /> Написати менеджеру
          </TelegramLink>
        </div>
      ) : (
        <>
          {colors.length > 1 && (
            <div className="pick">
              <div className="pick-head">
                <span>Колір: {color || '—'}</span>
              </div>
              <div className="chips">
                {colors.map((c) => (
                  <button key={c} className="chip" aria-pressed={c === color} disabled={!p.variants.some((v) => v.color === c && v.stock > 0)} onClick={() => setColor(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          {hasSizes && (
            <div className="pick">
              <div className="pick-head">
                <span>Розмір{variant?.size ? `: ${variant.size}` : ''}</span>
                {p.sizeChart && (
                  <button className="link-btn small" onClick={() => setChartOpen(true)}>
                    Таблиця розмірів
                  </button>
                )}
              </div>
              <div className="chips">
                {forColor.map((v) => (
                  <button key={v.id} className="chip" aria-pressed={v.id === variant?.id} disabled={v.stock === 0} onClick={() => (setVariantId(v.id), setAskSize(false))}>
                    {v.size || 'Єдиний'}
                  </button>
                ))}
              </div>
              {askSize && <p className="field-error" style={{ marginTop: 8 }}>Оберіть розмір</p>}
            </div>
          )}
          {variant && variant.stock <= 2 && <p className="stock-note">Залишилось {variant.stock} шт.</p>}
          <div className="buy-bar">
            {inCart > 0 ? (
              <button className="btn main big" onClick={() => navigate('/cart')}>
                <Icon name="bag" /> У кошику ({inCart}) — оформити
              </button>
            ) : (
              <button className="btn main big" onClick={add}>
                <Icon name="bag" /> Додати в кошик
              </button>
            )}
            {inCart > 0 && (
              <button className="btn big" onClick={add} aria-label="Додати ще одну">
                <Icon name="plus" />
              </button>
            )}
          </div>
        </>
      )}

      <div className="details">
        {p.description && (
          <details open>
            <summary>Опис</summary>
            <div className="content">{p.description}</div>
          </details>
        )}
        {(p.measurements || p.sizeChart) && (
          <details>
            <summary>Заміри та розміри</summary>
            <div className="content">
              {p.measurements}
              {p.sizeChart && <SizeChartTable chart={p.sizeChart} />}
            </div>
          </details>
        )}
        {(p.composition || p.care) && (
          <details>
            <summary>Склад і догляд</summary>
            <div className="content">
              {p.composition && <p style={{ margin: '0 0 6px' }}>{p.composition}</p>}
              {p.care}
            </div>
          </details>
        )}
        <details>
          <summary>Доставка та оплата</summary>
          <div className="content">
            {shop.shop.deliveryNote} Оплата — передоплата на рахунок {shop.payment.recipient}.{' '}
            <Link to="/info/delivery">Детальніше</Link> · <Link to="/info/returns">Обмін і повернення</Link>
          </div>
        </details>
      </div>

      {chartOpen && p.sizeChart && (
        <Sheet title="Таблиця розмірів" onClose={() => setChartOpen(false)}>
          <SizeChartTable chart={p.sizeChart} />
          {p.measurements && <p className="muted" style={{ whiteSpace: 'pre-line' }}>{p.measurements}</p>}
        </Sheet>
      )}
    </div>
  )
}

export function SizeChartTable({ chart }: { chart: { columns: string[]; rows: string[][] } }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: 8 }}>
      <table className="chart">
        <thead>
          <tr>
            {chart.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.rows.map((r, i) => (
            <tr key={i}>
              {chart.columns.map((_, j) => (
                <td key={j}>{r[j] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Reviews({ p }: { p: Product }) {
  return (
    <section className="section" id="reviews">
      <div className="section-head">
        <h2>Відгуки</h2>
        <Link to={`/reviews?product=${p.id}#write`}>Залишити відгук</Link>
      </div>
      {!p.reviews.length && <p className="muted">Поки немає відгуків про цю річ.</p>}
      <div className="stack">
        {p.reviews.map((r) => (
          <ReviewCard key={r.id} r={r} />
        ))}
      </div>
    </section>
  )
}

export function ReviewCard({ r }: { r: Product['reviews'][number] }) {
  return (
    <article className="review">
      <header>
        <span>{r.name}</span>
        <Stars value={r.rating} />
      </header>
      {r.product && (
        <Link to={`/p/${r.product_slug}`} className="small muted">
          {r.product}
        </Link>
      )}
      <p>{r.text}</p>
      {r.photos.length > 0 && (
        <div className="pics">
          {r.photos.map((ph) => (
            <a key={ph.id} href={ph.l} target="_blank" rel="noreferrer">
              <img src={ph.s} alt="" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {r.reply && (
        <div className="reply">
          <b>DaMark:</b> {r.reply}
        </div>
      )}
    </article>
  )
}

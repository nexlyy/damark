import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Icon } from '../components/Icon'
import { Empty, Qty } from '../components/ui'
import { api } from '../lib/api'
import { money, pieces } from '../lib/format'
import { useTitle } from '../lib/hooks'
import { cart, cartCount, cartTotal, type CartItem } from '../lib/store'

type Fresh = { variantId: number; qty: number; gone: boolean; price?: number; stock?: number; title?: string; image?: string | null; slug?: string; size?: string; color?: string; productId?: number }

// Prices and stock may have changed since things went into the cart: ask
// the server and correct the cart before checkout.
export function useFreshCart() {
  const items = cart.use()
  const [gone, setGone] = useState<number[]>([])
  const [checked, setChecked] = useState(false)
  const ids = items.map((i) => `${i.variantId}:${i.qty}`).join(',')
  useEffect(() => {
    if (!items.length) {
      setChecked(true)
      return
    }
    let alive = true
    api
      .post<{ items: Fresh[] }>('/api/cart', { items: items.map((i) => ({ variantId: i.variantId, qty: i.qty })) })
      .then((res) => {
        if (!alive) return
        const byId = new Map(res.items.map((f) => [f.variantId, f]))
        setGone(res.items.filter((f) => f.gone).map((f) => f.variantId))
        cart.set((list) =>
          list.map((i) => {
            const f = byId.get(i.variantId)
            if (!f || f.gone) return i
            return { ...i, price: f.price ?? i.price, stock: f.stock, qty: Math.max(1, Math.min(i.qty, f.stock ?? i.qty)), title: f.title ?? i.title, image: f.image ?? i.image, slug: f.slug ?? i.slug }
          }),
        )
        setChecked(true)
      })
      .catch(() => alive && setChecked(true))
    return () => {
      alive = false
    }
    // Only when the set of lines changes, not on every price correction.
  }, [ids])
  return { items, gone, checked }
}

export function CartLine({ item, gone, editable = true }: { item: CartItem; gone: boolean; editable?: boolean }) {
  return (
    <div className={`cart-line${gone ? ' gone' : ''}`}>
      {item.image ? <img src={item.image} alt="" loading="lazy" /> : <div className="noimg" />}
      <div className="meta">
        <Link to={`/p/${item.slug}`}>{item.title}</Link>
        <span className="opts">{[item.size, item.color].filter(Boolean).join(' · ')}</span>
        {gone ? (
          <span className="field-error">Уже немає в наявності</span>
        ) : (
          <b>{money(item.price * item.qty)}</b>
        )}
        {editable && (
          <div className="ctl">
            {!gone ? (
              <Qty small value={item.qty} max={Math.min(item.stock ?? 10, 10)} onChange={(n) => cart.set((l) => l.map((i) => (i.variantId === item.variantId ? { ...i, qty: n } : i)))} />
            ) : (
              <span />
            )}
            <button className="icon-btn" aria-label="Прибрати" onClick={() => cart.set((l) => l.filter((i) => i.variantId !== item.variantId))}>
              <Icon name="trash" size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function CartPage() {
  const { items, gone } = useFreshCart()
  const navigate = useNavigate()
  useTitle('Кошик')
  const live = items.filter((i) => !gone.includes(i.variantId))
  if (!items.length)
    return (
      <div className="wrap">
        <Empty icon="bag" title="Кошик порожній">
          <Link to="/catalog" className="btn main">
            До каталогу
          </Link>
        </Empty>
      </div>
    )
  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div className="catalog-head">
        <h1>Кошик</h1>
        <span className="muted small">{pieces(cartCount(live))}</span>
      </div>
      <div className="card">
        {items.map((i) => (
          <CartLine key={i.variantId} item={i} gone={gone.includes(i.variantId)} />
        ))}
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="totals">
          <div className="grand">
            <span>Разом</span>
            <span>{money(cartTotal(live))}</span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Доставка — за тарифами Нової пошти, оплачується при отриманні посилки.
          </p>
        </div>
        <button className="btn main big block" style={{ marginTop: 14 }} disabled={!live.length} onClick={() => navigate('/checkout')}>
          Оформити замовлення
        </button>
      </div>
    </div>
  )
}

import { Link } from 'react-router'
import { Icon } from '../components/Icon'
import { Img } from '../components/ui'
import { favorites, toggleFavorite } from '../lib/store'
import { money } from '../lib/format'
import type { ProductCard as Card } from '../lib/types'
import { track } from '../lib/umami'

export function Price({ price, oldPrice }: { price: number; oldPrice: number | null }) {
  return (
    <div className={`price${oldPrice ? ' sale' : ''}`}>
      <span>{money(price)}</span>
      {oldPrice && <s>{money(oldPrice)}</s>}
    </div>
  )
}

export function FavButton({ id, className = 'fav' }: { id: number; className?: string }) {
  const list = favorites.use()
  const on = list.includes(id)
  return (
    <button
      type="button"
      className={`${className}${on ? ' on' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'Прибрати з обраного' : 'Додати в обране'}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!on) track('Обране', { id })
        toggleFavorite(id)
      }}
    >
      <Icon name="heart" filled={on} size={20} />
    </button>
  )
}

export function ProductCard({ p, eager = false }: { p: Card; eager?: boolean }) {
  const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0
  return (
    <Link to={`/p/${p.slug}`} className={`pcard${p.inStock ? '' : ' sold'}`}>
      <div className="pic">
        {p.image && <Img photo={p.image} sizes="(min-width: 980px) 280px, (min-width: 640px) 33vw, 50vw" alt={p.title} eager={eager} />}
        {p.image2 && <Img className="second" photo={p.image2} sizes="(min-width: 980px) 280px, 33vw" alt="" />}
        <div className="tags">
          {!p.inStock && <span className="tag out">Розпродано</span>}
          {p.inStock && discount > 0 && <span className="tag sale">−{discount}%</span>}
          {p.inStock && p.isNew && <span className="tag">Новинка</span>}
          {p.inStock && p.isHit && <span className="tag hit">Хіт</span>}
        </div>
        <FavButton id={p.id} />
      </div>
      <div className="body">
        {p.brand && <span className="brand-name">{p.brand}</span>}
        <span className="title">{p.title}</span>
        <Price price={p.price} oldPrice={p.oldPrice} />
        {p.sizes.length > 0 && <span className="sizes">{p.sizes.join(' · ')}</span>}
      </div>
    </Link>
  )
}

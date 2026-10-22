import { Link } from 'react-router'
import { Icon } from '../components/Icon'
import { Spinner } from '../components/ui'
import { useFetch, useTitle } from '../lib/hooks'
import { useShop } from '../lib/shop'
import type { ProductCard as Card } from '../lib/types'
import { ProductCard } from './ProductCard'

type HomeData = { isNew: Card[]; hits: Card[]; sale: Card[]; latest: Card[] }

function Rail({ title, to, items }: { title: string; to: string; items: Card[] }) {
  if (!items.length) return null
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        <Link to={to}>Усі →</Link>
      </div>
      <div className="rail">
        {items.map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  )
}

export function Home() {
  const shop = useShop()
  const { data, error } = useFetch<HomeData>('/api/home')
  useTitle(shop.shop.name)
  return (
    <div className="wrap">
      <section className="hero">
        <img src="/logo.jpg" alt="" width="104" height="104" />
        <h1>{shop.shop.name}</h1>
        <p>Одяг і білизна в наявності. Оберіть розмір, оформіть замовлення — і ми відправимо Новою поштою.</p>
      </section>

      {error && <p className="error">{error}</p>}
      {!data && !error && <Spinner />}
      {data && (
        <>
          <Rail title="Новинки" to="/catalog?new=1" items={data.isNew} />
          <Rail title="Хіти" to="/catalog?hit=1" items={data.hits} />
          <Rail title="Акції" to="/catalog?sale=1" items={data.sale} />
          {data.latest.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>Щойно додали</h2>
                <Link to="/catalog">Увесь каталог →</Link>
              </div>
              <div className="grid">
                {data.latest.map((p, i) => (
                  <ProductCard key={p.id} p={p} eager={i < 2} />
                ))}
              </div>
            </section>
          )}
          {!data.latest.length && (
            <div className="empty">
              <Icon name="box" size={34} />
              <h3>Каталог скоро зʼявиться</h3>
            </div>
          )}
        </>
      )}

      <div className="trust">
        <div>
          <Icon name="truck" /> {shop.shop.deliveryNote.replace(/\.$/, '')}
        </div>
        <div>
          <Icon name="cash" /> Оплата лише на рахунок ФОП
        </div>
        <div>
          <Icon name="undo" /> Обмін і повернення 14 днів
        </div>
      </div>
    </div>
  )
}

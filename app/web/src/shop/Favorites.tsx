import { Link } from 'react-router'
import { Empty, Spinner } from '../components/ui'
import { query } from '../lib/api'
import { useFetch, useTitle } from '../lib/hooks'
import { favorites } from '../lib/store'
import type { ProductList } from '../lib/types'
import { ProductCard } from './ProductCard'

export function Favorites() {
  const ids = favorites.use()
  useTitle('Обране')
  const { data } = useFetch<ProductList>(ids.length ? `/api/products${query({ ids: ids.map(String), limit: 60 })}` : null)
  return (
    <div className="wrap">
      <div className="catalog-head">
        <h1>Обране</h1>
      </div>
      {!ids.length && (
        <Empty icon="heart" title="Тут поки порожньо">
          <p>Натискайте ♡ на товарах, щоб не загубити те, що сподобалось.</p>
          <Link to="/catalog" className="btn main">
            До каталогу
          </Link>
        </Empty>
      )}
      {ids.length > 0 && !data && <Spinner />}
      {data && (
        <div className="grid">
          {ids
            .map((id) => data.items.find((p) => p.id === id))
            .filter((p) => !!p)
            .map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
        </div>
      )}
    </div>
  )
}

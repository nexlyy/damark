import './shop.css'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { Icon } from '../components/Icon'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Sheet } from '../components/ui'
import { ShopProvider, useShop } from '../lib/shop'
import { cart, cartCount, favorites } from '../lib/store'
import { TelegramLink } from './TelegramLink'
import { Home } from './Home'
import { Catalog } from './Catalog'
import { ProductPage } from './ProductPage'
import { Favorites } from './Favorites'
import { CartPage } from './CartPage'
import { Checkout } from './Checkout'
import { OrderPage } from './OrderPage'
import { InfoPage, NotFound } from './InfoPage'
import { ReviewsPage } from './ReviewsPage'

export function ShopApp() {
  return (
    <ShopProvider>
      <Shop />
    </ShopProvider>
  )
}

function Shop() {
  const location = useLocation()
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0)
  }, [location.pathname, location.hash])
  return (
    <div className="shop">
      <Header />
      <main className="shop-main">
        <ErrorBoundary resetKey={location.pathname}>
          <Routes>
            <Route index element={<Home />} />
            <Route path="catalog" element={<Catalog />} />
            <Route path="c/:category" element={<Catalog />} />
            <Route path="p/:slug" element={<ProductPage />} />
            <Route path="favorites" element={<Favorites />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="order/:token" element={<OrderPage />} />
            <Route path="info/:slug" element={<InfoPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  )
}

function Header() {
  const shop = useShop()
  const items = cart.use()
  const favs = favorites.use()
  const [searching, setSearching] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const [q, setQ] = useState(params.get('q') ?? '')
  const showCats = location.pathname === '/' || location.pathname === '/catalog' || location.pathname.startsWith('/c/')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSearching(false)
    navigate(`/catalog?q=${encodeURIComponent(q.trim())}`)
  }
  const count = cartCount(items)

  return (
    <header className="shop-header">
      <div className="wrap">
        <Link to="/" className="brand" aria-label={`${shop.shop.name} — на головну`}>
          <img src="/logo-128.jpg" alt="" width="38" height="38" />
          <span>{shop.shop.name}</span>
        </Link>
        <form className="top-search" role="search" onSubmit={submit}>
          <Icon name="search" size={20} />
          <input type="search" placeholder="Пошук: сукня, джинси, бренд…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Пошук" />
        </form>
        <button className="icon-btn search-toggle" onClick={() => setSearching(true)} aria-label="Пошук">
          <Icon name="search" />
        </button>
        <Link to="/favorites" className="icon-btn" aria-label={`Обране: ${favs.length}`}>
          <Icon name="heart" />
          {favs.length > 0 && <span className="badge">{favs.length}</span>}
        </Link>
        <Link to="/cart" className="icon-btn" aria-label={`Кошик: ${count}`}>
          <Icon name="bag" />
          {count > 0 && <span className="badge">{count}</span>}
        </Link>
      </div>
      {showCats && shop.categories.length > 0 && (
        <nav className="cats" aria-label="Категорії">
          <NavLink to="/catalog" end className={({ isActive }) => (isActive && !params.get('q') ? 'active' : '')}>
            Усе
          </NavLink>
          {shop.categories.map((c) => (
            <NavLink key={c.id} to={`/c/${c.slug}`}>
              {c.name}
            </NavLink>
          ))}
        </nav>
      )}
      {searching && (
        <Sheet title="Пошук" onClose={() => setSearching(false)}>
          <form onSubmit={submit} role="search">
            <input type="search" autoFocus placeholder="Сукня, джинси, бренд…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Пошук" />
            <button className="btn main block" style={{ marginTop: 12 }}>
              Знайти
            </button>
          </form>
        </Sheet>
      )}
    </header>
  )
}

function Footer() {
  const shop = useShop()
  return (
    <footer className="shop-footer">
      <div className="wrap">
        <div className="cols">
          <div>
            <h3>Звʼязок з менеджером</h3>
            <ul>
              <li>
                <TelegramLink nick={shop.shop.managerTelegram} className="contact">
                  <Icon name="telegram" size={18} /> @{shop.shop.managerTelegram}
                </TelegramLink>
              </li>
              {shop.shop.viberPhone && (
                <li className="contact">
                  <Icon name="phone" size={18} /> Viber: {shop.shop.viberPhone}
                </li>
              )}
              {shop.shop.instagram && (
                <li>
                  <a className="contact" href={`https://www.instagram.com/${shop.shop.instagram}/`}>
                    <Icon name="instagram" size={18} /> {shop.shop.instagram}
                  </a>
                </li>
              )}
            </ul>
          </div>
          <div>
            <h3>Покупцям</h3>
            <ul>
              {shop.pages.map((p) => (
                <li key={p.slug}>
                  <Link to={`/info/${p.slug}`}>{p.title}</Link>
                </li>
              ))}
              <li>
                <Link to="/reviews">Відгуки</Link>
              </li>
            </ul>
          </div>
          <div>
            <h3>Оплата</h3>
            <p className="muted" style={{ margin: 0 }}>
              Лише на рахунок {shop.payment.recipient}. Якщо вам надіслали інші реквізити — це шахраї.
            </p>
          </div>
        </div>
        <p className="copyright">
          © {new Date().getFullYear()} {shop.shop.name}. {shop.shop.deliveryNote}
        </p>
      </div>
    </footer>
  )
}

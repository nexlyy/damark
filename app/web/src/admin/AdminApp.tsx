import './admin.css'
import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { Icon } from '../components/Icon'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { ErrorText, Field, Sheet, Spinner } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { useAction } from '../lib/hooks'
import { Dashboard } from './Dashboard'
import { Products } from './Products'
import { ProductEditor } from './ProductEditor'
import { Orders } from './Orders'
import { OrderDetail } from './OrderDetail'
import { OrderNew } from './OrderNew'
import { Customers, CustomerDetail } from './Customers'
import { Purchases, PurchaseNew } from './Purchases'
import { Finance } from './Finance'
import { Reviews } from './Reviews'
import { Settings } from './Settings'

export type Me = {
  user: { id: number; login: string; name: string; role: 'owner' | 'manager' | 'dev'; telegram: string | null }
  can: { finance: boolean; settings: boolean; staff: boolean }
  botReady: boolean
}

const MeContext = createContext<{ me: Me; reload: () => void } | null>(null)
export const useMe = () => useContext(MeContext)!

type Counts = { awaitingPayment: number; overdue: number; toShip: number; pendingReviews: number }
const CountsContext = createContext<{ counts: Counts | null; refresh: () => void }>({ counts: null, refresh: () => undefined })
export const useCounts = () => useContext(CountsContext)

export default function AdminApp() {
  const [me, setMe] = useState<Me | null | 'out'>(null)
  const load = useCallback(() => {
    api
      .get<Me>('/api/auth/me')
      .then(setMe)
      .catch((e: ApiError) => setMe(e.status === 401 ? 'out' : null))
  }, [])
  useEffect(() => {
    load()
    // Installable as an app on the phone's home screen.
    const link = document.createElement('link')
    link.rel = 'manifest'
    link.href = '/admin.webmanifest'
    document.head.appendChild(link)
    document.title = 'DaMark · адмінка'
    return () => link.remove()
  }, [load])

  if (me === null) return <Spinner />
  if (me === 'out') return <Login onDone={load} />
  return (
    <MeContext.Provider value={{ me, reload: load }}>
      <Layout />
    </MeContext.Provider>
  )
}

function Login({ onDone }: { onDone: () => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [remember, setRemember] = useState(true)
  const { busy, error, run } = useAction()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      if (challenge) {
        await api.post('/api/auth/verify', { challenge, code, remember })
        onDone()
        return
      }
      const res = await api.post<{ ok?: boolean; challenge?: string }>('/api/auth/login', { login, password })
      if (res.challenge) setChallenge(res.challenge)
      else onDone()
    })
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <img className="logo" src="/logo-128.jpg" alt="" />
        <h1 style={{ textAlign: 'center' }}>Адмінка DaMark</h1>
        {!challenge ? (
          <>
            <Field label="Логін">
              <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" required />
            </Field>
            <Field label="Пароль">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
          </>
        ) : (
          <>
            <p className="muted">Ми надіслали код у Telegram. Введіть його тут.</p>
            <Field label="Код із Telegram">
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus required />
            </Field>
            <label className="check" style={{ marginBottom: 14 }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Запамʼятати цей пристрій — наступного разу код не знадобиться</span>
            </label>
          </>
        )}
        <ErrorText>{error}</ErrorText>
        <button className="btn main block big" disabled={busy}>
          {challenge ? 'Підтвердити' : 'Увійти'}
        </button>
        {challenge && (
          <button type="button" className="link-btn" style={{ marginTop: 12 }} onClick={() => (setChallenge(null), setCode(''))}>
            Назад
          </button>
        )}
      </form>
    </div>
  )
}

type NavItem = { to: string; label: string; icon: string; end?: boolean; show?: (me: Me) => boolean; count?: (c: Counts) => number; alarm?: (c: Counts) => boolean }

const nav: NavItem[] = [
  { to: '/admin', label: 'Головна', icon: 'home', end: true },
  { to: '/admin/orders', label: 'Замовлення', icon: 'bag', count: (c) => c.awaitingPayment + c.toShip, alarm: (c) => c.overdue > 0 },
  { to: '/admin/products', label: 'Товари', icon: 'tag' },
  { to: '/admin/customers', label: 'Клієнти', icon: 'users' },
  { to: '/admin/purchases', label: 'Закупки', icon: 'box', show: (m) => m.can.finance },
  { to: '/admin/finance', label: 'Фінанси', icon: 'chart', show: (m) => m.can.finance },
  { to: '/admin/reviews', label: 'Відгуки', icon: 'star', count: (c) => c.pendingReviews },
  { to: '/admin/settings', label: 'Налаштування', icon: 'settings' },
]

function Layout() {
  const { me } = useMe()
  const location = useLocation()
  const navigate = useNavigate()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [more, setMore] = useState(false)
  const refresh = useCallback(() => {
    api.get<Counts>('/api/admin/dashboard').then(setCounts).catch(() => undefined)
  }, [])
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 60_000)
    return () => clearInterval(t)
  }, [refresh])
  useEffect(() => setMore(false), [location.pathname])

  const items = nav.filter((n) => !n.show || n.show(me))
  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => undefined)
    navigate('/admin')
    location.pathname === '/admin' ? window.location.reload() : window.location.assign('/admin')
  }
  const badge = (n: NavItem) => {
    if (!counts || !n.count) return null
    const value = n.count(counts)
    return value > 0 ? <span className={`count${n.alarm?.(counts) ? ' alarm' : ''}`}>{value}</span> : null
  }

  return (
    <CountsContext.Provider value={{ counts, refresh }}>
      <div className="admin">
        <aside className="admin-side">
          <Link to="/admin" className="brand">
            <img src="/logo-128.jpg" alt="" width="34" height="34" />
            <span>DaMark</span>
          </Link>
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav">
              <Icon name={n.icon} size={20} /> {n.label} {badge(n)}
            </NavLink>
          ))}
          <a className="nav" href="/" target="_blank" rel="noreferrer">
            <Icon name="external" size={20} /> Магазин
          </a>
          <div className="me">
            <b>{me.user.name}</b>
            <div className="muted">{roleLabel[me.user.role]}</div>
            <button className="link-btn small" onClick={logout} style={{ marginTop: 6 }}>
              Вийти
            </button>
          </div>
        </aside>
        <main className="admin-main">
          <ErrorBoundary resetKey={location.pathname} home="/admin">
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/new" element={<OrderNew />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="products" element={<Products />} />
              <Route path="products/new" element={<ProductEditor />} />
              <Route path="products/:id" element={<ProductEditor />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="purchases" element={<Purchases />} />
              <Route path="purchases/new" element={<PurchaseNew />} />
              <Route path="finance" element={<Finance />} />
              <Route path="reviews" element={<Reviews />} />
              <Route path="settings/*" element={<Settings />} />
              <Route path="*" element={<p className="muted">Такої сторінки немає.</p>} />
            </Routes>
          </ErrorBoundary>
        </main>
        <nav className="admin-tabs" aria-label="Розділи">
          {items.slice(0, 4).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <Icon name={n.icon} size={22} />
              {n.label}
              {badge(n)}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)}>
            <Icon name="menu" size={22} />
            Ще
          </button>
        </nav>
        {more && (
          <Sheet title="Розділи" onClose={() => setMore(false)}>
            <div className="list">
              {items.slice(4).map((n) => (
                <Link key={n.to} to={n.to} className="list-row">
                  <Icon name={n.icon} />
                  <span className="grow">{n.label}</span>
                  {badge(n)}
                </Link>
              ))}
              <a className="list-row" href="/" target="_blank" rel="noreferrer">
                <Icon name="external" />
                <span className="grow">Відкрити магазин</span>
              </a>
              <button className="list-row" style={{ border: 0, background: 'none', borderTop: '1px solid var(--line)', textAlign: 'left', cursor: 'pointer' }} onClick={logout}>
                <Icon name="logout" />
                <span className="grow">Вийти ({me.user.name})</span>
              </button>
            </div>
          </Sheet>
        )}
      </div>
    </CountsContext.Provider>
  )
}

export const roleLabel = { owner: 'Власниця', manager: 'Менеджер', dev: 'Розробник' }

export function Top({ title, back, children }: { title: string; back?: string; children?: ReactNode }) {
  return (
    <div className="admin-top">
      {back && (
        <Link to={back} className="icon-btn" aria-label="Назад">
          <Icon name="left" />
        </Link>
      )}
      <h1>{title}</h1>
      {children}
    </div>
  )
}

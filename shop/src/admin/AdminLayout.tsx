import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { useShop } from '../lib/store'
import './admin.css'

// Phones get the first four plus "Ще" in a bottom bar; a wide screen gets
// everything in a sidebar.
const MAIN: [string, string, IconName][] = [
  ['/admin', 'Огляд', 'dashboard'],
  ['/admin/products', 'Товари', 'box'],
  ['/admin/lives', 'Ефіри', 'live'],
  ['/admin/orders', 'Замовлення', 'orders'],
]

const EXTRA: [string, string, IconName][] = [
  ['/admin/customers', 'Клієнти', 'users'],
  ['/admin/batches', 'Закупівлі', 'layers'],
  ['/admin/settings', 'Налаштування', 'settings'],
]

// Added to a home screen from here, the icon should open the admin, not the
// catalog, and be named for it.
function useAdminInstall() {
  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const title = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    const was = [manifest?.getAttribute('href'), title?.content] as const
    manifest?.setAttribute('href', './admin.webmanifest')
    if (title) title.content = 'DaMark адмін'
    return () => {
      if (manifest && was[0]) manifest.setAttribute('href', was[0])
      if (title && was[1]) title.content = was[1]
    }
  }, [])
}

export function AdminLayout() {
  const { settings } = useShop()
  useAdminInstall()

  return (
    <div className="admin">
      <nav className="side" aria-label="Адмін-панель">
        <div className="side-brand">
          <span className="brand-dot" aria-hidden="true">Da</span>
          {settings.shopName} · адмінка
        </div>
        {MAIN.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === '/admin'}>
            <Icon name={icon} />
            {label}
          </NavLink>
        ))}
        {EXTRA.map(([to, label, icon]) => (
          <NavLink key={to} to={to} className="side-extra">
            <Icon name={icon} />
            {label}
          </NavLink>
        ))}
        <NavLink to="/admin/more" className="more-tab">
          <Icon name="menu" />
          Ще
        </NavLink>
        <div className="side-foot side-extra">
          <NavLink to="/">
            <Icon name="store" />
            Відкрити сайт
          </NavLink>
        </div>
      </nav>

      <main className="admin-main">
        <div className="admin-inner">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export function MorePage() {
  return (
    <>
      <h1>Ще</h1>
      <div className="card card-flush">
        <ul className="list">
          {[...EXTRA, ['/', 'Відкрити сайт', 'store'] as [string, string, IconName]].map(([to, label, icon]) => (
            <li key={to}>
              <NavLink to={to} className="list-row">
                <Icon name={icon} size={20} />
                <span className="grow">{label}</span>
                <Icon name="chevron" size={18} />
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

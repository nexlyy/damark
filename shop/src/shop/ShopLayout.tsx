import { Link, Outlet } from 'react-router-dom'
import { Icon, TelegramIcon } from '../components/Icon'
import { useShop } from '../lib/store'
import { telegramLink, viberLink } from '../lib/format'
import './shop.css'

export function ShopLayout() {
  const { settings } = useShop()

  return (
    <div className="shop">
      <div className="demo-banner">
        Демо-шаблон: товари та замовлення зберігаються лише в цьому браузері ·{' '}
        <Link to="/admin">Адмін-панель →</Link>
      </div>

      <header className="shop-header">
        <div className="shop-wrap">
          <Link to="/" className="brand-mark">
            <span className="brand-dot" aria-hidden="true">Da</span>
            {settings.shopName}
          </Link>
          <span className="grow" />
          <a className="btn btn-telegram btn-sm" href={telegramLink(settings.managerTelegram)}>
            <TelegramIcon />
            Замовити
          </a>
        </div>
      </header>

      <Outlet />

      <footer className="shop-footer">
        <div className="shop-wrap">
          <div className="safe-note">
            <Icon name="alert" />
            <span>
              Замовлення приймає тільки <b>@{settings.managerTelegram}</b> у Telegram і Viber{' '}
              <b>{settings.viberPhone}</b>. Ми ніколи не пишемо першими. Оплата — тільки на рахунок{' '}
              <b>{settings.fopName}</b>.
            </span>
          </div>
          <div className="row-wrap">
            <a href={telegramLink(settings.managerTelegram)}>Telegram менеджера</a>·
            <a href={viberLink(settings.viberPhone)}>Viber</a>·
            <a href={telegramLink(settings.stockGroup)}>Група наявності</a>
          </div>
          <span>© {settings.shopName}</span>
        </div>
      </footer>
    </div>
  )
}

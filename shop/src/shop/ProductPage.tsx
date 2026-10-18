import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon, TelegramIcon } from '../components/Icon'
import { Empty, Photo, ProductBadge, useToast } from '../components/ui'
import { useShop } from '../lib/store'
import { telegramLink, uah, viberLink } from '../lib/format'
import { CONDITION_LABEL } from '../lib/types'
import { CheckoutSheet } from './Checkout'

export function ProductPage() {
  const { id } = useParams()
  const { products, settings } = useShop()
  const product = products.find((p) => p.id === id && p.status !== 'draft')
  const [shown, setShown] = useState(0)
  const [toast, say] = useToast()
  const [checkout, setCheckout] = useState(false)

  if (!product) {
    return (
      <main className="shop-wrap" style={{ padding: '32px 16px' }}>
        <Empty icon="box" title="Цього товару вже немає" action={<Link className="btn" to="/">До каталогу</Link>}>
          Можливо, його вже продали. Нові речі — на ефірах і в групі наявності.
        </Empty>
      </main>
    )
  }

  const copyCode = () => {
    navigator.clipboard?.writeText(product.code).then(
      () => say('Код скопійовано — надішліть його менеджеру'),
      () => say('Код товару: ' + product.code),
    )
  }

  return (
    <main className="shop-wrap">
      <Link to="/" className="row muted" style={{ marginTop: 16, textDecoration: 'none', width: 'fit-content' }}>
        <Icon name="back" size={18} />
        Каталог
      </Link>

      <div className="pdp">
        <div className="gallery">
          <div className="gallery-main">
            <Photo src={product.photos[shown]} alt={product.title} />
          </div>
          {product.photos.length > 1 && (
            <div className="gallery-thumbs">
              {product.photos.map((src, i) => (
                <button key={i} type="button" aria-pressed={i === shown} aria-label={`Фото ${i + 1}`} onClick={() => setShown(i)}>
                  <Photo src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pdp-info">
          <div className="stack" style={{ gap: 6 }}>
            <div className="row-wrap">
              <span className="faint">{product.brand}</span>
              {product.status === 'reserved' && <ProductBadge status="reserved" />}
            </div>
            <h1>{product.title}</h1>
            <div className="pdp-price">
              {uah(product.price)}
              {product.oldPrice ? <s>{uah(product.oldPrice)}</s> : null}
            </div>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <h3>Розмір</h3>
            <div className="row-wrap">
              {product.sizes.map((s) => (
                <span key={s.size} className="chip size-chip">
                  {s.size}
                </span>
              ))}
            </div>
          </div>

          <dl className="facts">
            <div>
              <dt>Стан</dt>
              <dd>{CONDITION_LABEL[product.condition]}</dd>
            </div>
            <div>
              <dt>Категорія</dt>
              <dd>{product.category}</dd>
            </div>
            {product.measurements && (
              <div>
                <dt>Заміри</dt>
                <dd style={{ whiteSpace: 'pre-line' }}>{product.measurements}</dd>
              </div>
            )}
            <div>
              <dt>Код товару</dt>
              <dd className="num">{product.code}</dd>
            </div>
          </dl>

          {product.description && <p style={{ whiteSpace: 'pre-line' }}>{product.description}</p>}

          <div className="order-box">
            <b>Як замовити</b>
            {product.status === 'available' ? (
              <>
                <span className="muted">
                  Оформіть тут або напишіть менеджеру код <span className="code">{product.code}</span>.
                </span>
                <button className="btn btn-block" type="button" onClick={() => setCheckout(true)}>
                  <Icon name="check" />
                  Оформити замовлення
                </button>
              </>
            ) : (
              <span className="muted">
                Цю річ уже забронювали. Напишіть менеджеру код <span className="code">{product.code}</span> — якщо бронь
                не оплатять, вона повернеться в продаж.
              </span>
            )}
            <a className="btn btn-telegram btn-block" href={telegramLink(settings.managerTelegram)}>
              <TelegramIcon />
              Написати в Telegram
            </a>
            <div className="grid-2">
              <a className="btn btn-ghost" href={viberLink(settings.viberPhone)}>
                Viber
              </a>
              <button className="btn btn-ghost" type="button" onClick={copyCode}>
                <Icon name="copy" />
                Код
              </button>
            </div>
          </div>

          <div className="safe-note">
            <Icon name="alert" />
            <span>
              Оплата — тільки на рахунок <b>{settings.fopName}</b>. Якщо вам надіслали інші реквізити — це шахраї.
            </span>
          </div>
        </div>
      </div>
      {checkout && <CheckoutSheet product={product} settings={settings} onClose={() => setCheckout(false)} />}
      {toast}
    </main>
  )
}

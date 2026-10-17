import { useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { Badge, useToast } from '../components/ui'
import { demoData } from '../lib/demo'
import { clearAll, replaceAll, saveSettings, useShop } from '../lib/store'
import type { ShopSettings } from '../lib/types'

// What a production version would connect, so the owner sees the plan.
const INTEGRATIONS: [IconName, string, string][] = [
  ['orders', 'Telegram-бот замовлень', 'Покупець пише боту, бот створює замовлення, дає реквізити ФОП і збирає дані для доставки. Сповіщення вам — миттєво.'],
  ['truck', 'Нова пошта', 'ТТН однією кнопкою, статус посилки сам оновлює замовлення, відмови потрапляють у дашборд.'],
  ['check', 'Банк (monobank / ПриватБанк)', 'Оплата на рахунок ФОП сама позначає замовлення оплаченим за сумою та номером у призначенні.'],
  ['live', 'TikTok-ефір', 'Читати коментарі «беру №7» з ефіру і пропонувати бронь. Неофіційний спосіб — може зламатися.'],
]

export function Settings() {
  const data = useShop()
  const [s, setS] = useState<ShopSettings>(data.settings)
  const [toast, say] = useToast()

  const field = (key: keyof ShopSettings, label: string, hint?: string, type = 'text') => (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        type={type}
        value={String(s[key])}
        onChange={(e) => setS({ ...s, [key]: type === 'number' ? Number(e.target.value) : e.target.value })}
      />
      {hint && <small>{hint}</small>}
    </label>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Налаштування</h1>
          <p className="muted">Контакти й реквізити підставляються на сайт і в повідомлення клієнтам.</p>
        </div>
      </div>

      <section className="card form-section">
        <h2>Магазин і контакти</h2>
        {field('shopName', 'Назва магазину')}
        <div className="grid-2">
          {field('managerTelegram', 'Telegram менеджера', 'Без @')}
          {field('viberPhone', 'Viber', '+380…', 'tel')}
        </div>
        {field('stockGroup', 'Група наявності в Telegram', 'Ім’я з посилання t.me/…')}
      </section>

      <section className="card form-section">
        <h2>Оплата</h2>
        {field('fopName', 'Отримувач (ФОП)')}
        {field('iban', 'IBAN', 'Підставляється в повідомлення з реквізитами')}
        {field('reserveHours', 'Скільки годин тримати бронь', 'Після цього замовлення підсвічується в «Потребує уваги»', 'number')}
        <button
          className="btn"
          type="button"
          style={{ justifySelf: 'start' }}
          onClick={() => {
            saveSettings({ ...s, blacklist: data.settings.blacklist })
            say('Збережено')
          }}
        >
          <Icon name="check" />
          Зберегти
        </button>
      </section>

      <section className="card form-section">
        <h2>Підключення</h2>
        <p className="faint">У шаблоні це план. Кожне підключення — окремий етап робочої версії.</p>
        <ul className="list stack" style={{ gap: 14 }}>
          {INTEGRATIONS.map(([icon, title, text]) => (
            <li key={title} className="integr" style={{ borderTop: 0 }}>
              <span className="integr-icon">
                <Icon name={icon} />
              </span>
              <div className="grow">
                <div className="spread">
                  <b>{title}</b>
                  <Badge tone="neutral">Згодом</Badge>
                </div>
                <p className="faint">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card form-section">
        <h2>Демо-дані</h2>
        <p className="faint">Шаблон зберігає все лише в цьому браузері. Приклад — вигадані товари й замовлення, щоб показати дашборд.</p>
        <div className="row-wrap">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              if (data.products.length && !confirm('Замінити все, що є, на приклад?')) return
              replaceAll(demoData(data.settings))
              say('Приклад завантажено')
            }}
          >
            Заповнити прикладом
          </button>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              if (confirm('Видалити всі товари, замовлення, ефіри й закупівлі?')) {
                clearAll()
                say('Очищено')
              }
            }}
          >
            Очистити все
          </button>
        </div>
      </section>
      {toast}
    </>
  )
}

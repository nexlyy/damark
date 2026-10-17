import { useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { Badge, useToast } from '../components/ui'
import { demoData } from '../lib/demo'
import { clearAll, replaceAll, saveSettings, useShop } from '../lib/store'
import { copyText } from '../lib/messages'
import type { NovaPoshtaSettings, ShopSettings } from '../lib/types'
import { InstallCard } from './InstallCard'

// What a production version would connect, so the owner sees the plan. Nova
// Poshta already works here in demo form: the waybill button on a paid order.
const INTEGRATIONS: [IconName, string, string, 'demo' | 'later'][] = [
  ['truck', 'Нова пошта', 'ТТН однією кнопкою на оплаченому замовленні або одразу для всіх оплачених. Далі — статус посилки сам оновлює замовлення, відмови потрапляють у дашборд.', 'demo'],
  ['orders', 'Telegram-бот замовлень', 'Покупець пише боту, бот створює замовлення, дає реквізити ФОП і збирає дані для доставки. Сповіщення вам — миттєво.', 'later'],
  ['check', 'Банк (monobank / ПриватБанк)', 'Оплата на рахунок ФОП сама позначає замовлення оплаченим за сумою та номером у призначенні.', 'later'],
  ['live', 'TikTok-ефір', 'Читати коментарі «беру №7» з ефіру і пропонувати бронь. Неофіційний спосіб — може зламатися.', 'later'],
]

export function Settings() {
  const data = useShop()
  const [s, setS] = useState<ShopSettings>(data.settings)
  const [toast, say] = useToast()

  const field = (key: Exclude<keyof ShopSettings, 'novaPoshta' | 'blacklist'>, label: string, hint?: string, type = 'text') => (
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

  const np = (key: keyof NovaPoshtaSettings, label: string, hint?: string, type = 'text') => (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        type={type}
        autoComplete="off"
        value={s.novaPoshta[key]}
        onChange={(e) => setS({ ...s, novaPoshta: { ...s.novaPoshta, [key]: e.target.value } })}
      />
      {hint && <small>{hint}</small>}
    </label>
  )

  const demoLink = (route: string) => location.origin + location.pathname + '#' + route + '?demo=1'

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
      </section>

      <section className="card form-section">
        <div className="spread">
          <h2>Нова пошта</h2>
          <Badge tone="warning">Демо</Badge>
        </div>
        <p className="faint">
          Звідки й від кого їдуть посилки. У демо ТТН отримує умовний номер. У робочій версії ключ API з бізнес-кабінету
          Нової пошти зберігається на сервері, а кнопка створює справжню накладну.
        </p>
        <div className="grid-2">
          {np('senderName', 'Відправник (ПІБ або ФОП)')}
          {np('senderPhone', 'Телефон відправника', undefined, 'tel')}
        </div>
        <div className="grid-2">
          {np('senderCity', 'Місто відправки')}
          {np('senderBranch', 'Відділення відправки')}
        </div>
        {np('apiKey', 'Ключ API Нової пошти', 'Кабінет Нової пошти → Налаштування → Безпека → Ключ API. У демо нікуди не надсилається.', 'password')}
      </section>

      <div className="sticky-actions">
        <button
          className="btn grow"
          type="button"
          onClick={() => {
            saveSettings({ ...s, blacklist: data.settings.blacklist })
            say('Збережено')
          }}
        >
          <Icon name="check" />
          Зберегти налаштування
        </button>
      </div>

      <InstallCard />

      <section className="card form-section">
        <h2>Підключення</h2>
        <p className="faint">Кожне підключення — окремий етап робочої версії.</p>
        <ul className="list stack" style={{ gap: 14 }}>
          {INTEGRATIONS.map(([icon, title, text, state]) => (
            <li key={title} className="integr" style={{ borderTop: 0 }}>
              <span className="integr-icon">
                <Icon name={icon} />
              </span>
              <div className="grow">
                <div className="spread">
                  <b>{title}</b>
                  {state === 'demo' ? <Badge tone="warning">Є в демо</Badge> : <Badge tone="neutral">Згодом</Badge>}
                </div>
                <p className="faint">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card form-section">
        <h2>Посилання з прикладом</h2>
        <p className="faint">Відкриваються одразу з вигаданими товарами й замовленнями — зручно надіслати, щоб показати.</p>
        <div className="row-wrap">
          <button className="btn btn-ghost" type="button" onClick={async () => say((await copyText(demoLink('/admin'))) ? 'Посилання на адмінку скопійовано' : demoLink('/admin'))}>
            <Icon name="copy" />
            Адмінка з прикладом
          </button>
          <button className="btn btn-ghost" type="button" onClick={async () => say((await copyText(demoLink('/'))) ? 'Посилання на каталог скопійовано' : demoLink('/'))}>
            <Icon name="copy" />
            Каталог з прикладом
          </button>
        </div>
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

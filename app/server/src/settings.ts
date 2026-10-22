import type { DB } from './db.js'

// Shop settings, edited in the admin. Stored one key per group as JSON;
// anything missing falls back to these defaults, so a new field needs no
// migration.

export const defaults = {
  shop: {
    name: 'DaMark shop',
    managerTelegram: 'Anastasiya_DaMark',
    viberPhone: '+380671770035',
    stockGroup: 'anna_DaMark',
    instagram: 'damarkshop',
    deliveryNote: 'Доставка Новою поштою — 1–3 дні.',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One size'],
    colors: ['Чорний', 'Білий', 'Бежевий', 'Сірий', 'Блакитний', 'Рожевий'],
  },
  payment: {
    recipient: 'ФОП Маловік Євгенія Володимирівна',
    iban: 'UA073220010000026000350010013',
    taxId: '3110406220',
    bankCode: '21133352',
    purpose: 'Оплата за товар, замовлення №{number}',
  },
  orders: {
    reserveHours: 24,
  },
  novaPoshta: {
    apiKey: '',
    senderRef: '',
    contactRef: '',
    senderPhone: '',
    senderCityRef: '',
    senderCityName: '',
    senderWarehouseRef: '',
    senderWarehouseName: '',
    description: 'Одяг',
    weightKg: 0.5,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 5,
  },
  telegram: {
    botToken: '',
    botUsername: '',
    teamChatId: 0,
    teamChatTitle: '',
    bindCode: '',
    updateOffset: 0,
  },
  analytics: {
    umamiWebsiteId: '',
  },
}

export type Settings = typeof defaults
export type SettingsGroup = keyof Settings

// Never sent to the browser in full; the admin shows whether they are set.
export const secretFields: Partial<Record<SettingsGroup, string[]>> = {
  novaPoshta: ['apiKey'],
  telegram: ['botToken', 'bindCode', 'updateOffset'],
}

export function getSettings<K extends SettingsGroup>(db: DB, group: K): Settings[K] {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(group) as { value: string } | undefined
  const stored = row ? (JSON.parse(row.value) as Partial<Settings[K]>) : {}
  return { ...defaults[group], ...stored }
}

export function saveSettings<K extends SettingsGroup>(db: DB, group: K, patch: Partial<Settings[K]>): Settings[K] {
  const next = { ...getSettings(db, group), ...patch }
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .run(group, JSON.stringify(next))
  return next
}

// The public part buyers need: contacts and requisites.
export function publicSettings(db: DB) {
  const shop = getSettings(db, 'shop')
  const payment = getSettings(db, 'payment')
  const telegram = getSettings(db, 'telegram')
  const analytics = getSettings(db, 'analytics')
  return {
    shop,
    payment,
    reserveHours: getSettings(db, 'orders').reserveHours,
    botUsername: telegram.botToken ? telegram.botUsername : '',
    umamiWebsiteId: analytics.umamiWebsiteId,
  }
}

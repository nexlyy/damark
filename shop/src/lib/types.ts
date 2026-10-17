// The shop's data model. supabase/schema.sql describes the same shape as
// database tables; keep the two in step.

export const CATEGORIES = ['Взуття', 'Одяг', 'Білизна', 'Купальники', 'Сумки', 'Аксесуари'] as const
export type Category = (typeof CATEGORIES)[number]

export type Condition = 'new' | 'new_flaw' | 'used'
export const CONDITION_LABEL: Record<Condition, string> = {
  new: 'Новий',
  new_flaw: 'Новий, з нюансом',
  used: 'Був у використанні',
}

// draft: only in the admin. available: on the site. reserved: someone took it
// on a live or in chat and has not paid. sold: paid for.
export type ProductStatus = 'draft' | 'available' | 'reserved' | 'sold'
export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  draft: 'Чернетка',
  available: 'В наявності',
  reserved: 'Заброньовано',
  sold: 'Продано',
}

export interface SizeStock {
  size: string
  qty: number
}

export interface Product {
  id: string
  code: string            // DM-0001: what a buyer quotes to the manager
  title: string
  brand: string
  category: Category
  sizes: SizeStock[]
  measurements: string    // free text: insole length, waist, length…
  condition: Condition
  description: string
  price: number           // UAH
  oldPrice?: number
  cost: number            // what it was bought for; never shown on the site
  batchId?: string
  photos: string[]        // "idb:…" refs in the demo (lib/photos.ts); storage URLs in production
  status: ProductStatus
  createdAt: string
}

export type OrderStatus =
  | 'new'
  | 'awaiting_payment'
  | 'paid'
  | 'shipped'
  | 'done'
  | 'refused'
  | 'cancelled'

export const ORDER_FLOW: OrderStatus[] = ['new', 'awaiting_payment', 'paid', 'shipped', 'done']

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'Нове',
  awaiting_payment: 'Очікує оплату',
  paid: 'Оплачено',
  shipped: 'Відправлено',
  done: 'Отримано',
  refused: 'Відмова від посилки',
  cancelled: 'Скасовано',
}

export interface OrderItem {
  productId: string
  title: string
  size: string
  price: number
  cost: number
}

// Where the order came from: the buyer's own form on the site, a lot booked
// during a live, or typed in by the manager from a chat.
export type OrderSource = 'site' | 'live' | 'manual'
export const ORDER_SOURCE_LABEL: Record<OrderSource, string> = {
  site: 'З сайту',
  live: 'З ефіру',
  manual: 'Вручну',
}

export interface Order {
  id: string
  number: number
  createdAt: string
  status: OrderStatus
  source?: OrderSource
  customer: {
    name: string
    phone: string
    telegram: string
  }
  items: OrderItem[]
  delivery: {
    city: string
    branch: string        // Nova Poshta branch or parcel locker
  }
  ttn: string             // Nova Poshta waybill number
  ttnDemo?: boolean       // made up by the demo, not issued by Nova Poshta
  liveId?: string
  note: string
  paidAt?: string
  shippedAt?: string
}

export type LiveStatus = 'planned' | 'live' | 'done'
export const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
  planned: 'Заплановано',
  live: 'Йде зараз',
  done: 'Завершено',
}

export interface Live {
  id: string
  title: string
  date: string            // ISO date and time it starts
  status: LiveStatus
  lots: string[]          // product ids; a lot's number is its place here + 1
}

export interface Batch {
  id: string
  title: string           // "Стоковий мішок, Італія, взуття"
  date: string
  cost: number
  note: string
}

export interface ShopSettings {
  shopName: string
  managerTelegram: string // without @
  viberPhone: string      // +380…
  fopName: string
  iban: string            // goes into the payment message template
  stockGroup: string      // t.me username of the read-only stock group
  reserveHours: number    // how long a reservation waits for payment
  blacklist: string[]     // phones or @usernames that refused parcels
  novaPoshta: NovaPoshtaSettings
}

// What creating a waybill needs on the sender's side. In production the API
// key lives on the server; the demo only keeps it to show where it goes.
export interface NovaPoshtaSettings {
  apiKey: string
  senderName: string
  senderPhone: string
  senderCity: string
  senderBranch: string
}

export interface ShopData {
  products: Product[]
  orders: Order[]
  lives: Live[]
  batches: Batch[]
  settings: ShopSettings
}

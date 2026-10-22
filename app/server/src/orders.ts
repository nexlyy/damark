import { EventEmitter } from 'node:events'
import type { DB } from './db.js'
import { mediaUrl } from './media.js'
import { getSettings } from './settings.js'
import { addHours, fail, normalizePhone, randomToken, round2, sqlTime } from './util.js'

export type OrderStatus = 'new' | 'paid' | 'shipped' | 'arrived' | 'received' | 'cancelled' | 'refused' | 'returned'

export const statusLabels: Record<OrderStatus, string> = {
  new: 'Очікує оплату',
  paid: 'Оплачено',
  shipped: 'Відправлено',
  arrived: 'У відділенні',
  received: 'Отримано',
  cancelled: 'Скасовано',
  refused: 'Відмова / повернення',
  returned: 'Повернено',
}

// Orders announce what happened; the Telegram bot listens. Keeps this file
// free of messaging and lets tests run without it.
export const orderEvents = new EventEmitter<{
  created: [orderId: number]
  status: [orderId: number, status: OrderStatus]
  shipped: [orderId: number]
}>()

export type OrderRow = {
  id: number
  number: number
  token: string
  customer_id: number
  status: OrderStatus
  source: 'site' | 'admin'
  name: string
  phone: string
  telegram: string
  city_name: string
  city_ref: string
  warehouse_name: string
  warehouse_ref: string
  warehouse_kind: 'branch' | 'postomat'
  discount: number
  total: number
  refund: number
  buyer_note: string
  note: string
  manager_id: number | null
  exchange_of: number | null
  reserved_until: string | null
  reserve_alerted: number
  paid_at: string | null
  shipped_at: string | null
  closed_at: string | null
  ttn: string
  ttn_ref: string
  np_status: string
  np_status_code: number | null
  np_checked_at: string | null
  tg_chat_id: number | null
  team_message_id: number | null
  created_at: string
  updated_at: string
}

export type ItemRow = {
  id: number
  order_id: number
  product_id: number | null
  variant_id: number | null
  title: string
  size: string
  color: string
  image: string
  price: number
  cost: number | null
  qty: number
  returned_qty: number
}

export type OrderInput = {
  items: Array<{ variantId: number; qty: number }>
  name: string
  phone: string
  telegram: string
  cityName: string
  cityRef: string
  warehouseName: string
  warehouseRef: string
  warehouseKind: 'branch' | 'postomat'
  note: string
}

export function getOrder(db: DB, id: number): OrderRow {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined
  if (!row) return fail(404, 'Замовлення не знайдено.')
  return row
}

export function orderItems(db: DB, orderId: number): ItemRow[] {
  return db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(orderId) as ItemRow[]
}

export function logEvent(db: DB, orderId: number, userId: number | null, text: string) {
  db.prepare('INSERT INTO order_events (order_id, user_id, text) VALUES (?, ?, ?)').run(orderId, userId, text)
  db.prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").run(orderId)
}

function upsertCustomer(db: DB, name: string, phone: string, telegram: string): { id: number; blacklisted: number } {
  const found = db.prepare('SELECT id, blacklisted FROM customers WHERE phone = ?').get(phone) as { id: number; blacklisted: number } | undefined
  if (found) {
    db.prepare("UPDATE customers SET name = ?, telegram = CASE WHEN ? != '' THEN ? ELSE telegram END WHERE id = ?").run(name, telegram, telegram, found.id)
    return found
  }
  const id = Number(db.prepare('INSERT INTO customers (name, phone, telegram) VALUES (?, ?, ?)').run(name, phone, telegram).lastInsertRowid)
  return { id, blacklisted: 0 }
}

function cleanTelegram(value: string): string {
  const v = value.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '')
  return /^[A-Za-z0-9_]{3,32}$/.test(v) ? v : ''
}

// Buyers and staff both place orders through here. Stock is taken at once;
// cancelling gives it back.
export function createOrder(
  db: DB,
  input: OrderInput,
  opts: { source: 'site' | 'admin'; userId?: number | null; discount?: number; exchangeOf?: number | null } = { source: 'site' },
): OrderRow {
  const phone = normalizePhone(input.phone)
  if (!/^\+\d{10,15}$/.test(phone)) fail(400, 'Перевірте номер телефону.')
  if (!input.items.length) fail(400, 'Кошик порожній.')
  if (input.items.length > 30) fail(400, 'Забагато позицій в одному замовленні.')

  const reserveHours = getSettings(db, 'orders').reserveHours

  const id = db.transaction(() => {
    const lines: Array<Omit<ItemRow, 'id' | 'order_id' | 'returned_qty'>> = []
    const merged = new Map<number, number>()
    for (const item of input.items) merged.set(item.variantId, (merged.get(item.variantId) ?? 0) + item.qty)
    for (const [variantId, qty] of merged) {
      const v = db
        .prepare(
          `SELECT v.id, v.size, v.color, v.stock, v.cost, p.id product_id, p.title, p.price, p.status,
            (SELECT file FROM media m WHERE m.product_id = p.id ORDER BY sort, id LIMIT 1) file
           FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`,
        )
        .get(variantId) as
        | { id: number; size: string; color: string; stock: number; cost: number | null; product_id: number; title: string; price: number; status: string; file: string | null }
        | undefined
      if (!v || (opts.source === 'site' && v.status !== 'active')) fail(409, 'Одного з товарів уже немає в продажу. Оновіть кошик.')
      const label = [v!.title, v!.size, v!.color].filter(Boolean).join(', ')
      if (v!.stock < qty) fail(409, v!.stock ? `«${label}»: залишилось лише ${v!.stock} шт.` : `«${label}» щойно розібрали.`)
      lines.push({
        product_id: v!.product_id,
        variant_id: v!.id,
        title: v!.title,
        size: v!.size,
        color: v!.color,
        image: v!.file ? mediaUrl(v!.file, 's') : '',
        price: v!.price,
        cost: v!.cost,
        qty,
      })
    }

    const customer = upsertCustomer(db, input.name.trim(), phone, cleanTelegram(input.telegram))
    const sum = lines.reduce((s, l) => s + l.price * l.qty, 0)
    const discount = Math.min(Math.max(opts.discount ?? 0, 0), sum)
    const number = ((db.prepare('SELECT MAX(number) n FROM orders').get() as { n: number | null }).n ?? 1000) + 1
    const orderId = Number(
      db
        .prepare(
          `INSERT INTO orders (number, token, customer_id, status, source, name, phone, telegram, city_name, city_ref, warehouse_name,
            warehouse_ref, warehouse_kind, discount, total, buyer_note, manager_id, exchange_of, reserved_until)
           VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          number, randomToken(18), customer.id, opts.source, input.name.trim(), phone, cleanTelegram(input.telegram),
          input.cityName.trim(), input.cityRef, input.warehouseName.trim(), input.warehouseRef, input.warehouseKind,
          discount, sum - discount, input.note.trim(), opts.source === 'admin' ? (opts.userId ?? null) : null,
          opts.exchangeOf ?? null, sqlTime(addHours(reserveHours)),
        ).lastInsertRowid,
    )
    for (const l of lines) {
      db.prepare(
        'INSERT INTO order_items (order_id, product_id, variant_id, title, size, color, image, price, cost, qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(orderId, l.product_id, l.variant_id, l.title, l.size, l.color, l.image, l.price, l.cost, l.qty)
      db.prepare('UPDATE variants SET stock = stock - ? WHERE id = ?').run(l.qty, l.variant_id)
    }
    const exchange = opts.exchangeOf ? ` (обмін до №${(db.prepare('SELECT number FROM orders WHERE id = ?').get(opts.exchangeOf) as { number: number } | undefined)?.number ?? '?'})` : ''
    logEvent(db, orderId, opts.userId ?? null, (opts.source === 'site' ? 'Оформлено на сайті' : 'Створено в адмінці') + exchange)
    if (customer.blacklisted) logEvent(db, orderId, null, 'Увага: клієнт у чорному списку')
    return orderId
  })()

  orderEvents.emit('created', id)
  return getOrder(db, id)
}

function restock(db: DB, orderId: number, quantities?: Map<number, number>) {
  for (const item of orderItems(db, orderId)) {
    const left = item.qty - item.returned_qty
    const back = quantities ? Math.min(quantities.get(item.id) ?? 0, left) : left
    if (back <= 0) continue
    if (item.variant_id) db.prepare('UPDATE variants SET stock = stock + ? WHERE id = ?').run(back, item.variant_id)
    db.prepare('UPDATE order_items SET returned_qty = returned_qty + ? WHERE id = ?').run(back, item.id)
  }
}

const allowed: Record<OrderStatus, OrderStatus[]> = {
  new: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled', 'new'],
  shipped: ['arrived', 'received', 'refused', 'paid'],
  arrived: ['received', 'refused', 'shipped'],
  received: ['returned'],
  cancelled: [],
  refused: ['returned'],
  returned: [],
}

export function canMove(from: OrderStatus, to: OrderStatus) {
  return allowed[from].includes(to)
}

// Status changes made by staff (or by the tracking job, with userId null).
export function setStatus(db: DB, orderId: number, to: OrderStatus, userId: number | null, extra: { note?: string } = {}) {
  db.transaction(() => {
    const order = getOrder(db, orderId)
    if (order.status === to) return
    if (!canMove(order.status, to)) fail(409, `Не можна змінити «${statusLabels[order.status]}» на «${statusLabels[to]}».`)
    const now = sqlTime()
    switch (to) {
      case 'paid':
        db.prepare('UPDATE orders SET status = ?, paid_at = COALESCE(paid_at, ?), reserved_until = NULL WHERE id = ?').run(to, now, orderId)
        break
      case 'cancelled':
        restock(db, orderId)
        // Money for a paid order goes back to the buyer.
        db.prepare('UPDATE orders SET status = ?, closed_at = ?, refund = CASE WHEN paid_at IS NOT NULL THEN total ELSE 0 END, reserved_until = NULL WHERE id = ?').run(to, now, orderId)
        break
      case 'received':
        db.prepare('UPDATE orders SET status = ?, closed_at = ? WHERE id = ?').run(to, now, orderId)
        break
      case 'returned':
        // The whole parcel came back (refused) or everything was returned.
        restock(db, orderId)
        db.prepare('UPDATE orders SET status = ?, closed_at = ?, refund = CASE WHEN paid_at IS NOT NULL THEN total ELSE 0 END WHERE id = ?').run(to, now, orderId)
        break
      case 'new':
        db.prepare('UPDATE orders SET status = ?, paid_at = NULL WHERE id = ?').run(to, orderId)
        break
      default:
        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(to, orderId)
    }
    logEvent(db, orderId, userId, `Статус: ${statusLabels[to]}${extra.note ? ` — ${extra.note}` : ''}`)
  })()
  orderEvents.emit('status', orderId, to)
}

// Part of a received order comes back: those pieces return to stock and
// the refund is recorded. Everything back means the order is "returned".
export function returnItems(db: DB, orderId: number, userId: number | null, items: Array<{ itemId: number; qty: number }>, refund: number) {
  db.transaction(() => {
    const order = getOrder(db, orderId)
    if (order.status !== 'received') fail(409, 'Повернення оформлюється для отриманого замовлення.')
    const own = new Map(orderItems(db, orderId).map((i) => [i.id, i]))
    const map = new Map<number, number>()
    for (const it of items) {
      const line = own.get(it.itemId)
      if (!line) fail(400, 'Позиція не з цього замовлення.')
      if (it.qty > line!.qty - line!.returned_qty) fail(400, `«${line!.title}»: стільки не продавали.`)
      if (it.qty > 0) map.set(it.itemId, it.qty)
    }
    if (!map.size && refund <= 0) fail(400, 'Оберіть, що повертається.')
    if (order.refund + refund > order.total) fail(400, 'Сума повернення більша за суму замовлення.')
    restock(db, orderId, map)
    db.prepare('UPDATE orders SET refund = refund + ? WHERE id = ?').run(refund, orderId)
    const left = orderItems(db, orderId).some((i) => i.qty > i.returned_qty)
    const what = [...map].map(([id, qty]) => `${own.get(id)!.title} ${[own.get(id)!.size, own.get(id)!.color].filter(Boolean).join('/')} × ${qty}`).join(', ')
    logEvent(db, orderId, userId, `Повернення: ${what || 'без речей'}${refund ? `, повернуто ${refund} грн` : ''}`)
    if (!left) {
      db.prepare("UPDATE orders SET status = 'returned' WHERE id = ?").run(orderId)
      logEvent(db, orderId, userId, `Статус: ${statusLabels.returned}`)
    }
  })()
}

export function setTtn(db: DB, orderId: number, userId: number | null, ttn: string, ttnRef = '') {
  const clean = ttn.replace(/\s/g, '')
  if (!/^\d{14}$/.test(clean)) fail(400, 'ТТН Нової пошти — 14 цифр.')
  db.transaction(() => {
    const order = getOrder(db, orderId)
    if (!['paid', 'shipped'].includes(order.status)) fail(409, 'ТТН додається до оплаченого замовлення.')
    db.prepare("UPDATE orders SET ttn = ?, ttn_ref = ?, status = 'shipped', shipped_at = COALESCE(shipped_at, ?), np_status = '', np_status_code = NULL WHERE id = ?").run(
      clean, ttnRef, sqlTime(), orderId,
    )
    logEvent(db, orderId, userId, `ТТН ${clean}`)
  })()
  orderEvents.emit('shipped', orderId)
  orderEvents.emit('status', orderId, 'shipped')
}

export function extendReserve(db: DB, orderId: number, userId: number) {
  const order = getOrder(db, orderId)
  if (order.status !== 'new') fail(409, 'Бронь є лише в замовлення, що чекає оплату.')
  const hours = getSettings(db, 'orders').reserveHours
  const until = sqlTime(addHours(hours))
  db.prepare('UPDATE orders SET reserved_until = ?, reserve_alerted = 0 WHERE id = ?').run(until, orderId)
  logEvent(db, orderId, userId, `Бронь продовжено на ${hours} год`)
}

export function overdueReservations(db: DB) {
  return db
    .prepare("SELECT id FROM orders WHERE status = 'new' AND reserved_until IS NOT NULL AND reserved_until < datetime('now') AND reserve_alerted = 0")
    .all() as Array<{ id: number }>
}

// What the buyer's order page shows.
export function publicOrder(db: DB, token: string) {
  const o = db.prepare('SELECT * FROM orders WHERE token = ?').get(token) as OrderRow | undefined
  if (!o) return null
  const payment = getSettings(db, 'payment')
  return {
    number: o.number,
    status: o.status,
    statusLabel: statusLabels[o.status],
    createdAt: o.created_at,
    reservedUntil: o.status === 'new' ? o.reserved_until : null,
    name: o.name,
    phone: o.phone,
    city: o.city_name,
    warehouse: o.warehouse_name,
    total: o.total,
    discount: o.discount,
    ttn: o.ttn,
    npStatus: o.np_status,
    telegramLinked: !!o.tg_chat_id,
    items: orderItems(db, o.id).map((i) => ({ title: i.title, size: i.size, color: i.color, image: i.image, price: i.price, qty: i.qty })),
    payment: o.status === 'new' ? { ...payment, purpose: payment.purpose.replace('{number}', String(o.number)), amount: o.total } : null,
  }
}

export function orderCost(items: ItemRow[]) {
  return round2(items.reduce((s, i) => s + (i.cost ?? 0) * (i.qty - i.returned_qty), 0))
}

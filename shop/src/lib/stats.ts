import { hoursSince } from './format'
import type { Order, OrderStatus, ShopData } from './types'

const EARNED: OrderStatus[] = ['paid', 'shipped', 'done']
const DAY = 864e5

export function orderTotal(order: Order): number {
  return order.items.reduce((sum, i) => sum + i.price, 0)
}

export function orderCost(order: Order): number {
  return order.items.reduce((sum, i) => sum + i.cost, 0)
}

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export interface DayRevenue {
  day: string    // ISO date of the day's start
  revenue: number
  orders: number
}

// Money counts on the day it was paid, not the day the order was taken.
export function revenueByDay(data: ShopData, days: number, now = Date.now()): DayRevenue[] {
  const first = startOfDay(now) - (days - 1) * DAY
  const out: DayRevenue[] = Array.from({ length: days }, (_, i) => ({
    day: new Date(first + i * DAY).toISOString(),
    revenue: 0,
    orders: 0,
  }))
  for (const o of data.orders) {
    if (!EARNED.includes(o.status) || !o.paidAt) continue
    const index = Math.floor((startOfDay(new Date(o.paidAt).getTime()) - first) / DAY)
    if (index < 0 || index >= days) continue
    out[index].revenue += orderTotal(o)
    out[index].orders += 1
  }
  return out
}

export interface Summary {
  revenue: number
  profit: number
  paidOrders: number
  previousRevenue: number
  awaitingPayment: number
  toShip: number
  inStock: number
  reserved: number
}

export function summary(data: ShopData, days: number, now = Date.now()): Summary {
  const from = startOfDay(now) - (days - 1) * DAY
  const prevFrom = from - days * DAY
  let revenue = 0
  let profit = 0
  let paidOrders = 0
  let previousRevenue = 0
  for (const o of data.orders) {
    if (!EARNED.includes(o.status) || !o.paidAt) continue
    const t = new Date(o.paidAt).getTime()
    if (t >= from) {
      revenue += orderTotal(o)
      profit += orderTotal(o) - orderCost(o)
      paidOrders += 1
    } else if (t >= prevFrom) {
      previousRevenue += orderTotal(o)
    }
  }
  return {
    revenue,
    profit,
    paidOrders,
    previousRevenue,
    awaitingPayment: data.orders.filter((o) => o.status === 'new' || o.status === 'awaiting_payment').length,
    toShip: data.orders.filter((o) => o.status === 'paid').length,
    inStock: data.products.filter((p) => p.status === 'available').length,
    reserved: data.products.filter((p) => p.status === 'reserved').length,
  }
}

export type AttentionKind = 'overdue' | 'ship' | 'refused' | 'blacklist'

export interface Attention {
  kind: AttentionKind
  order: Order
  text: string
}

// What needs a hand today, worst first.
export function needsAttention(data: ShopData, now = Date.now()): Attention[] {
  const out: Attention[] = []
  const black = new Set(data.settings.blacklist)
  for (const o of data.orders) {
    const contacts = [o.customer.phone, o.customer.telegram].filter(Boolean)
    if ((o.status === 'new' || o.status === 'awaiting_payment') && contacts.some((c) => black.has(c))) {
      out.push({ kind: 'blacklist', order: o, text: 'Клієнт у чорному списку' })
    }
    if ((o.status === 'new' || o.status === 'awaiting_payment') && hoursSince(o.createdAt, now) > data.settings.reserveHours) {
      out.push({ kind: 'overdue', order: o, text: `Не оплачено понад ${data.settings.reserveHours} год — зняти бронь?` })
    }
    if (o.status === 'paid') {
      out.push({ kind: 'ship', order: o, text: 'Оплачено — треба відправити' })
    }
    if (o.status === 'refused' && hoursSince(o.createdAt, now) < 14 * 24) {
      out.push({ kind: 'refused', order: o, text: 'Відмова від посилки — додати в чорний список?' })
    }
  }
  const rank: Record<AttentionKind, number> = { blacklist: 0, overdue: 1, ship: 2, refused: 3 }
  return out.sort((a, b) => rank[a.kind] - rank[b.kind])
}

export interface BatchResult {
  sold: number
  total: number
  revenue: number
  profit: number   // revenue minus what the whole batch cost
}

export function batchResult(data: ShopData, batchId: string): BatchResult {
  const batch = data.batches.find((b) => b.id === batchId)
  const items = data.products.filter((p) => p.batchId === batchId)
  const ids = new Set(items.map((p) => p.id))
  let revenue = 0
  for (const o of data.orders) {
    if (!EARNED.includes(o.status)) continue
    for (const i of o.items) if (ids.has(i.productId)) revenue += i.price
  }
  return {
    sold: items.filter((p) => p.status === 'sold').length,
    total: items.length,
    revenue,
    profit: revenue - (batch?.cost ?? 0),
  }
}

export interface Customer {
  key: string
  name: string
  phone: string
  telegram: string
  orders: number
  spent: number
  refused: number
  last: string
}

export function customers(data: ShopData): Customer[] {
  const map = new Map<string, Customer>()
  for (const o of data.orders) {
    const key = o.customer.phone || o.customer.telegram || o.customer.name
    if (!key) continue
    const c = map.get(key) ?? {
      key,
      name: o.customer.name,
      phone: o.customer.phone,
      telegram: o.customer.telegram,
      orders: 0,
      spent: 0,
      refused: 0,
      last: o.createdAt,
    }
    c.orders += 1
    if (EARNED.includes(o.status)) c.spent += orderTotal(o)
    if (o.status === 'refused') c.refused += 1
    if (o.createdAt > c.last) c.last = o.createdAt
    map.set(key, c)
  }
  return [...map.values()].sort((a, b) => b.spent - a.spent)
}

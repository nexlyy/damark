import { useSyncExternalStore } from 'react'
import { clearPhotos, deletePhotos } from './photos'
import type { Batch, Live, Order, OrderStatus, Product, ShopData, ShopSettings } from './types'

// The demo keeps everything in this browser's localStorage. A production
// version swaps this file for one that talks to a database (see
// supabase/schema.sql); the screens only use the functions exported here.

const KEY = 'damark-shop-demo-v1'

export const DEFAULT_SETTINGS: ShopSettings = {
  shopName: 'DaMark',
  managerTelegram: 'Anna_Kriukovets',
  viberPhone: '+380671770035',
  fopName: 'ФОП Крюковець Ганна Володимирівна',
  iban: '',
  stockGroup: 'DaMrkshop',
  reserveHours: 24,
  blacklist: [],
  novaPoshta: { apiKey: '', senderName: '', senderPhone: '', senderCity: '', senderBranch: '' },
}

const EMPTY: ShopData = {
  products: [],
  orders: [],
  lives: [],
  batches: [],
  settings: DEFAULT_SETTINGS,
}

function load(): ShopData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<ShopData>
    return {
      ...EMPTY,
      ...parsed,
      settings: {
        ...DEFAULT_SETTINGS,
        ...parsed.settings,
        novaPoshta: { ...DEFAULT_SETTINGS.novaPoshta, ...parsed.settings?.novaPoshta },
      },
    }
  } catch {
    return EMPTY
  }
}

let data: ShopData = load()
const listeners = new Set<() => void>()

export class StorageFullError extends Error {}

function commit(next: ShopData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch (error) {
    if (error instanceof DOMException && /quota/i.test(error.name + error.message)) {
      throw new StorageFullError(
        'Демо-сховище браузера заповнене. У робочій версії дані зберігаються на сервері.',
      )
    }
    // Private mode or blocked storage: keep working for this visit.
  }
  data = next
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      data = load()
      fn()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

export function useShop(): ShopData {
  return useSyncExternalStore(subscribe, () => data, () => data)
}

export function snapshot(): ShopData {
  return data
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// Products

export function nextProductCode(products = data.products): string {
  const top = products.reduce((max, p) => Math.max(max, Number(p.code.replace(/\D/g, '')) || 0), 0)
  return 'DM-' + String(top + 1).padStart(4, '0')
}

export function saveProduct(product: Product) {
  const before = data.products.find((p) => p.id === product.id)
  if (before) deletePhotos(before.photos.filter((ref) => !product.photos.includes(ref)))
  const exists = Boolean(before)
  const products = exists
    ? data.products.map((p) => (p.id === product.id ? product : p))
    : [product, ...data.products]
  commit({ ...data, products })
}

export function deleteProduct(id: string) {
  deletePhotos(data.products.find((p) => p.id === id)?.photos ?? [])
  commit({
    ...data,
    products: data.products.filter((p) => p.id !== id),
    lives: data.lives.map((l) => ({ ...l, lots: l.lots.filter((lot) => lot !== id) })),
  })
}

// Orders

const HOLDS: OrderStatus[] = ['new', 'awaiting_payment']
const SELLS: OrderStatus[] = ['paid', 'shipped', 'done']

// A product that appears in an order takes its status from the orders: held
// while someone has not paid, sold once they have, and back on sale when every
// order for it fell through. Products no order mentions keep what was set by hand.
function withProductStatuses(next: ShopData): ShopData {
  const state = new Map<string, 'held' | 'sold' | 'free'>()
  for (const order of next.orders) {
    for (const item of order.items) {
      const was = state.get(item.productId) ?? 'free'
      if (SELLS.includes(order.status)) state.set(item.productId, 'sold')
      else if (HOLDS.includes(order.status) && was !== 'sold') state.set(item.productId, 'held')
      else if (!state.has(item.productId)) state.set(item.productId, 'free')
    }
  }
  return {
    ...next,
    products: next.products.map((p) => {
      const s = state.get(p.id)
      if (!s || p.status === 'draft') return p
      const status = s === 'sold' ? 'sold' : s === 'held' ? 'reserved' : 'available'
      return status === p.status ? p : { ...p, status }
    }),
  }
}

export function nextOrderNumber(orders = data.orders): number {
  return orders.reduce((max, o) => Math.max(max, o.number), 1000) + 1
}

export function saveOrder(order: Order) {
  const exists = data.orders.some((o) => o.id === order.id)
  const orders = exists
    ? data.orders.map((o) => (o.id === order.id ? order : o))
    : [order, ...data.orders]
  commit(withProductStatuses({ ...data, orders }))
}

export function setOrderStatus(id: string, status: OrderStatus) {
  const now = new Date().toISOString()
  const orders = data.orders.map((o) => {
    if (o.id !== id) return o
    const next: Order = { ...o, status }
    if (status === 'paid' && !o.paidAt) next.paidAt = now
    if (status === 'shipped' && !o.shippedAt) next.shippedAt = now
    return next
  })
  commit(withProductStatuses({ ...data, orders }))
}

export function deleteOrder(id: string) {
  commit(withProductStatuses({ ...data, orders: data.orders.filter((o) => o.id !== id) }))
}

// Lives

export function saveLive(live: Live) {
  const exists = data.lives.some((l) => l.id === live.id)
  const lives = exists ? data.lives.map((l) => (l.id === live.id ? live : l)) : [live, ...data.lives]
  commit({ ...data, lives })
}

export function deleteLive(id: string) {
  commit({ ...data, lives: data.lives.filter((l) => l.id !== id) })
}

// Purchases

export function saveBatch(batch: Batch) {
  const exists = data.batches.some((b) => b.id === batch.id)
  const batches = exists
    ? data.batches.map((b) => (b.id === batch.id ? batch : b))
    : [batch, ...data.batches]
  commit({ ...data, batches })
}

export function deleteBatch(id: string) {
  commit({
    ...data,
    batches: data.batches.filter((b) => b.id !== id),
    products: data.products.map((p) => (p.batchId === id ? { ...p, batchId: undefined } : p)),
  })
}

// Settings and the whole store

export function saveSettings(settings: ShopSettings) {
  commit({ ...data, settings })
}

export function toggleBlacklist(contact: string) {
  const list = data.settings.blacklist
  const blacklist = list.includes(contact) ? list.filter((c) => c !== contact) : [...list, contact]
  commit({ ...data, settings: { ...data.settings, blacklist } })
}

export function replaceAll(next: ShopData) {
  clearPhotos()
  commit(withProductStatuses(next))
}

export function clearAll() {
  clearPhotos()
  commit({ ...EMPTY, settings: data.settings })
}

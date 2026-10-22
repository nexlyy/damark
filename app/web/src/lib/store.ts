import { useSyncExternalStore } from 'react'

// Cart, favourites and the last delivery details live in this browser only.
// Storage can be missing (private mode, blocked site data): the shop then
// still works for the visit, it just forgets afterwards.

function persisted<T>(key: string, initial: T) {
  let value: T = initial
  try {
    const raw = localStorage.getItem(key)
    if (raw) value = JSON.parse(raw) as T
  } catch {
    /* no storage */
  }
  const listeners = new Set<() => void>()
  const store = {
    get: () => value,
    set(next: T | ((prev: T) => T)) {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* no storage */
      }
      listeners.forEach((l) => l())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    use: () => useSyncExternalStore(store.subscribe, store.get, store.get),
  }
  // Another tab changed it.
  window.addEventListener('storage', (e) => {
    if (e.key !== key || !e.newValue) return
    try {
      value = JSON.parse(e.newValue) as T
      listeners.forEach((l) => l())
    } catch {
      /* ignore */
    }
  })
  return store
}

export type CartItem = {
  variantId: number
  productId: number
  slug: string
  title: string
  size: string
  color: string
  price: number
  image: string | null
  qty: number
  stock?: number
}

export const cart = persisted<CartItem[]>('dm-cart', [])
export const favorites = persisted<number[]>('dm-favorites', [])

export type Delivery = {
  lastName: string
  firstName: string
  phone: string
  telegram: string
  city: { ref: string; name: string } | null
  warehouse: { ref: string; name: string; kind: 'branch' | 'postomat' } | null
}

export const delivery = persisted<Delivery>('dm-delivery', { lastName: '', firstName: '', phone: '', telegram: '', city: null, warehouse: null })

// The last orders placed from this browser, to find them again.
export const myOrders = persisted<Array<{ token: string; number: number; at: string }>>('dm-orders', [])

export function addToCart(item: CartItem) {
  cart.set((list) => {
    const found = list.find((i) => i.variantId === item.variantId)
    if (found) return list.map((i) => (i.variantId === item.variantId ? { ...i, qty: Math.min(i.qty + item.qty, item.stock ?? 10, 10) } : i))
    return [...list, item]
  })
}

export function toggleFavorite(id: number) {
  favorites.set((list) => (list.includes(id) ? list.filter((x) => x !== id) : [id, ...list].slice(0, 200)))
}

export const cartCount = (list: CartItem[]) => list.reduce((s, i) => s + i.qty, 0)
export const cartTotal = (list: CartItem[]) => list.reduce((s, i) => s + i.qty * i.price, 0)

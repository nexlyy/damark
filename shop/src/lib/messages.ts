import { uah } from './format'
import { orderTotal } from './stats'
import type { Live, Order, Product, ShopSettings } from './types'

// Ready-to-paste texts, so the manager copies instead of typing the same
// thing forty times an evening.

export function paymentMessage(order: Order, s: ShopSettings): string {
  const lines = order.items.map((i) => `• ${i.title}${i.size ? `, р. ${i.size}` : ''} — ${uah(i.price)}`)
  return [
    `Замовлення №${order.number}`,
    ...lines,
    `Разом: ${uah(orderTotal(order))}`,
    '',
    `Оплата тільки на рахунок ${s.fopName}`,
    s.iban ? `IBAN: ${s.iban}` : 'IBAN: (додайте в Налаштуваннях)',
    `У призначенні платежу вкажіть №${order.number}.`,
    '',
    `Бронь тримаємо ${s.reserveHours} год. Після оплати надішліть, будь ласка, квитанцію та дані для Нової пошти: ПІБ, телефон, місто, відділення.`,
  ].join('\n')
}

export function shippedMessage(order: Order): string {
  return [
    `Ваше замовлення №${order.number} відправлено 🚚`,
    `ТТН Нової пошти: ${order.ttn || '—'}`,
    'Дякуємо, що ви з нами 💙',
  ].join('\n')
}

export function lotsMessage(live: Live, products: Product[]): string {
  const byId = new Map(products.map((p) => [p.id, p]))
  const lines = live.lots.map((id, i) => {
    const p = byId.get(id)
    if (!p) return `№${i + 1} —`
    const mark = p.status === 'sold' ? ' ❌ продано' : p.status === 'reserved' ? ' ⏳ бронь' : ''
    const size = p.sizes.map((s) => s.size).join('/')
    return `№${i + 1} ${p.title}${size ? `, р. ${size}` : ''} — ${uah(p.price)}${mark}`
  })
  return [live.title, '', ...lines].join('\n')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

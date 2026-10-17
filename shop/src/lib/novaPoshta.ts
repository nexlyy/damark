import type { NovaPoshtaSettings, Order, Product } from './types'

// Creating a Nova Poshta waybill (ТТН) for an order.
//
// In the demo nothing leaves the browser: the number is made up and the order
// is marked as such. In production this function calls the shop's own server,
// which holds the API key from the Nova Poshta business account and calls
// InternetDocument.save there. A key must never ship inside a public page.

export interface WaybillDraft {
  recipientName: string
  recipientPhone: string
  city: string
  branch: string
  weightKg: number
  declaredValue: number
  payer: 'Recipient' | 'Sender'      // who pays for the delivery
  description: string
  cashOnDelivery: number              // 0 when the order is paid in advance
}

export interface Waybill {
  ttn: string
  demo: boolean
}

const WEIGHT: Record<string, number> = { Взуття: 1.5, Сумки: 1, Одяг: 0.7 }

export function draftFor(order: Order, products: Product[]): WaybillDraft {
  const byId = new Map(products.map((p) => [p.id, p]))
  const categories = order.items.map((i) => byId.get(i.productId)?.category ?? '')
  const weight = categories.reduce((sum, c) => sum + (WEIGHT[c] ?? 0.5), 0)
  return {
    recipientName: order.customer.name.replace(/\s*\(демо\)$/, ''),
    recipientPhone: order.customer.phone,
    city: order.delivery.city,
    branch: order.delivery.branch,
    weightKg: Math.round(Math.max(weight, 0.5) * 10) / 10,
    declaredValue: order.items.reduce((s, i) => s + i.price, 0),
    payer: 'Recipient',
    description: categories.includes('Взуття') ? 'Взуття' : 'Одяг',
    cashOnDelivery: 0,
  }
}

// What is missing before Nova Poshta would accept the draft.
export function missing(draft: WaybillDraft): string[] {
  const out: string[] = []
  if (!draft.recipientName.trim()) out.push('ПІБ отримувача')
  if (draft.recipientPhone.replace(/\D/g, '').length < 10) out.push('телефон')
  if (!draft.city.trim()) out.push('місто')
  if (!draft.branch.trim()) out.push('відділення')
  if (!(draft.weightKg > 0)) out.push('вага')
  return out
}

function demoNumber(): string {
  // Nova Poshta numbers are 14 digits; parcels sent by businesses usually
  // begin with 2045 or 5900.
  let digits = '20450'
  for (let i = 0; i < 9; i++) digits += Math.floor(Math.random() * 10)
  return digits
}

export async function createWaybill(draft: WaybillDraft, sender: NovaPoshtaSettings): Promise<Waybill> {
  const gaps = missing(draft)
  if (gaps.length) throw new Error('Не вистачає: ' + gaps.join(', '))
  void sender // production: sent to the server together with the draft
  await new Promise((r) => setTimeout(r, 700))
  return { ttn: demoNumber(), demo: true }
}

export function trackingLink(ttn: string): string {
  return 'https://novaposhta.ua/tracking/?cargo_number=' + encodeURIComponent(ttn)
}

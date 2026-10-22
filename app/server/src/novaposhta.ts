import type { DB } from './db.js'
import { config } from './config.js'
import { getSettings } from './settings.js'
import { fail } from './util.js'

// Nova Poshta JSON API 2.0: every call is a POST of
// { apiKey, modelName, calledMethod, methodProperties }.

type NpResponse<T> = { success: boolean; data: T[]; errors: string[]; warnings: string[] }

export async function npCall<T = Record<string, unknown>>(db: DB, modelName: string, calledMethod: string, methodProperties: object, needKey = true): Promise<T[]> {
  const { apiKey } = getSettings(db, 'novaPoshta')
  if (needKey && !apiKey) fail(400, 'Додайте ключ API Нової пошти в налаштуваннях.')
  let res: Response
  try {
    res = await fetch(config.novaPoshtaApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return fail(502, 'Нова пошта не відповідає. Спробуйте за хвилину.')
  }
  if (!res.ok) fail(502, `Нова пошта відповіла помилкою ${res.status}.`)
  const body = (await res.json()) as NpResponse<T>
  if (!body.success) fail(400, `Нова пошта: ${(body.errors ?? []).join('; ') || 'невідома помилка'}`)
  return body.data ?? []
}

function cached<T>(db: DB, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const row = db.prepare('SELECT value FROM np_cache WHERE key = ? AND expires_at > ?').get(key, Date.now()) as { value: string } | undefined
  if (row) return Promise.resolve(JSON.parse(row.value) as T)
  return load().then((value) => {
    db.prepare('INSERT INTO np_cache (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at').run(
      key, JSON.stringify(value), Date.now() + ttlMs,
    )
    return value
  })
}

export function clearExpiredCache(db: DB) {
  db.prepare('DELETE FROM np_cache WHERE expires_at < ?').run(Date.now())
}

export type City = { ref: string; name: string; area: string; region: string; kind: string }

export function searchCities(db: DB, query: string): Promise<City[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return Promise.resolve([])
  return cached(db, `city:${q}`, 86_400_000, async () => {
    type Found = { TotalCount: number; Addresses: Array<{ DeliveryCity: string; MainDescription: string; Area: string; Region: string; SettlementTypeCode: string; Warehouses: number }> }
    const data = await npCall<Found>(db, 'Address', 'searchSettlements', { CityName: q, Limit: '20', Page: '1' }, false)
    return (data[0]?.Addresses ?? [])
      .filter((a) => a.DeliveryCity && a.Warehouses > 0)
      .map((a) => ({ ref: a.DeliveryCity, name: a.MainDescription, area: a.Area, region: a.Region, kind: a.SettlementTypeCode }))
  })
}

export type Warehouse = { ref: string; name: string; number: string; kind: 'branch' | 'postomat' }

export function searchWarehouses(db: DB, cityRef: string, query: string): Promise<Warehouse[]> {
  if (!/^[0-9a-f-]{36}$/i.test(cityRef)) return Promise.resolve([])
  const q = query.trim().toLowerCase()
  return cached(db, `wh:${cityRef}:${q}`, 86_400_000, async () => {
    type Found = { Ref: string; Description: string; Number: string; CategoryOfWarehouse: string; WarehouseStatus: string }
    const data = await npCall<Found>(db, 'AddressGeneral', 'getWarehouses', { CityRef: cityRef, FindByString: q, Limit: '60', Page: '1' }, false)
    return data
      .filter((w) => !w.WarehouseStatus || w.WarehouseStatus === 'Working')
      .map((w) => ({ ref: w.Ref, name: w.Description, number: w.Number, kind: w.CategoryOfWarehouse === 'Postomat' ? 'postomat' : 'branch' }) as Warehouse)
      .sort((a, b) => Number(a.number) - Number(b.number))
  })
}

// For the settings page: whose account the key belongs to and who sends.
export async function senders(db: DB) {
  const list = await npCall<{ Ref: string; Description: string }>(db, 'Counterparty', 'getCounterparties', { CounterpartyProperty: 'Sender', Page: '1' })
  const out = []
  for (const s of list.slice(0, 5)) {
    const contacts = await npCall<{ Ref: string; Description: string; Phones: string }>(db, 'Counterparty', 'getCounterpartyContactPersons', { Ref: s.Ref, Page: '1' })
    out.push({ ref: s.Ref, name: s.Description, contacts: contacts.map((c) => ({ ref: c.Ref, name: c.Description, phone: c.Phones })) })
  }
  return out
}

function npDate(d = new Date()) {
  const kyiv = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }))
  return `${String(kyiv.getDate()).padStart(2, '0')}.${String(kyiv.getMonth() + 1).padStart(2, '0')}.${kyiv.getFullYear()}`
}

// The order form asks surname and first name separately and stores them as
// "Surname First"; Nova Poshta wants them apart again.
export function splitName(full: string) {
  const [last = '', ...rest] = full.trim().split(/\s+/)
  return { lastName: last, firstName: rest.join(' ') || last }
}

export type TtnOrder = { name: string; phone: string; city_ref: string; warehouse_ref: string; warehouse_kind: string; total: number }

export async function createTtn(db: DB, order: TtnOrder) {
  const np = getSettings(db, 'novaPoshta')
  const missing = [
    !np.senderRef && 'відправника',
    !np.contactRef && 'контактну особу',
    !np.senderPhone && 'телефон відправника',
    !np.senderCityRef && 'місто відправки',
    !np.senderWarehouseRef && 'відділення відправки',
  ].filter(Boolean)
  if (missing.length) fail(400, `У налаштуваннях Нової пошти не вистачає: ${missing.join(', ')}.`)
  if (!order.city_ref || !order.warehouse_ref) fail(400, 'У замовленні немає міста або відділення з довідника Нової пошти. Оберіть їх заново.')

  const phone = order.phone.replace(/\D/g, '')
  const { lastName, firstName } = splitName(order.name)
  const [recipient] = await npCall<{ Ref: string; ContactPerson: { data: Array<{ Ref: string }> } }>(db, 'Counterparty', 'save', {
    FirstName: firstName,
    LastName: lastName,
    MiddleName: '',
    Phone: phone,
    Email: '',
    CounterpartyType: 'PrivatePerson',
    CounterpartyProperty: 'Recipient',
  })
  const contact = recipient?.ContactPerson?.data?.[0]?.Ref
  if (!recipient?.Ref || !contact) fail(502, 'Нова пошта не створила одержувача.')

  const [doc] = await npCall<{ Ref: string; IntDocNumber: string; CostOnSite: number; EstimatedDeliveryDate: string }>(db, 'InternetDocument', 'save', {
    PayerType: 'Recipient',
    PaymentMethod: 'Cash',
    DateTime: npDate(),
    CargoType: 'Parcel',
    Weight: String(np.weightKg),
    ServiceType: 'WarehouseWarehouse',
    SeatsAmount: '1',
    Description: np.description,
    Cost: String(Math.max(order.total, 1)),
    CitySender: np.senderCityRef,
    Sender: np.senderRef,
    SenderAddress: np.senderWarehouseRef,
    ContactSender: np.contactRef,
    SendersPhone: np.senderPhone.replace(/\D/g, ''),
    CityRecipient: order.city_ref,
    Recipient: recipient.Ref,
    RecipientAddress: order.warehouse_ref,
    ContactRecipient: contact,
    RecipientsPhone: phone,
    // Postomats need the box size; branches accept it too.
    OptionsSeat: [
      {
        volumetricWidth: String(np.widthCm),
        volumetricLength: String(np.lengthCm),
        volumetricHeight: String(np.heightCm),
        weight: String(np.weightKg),
      },
    ],
  })
  if (!doc?.IntDocNumber) fail(502, 'Нова пошта не повернула номер ТТН.')
  return { ttn: doc.IntDocNumber, ref: doc.Ref, cost: doc.CostOnSite, estimated: doc.EstimatedDeliveryDate }
}

// Tracking codes worth acting on; everything else is "on the way".
// https://developers.novaposhta.ua — TrackingDocument.getStatusDocuments
export function trackingOutcome(code: number): 'arrived' | 'received' | 'refused' | null {
  if ([7, 8].includes(code)) return 'arrived'
  if ([9, 10, 11, 106].includes(code)) return 'received'
  if ([102, 103, 105, 108].includes(code)) return 'refused'
  return null
}

export async function track(db: DB, docs: Array<{ ttn: string; phone: string }>) {
  const out: Array<{ ttn: string; code: number; status: string }> = []
  for (let i = 0; i < docs.length; i += 100) {
    const chunk = docs.slice(i, i + 100)
    const data = await npCall<{ Number: string; StatusCode: string; Status: string }>(db, 'TrackingDocument', 'getStatusDocuments', {
      Documents: chunk.map((d) => ({ DocumentNumber: d.ttn, Phone: d.phone.replace(/\D/g, '') })),
    })
    for (const d of data) out.push({ ttn: d.Number, code: Number(d.StatusCode), status: d.Status })
  }
  return out
}

import { DEFAULT_SETTINGS, newId } from './store'
import type { Batch, Category, Live, Order, OrderStatus, Product, ShopData, ShopSettings } from './types'

// Invented sample data, loaded only when someone presses "Заповнити прикладом"
// in Settings, so the dashboard can be shown with numbers in it. Nothing here
// is a real product, order or customer.

const DAY = 864e5

const ITEMS: [string, string, Category, string, number, number][] = [
  ['Ботфорти замшеві', 'Stock Italia', 'Взуття', '38', 2400, 900],
  ['Ботильйони зі стразами', 'Stock Italia', 'Взуття', '37', 2900, 1100],
  ['Кросівки шкіряні білі', 'Stock EU', 'Взуття', '39', 1800, 650],
  ['Лофери з пряжкою', 'Stock EU', 'Взуття', '38', 1500, 520],
  ['Сабо на платформі', 'Stock EU', 'Взуття', '40', 1300, 450],
  ['Чоботи з бахромою', 'Stock Italia', 'Взуття', '39', 2600, 980],
  ['Сукня-сорочка льон', 'Stock UK', 'Одяг', 'M', 1200, 380],
  ['Жакет оверсайз', 'Stock UK', 'Одяг', 'S', 1700, 600],
  ['Джинси прямі', 'Stock EU', 'Одяг', '28', 1100, 350],
  ['Светр кашеміровий', 'Stock Italia', 'Одяг', 'M', 2100, 800],
  ['Комплект мереживний', 'Stock EU', 'Білизна', '75B', 900, 260],
  ['Боді безшовне', 'Stock EU', 'Білизна', 'S', 650, 180],
  ['Купальник злитий', 'Stock EU', 'Купальники', 'M', 1250, 400],
  ['Бікіні в рубчик', 'Stock EU', 'Купальники', 'S', 1100, 340],
  ['Сумка-багет', 'Stock Italia', 'Сумки', 'One size', 1900, 700],
  ['Ремінь шкіряний', 'Stock EU', 'Аксесуари', '85', 600, 150],
]

const PEOPLE: [string, string][] = [
  ['Олена', '@client_olena'],
  ['Ірина', '@client_iryna'],
  ['Марія', '@client_mariia'],
  ['Наталія', '@client_natalia'],
  ['Тетяна', '@client_tetiana'],
  ['Катерина', '@client_kateryna'],
  ['Юлія', '@client_yuliia'],
  ['Світлана', '@client_svitlana'],
]

const CITIES = ['Дніпро', 'Київ', 'Львів', 'Одеса', 'Харків', 'Запоріжжя']

export function demoData(settings: ShopSettings = DEFAULT_SETTINGS, now = Date.now()): ShopData {
  const iso = (daysAgo: number, hour = 13) => {
    const d = new Date(now - daysAgo * DAY)
    d.setHours(hour, 15, 0, 0)
    return d.toISOString()
  }

  const batches: Batch[] = [
    { id: newId(), title: 'Стоковий мішок, Італія, взуття', date: iso(20), cost: 9000, note: 'Демо-закупівля' },
    { id: newId(), title: 'Стоковий мішок, Європа, мікс', date: iso(12), cost: 6500, note: 'Демо-закупівля' },
  ]

  const products: Product[] = ITEMS.map(([title, brand, category, size, price, cost], i) => ({
    id: newId(),
    code: 'DM-' + String(i + 1).padStart(4, '0'),
    title,
    brand,
    category,
    sizes: [{ size, qty: 1 }],
    measurements: category === 'Взуття' ? 'Устілка: 24,5 см' : category === 'Одяг' ? 'Довжина: 98 см' : '',
    condition: i % 5 === 3 ? 'new_flaw' : 'new',
    description: 'Демо-опис. Тут буде опис речі: матеріал, посадка, нюанси.',
    price,
    cost,
    batchId: brand === 'Stock Italia' ? batches[0].id : batches[1].id,
    photos: [],
    status: 'available',
    createdAt: iso(12 - (i % 10)),
  }))

  const lives: Live[] = [
    { id: newId(), title: 'Ефір: взуття з Італії', date: iso(6, 19), status: 'done', lots: products.slice(0, 8).map((p) => p.id) },
    { id: newId(), title: 'Ефір: купальники та білизна', date: iso(2, 19), status: 'done', lots: products.slice(8, 14).map((p) => p.id) },
    { id: newId(), title: 'Ефір: нові надходження', date: iso(-1, 19), status: 'planned', lots: products.slice(12).map((p) => p.id) },
  ]

  const plan: [number, OrderStatus, number][] = [
    // product index, status, days ago
    [0, 'done', 13], [1, 'done', 11], [2, 'shipped', 9], [3, 'done', 8],
    [4, 'refused', 7], [5, 'shipped', 6], [6, 'done', 5], [7, 'paid', 4],
    [8, 'shipped', 3], [9, 'paid', 2], [10, 'awaiting_payment', 2], [11, 'paid', 1],
    [12, 'new', 0], [13, 'awaiting_payment', 0],
  ]

  const orders: Order[] = plan.map(([index, status, daysAgo], n) => {
    const p = products[index]
    const [name, telegram] = PEOPLE[n % PEOPLE.length]
    const created = iso(daysAgo, 19 + (n % 3))
    const paid = ['paid', 'shipped', 'done'].includes(status) ? iso(daysAgo, 21) : undefined
    return {
      id: newId(),
      number: 1001 + n,
      createdAt: created,
      status,
      customer: { name: name + ' (демо)', phone: '+38000000000' + (n % 8), telegram },
      items: [{ productId: p.id, title: p.title, size: p.sizes[0].size, price: p.price, cost: p.cost }],
      delivery: { city: CITIES[n % CITIES.length], branch: 'Відділення №' + (n + 3) },
      ttn: status === 'shipped' || status === 'done' || status === 'refused' ? '2045000000' + String(1000 + n) : '',
      ttnDemo: status === 'shipped' || status === 'done' || status === 'refused' ? true : undefined,
      source: index < 14 ? 'live' : 'manual',
      liveId: index < 8 ? lives[0].id : lives[1].id,
      note: '',
      paidAt: paid,
      shippedAt: status === 'shipped' || status === 'done' ? iso(Math.max(0, daysAgo - 1), 12) : undefined,
    }
  })

  return { products, orders, lives, batches, settings }
}

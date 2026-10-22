// What the server sends, as the pages use it.

export type Photo = { id: number; s: string; m: string; l: string; width: number; height: number }

export type ProductCard = {
  id: number
  slug: string
  title: string
  brand: string | null
  price: number
  oldPrice: number | null
  isNew: boolean
  isHit: boolean
  inStock: boolean
  sizes: string[]
  image: Photo | null
  image2: Photo | null
}

export type ProductList = { items: ProductCard[]; total: number; page: number; pages: number }

export type SizeChart = { columns: string[]; rows: string[][] }

export type Review = { id: number; name: string; rating: number; text: string; reply: string; created_at: string; photos: Photo[]; product?: string | null; product_slug?: string | null }

export type Product = {
  id: number
  slug: string
  title: string
  description: string
  brand: { name: string; slug: string } | null
  category: { name: string; slug: string } | null
  price: number
  oldPrice: number | null
  composition: string
  care: string
  measurements: string
  sizeChart: SizeChart | null
  isNew: boolean
  isHit: boolean
  archived: boolean
  photos: Photo[]
  variants: Array<{ id: number; size: string; color: string; stock: number }>
  reviews: Review[]
}

export type Category = { id: number; name: string; slug: string; sort: number; active?: number }

export type ShopInfo = {
  shop: {
    name: string
    managerTelegram: string
    viberPhone: string
    stockGroup: string
    instagram: string
    deliveryNote: string
    sizes: string[]
    colors: string[]
  }
  payment: { recipient: string; iban: string; taxId: string; bankCode: string; purpose: string }
  reserveHours: number
  botUsername: string
  umamiWebsiteId: string
  categories: Category[]
  pages: Array<{ slug: string; title: string }>
}

export type OrderStatus = 'new' | 'paid' | 'shipped' | 'arrived' | 'received' | 'cancelled' | 'refused' | 'returned'

export type PublicOrder = {
  number: number
  status: OrderStatus
  statusLabel: string
  createdAt: string
  reservedUntil: string | null
  name: string
  phone: string
  city: string
  warehouse: string
  total: number
  discount: number
  ttn: string
  npStatus: string
  telegramLinked: boolean
  items: Array<{ title: string; size: string; color: string; image: string; price: number; qty: number }>
  payment: (ShopInfo['payment'] & { amount: number }) | null
}

export type City = { ref: string; name: string; area: string; region: string; kind: string }
export type Warehouse = { ref: string; name: string; number: string; kind: 'branch' | 'postomat' }

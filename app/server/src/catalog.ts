import type { DB } from './db.js'
import { mediaUrls, removeImageFiles } from './media.js'
import { fail, round2, searchText, slugify, sqlTime } from './util.js'

export type SizeChart = { columns: string[]; rows: string[][] }

type ProductRow = {
  id: number
  slug: string
  title: string
  description: string
  category_id: number | null
  brand_id: number | null
  price: number
  old_price: number | null
  composition: string
  care: string
  measurements: string
  size_chart: string | null
  status: 'draft' | 'active' | 'archived'
  is_new: number
  is_hit: number
  created_at: string
  updated_at: string
  published_at: string | null
}

type VariantRow = { id: number; product_id: number; size: string; color: string; sku: string; stock: number; cost: number | null; sort: number }
type MediaRow = { id: number; product_id: number; file: string; width: number; height: number; sort: number }

function photo(m: MediaRow) {
  return { id: m.id, ...mediaUrls(m.file), width: m.width, height: m.height }
}

// Sizes in the order the shop lists them in settings, others after, A–Z.
export function sizeOrder(order: string[]) {
  return (a: string, b: string) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    const na = Number.parseFloat(a)
    const nb = Number.parseFloat(b)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return a.localeCompare(b, 'uk')
  }
}

function mediaFor(db: DB, ids: number[]): Map<number, MediaRow[]> {
  const map = new Map<number, MediaRow[]>()
  if (!ids.length) return map
  const rows = db
    .prepare(`SELECT id, product_id, file, width, height, sort FROM media WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort, id`)
    .all(...ids) as MediaRow[]
  for (const r of rows) {
    const list = map.get(r.product_id) ?? []
    list.push(r)
    map.set(r.product_id, list)
  }
  return map
}

function variantsFor(db: DB, ids: number[]): Map<number, VariantRow[]> {
  const map = new Map<number, VariantRow[]>()
  if (!ids.length) return map
  const rows = db
    .prepare(`SELECT * FROM variants WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort, id`)
    .all(...ids) as VariantRow[]
  for (const r of rows) {
    const list = map.get(r.product_id) ?? []
    list.push(r)
    map.set(r.product_id, list)
  }
  return map
}

// ---------------------------------------------------------------- storefront

export type ListQuery = {
  q?: string
  category?: string
  brand?: string[]
  size?: string[]
  color?: string[]
  min?: number
  max?: number
  sale?: boolean
  isNew?: boolean
  hit?: boolean
  ids?: number[]
  sort?: 'new' | 'price_asc' | 'price_desc'
  page?: number
  limit?: number
}

export function listProducts(db: DB, query: ListQuery, sizeSort: string[]) {
  const where = ["p.status = 'active'"]
  const args: unknown[] = []
  if (query.q) {
    for (const word of searchText(query.q).split(' ').slice(0, 6)) {
      where.push('p.search LIKE ?')
      args.push(`%${word.replace(/[%_]/g, '')}%`)
    }
  }
  if (query.category) {
    where.push('p.category_id = (SELECT id FROM categories WHERE slug = ?)')
    args.push(query.category)
  }
  if (query.brand?.length) {
    where.push(`p.brand_id IN (SELECT id FROM brands WHERE slug IN (${query.brand.map(() => '?').join(',')}))`)
    args.push(...query.brand)
  }
  const variantTerms: string[] = []
  if (query.size?.length) {
    variantTerms.push(`v.size IN (${query.size.map(() => '?').join(',')})`)
    args.push(...query.size)
  }
  if (query.color?.length) {
    variantTerms.push(`v.color IN (${query.color.map(() => '?').join(',')})`)
    args.push(...query.color)
  }
  if (variantTerms.length) where.push(`EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.stock > 0 AND ${variantTerms.join(' AND ')})`)
  if (query.min !== undefined) {
    where.push('p.price >= ?')
    args.push(query.min)
  }
  if (query.max !== undefined) {
    where.push('p.price <= ?')
    args.push(query.max)
  }
  if (query.sale) where.push('p.old_price > p.price')
  if (query.isNew) where.push('p.is_new = 1')
  if (query.hit) where.push('p.is_hit = 1')
  if (query.ids) {
    if (!query.ids.length) return { items: [], total: 0, page: 1, pages: 0 }
    where.push(`p.id IN (${query.ids.map(() => '?').join(',')})`)
    args.push(...query.ids)
  }

  const inStock = 'EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.stock > 0)'
  const order =
    query.sort === 'price_asc' ? 'p.price ASC, p.id DESC' : query.sort === 'price_desc' ? 'p.price DESC, p.id DESC' : 'p.published_at DESC, p.id DESC'
  const limit = Math.min(Math.max(query.limit ?? 24, 1), 60)
  const page = Math.max(query.page ?? 1, 1)
  const whereSql = where.join(' AND ')

  const total = (db.prepare(`SELECT COUNT(*) n FROM products p WHERE ${whereSql}`).get(...args) as { n: number }).n
  // Sold-out items stay findable but go to the end.
  const rows = db
    .prepare(
      `SELECT p.*, b.name brand_name, ${inStock} in_stock FROM products p LEFT JOIN brands b ON b.id = p.brand_id
       WHERE ${whereSql} ORDER BY in_stock DESC, ${order} LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, (page - 1) * limit) as Array<ProductRow & { brand_name: string | null; in_stock: number }>

  const ids = rows.map((r) => r.id)
  const media = mediaFor(db, ids)
  const variants = variantsFor(db, ids)
  const bySize = sizeOrder(sizeSort)
  const items = rows.map((r) => {
    const vs = variants.get(r.id) ?? []
    const photos = media.get(r.id) ?? []
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      brand: r.brand_name,
      price: r.price,
      oldPrice: r.old_price && r.old_price > r.price ? r.old_price : null,
      isNew: !!r.is_new,
      isHit: !!r.is_hit,
      inStock: !!r.in_stock,
      sizes: [...new Set(vs.filter((v) => v.stock > 0 && v.size).map((v) => v.size))].sort(bySize),
      image: photos[0] ? photo(photos[0]) : null,
      image2: photos[1] ? photo(photos[1]) : null,
    }
  })
  return { items, total, page, pages: Math.ceil(total / limit) }
}

// What the filters can offer within a category (or the whole shop).
export function facets(db: DB, categorySlug: string | undefined, sizeSort: string[]) {
  const scope = categorySlug ? 'AND p.category_id = (SELECT id FROM categories WHERE slug = ?)' : ''
  const args = categorySlug ? [categorySlug] : []
  const sizes = db
    .prepare(`SELECT DISTINCT v.size FROM variants v JOIN products p ON p.id = v.product_id WHERE p.status = 'active' AND v.stock > 0 AND v.size != '' ${scope}`)
    .all(...args) as Array<{ size: string }>
  const colors = db
    .prepare(`SELECT DISTINCT v.color FROM variants v JOIN products p ON p.id = v.product_id WHERE p.status = 'active' AND v.stock > 0 AND v.color != '' ${scope} ORDER BY v.color`)
    .all(...args) as Array<{ color: string }>
  const brands = db
    .prepare(`SELECT DISTINCT b.name, b.slug FROM brands b JOIN products p ON p.brand_id = b.id WHERE p.status = 'active' ${scope} ORDER BY b.name`)
    .all(...args) as Array<{ name: string; slug: string }>
  const price = db.prepare(`SELECT MIN(p.price) min, MAX(p.price) max FROM products p WHERE p.status = 'active' ${scope}`).get(...args) as {
    min: number | null
    max: number | null
  }
  return {
    sizes: sizes.map((s) => s.size).sort(sizeOrder(sizeSort)),
    colors: colors.map((c) => c.color),
    brands,
    price,
  }
}

export function listCategories(db: DB, withCounts = false) {
  if (!withCounts) return db.prepare('SELECT id, name, slug, sort FROM categories ORDER BY sort, name').all()
  return db
    .prepare(
      `SELECT c.id, c.name, c.slug, c.sort,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') active
       FROM categories c ORDER BY c.sort, c.name`,
    )
    .all()
}

export function productBySlug(db: DB, slug: string, sizeSort: string[]) {
  const r = db
    .prepare(
      `SELECT p.*, b.name brand_name, b.slug brand_slug, c.name category_name, c.slug category_slug
       FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.slug = ? AND p.status != 'draft'`,
    )
    .get(slug) as (ProductRow & { brand_name: string | null; brand_slug: string | null; category_name: string | null; category_slug: string | null }) | undefined
  if (!r) return null
  const vs = variantsFor(db, [r.id]).get(r.id) ?? []
  const photos = mediaFor(db, [r.id]).get(r.id) ?? []
  const bySize = sizeOrder(sizeSort)
  const reviews = db
    .prepare("SELECT id, name, rating, text, reply, created_at FROM reviews WHERE product_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 20")
    .all(r.id) as Array<{ id: number; name: string; rating: number; text: string; reply: string; created_at: string }>
  const reviewPhotos = reviewMedia(db, reviews.map((x) => x.id))
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    brand: r.brand_name ? { name: r.brand_name, slug: r.brand_slug } : null,
    category: r.category_name ? { name: r.category_name, slug: r.category_slug } : null,
    price: r.price,
    oldPrice: r.old_price && r.old_price > r.price ? r.old_price : null,
    composition: r.composition,
    care: r.care,
    measurements: r.measurements,
    sizeChart: r.size_chart ? (JSON.parse(r.size_chart) as SizeChart) : null,
    isNew: !!r.is_new,
    isHit: !!r.is_hit,
    archived: r.status === 'archived',
    photos: photos.map(photo),
    variants: vs
      .filter(() => r.status === 'active')
      .sort((a, b) => bySize(a.size, b.size) || a.sort - b.sort)
      .map((v) => ({ id: v.id, size: v.size, color: v.color, stock: v.stock })),
    reviews: reviews.map((x) => ({ ...x, photos: reviewPhotos.get(x.id) ?? [] })),
  }
}

export function reviewMedia(db: DB, reviewIds: number[]) {
  const map = new Map<number, ReturnType<typeof photo>[]>()
  if (!reviewIds.length) return map
  const rows = db
    .prepare(`SELECT id, review_id product_id, file, width, height, sort FROM media WHERE review_id IN (${reviewIds.map(() => '?').join(',')}) ORDER BY sort, id`)
    .all(...reviewIds) as MediaRow[]
  for (const m of rows) {
    const list = map.get(m.product_id) ?? []
    list.push(photo(m))
    map.set(m.product_id, list)
  }
  return map
}

// --------------------------------------------------------------------- admin

export function adminProductList(db: DB, q: { q?: string; status?: string; category?: number; lowStock?: boolean }) {
  const where: string[] = ['1 = 1']
  const args: unknown[] = []
  if (q.q) {
    for (const word of searchText(q.q).split(' ').slice(0, 6)) {
      where.push('p.search LIKE ?')
      args.push(`%${word.replace(/[%_]/g, '')}%`)
    }
  }
  if (q.status) {
    where.push('p.status = ?')
    args.push(q.status)
  } else {
    where.push("p.status != 'archived'")
  }
  if (q.category) {
    where.push('p.category_id = ?')
    args.push(q.category)
  }
  if (q.lowStock) where.push("p.status = 'active' AND (SELECT COALESCE(SUM(stock), 0) FROM variants v WHERE v.product_id = p.id) <= 1")
  const rows = db
    .prepare(
      `SELECT p.id, p.slug, p.title, p.price, p.old_price, p.status, p.is_new, p.is_hit, p.updated_at, c.name category, b.name brand,
        (SELECT COALESCE(SUM(stock), 0) FROM variants v WHERE v.product_id = p.id) stock,
        (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id AND v.stock = 0) sold_out_variants
       FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
       WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC, p.id DESC LIMIT 500`,
    )
    .all(...args) as Array<{ id: number } & Record<string, unknown>>
  const media = mediaFor(db, rows.map((r) => r.id))
  return rows.map((r) => {
    const first = media.get(r.id)?.[0]
    return { ...r, image: first ? mediaUrls(first.file).s : null }
  })
}

export function adminProduct(db: DB, id: number, showCost: boolean) {
  const r = db
    .prepare('SELECT p.*, b.name brand FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE p.id = ?')
    .get(id) as (ProductRow & { brand: string | null }) | undefined
  if (!r) return fail(404, 'Товар не знайдено.')
  const vs = variantsFor(db, [id]).get(id) ?? []
  const photos = mediaFor(db, [id]).get(id) ?? []
  const sold = db
    .prepare(
      `SELECT COALESCE(SUM(i.qty - i.returned_qty), 0) n FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE i.product_id = ? AND o.status NOT IN ('cancelled')`,
    )
    .get(id) as { n: number }
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    categoryId: r.category_id,
    brand: r.brand ?? '',
    price: r.price,
    oldPrice: r.old_price,
    composition: r.composition,
    care: r.care,
    measurements: r.measurements,
    sizeChart: r.size_chart ? (JSON.parse(r.size_chart) as SizeChart) : null,
    status: r.status,
    isNew: !!r.is_new,
    isHit: !!r.is_hit,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sold: sold.n,
    photos: photos.map(photo),
    variants: vs.map((v) => ({ id: v.id, size: v.size, color: v.color, sku: v.sku, stock: v.stock, ...(showCost ? { cost: v.cost } : {}) })),
  }
}

export type ProductInput = {
  title: string
  slug?: string
  description: string
  categoryId: number | null
  brand: string
  price: number
  oldPrice: number | null
  composition: string
  care: string
  measurements: string
  sizeChart: SizeChart | null
  status: 'draft' | 'active' | 'archived'
  isNew: boolean
  isHit: boolean
  photoIds: number[]
  variants: Array<{ id?: number; size: string; color: string; sku: string; stock: number; cost?: number | null }>
}

function uniqueSlug(db: DB, wanted: string, ownId: number | null): string {
  const base = slugify(wanted)
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`
    const taken = db.prepare('SELECT id FROM products WHERE slug = ?').get(slug) as { id: number } | undefined
    if (!taken || taken.id === ownId) return slug
  }
}

export function brandId(db: DB, name: string): number | null {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean) return null
  const found = db.prepare('SELECT id FROM brands WHERE name = ?').get(clean) as { id: number } | undefined
  if (found) return found.id
  let slug = slugify(clean)
  while (db.prepare('SELECT 1 FROM brands WHERE slug = ?').get(slug)) slug += '-x'
  return Number(db.prepare('INSERT INTO brands (name, slug) VALUES (?, ?)').run(clean, slug).lastInsertRowid)
}

export function saveProduct(db: DB, id: number | null, input: ProductInput, canSetCost: boolean): number {
  const keys = new Set<string>()
  for (const v of input.variants) {
    const key = `${v.size.trim()}|${v.color.trim()}`
    if (keys.has(key)) fail(400, `Варіант «${[v.size, v.color].filter(Boolean).join(' / ') || 'без розміру'}» повторюється.`)
    keys.add(key)
  }
  if (input.status === 'active' && !input.variants.length) fail(400, 'Додайте хоча б один розмір або варіант, щоб опублікувати товар.')
  if (input.oldPrice !== null && input.oldPrice <= input.price) input.oldPrice = null

  const saved = db.transaction(() => {
    const existing = id ? (db.prepare('SELECT id, status, published_at FROM products WHERE id = ?').get(id) as { id: number; status: string; published_at: string | null } | undefined) : undefined
    if (id && !existing) fail(404, 'Товар не знайдено.')
    const brand = brandId(db, input.brand)
    if (input.categoryId && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(input.categoryId)) fail(400, 'Категорію не знайдено.')
    const slug = uniqueSlug(db, input.slug?.trim() || input.title, id)
    const now = sqlTime()
    const publishedAt = existing?.published_at ?? (input.status === 'active' ? now : null)
    const values = [
      slug, input.title.trim(), input.description, input.categoryId, brand, input.price, input.oldPrice,
      input.composition, input.care, input.measurements, input.sizeChart ? JSON.stringify(input.sizeChart) : null,
      input.status, input.isNew ? 1 : 0, input.isHit ? 1 : 0, now, publishedAt,
    ]
    let productId = id
    if (existing) {
      db.prepare(
        `UPDATE products SET slug = ?, title = ?, description = ?, category_id = ?, brand_id = ?, price = ?, old_price = ?,
          composition = ?, care = ?, measurements = ?, size_chart = ?, status = ?, is_new = ?, is_hit = ?, updated_at = ?, published_at = ?
         WHERE id = ?`,
      ).run(...values, id)
    } else {
      productId = Number(
        db.prepare(
          `INSERT INTO products (slug, title, description, category_id, brand_id, price, old_price, composition, care, measurements,
            size_chart, status, is_new, is_hit, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(...values).lastInsertRowid,
      )
    }

    // Variants: keep ids that come back, add new ones, drop the rest.
    const current = db.prepare('SELECT id FROM variants WHERE product_id = ?').all(productId) as Array<{ id: number }>
    const keep = new Set(input.variants.filter((v) => v.id).map((v) => v.id))
    for (const v of current) if (!keep.has(v.id)) db.prepare('DELETE FROM variants WHERE id = ?').run(v.id)
    // Clear the unique (size, color) slots first so renames can swap.
    input.variants.forEach((v, i) => {
      if (v.id) db.prepare("UPDATE variants SET size = ?, color = '' WHERE id = ? AND product_id = ?").run(`__tmp${i}`, v.id, productId)
    })
    input.variants.forEach((v, sort) => {
      const cost = canSetCost && v.cost !== undefined && v.cost !== null ? round2(v.cost) : undefined
      if (v.id) {
        const res = db
          .prepare('UPDATE variants SET size = ?, color = ?, sku = ?, stock = ?, sort = ? WHERE id = ? AND product_id = ?')
          .run(v.size.trim(), v.color.trim(), v.sku.trim(), v.stock, sort, v.id, productId)
        if (!res.changes) fail(400, 'Варіант не належить цьому товару.')
        if (cost !== undefined) db.prepare('UPDATE variants SET cost = ? WHERE id = ?').run(cost, v.id)
      } else {
        db.prepare('INSERT INTO variants (product_id, size, color, sku, stock, cost, sort) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          productId, v.size.trim(), v.color.trim(), v.sku.trim(), v.stock, cost ?? null, sort,
        )
      }
    })

    // Photos: attach in the given order; photos of this product left out are
    // removed (their files too, after the transaction).
    const attached = db.prepare('SELECT id, file FROM media WHERE product_id = ?').all(productId) as Array<{ id: number; file: string }>
    input.photoIds.forEach((mediaId, sort) => {
      const res = db
        .prepare('UPDATE media SET product_id = ?, sort = ? WHERE id = ? AND (product_id IS NULL OR product_id = ?) AND review_id IS NULL')
        .run(productId, sort, mediaId, productId)
      if (!res.changes) fail(400, 'Фото не знайдено. Завантажте його ще раз.')
    })
    const dropped = attached.filter((m) => !input.photoIds.includes(m.id))
    for (const m of dropped) db.prepare('DELETE FROM media WHERE id = ?').run(m.id)

    refreshSearch(db, productId!)
    return { productId: productId!, dropped: dropped.map((m) => m.file) }
  })()
  // Files go only once the rows are gone for good.
  for (const file of saved.dropped) void removeImageFiles(file)
  return saved.productId
}

export async function deleteProduct(db: DB, id: number) {
  const used = db.prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1').get(id)
  if (used) fail(409, 'Товар є в замовленнях — його можна лише перенести в архів.')
  const files = db.prepare('SELECT file FROM media WHERE product_id = ?').all(id) as Array<{ file: string }>
  db.prepare('DELETE FROM products WHERE id = ?').run(id)
  await Promise.all(files.map((f) => removeImageFiles(f.file)))
}

export function saveCategory(db: DB, id: number | null, name: string, sort: number) {
  const clean = name.trim()
  if (!clean) fail(400, 'Вкажіть назву категорії.')
  let slug = slugify(clean)
  for (let i = 2; ; i++) {
    const owner = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug) as { id: number } | undefined
    if (!owner || owner.id === id) break
    slug = `${slugify(clean)}-${i}`
  }
  if (id) {
    db.prepare('UPDATE categories SET name = ?, slug = ?, sort = ? WHERE id = ?').run(clean, slug, sort, id)
    for (const p of db.prepare('SELECT id FROM products WHERE category_id = ?').all(id) as Array<{ id: number }>) refreshSearch(db, p.id)
    return id
  }
  return Number(db.prepare('INSERT INTO categories (name, slug, sort) VALUES (?, ?, ?)').run(clean, slug, sort).lastInsertRowid)
}

// The text product search matches: title, brand, category and SKUs.
export function refreshSearch(db: DB, productId: number) {
  const row = db
    .prepare(
      `SELECT p.title, b.name brand, c.name category, (SELECT GROUP_CONCAT(sku, ' ') FROM variants WHERE product_id = p.id) skus
       FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`,
    )
    .get(productId) as { title: string; brand: string | null; category: string | null; skus: string | null } | undefined
  if (row) db.prepare('UPDATE products SET search = ? WHERE id = ?').run(searchText(row.title, row.brand, row.category, row.skus), productId)
}

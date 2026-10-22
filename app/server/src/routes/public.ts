import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Ctx } from '../app.js'
import { rateLimit } from '../auth.js'
import { config } from '../config.js'
import { facets, listCategories, listProducts, productBySlug, reviewMedia } from '../catalog.js'
import { insertMedia, mediaUrls, storeImage } from '../media.js'
import { searchCities, searchWarehouses } from '../novaposhta.js'
import { createOrder, publicOrder } from '../orders.js'
import { listPages, renderPage } from '../pages.js'
import { getSettings, publicSettings } from '../settings.js'
import { startLink, botReady, toTeam } from '../telegram.js'
import { fail } from '../util.js'

const list = (v: unknown) => (typeof v === 'string' && v ? v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20) : undefined)
const num = (v: unknown) => (typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined)

const orderSchema = z.object({
  items: z.array(z.object({ variantId: z.number().int().positive(), qty: z.number().int().min(1).max(10) })).min(1, 'Кошик порожній.').max(30),
  lastName: z.string().trim().min(2, 'Вкажіть прізвище.').max(60),
  firstName: z.string().trim().min(2, "Вкажіть ім'я.").max(60),
  phone: z.string().trim().min(9, 'Вкажіть номер телефону.').max(20),
  telegram: z.string().trim().max(64).default(''),
  cityName: z.string().trim().min(2, 'Оберіть місто.').max(120),
  cityRef: z.string().trim().max(64),
  warehouseName: z.string().trim().min(2, 'Оберіть відділення.').max(200),
  warehouseRef: z.string().trim().max(64),
  warehouseKind: z.enum(['branch', 'postomat']).default('branch'),
  note: z.string().trim().max(500).default(''),
  agree: z.literal(true, 'Підтвердьте згоду з умовами.'),
})

const reviewSchema = z.object({
  productId: z.number().int().positive().nullable().default(null),
  name: z.string().trim().min(2, "Вкажіть ім'я.").max(60),
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(5, 'Напишіть кілька слів.').max(2000),
  photoIds: z.array(z.number().int().positive()).max(4).default([]),
})

export const publicRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  const { db } = ctx
  const sizes = () => getSettings(db, 'shop').sizes

  app.get('/shop', async () => ({
    ...publicSettings(db),
    categories: (listCategories(db, true) as Array<{ active: number }>).filter((c) => c.active > 0),
    pages: listPages(db),
  }))

  app.get('/home', async () => {
    const pick = (q: object, limit = 8) => listProducts(db, { ...q, limit }, sizes()).items.filter((p) => p.inStock)
    return { isNew: pick({ isNew: true }), hits: pick({ hit: true }), sale: pick({ sale: true }), latest: pick({}, 12) }
  })

  app.get('/products', async (req) => {
    const q = req.query as Record<string, string>
    return listProducts(
      db,
      {
        q: q.q?.slice(0, 80),
        category: q.category,
        brand: list(q.brand),
        size: list(q.size),
        color: list(q.color),
        min: num(q.min),
        max: num(q.max),
        sale: q.sale === '1',
        isNew: q.new === '1',
        hit: q.hit === '1',
        ids: q.ids !== undefined ? (list(q.ids) ?? []).map(Number).filter(Number.isInteger) : undefined,
        sort: ['new', 'price_asc', 'price_desc'].includes(q.sort) ? (q.sort as 'new') : 'new',
        page: num(q.page),
        limit: num(q.limit),
      },
      sizes(),
    )
  })

  app.get('/facets', async (req) => facets(db, (req.query as { category?: string }).category || undefined, sizes()))

  app.get('/products/:slug', async (req) => {
    const p = productBySlug(db, (req.params as { slug: string }).slug, sizes())
    if (!p) fail(404, 'Товар не знайдено.')
    return p
  })

  // The cart lives in the browser; this tells it what is still true.
  app.post('/cart', async (req) => {
    const { items } = z.object({ items: z.array(z.object({ variantId: z.number().int(), qty: z.number().int().min(1).max(10) })).max(30) }).parse(req.body)
    if (!items.length) return { items: [] }
    const rows = db
      .prepare(
        `SELECT v.id variant_id, v.size, v.color, v.stock, p.id product_id, p.slug, p.title, p.price, p.old_price, p.status,
          (SELECT file FROM media m WHERE m.product_id = p.id ORDER BY sort, id LIMIT 1) file
         FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id IN (${items.map(() => '?').join(',')})`,
      )
      .all(...items.map((i) => i.variantId)) as Array<{
      variant_id: number; size: string; color: string; stock: number; product_id: number; slug: string; title: string; price: number; old_price: number | null; status: string; file: string | null
    }>
    const byId = new Map(rows.map((r) => [r.variant_id, r]))
    return {
      items: items.map((i) => {
        const r = byId.get(i.variantId)
        if (!r || r.status !== 'active') return { variantId: i.variantId, qty: i.qty, gone: true }
        return {
          variantId: r.variant_id,
          productId: r.product_id,
          slug: r.slug,
          title: r.title,
          size: r.size,
          color: r.color,
          price: r.price,
          oldPrice: r.old_price && r.old_price > r.price ? r.old_price : null,
          stock: r.stock,
          qty: Math.min(i.qty, r.stock),
          image: r.file ? mediaUrls(r.file).s : null,
          gone: r.stock === 0,
        }
      }),
    }
  })

  app.get('/np/cities', async (req) => {
    rateLimit(`np:${req.ip}`, 120, 60_000)
    return searchCities(db, String((req.query as { q?: string }).q ?? '').slice(0, 60))
  })

  app.get('/np/warehouses', async (req) => {
    rateLimit(`np:${req.ip}`, 120, 60_000)
    const q = req.query as { city?: string; q?: string }
    return searchWarehouses(db, String(q.city ?? ''), String(q.q ?? '').slice(0, 60))
  })

  app.post('/orders', async (req) => {
    rateLimit(`order:${req.ip}`, 10, 3600_000)
    const input = orderSchema.parse(req.body)
    const order = createOrder(
      db,
      { ...input, name: `${input.lastName} ${input.firstName}` },
      { source: 'site' },
    )
    return { number: order.number, token: order.token }
  })

  app.get('/orders/:token', async (req) => {
    const order = publicOrder(db, (req.params as { token: string }).token)
    if (!order) fail(404, 'Замовлення не знайдено.')
    return order
  })

  app.post('/orders/:token/telegram', async (req) => {
    const row = db.prepare('SELECT id FROM orders WHERE token = ?').get((req.params as { token: string }).token) as { id: number } | undefined
    if (!row) fail(404, 'Замовлення не знайдено.')
    if (!botReady(db)) fail(400, 'Сповіщення в Telegram поки недоступні.')
    return { url: startLink(db, 'order', row.id) }
  })

  app.get('/reviews', async (req) => {
    const page = Math.max(num((req.query as { page?: string }).page) ?? 1, 1)
    const rows = db
      .prepare(
        `SELECT r.id, r.name, r.rating, r.text, r.reply, r.created_at, p.title product, p.slug product_slug
         FROM reviews r LEFT JOIN products p ON p.id = r.product_id WHERE r.status = 'approved' ORDER BY r.id DESC LIMIT 20 OFFSET ?`,
      )
      .all((page - 1) * 20) as Array<{ id: number }>
    const photos = reviewMedia(db, rows.map((r) => r.id))
    const stats = db.prepare("SELECT COUNT(*) count, ROUND(AVG(rating), 1) avg FROM reviews WHERE status = 'approved'").get()
    return { items: rows.map((r) => ({ ...r, photos: photos.get(r.id) ?? [] })), stats }
  })

  app.post('/reviews/photo', async (req) => {
    rateLimit(`review-photo:${req.ip}`, 20, 86_400_000)
    const file = await req.file()
    if (!file) fail(400, 'Додайте фото.')
    const stored = await storeImage(await file.toBuffer())
    return { id: insertMedia(db, stored), ...mediaUrls(stored.file) }
  })

  app.post('/reviews', async (req) => {
    rateLimit(`review:${req.ip}`, 5, 86_400_000)
    const input = reviewSchema.parse(req.body)
    if (input.productId && !db.prepare("SELECT 1 FROM products WHERE id = ? AND status != 'draft'").get(input.productId)) fail(400, 'Товар не знайдено.')
    const id = db.transaction(() => {
      const reviewId = Number(
        db.prepare('INSERT INTO reviews (product_id, name, rating, text) VALUES (?, ?, ?, ?)').run(input.productId, input.name, input.rating, input.text).lastInsertRowid,
      )
      input.photoIds.forEach((mediaId, sort) => {
        db.prepare('UPDATE media SET review_id = ?, sort = ? WHERE id = ? AND product_id IS NULL AND review_id IS NULL').run(reviewId, sort, mediaId)
      })
      return reviewId
    })()
    void toTeam(db, `⭐ Новий відгук (${input.rating}/5) від ${input.name.replace(/[<>&]/g, '')} — чекає на перевірку.`).catch(() => undefined)
    return { id }
  })

  app.get('/pages/:slug', async (req) => {
    const page = renderPage(db, (req.params as { slug: string }).slug, config.publicUrl.replace(/^https?:\/\//, ''))
    if (!page) fail(404, 'Сторінку не знайдено.')
    return page
  })
}

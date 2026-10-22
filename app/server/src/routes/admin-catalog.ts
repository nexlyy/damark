import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Ctx } from '../app.js'
import { can } from '../auth.js'
import { adminProduct, adminProductList, deleteProduct, listCategories, saveCategory, saveProduct } from '../catalog.js'
import { insertMedia, mediaUrls, storeImage } from '../media.js'
import { fail, searchText } from '../util.js'

const money = z.number().int('Ціна — ціле число гривень.').min(0).max(1_000_000)

const productSchema = z.object({
  title: z.string().trim().min(2, 'Вкажіть назву.').max(140),
  slug: z.string().trim().max(80).optional(),
  description: z.string().max(5000).default(''),
  categoryId: z.number().int().positive().nullable().default(null),
  brand: z.string().trim().max(60).default(''),
  price: money,
  oldPrice: money.nullable().default(null),
  composition: z.string().max(500).default(''),
  care: z.string().max(500).default(''),
  measurements: z.string().max(2000).default(''),
  sizeChart: z
    .object({ columns: z.array(z.string().max(40)).min(1).max(10), rows: z.array(z.array(z.string().max(40)).max(10)).max(30) })
    .nullable()
    .default(null),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  isNew: z.boolean().default(false),
  isHit: z.boolean().default(false),
  photoIds: z.array(z.number().int().positive()).max(20, 'До 20 фото на товар.').default([]),
  variants: z
    .array(
      z.object({
        id: z.number().int().positive().optional(),
        size: z.string().trim().max(30).default(''),
        color: z.string().trim().max(40).default(''),
        sku: z.string().trim().max(40).default(''),
        stock: z.number().int().min(0, 'Залишок не може бути відʼємним.').max(100_000),
        cost: z.number().min(0).max(1_000_000).nullable().optional(),
      }),
    )
    .max(200)
    .default([]),
})

export const adminCatalogRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  const { db } = ctx

  app.get('/products', async (req) => {
    const q = req.query as Record<string, string>
    return adminProductList(db, { q: q.q, status: q.status || undefined, category: q.category ? Number(q.category) : undefined, lowStock: q.low === '1' })
  })

  app.get('/products/:id', async (req) => adminProduct(db, Number((req.params as { id: string }).id), can.finance(req.user)))

  app.post('/products', async (req) => {
    const id = saveProduct(db, null, productSchema.parse(req.body), can.finance(req.user))
    return adminProduct(db, id, can.finance(req.user))
  })

  app.put('/products/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    saveProduct(db, id, productSchema.parse(req.body), can.finance(req.user))
    return adminProduct(db, id, can.finance(req.user))
  })

  app.delete('/products/:id', async (req) => {
    await deleteProduct(db, Number((req.params as { id: string }).id))
    return { ok: true }
  })

  // Copy of a product with its text and sizes but no photos or stock: for
  // the same model in another colour.
  app.post('/products/:id/copy', async (req) => {
    const src = adminProduct(db, Number((req.params as { id: string }).id), true)
    const id = saveProduct(
      db,
      null,
      {
        ...src,
        title: `${src.title} (копія)`,
        slug: undefined,
        status: 'draft',
        photoIds: [],
        variants: src.variants.map((v) => ({ size: v.size, color: v.color, sku: '', stock: 0, cost: can.finance(req.user) ? (v as { cost?: number | null }).cost : undefined })),
      },
      can.finance(req.user),
    )
    return { id }
  })

  app.post('/media', async (req) => {
    const file = await req.file()
    if (!file) fail(400, 'Додайте фото.')
    const stored = await storeImage(await file.toBuffer())
    const id = insertMedia(db, stored)
    return { id, ...mediaUrls(stored.file), width: stored.width, height: stored.height }
  })

  // Variant search for purchases and orders entered by hand.
  app.get('/variants', async (req) => {
    const q = String((req.query as { q?: string }).q ?? '')
    const where: string[] = ["p.status != 'archived'"]
    const args: unknown[] = []
    for (const word of searchText(q).split(' ').filter(Boolean).slice(0, 5)) {
      where.push("(p.search LIKE ? OR lower(v.size) = ? OR lower(v.color) LIKE ?)")
      args.push(`%${word}%`, word, `%${word}%`)
    }
    const rows = db
      .prepare(
        `SELECT v.id variantId, p.id productId, p.title, p.status, v.size, v.color, v.sku, v.stock, v.cost, p.price,
          (SELECT file FROM media m WHERE m.product_id = p.id ORDER BY sort, id LIMIT 1) file
         FROM variants v JOIN products p ON p.id = v.product_id WHERE ${where.join(' AND ')}
         ORDER BY p.updated_at DESC, v.sort LIMIT 40`,
      )
      .all(...args) as Array<Record<string, unknown> & { file: string | null; cost: number | null }>
    const showCost = can.finance(req.user)
    return rows.map(({ file, cost, ...r }) => ({ ...r, ...(showCost ? { cost } : {}), image: file ? mediaUrls(file).s : null }))
  })

  app.get('/categories', async () => listCategories(db, true))

  app.post('/categories', async (req) => {
    const { name, sort } = z.object({ name: z.string().max(60), sort: z.number().int().default(0) }).parse(req.body)
    return { id: saveCategory(db, null, name, sort) }
  })

  app.put('/categories/:id', async (req) => {
    const { name, sort } = z.object({ name: z.string().max(60), sort: z.number().int().default(0) }).parse(req.body)
    return { id: saveCategory(db, Number((req.params as { id: string }).id), name, sort) }
  })

  app.delete('/categories/:id', async (req) => {
    db.prepare('DELETE FROM categories WHERE id = ?').run(Number((req.params as { id: string }).id))
    return { ok: true }
  })

  app.get('/brands', async () => db.prepare('SELECT id, name FROM brands ORDER BY name').all())
}

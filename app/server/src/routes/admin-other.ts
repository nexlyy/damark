import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Ctx } from '../app.js'
import { can, endAllSessions, hashPassword, type User } from '../auth.js'
import { reviewMedia } from '../catalog.js'
import { createPurchase, deletePurchase, listExpenses, listPurchases, profitByMonth, purchase, saveExpense, stockValue } from '../finance.js'
import { removeImageFiles } from '../media.js'
import { senders } from '../novaposhta.js'
import { listPages, rawPage, savePage } from '../pages.js'
import { defaults, getSettings, saveSettings, secretFields, type SettingsGroup } from '../settings.js'
import { tg } from '../telegram.js'
import { fail, randomToken } from '../util.js'
import { me } from './auth.js'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата у форматі РРРР-ММ-ДД.')

function only(check: (u: User) => boolean) {
  return async (req: FastifyRequest) => {
    if (!check(req.user)) fail(403, 'Немає доступу.')
  }
}

// Settings the admin form may change, per group. Secrets come in only when
// typed anew; an empty value leaves the stored one alone.
const settingsSchemas: Partial<Record<SettingsGroup, z.ZodType>> = {
  shop: z.object({
    name: z.string().trim().min(1).max(60),
    managerTelegram: z.string().trim().max(40).transform((s) => s.replace(/^@/, '')),
    viberPhone: z.string().trim().max(20),
    stockGroup: z.string().trim().max(40).transform((s) => s.replace(/^@/, '')),
    instagram: z.string().trim().max(40).transform((s) => s.replace(/^@/, '')),
    deliveryNote: z.string().trim().max(300),
    sizes: z.array(z.string().trim().min(1).max(20)).max(40),
    colors: z.array(z.string().trim().min(1).max(30)).max(60),
  }).partial(),
  payment: z.object({
    recipient: z.string().trim().max(120),
    iban: z.string().trim().transform((s) => s.replace(/\s/g, '').toUpperCase()).pipe(z.string().regex(/^UA\d{27}$/, 'IBAN — UA і 27 цифр.')),
    taxId: z.string().trim().max(12),
    bankCode: z.string().trim().max(12),
    purpose: z.string().trim().max(160),
  }).partial(),
  orders: z.object({ reserveHours: z.number().int().min(1).max(24 * 14) }).partial(),
  novaPoshta: z.object({
    apiKey: z.string().trim().max(64),
    senderRef: z.string().trim().max(64),
    contactRef: z.string().trim().max(64),
    senderPhone: z.string().trim().max(20),
    senderCityRef: z.string().trim().max(64),
    senderCityName: z.string().trim().max(120),
    senderWarehouseRef: z.string().trim().max(64),
    senderWarehouseName: z.string().trim().max(200),
    description: z.string().trim().min(1).max(60),
    weightKg: z.number().min(0.1).max(30),
    lengthCm: z.number().int().min(1).max(200),
    widthCm: z.number().int().min(1).max(200),
    heightCm: z.number().int().min(1).max(200),
  }).partial(),
  analytics: z.object({ umamiWebsiteId: z.string().trim().regex(/^([0-9a-f-]{36})?$/i, 'ID сайту Umami — як 7338b69a-….') }).partial(),
}

function visibleSettings(group: SettingsGroup, value: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...value }
  for (const key of secretFields[group] ?? []) {
    out[`${key}Set`] = !!value[key]
    delete out[key]
  }
  return out
}

export const adminOtherRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  const { db } = ctx

  app.get('/dashboard', async (req) => {
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n
    const finance = can.finance(req.user)
    const today = db
      .prepare("SELECT COUNT(*) orders, COALESCE(SUM(total), 0) total FROM orders WHERE date(created_at, 'localtime') = date('now', 'localtime') AND status != 'cancelled'")
      .get() as { orders: number; total: number }
    return {
      awaitingPayment: count("SELECT COUNT(*) n FROM orders WHERE status = 'new'"),
      overdue: count("SELECT COUNT(*) n FROM orders WHERE status = 'new' AND reserved_until < datetime('now')"),
      toShip: count("SELECT COUNT(*) n FROM orders WHERE status = 'paid'"),
      inTransit: count("SELECT COUNT(*) n FROM orders WHERE status = 'shipped'"),
      atBranch: count("SELECT COUNT(*) n FROM orders WHERE status = 'arrived'"),
      unassigned: count("SELECT COUNT(*) n FROM orders WHERE status IN ('new', 'paid') AND manager_id IS NULL"),
      pendingReviews: count("SELECT COUNT(*) n FROM reviews WHERE status = 'pending'"),
      products: count("SELECT COUNT(*) n FROM products WHERE status = 'active'"),
      drafts: count("SELECT COUNT(*) n FROM products WHERE status = 'draft'"),
      soldOut: count("SELECT COUNT(*) n FROM products p WHERE status = 'active' AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.stock > 0)"),
      today: { orders: today.orders, ...(finance ? { total: today.total } : {}) },
      daily: finance
        ? db
            .prepare(
              `SELECT date(paid_at, 'localtime') day, COUNT(*) orders, SUM(total - refund) revenue FROM orders
               WHERE paid_at >= datetime('now', '-30 days') AND status != 'cancelled' GROUP BY day ORDER BY day`,
            )
            .all()
        : [],
      months: finance ? profitByMonth(db, 2) : [],
      recent: db
        .prepare(
          `SELECT o.id, o.number, o.status, o.name, o.total, o.created_at, o.reserved_until,
            CASE WHEN o.status = 'new' AND o.reserved_until < datetime('now') THEN 1 ELSE 0 END overdue
           FROM orders o ORDER BY o.id DESC LIMIT 8`,
        )
        .all(),
      lowStock: db
        .prepare(
          `SELECT p.id, p.title, v.size, v.color, v.stock FROM variants v JOIN products p ON p.id = v.product_id
           WHERE p.status = 'active' AND v.stock BETWEEN 0 AND 1 ORDER BY v.stock, p.updated_at DESC LIMIT 12`,
        )
        .all(),
    }
  })

  // ---------------------------------------------------------- money (owner)
  app.register(async (money) => {
    money.addHook('preHandler', only(can.finance))

    money.get('/purchases', async () => listPurchases(db))
    money.get('/purchases/:id', async (req) => purchase(db, Number((req.params as { id: string }).id)))
    money.post('/purchases', async (req) => {
      const input = z
        .object({
          date: day,
          supplier: z.string().max(120).default(''),
          note: z.string().max(1000).default(''),
          extraCost: z.number().min(0).max(10_000_000).default(0),
          items: z.array(z.object({ variantId: z.number().int().positive(), qty: z.number().int().min(1).max(100_000), unitCost: z.number().min(0).max(1_000_000) })).min(1, 'Додайте позиції.').max(300),
        })
        .parse(req.body)
      return { id: createPurchase(db, input, req.user.id) }
    })
    money.delete('/purchases/:id', async (req) => {
      deletePurchase(db, Number((req.params as { id: string }).id))
      return { ok: true }
    })

    const expenseSchema = z.object({ date: day, category: z.string().trim().min(1, 'Вкажіть статтю витрат.').max(60), amount: z.number().min(0).max(10_000_000), note: z.string().max(500).default('') })
    money.get('/expenses', async (req) => listExpenses(db, (req.query as { month?: string }).month))
    money.get('/expense-categories', async () => db.prepare('SELECT category, COUNT(*) n FROM expenses GROUP BY category ORDER BY n DESC LIMIT 30').all())
    money.post('/expenses', async (req) => ({ id: saveExpense(db, null, expenseSchema.parse(req.body), req.user.id) }))
    money.put('/expenses/:id', async (req) => ({ id: saveExpense(db, Number((req.params as { id: string }).id), expenseSchema.parse(req.body), req.user.id) }))
    money.delete('/expenses/:id', async (req) => {
      db.prepare('DELETE FROM expenses WHERE id = ?').run(Number((req.params as { id: string }).id))
      return { ok: true }
    })

    money.get('/finance', async () => ({ months: profitByMonth(db, 12), stock: stockValue(db) }))
  })

  // ---------------------------------------------------------------- reviews
  app.get('/reviews', async (req) => {
    const status = (req.query as { status?: string }).status || 'pending'
    const rows = db
      .prepare(
        `SELECT r.*, p.title product, p.slug product_slug FROM reviews r LEFT JOIN products p ON p.id = r.product_id
         WHERE r.status = ? ORDER BY r.id DESC LIMIT 200`,
      )
      .all(status) as Array<{ id: number }>
    const photos = reviewMedia(db, rows.map((r) => r.id))
    return rows.map((r) => ({ ...r, photos: photos.get(r.id) ?? [] }))
  })

  app.patch('/reviews/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const input = z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional(), reply: z.string().max(1000).optional(), productId: z.number().int().positive().nullable().optional() }).parse(req.body)
    if (input.status) db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(input.status, id)
    if (input.reply !== undefined) db.prepare('UPDATE reviews SET reply = ? WHERE id = ?').run(input.reply, id)
    if (input.productId !== undefined) db.prepare('UPDATE reviews SET product_id = ? WHERE id = ?').run(input.productId, id)
    return { ok: true }
  })

  app.delete('/reviews/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const files = db.prepare('SELECT file FROM media WHERE review_id = ?').all(id) as Array<{ file: string }>
    db.prepare('DELETE FROM media WHERE review_id = ?').run(id)
    db.prepare('DELETE FROM reviews WHERE id = ?').run(id)
    await Promise.all(files.map((f) => removeImageFiles(f.file)))
    return { ok: true }
  })

  // ---------------------------------------------- settings, pages, staff
  app.register(async (owner) => {
    owner.addHook('preHandler', only(can.settings))

    owner.get('/settings', async () => {
      const out: Record<string, unknown> = {}
      for (const group of Object.keys(defaults) as SettingsGroup[]) {
        out[group] = visibleSettings(group, getSettings(db, group) as Record<string, unknown>)
      }
      return out
    })

    owner.put('/settings/:group', async (req) => {
      const group = (req.params as { group: string }).group as SettingsGroup
      const schema = settingsSchemas[group]
      if (!schema) fail(404, 'Немає таких налаштувань.')
      const patch = schema.parse(req.body) as Record<string, unknown>
      for (const key of secretFields[group] ?? []) if (patch[key] === '') delete patch[key]
      return visibleSettings(group, saveSettings(db, group, patch as never) as Record<string, unknown>)
    })

    owner.post('/settings/telegram/token', async (req) => {
      const { token } = z.object({ token: z.string().trim().max(100) }).parse(req.body)
      if (!token) {
        saveSettings(db, 'telegram', { botToken: '', botUsername: '', updateOffset: 0 })
        return { ok: true }
      }
      if (!/^\d+:[\w-]{30,}$/.test(token)) fail(400, 'Це не схоже на токен від @BotFather.')
      let bot: { username: string }
      try {
        bot = await tg<{ username: string }>(token, 'getMe')
      } catch {
        return fail(400, 'Telegram не прийняв цей токен.')
      }
      saveSettings(db, 'telegram', { botToken: token, botUsername: bot.username, updateOffset: 0 })
      return { username: bot.username }
    })

    owner.post('/settings/telegram/bind', async () => {
      const code = randomToken(6).replace(/[^A-Za-z0-9]/g, 'x')
      saveSettings(db, 'telegram', { bindCode: code })
      return { command: `/bind ${code}` }
    })

    owner.post('/settings/telegram/unbind', async () => {
      saveSettings(db, 'telegram', { teamChatId: 0, teamChatTitle: '' })
      return { ok: true }
    })

    owner.get('/settings/novaposhta/senders', async () => senders(db))

    owner.get('/pages', async () => listPages(db))
    owner.get('/pages/:slug', async (req) => rawPage(db, (req.params as { slug: string }).slug))
    owner.put('/pages/:slug', async (req) => {
      const { title, body } = z.object({ title: z.string().trim().min(2).max(120), body: z.string().max(50_000) }).parse(req.body)
      savePage(db, (req.params as { slug: string }).slug, title, body)
      return { ok: true }
    })

    owner.get('/users', async () =>
      db.prepare('SELECT id, login, name, role, disabled, tg_username, tg_user_id IS NOT NULL telegram, created_at FROM users ORDER BY disabled, id').all(),
    )

    const roles = z.enum(['owner', 'manager', 'dev'])
    owner.post('/users', async (req) => {
      const input = z
        .object({ login: z.string().trim().regex(/^[a-z0-9._-]{3,32}$/i, 'Логін: 3–32 латинські літери, цифри, . _ -'), name: z.string().trim().min(2).max(60), role: roles, password: z.string().min(10, 'Пароль — щонайменше 10 символів.').max(200) })
        .parse(req.body)
      if (db.prepare('SELECT 1 FROM users WHERE login = ?').get(input.login)) fail(409, 'Такий логін уже є.')
      const id = Number(
        db.prepare('INSERT INTO users (login, name, role, password_hash) VALUES (?, ?, ?, ?)').run(input.login, input.name, input.role, await hashPassword(input.password)).lastInsertRowid,
      )
      return { id }
    })

    owner.patch('/users/:id', async (req) => {
      const id = Number((req.params as { id: string }).id)
      const input = z
        .object({ name: z.string().trim().min(2).max(60).optional(), role: roles.optional(), disabled: z.boolean().optional(), password: z.string().min(10, 'Пароль — щонайменше 10 символів.').max(200).optional(), unlinkTelegram: z.boolean().optional() })
        .parse(req.body)
      if (id === req.user.id && (input.disabled || (input.role && input.role === 'manager'))) fail(400, 'Не можна відключити себе або забрати собі доступ.')
      if (input.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(input.name, id)
      if (input.role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(input.role, id)
      if (input.disabled !== undefined) {
        db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(input.disabled ? 1 : 0, id)
        if (input.disabled) endAllSessions(db, id)
      }
      if (input.password) {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(input.password), id)
        endAllSessions(db, id)
      }
      if (input.unlinkTelegram) db.prepare('UPDATE users SET tg_user_id = NULL, tg_username = NULL WHERE id = ?').run(id)
      return { ok: true }
    })
  })

  app.get('/me', async (req) => me(db, req.user))
}

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Ctx } from '../app.js'
import { can } from '../auth.js'
import { createTtn, track, trackingOutcome } from '../novaposhta.js'
import {
  canMove, createOrder, extendReserve, getOrder, logEvent, orderCost, orderItems, returnItems, setStatus, setTtn, statusLabels,
  type OrderRow, type OrderStatus,
} from '../orders.js'
import { refreshTeamMessage } from '../telegram.js'
import { fail, normalizePhone, searchText, sqlTime } from '../util.js'

const statuses = Object.keys(statusLabels) as OrderStatus[]

const deliverySchema = {
  lastName: z.string().trim().min(2, 'Вкажіть прізвище.').max(60),
  firstName: z.string().trim().min(2, "Вкажіть ім'я.").max(60),
  phone: z.string().trim().min(9, 'Вкажіть телефон.').max(20),
  telegram: z.string().trim().max(64).default(''),
  cityName: z.string().trim().min(2, 'Оберіть місто.').max(120),
  cityRef: z.string().trim().max(64).default(''),
  warehouseName: z.string().trim().min(2, 'Оберіть відділення.').max(200),
  warehouseRef: z.string().trim().max(64).default(''),
  warehouseKind: z.enum(['branch', 'postomat']).default('branch'),
}

// Orders that need someone: unpaid, paid but not sent, parcels waiting.
const groups: Record<string, string> = {
  active: "o.status IN ('new', 'paid', 'shipped', 'arrived')",
  overdue: "o.status = 'new' AND o.reserved_until < datetime('now')",
  mine: 'o.manager_id = ?',
  all: '1 = 1',
}

export const adminOrderRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  const { db } = ctx

  app.get('/orders', async (req) => {
    const q = req.query as Record<string, string>
    const where: string[] = []
    const args: unknown[] = []
    if (statuses.includes(q.status as OrderStatus)) {
      where.push('o.status = ?')
      args.push(q.status)
    } else {
      const group = groups[q.status] ?? groups.active
      where.push(group)
      if (q.status === 'mine') args.push(req.user.id)
    }
    if (q.q) {
      const term = q.q.trim()
      const digits = term.replace(/\D/g, '')
      where.push('(o.number = ? OR o.ttn = ? OR (? != \'\' AND o.phone LIKE ?) OR lower(o.name) LIKE ? OR lower(o.telegram) LIKE ?)')
      args.push(Number(digits) || -1, digits, digits, `%${digits.slice(-9)}%`, `%${searchText(term)}%`, `%${searchText(term).replace(/^@/, '')}%`)
    }
    if (q.customer) {
      where.push('o.customer_id = ?')
      args.push(Number(q.customer))
    }
    const page = Math.max(Number(q.page) || 1, 1)
    const rows = db
      .prepare(
        `SELECT o.id, o.number, o.status, o.source, o.name, o.phone, o.telegram, o.city_name, o.total, o.refund, o.ttn, o.np_status,
          o.reserved_until, o.created_at, o.updated_at, u.name manager, c.blacklisted,
          (SELECT COALESCE(SUM(qty), 0) FROM order_items WHERE order_id = o.id) pieces,
          (SELECT image FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 1) image,
          CASE WHEN o.status = 'new' AND o.reserved_until < datetime('now') THEN 1 ELSE 0 END overdue
         FROM orders o LEFT JOIN users u ON u.id = o.manager_id JOIN customers c ON c.id = o.customer_id
         WHERE ${where.join(' AND ')} ORDER BY o.id DESC LIMIT 50 OFFSET ?`,
      )
      .all(...args, (page - 1) * 50)
    const counts = db
      .prepare(
        `SELECT status, COUNT(*) n, SUM(CASE WHEN status = 'new' AND reserved_until < datetime('now') THEN 1 ELSE 0 END) overdue
         FROM orders WHERE status IN ('new', 'paid', 'shipped', 'arrived') GROUP BY status`,
      )
      .all()
    return { items: rows, counts }
  })

  app.get('/orders/:id', async (req) => {
    const order = getOrder(db, Number((req.params as { id: string }).id))
    const items = orderItems(db, order.id)
    const showMoney = can.finance(req.user)
    const customer = db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) orders,
          (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND status IN ('refused')) refused,
          (SELECT COALESCE(SUM(total - refund), 0) FROM orders WHERE customer_id = c.id AND paid_at IS NOT NULL AND status != 'cancelled') spent
         FROM customers c WHERE c.id = ?`,
      )
      .get(order.customer_id)
    const events = db
      .prepare('SELECT e.at, e.text, u.name user FROM order_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.order_id = ? ORDER BY e.id')
      .all(order.id)
    const manager = order.manager_id ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(order.manager_id) : null
    const exchangeOf = order.exchange_of ? db.prepare('SELECT id, number FROM orders WHERE id = ?').get(order.exchange_of) : null
    const exchanges = db.prepare('SELECT id, number FROM orders WHERE exchange_of = ?').all(order.id)
    return {
      ...order,
      manager,
      exchangeOf,
      exchanges,
      overdue: order.status === 'new' && !!order.reserved_until && order.reserved_until < sqlTime(),
      next: statuses.filter((s) => canMove(order.status, s)),
      items: items.map((i) => (showMoney ? i : { ...i, cost: undefined })),
      ...(showMoney ? { cost: orderCost(items) } : {}),
      customer,
      events,
    }
  })

  app.post('/orders', async (req) => {
    const input = z
      .object({
        ...deliverySchema,
        items: z.array(z.object({ variantId: z.number().int().positive(), qty: z.number().int().min(1).max(50) })).min(1, 'Додайте товари.'),
        discount: z.number().int().min(0).default(0),
        note: z.string().trim().max(1000).default(''),
        exchangeOf: z.number().int().positive().nullable().default(null),
      })
      .parse(req.body)
    if (input.exchangeOf) getOrder(db, input.exchangeOf)
    const order = createOrder(
      db,
      { ...input, name: `${input.lastName} ${input.firstName}`, note: '' },
      { source: 'admin', userId: req.user.id, discount: input.discount, exchangeOf: input.exchangeOf },
    )
    if (input.note) db.prepare('UPDATE orders SET note = ? WHERE id = ?').run(input.note, order.id)
    return { id: order.id }
  })

  app.patch('/orders/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const order = getOrder(db, id)
    const input = z
      .object({
        note: z.string().max(2000).optional(),
        managerId: z.number().int().positive().nullable().optional(),
        delivery: z.object(deliverySchema).optional(),
      })
      .parse(req.body)
    if (input.note !== undefined) db.prepare('UPDATE orders SET note = ? WHERE id = ?').run(input.note, id)
    if (input.managerId !== undefined) {
      const m = input.managerId ? (db.prepare('SELECT name FROM users WHERE id = ? AND disabled = 0').get(input.managerId) as { name: string } | undefined) : null
      if (input.managerId && !m) fail(400, 'Менеджера не знайдено.')
      db.prepare('UPDATE orders SET manager_id = ? WHERE id = ?').run(input.managerId, id)
      logEvent(db, id, req.user.id, m ? `Відповідальний: ${m.name}` : 'Відповідального знято')
      void refreshTeamMessage(db, id)
    }
    if (input.delivery) {
      if (!['new', 'paid'].includes(order.status)) fail(409, 'Дані доставки змінюються до відправки.')
      const d = input.delivery
      const phone = normalizePhone(d.phone)
      db.prepare(
        `UPDATE orders SET name = ?, phone = ?, telegram = ?, city_name = ?, city_ref = ?, warehouse_name = ?, warehouse_ref = ?, warehouse_kind = ? WHERE id = ?`,
      ).run(`${d.lastName} ${d.firstName}`, phone, d.telegram.replace(/^@/, ''), d.cityName, d.cityRef, d.warehouseName, d.warehouseRef, d.warehouseKind, id)
      logEvent(db, id, req.user.id, `Дані доставки: ${d.lastName} ${d.firstName}, ${phone}, ${d.cityName}, ${d.warehouseName}`)
    }
    return { ok: true }
  })

  app.post('/orders/:id/status', async (req) => {
    const { status, note } = z.object({ status: z.enum(statuses as [OrderStatus, ...OrderStatus[]]), note: z.string().max(300).optional() }).parse(req.body)
    setStatus(db, Number((req.params as { id: string }).id), status, req.user.id, { note })
    return { ok: true }
  })

  app.post('/orders/:id/take', async (req) => {
    const id = Number((req.params as { id: string }).id)
    db.prepare('UPDATE orders SET manager_id = ? WHERE id = ?').run(req.user.id, id)
    logEvent(db, id, req.user.id, `Взяв(ла) в роботу: ${req.user.name}`)
    void refreshTeamMessage(db, id)
    return { ok: true }
  })

  app.post('/orders/:id/extend', async (req) => {
    extendReserve(db, Number((req.params as { id: string }).id), req.user.id)
    return { ok: true }
  })

  // A number written by hand, or one Nova Poshta creates from the order.
  app.post('/orders/:id/ttn', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const { ttn } = z.object({ ttn: z.string().max(20).optional() }).parse(req.body ?? {})
    if (ttn) {
      setTtn(db, id, req.user.id, ttn)
      return { ttn: ttn.replace(/\s/g, '') }
    }
    const order = getOrder(db, id)
    if (order.status !== 'paid') fail(409, 'ТТН створюється для оплаченого замовлення.')
    const doc = await createTtn(db, order)
    setTtn(db, id, req.user.id, doc.ttn, doc.ref)
    return doc
  })

  app.post('/orders/:id/track', async (req) => {
    const order = getOrder(db, Number((req.params as { id: string }).id))
    if (!order.ttn) fail(400, 'У замовлення ще немає ТТН.')
    await applyTracking(db, [order])
    return getOrder(db, order.id)
  })

  app.post('/orders/:id/return', async (req) => {
    const { items, refund } = z
      .object({ items: z.array(z.object({ itemId: z.number().int(), qty: z.number().int().min(0) })), refund: z.number().int().min(0) })
      .parse(req.body)
    returnItems(db, Number((req.params as { id: string }).id), req.user.id, items, refund)
    return { ok: true }
  })

  app.get('/customers', async (req) => {
    const q = req.query as Record<string, string>
    const where: string[] = ['1 = 1']
    const args: unknown[] = []
    if (q.q) {
      const digits = q.q.replace(/\D/g, '')
      where.push("(lower(c.name) LIKE ? OR (? != '' AND c.phone LIKE ?) OR lower(c.telegram) LIKE ?)")
      args.push(`%${searchText(q.q)}%`, digits, `%${digits.slice(-9)}%`, `%${searchText(q.q).replace(/^@/, '')}%`)
    }
    if (q.blacklisted === '1') where.push('c.blacklisted = 1')
    return db
      .prepare(
        `SELECT c.id, c.name, c.phone, c.telegram, c.blacklisted, c.note, c.created_at,
          COUNT(o.id) orders, MAX(o.created_at) last_order,
          COALESCE(SUM(CASE WHEN o.paid_at IS NOT NULL AND o.status != 'cancelled' THEN o.total - o.refund END), 0) spent,
          SUM(CASE WHEN o.status = 'refused' THEN 1 ELSE 0 END) refused
         FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE ${where.join(' AND ')}
         GROUP BY c.id ORDER BY last_order DESC NULLS LAST, c.id DESC LIMIT 200`,
      )
      .all(...args)
  })

  app.get('/customers/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
    if (!customer) fail(404, 'Клієнта не знайдено.')
    const orders = db.prepare('SELECT id, number, status, total, refund, created_at, ttn FROM orders WHERE customer_id = ? ORDER BY id DESC').all(id)
    return { ...customer, orders }
  })

  app.patch('/customers/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const input = z
      .object({ name: z.string().trim().min(2).max(120).optional(), telegram: z.string().trim().max(64).optional(), note: z.string().max(2000).optional(), blacklisted: z.boolean().optional() })
      .parse(req.body)
    if (input.name !== undefined) db.prepare('UPDATE customers SET name = ? WHERE id = ?').run(input.name, id)
    if (input.telegram !== undefined) db.prepare('UPDATE customers SET telegram = ? WHERE id = ?').run(input.telegram.replace(/^@/, ''), id)
    if (input.note !== undefined) db.prepare('UPDATE customers SET note = ? WHERE id = ?').run(input.note, id)
    if (input.blacklisted !== undefined) db.prepare('UPDATE customers SET blacklisted = ? WHERE id = ?').run(input.blacklisted ? 1 : 0, id)
    return { ok: true }
  })
}

// Asks Nova Poshta where parcels are and moves orders along: arrived at the
// branch, picked up, or refused.
export async function applyTracking(db: Ctx['db'], orders: OrderRow[]) {
  const withTtn = orders.filter((o) => o.ttn)
  if (!withTtn.length) return 0
  const results = await track(db, withTtn.map((o) => ({ ttn: o.ttn, phone: o.phone })))
  let moved = 0
  for (const r of results) {
    const order = withTtn.find((o) => o.ttn === r.ttn)
    if (!order) continue
    db.prepare("UPDATE orders SET np_status = ?, np_status_code = ?, np_checked_at = datetime('now') WHERE id = ?").run(r.status, r.code, order.id)
    const outcome = trackingOutcome(r.code)
    const current = getOrder(db, order.id).status
    if (outcome && outcome !== current && canMove(current, outcome)) {
      setStatus(db, order.id, outcome, null, { note: `Нова пошта: ${r.status}` })
      moved++
    }
  }
  return moved
}

import type { DB } from './db.js'
import { fail, round2 } from './util.js'

// Purchases bring stock in and set what each piece cost (weighted average
// with what is already on the shelf). Profit is counted on the month an
// order was paid.

export type PurchaseInput = {
  date: string
  supplier: string
  note: string
  extraCost: number
  items: Array<{ variantId: number; qty: number; unitCost: number }>
}

export function createPurchase(db: DB, input: PurchaseInput, userId: number) {
  if (!input.items.length) fail(400, 'Додайте хоча б одну позицію.')
  return db.transaction(() => {
    const id = Number(
      db.prepare('INSERT INTO purchases (date, supplier, note, extra_cost, created_by) VALUES (?, ?, ?, ?, ?)').run(
        input.date, input.supplier.trim(), input.note.trim(), round2(input.extraCost), userId,
      ).lastInsertRowid,
    )
    const pieces = input.items.reduce((s, i) => s + i.qty, 0)
    // Delivery and other extras are spread evenly over the pieces.
    const extraPerPiece = pieces ? input.extraCost / pieces : 0
    for (const item of input.items) {
      const v = db
        .prepare('SELECT v.id, v.size, v.color, v.stock, v.cost, p.title FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?')
        .get(item.variantId) as { id: number; size: string; color: string; stock: number; cost: number | null; title: string } | undefined
      if (!v) fail(400, 'Варіант товару не знайдено.')
      const unit = round2(item.unitCost + extraPerPiece)
      const cost = v.cost === null || v.stock === 0 ? unit : round2((v.cost * v.stock + unit * item.qty) / (v.stock + item.qty))
      db.prepare('UPDATE variants SET stock = stock + ?, cost = ? WHERE id = ?').run(item.qty, cost, v.id)
      db.prepare('INSERT INTO purchase_items (purchase_id, variant_id, title, size, color, qty, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id, v.id, v.title, v.size, v.color, item.qty, round2(item.unitCost),
      )
    }
    return id
  })()
}

export function listPurchases(db: DB) {
  return db
    .prepare(
      `SELECT p.id, p.date, p.supplier, p.note, p.extra_cost, u.name created_by,
        (SELECT COALESCE(SUM(qty), 0) FROM purchase_items WHERE purchase_id = p.id) pieces,
        (SELECT COALESCE(SUM(qty * unit_cost), 0) FROM purchase_items WHERE purchase_id = p.id) + p.extra_cost amount
       FROM purchases p LEFT JOIN users u ON u.id = p.created_by ORDER BY p.date DESC, p.id DESC LIMIT 300`,
    )
    .all()
}

export function purchase(db: DB, id: number) {
  const p = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id)
  if (!p) fail(404, 'Закупку не знайдено.')
  const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id').all(id)
  return { ...p, items }
}

// Undo a purchase entered by mistake: the pieces leave stock again if they
// are still there. Costs already averaged in stay as they are.
export function deletePurchase(db: DB, id: number) {
  db.transaction(() => {
    const items = db.prepare('SELECT variant_id, qty, title FROM purchase_items WHERE purchase_id = ?').all(id) as Array<{ variant_id: number | null; qty: number; title: string }>
    for (const i of items) {
      if (!i.variant_id) continue
      const v = db.prepare('SELECT stock FROM variants WHERE id = ?').get(i.variant_id) as { stock: number } | undefined
      if (v && v.stock < i.qty) fail(409, `«${i.title}» уже продано — закупку не можна видалити.`)
      if (v) db.prepare('UPDATE variants SET stock = stock - ? WHERE id = ?').run(i.qty, i.variant_id)
    }
    db.prepare('DELETE FROM purchases WHERE id = ?').run(id)
  })()
}

export type ExpenseInput = { date: string; category: string; amount: number; note: string }

export function saveExpense(db: DB, id: number | null, input: ExpenseInput, userId: number) {
  if (id) {
    db.prepare('UPDATE expenses SET date = ?, category = ?, amount = ?, note = ? WHERE id = ?').run(input.date, input.category.trim(), round2(input.amount), input.note.trim(), id)
    return id
  }
  return Number(
    db.prepare('INSERT INTO expenses (date, category, amount, note, created_by) VALUES (?, ?, ?, ?, ?)').run(
      input.date, input.category.trim(), round2(input.amount), input.note.trim(), userId,
    ).lastInsertRowid,
  )
}

export function listExpenses(db: DB, month?: string) {
  const where = month ? "WHERE strftime('%Y-%m', date) = ?" : ''
  return db.prepare(`SELECT e.*, u.name created_by_name FROM expenses e LEFT JOIN users u ON u.id = e.created_by ${where} ORDER BY date DESC, id DESC LIMIT 500`).all(...(month ? [month] : []))
}

// Month by month, in the server's local time (the service runs with
// TZ=Europe/Kyiv): what came in, what the goods cost, what else
// was spent. Paid orders count; cancelled ones and refunds come off.
export function profitByMonth(db: DB, months = 12) {
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m', o.paid_at, 'localtime') month,
        COUNT(*) orders,
        SUM(o.total - o.refund) revenue,
        SUM((SELECT COALESCE(SUM(COALESCE(i.cost, 0) * (i.qty - i.returned_qty)), 0) FROM order_items i WHERE i.order_id = o.id)) cogs,
        SUM((SELECT COALESCE(SUM(i.qty - i.returned_qty), 0) FROM order_items i WHERE i.order_id = o.id)) pieces,
        SUM((SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.cost IS NULL)) uncosted
       FROM orders o WHERE o.paid_at IS NOT NULL AND o.status != 'cancelled'
       GROUP BY month ORDER BY month DESC LIMIT ?`,
    )
    .all(months) as Array<{ month: string; orders: number; revenue: number; cogs: number; pieces: number; uncosted: number }>
  const expenses = db
    .prepare(`SELECT strftime('%Y-%m', date) month, SUM(amount) amount FROM expenses GROUP BY month`)
    .all() as Array<{ month: string; amount: number }>
  const expenseMap = new Map(expenses.map((e) => [e.month, e.amount]))
  const months_ = new Set([...rows.map((r) => r.month), ...expenses.map((e) => e.month)])
  return [...months_]
    .sort()
    .reverse()
    .slice(0, months)
    .map((month) => {
      const r = rows.find((x) => x.month === month)
      const revenue = r?.revenue ?? 0
      const cogs = round2(r?.cogs ?? 0)
      const spent = round2(expenseMap.get(month) ?? 0)
      return {
        month,
        orders: r?.orders ?? 0,
        pieces: r?.pieces ?? 0,
        revenue,
        cogs,
        gross: round2(revenue - cogs),
        expenses: spent,
        profit: round2(revenue - cogs - spent),
        uncosted: r?.uncosted ?? 0,
      }
    })
}

export function stockValue(db: DB) {
  return db
    .prepare('SELECT COALESCE(SUM(v.stock), 0) pieces, COALESCE(SUM(v.stock * COALESCE(v.cost, 0)), 0) cost, COALESCE(SUM(v.stock * p.price), 0) retail FROM variants v JOIN products p ON p.id = v.product_id WHERE p.status != \'archived\'')
    .get() as { pieces: number; cost: number; retail: number }
}

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import sharp from 'sharp'
import type { FastifyInstance } from 'fastify'
import type { DB } from '../src/db.js'

// setup.ts has to finish (mock servers up, environment set) before config.ts
// is read, so everything from src is imported after it.
const { npCalls, np, telegramCalls } = await import('./setup.js')
const { buildApp } = await import('../src/app.js')
const { hashPassword, resetRateLimits } = await import('../src/auth.js')
const { openDb } = await import('../src/db.js')
const { saveSettings } = await import('../src/settings.js')
const { handleUpdate, notifyOnOrders } = await import('../src/telegram.js')
const { overdueReservations } = await import('../src/orders.js')
const { backup } = await import('../src/jobs.js')

let app: FastifyInstance
let db: DB
const cookies: Record<string, string> = {}

type Res = { status: number; body: any; cookies: Record<string, string> }

async function call(method: string, url: string, body?: unknown, who?: string, headers: Record<string, string> = {}): Promise<Res> {
  const res = await app.inject({
    method: method as 'GET',
    url,
    payload: body as object,
    headers: { ...(who ? { cookie: cookies[who] } : {}), ...headers },
  })
  const set: Record<string, string> = {}
  for (const c of res.cookies) set[c.name] = c.value
  let parsed: unknown = res.body
  try {
    parsed = JSON.parse(res.body)
  } catch {
    /* not json */
  }
  return { status: res.statusCode, body: parsed, cookies: set }
}

async function login(who: string, password: string, extraCookie = '') {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: who, password }, headers: extraCookie ? { cookie: extraCookie } : {} })
  const session = res.cookies.find((c) => c.name === 'dm_session')
  if (session) cookies[who] = `dm_session=${session.value}`
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

async function upload(who: string, width = 1200, height = 1500): Promise<{ id: number; s: string; m: string; l: string }> {
  const img = await sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 220 } } }).jpeg().toBuffer()
  const boundary = '----dm' + Math.random().toString(16).slice(2)
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    img,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const res = await app.inject({ method: 'POST', url: '/api/admin/media', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie: cookies[who] } })
  assert.equal(res.statusCode, 200, res.body)
  return JSON.parse(res.body)
}

const delivery = {
  lastName: 'Шевченко',
  firstName: 'Олена',
  phone: '067 123 45 67',
  telegram: '@olena_s',
  cityName: 'Київ',
  cityRef: 'db5c88e0-391c-11dd-90d9-001a92567626',
  warehouseName: 'Відділення №5: вул. Хрещатик, 1',
  warehouseRef: '1ec09d88-e1c2-11e3-8c4a-0050568002cf',
  warehouseKind: 'branch',
}

before(async () => {
  db = openDb(':memory:')
  app = await buildApp(db)
  notifyOnOrders(db, () => undefined)
  db.prepare('INSERT INTO users (login, name, role, password_hash) VALUES (?, ?, ?, ?)').run('anna', 'Анна', 'owner', await hashPassword('anna-password-1'))
  db.prepare('INSERT INTO users (login, name, role, password_hash) VALUES (?, ?, ?, ?)').run('olya', 'Оля', 'manager', await hashPassword('olya-password-1'))
})

after(async () => {
  await app.close()
})

describe('login', () => {
  test('wrong password is refused, right one opens the admin', async () => {
    assert.equal((await call('GET', '/api/admin/dashboard')).status, 401)
    assert.equal((await login('anna', 'nope')).status, 401)
    assert.equal((await login('nobody', 'nope')).status, 401)
    const ok = await login('anna', 'anna-password-1')
    assert.equal(ok.status, 200)
    assert.equal(ok.body.ok, true)
    const me = await call('GET', '/api/auth/me', undefined, 'anna')
    assert.equal(me.body.user.role, 'owner')
    assert.equal(me.body.can.finance, true)
    assert.equal((await login('olya', 'olya-password-1')).status, 200)
  })

  test('requests from another site are refused', async () => {
    const res = await call('POST', '/api/admin/categories', { name: 'X' }, 'anna', { origin: 'https://evil.example' })
    assert.equal(res.status, 403)
  })

  test('managers stay out of money, settings and staff', async () => {
    assert.equal((await call('GET', '/api/admin/finance', undefined, 'olya')).status, 403)
    assert.equal((await call('GET', '/api/admin/settings', undefined, 'olya')).status, 403)
    assert.equal((await call('GET', '/api/admin/users', undefined, 'olya')).status, 403)
    assert.equal((await call('GET', '/api/admin/dashboard', undefined, 'olya')).status, 200)
  })

  test('with Telegram linked, a new device needs the code from the bot', async () => {
    const token = await call('POST', '/api/admin/settings/telegram/token', { token: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij' }, 'anna')
    assert.equal(token.status, 200, JSON.stringify(token.body))
    assert.equal(token.body.username, 'damark_test_bot')

    // Linking: the admin gives a t.me link, the bot gets /start u_<token>.
    const link = await call('POST', '/api/auth/telegram-link', {}, 'anna')
    const payload = /start=(u_[\w-]+)/.exec(link.body.url)![1]
    await handleUpdate(db, 'x', { update_id: 1, message: { message_id: 1, chat: { id: 555, type: 'private' }, from: { id: 555, username: 'anna_tg' }, text: `/start ${payload}` } })
    assert.equal((db.prepare("SELECT tg_user_id FROM users WHERE login = 'anna'").get() as { tg_user_id: number }).tg_user_id, 555)

    resetRateLimits()
    const first = await login('anna', 'anna-password-1')
    assert.ok(first.body.challenge, 'asks for a code')
    const sent = telegramCalls.filter((c) => c.path.endsWith('/sendMessage') && c.body.chat_id === 555).at(-1)!
    const code = /<code>(\d{6})<\/code>/.exec(String(sent.body.text))![1]

    assert.equal((await call('POST', '/api/auth/verify', { challenge: first.body.challenge, code: '000000' })).status, 400)
    const verified = await app.inject({ method: 'POST', url: '/api/auth/verify', payload: { challenge: first.body.challenge, code, remember: true } })
    assert.equal(verified.statusCode, 200, verified.body)
    const device = verified.cookies.find((c) => c.name === 'dm_device')!
    const session = verified.cookies.find((c) => c.name === 'dm_session')!
    cookies.anna = `dm_session=${session.value}`

    // The same device next time: password only.
    const again = await login('anna', 'anna-password-1', `dm_device=${device.value}`)
    assert.equal(again.body.ok, true)
    cookies.anna = `dm_session=${session.value}`
  })
})

let productId = 0
let variantM = 0
let variantL = 0

describe('catalog', () => {
  test('a product with photos and sizes goes live', async () => {
    const cat = await call('POST', '/api/admin/categories', { name: 'Сукні' }, 'anna')
    assert.equal(cat.status, 200)
    const p1 = await upload('olya')
    const p2 = await upload('olya', 900, 600)
    assert.match(p1.m, /^\/media\/\d{4}\/[\w-]+-m\.webp$/)

    const draft = await call(
      'POST',
      '/api/admin/products',
      {
        title: 'Сукня льняна Міді',
        description: 'Легка сукня з льону.',
        categoryId: cat.body.id,
        brand: 'DaMark',
        price: 1450,
        oldPrice: 1800,
        composition: '100% льон',
        care: 'Делікатне прання 30°',
        status: 'active',
        isNew: true,
        photoIds: [p1.id, p2.id],
        sizeChart: { columns: ['Розмір', 'Груди'], rows: [['M', '90'], ['L', '96']] },
        variants: [
          { size: 'M', color: 'Бежевий', stock: 2, cost: 600 },
          { size: 'L', color: 'Бежевий', stock: 1, cost: 600 },
        ],
      },
      'olya',
    )
    assert.equal(draft.status, 200, JSON.stringify(draft.body))
    productId = draft.body.id
    assert.equal(draft.body.slug, 'suknia-lniana-midi')
    assert.equal(draft.body.photos.length, 2)
    // A manager cannot set or see purchase cost.
    assert.equal(draft.body.variants[0].cost, undefined)
    const asOwner = await call('GET', `/api/admin/products/${productId}`, undefined, 'anna')
    assert.equal(asOwner.body.variants[0].cost, null)
    variantM = asOwner.body.variants[0].id
    variantL = asOwner.body.variants[1].id

    // Each photo exists in three WebP sizes; nothing else is kept.
    const dir = path.join(process.env.DATA_DIR!, 'media', p1.m.split('/')[2])
    assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).length, 6)
    const full = await sharp(path.join(process.env.DATA_DIR!, p1.l)).metadata()
    assert.equal(full.format, 'webp')
    assert.equal(full.height, 1500)
    const small = await sharp(path.join(process.env.DATA_DIR!, p1.s)).metadata()
    assert.equal(small.width, 384)
  })

  test('buyers find it by search, size and category', async () => {
    const list = await call('GET', '/api/products?q=СУКНЯ%20міді')
    assert.equal(list.body.total, 1)
    assert.deepEqual(list.body.items[0].sizes, ['M', 'L'])
    assert.equal(list.body.items[0].oldPrice, 1800)
    assert.equal((await call('GET', '/api/products?size=XL')).body.total, 0)
    assert.equal((await call('GET', '/api/products?size=L&category=sukni')).body.total, 1)
    assert.equal((await call('GET', '/api/products?sale=1&new=1')).body.total, 1)
    const facets = await call('GET', '/api/facets?category=sukni')
    assert.deepEqual(facets.body.sizes, ['M', 'L'])
    assert.deepEqual(facets.body.brands.map((b: { name: string }) => b.name), ['DaMark'])
    const page = await call('GET', '/api/products/suknia-lniana-midi')
    assert.equal(page.body.photos.length, 2)
    assert.equal(page.body.sizeChart.rows.length, 2)
    const shop = await call('GET', '/api/shop')
    assert.equal(shop.body.categories.length, 1)
    assert.equal(shop.body.payment.iban, 'UA073220010000026000350010013')
  })

  test('the product page carries its own preview for Telegram', async () => {
    const res = await app.inject({ method: 'GET', url: '/p/suknia-lniana-midi' })
    assert.match(res.body, /<title>Сукня льняна Міді — 1450 грн · DaMark shop<\/title>/)
    assert.match(res.body, /og:image" content="https:\/\/new\.damark\.test\/media\/.+-m\.webp"/)
  })

  test('drafts stay hidden', async () => {
    await call('POST', '/api/admin/products', { title: 'Чернетка', price: 100, status: 'draft' }, 'anna')
    assert.equal((await call('GET', '/api/products?q=чернетка')).body.total, 0)
    assert.equal((await call('GET', '/api/products/chernetka')).status, 404)
  })
})

let orderToken = ''
let orderId = 0

describe('orders', () => {
  test('nova poshta lookups for the order form', async () => {
    const cities = await call('GET', '/api/np/cities?q=Київ')
    assert.equal(cities.body[0].name, 'Київ')
    const branches = await call('GET', `/api/np/warehouses?city=${cities.body[0].ref}`)
    assert.deepEqual(branches.body.map((b: { kind: string }) => b.kind), ['branch', 'postomat'])
    // A second lookup is served from the cache.
    const before = npCalls.length
    await call('GET', '/api/np/cities?q=київ')
    assert.equal(npCalls.length, before)
  })

  test('placing an order takes the pieces from stock and the bot tells the team', async () => {
    saveSettings(db, 'telegram', { teamChatId: -100 })
    const res = await call('POST', '/api/orders', { ...delivery, items: [{ variantId: variantM, qty: 2 }, { variantId: variantL, qty: 1 }], agree: true })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.number, 1001)
    orderToken = res.body.token
    orderId = (db.prepare('SELECT id FROM orders WHERE token = ?').get(orderToken) as { id: number }).id
    const stock = db.prepare('SELECT stock FROM variants WHERE product_id = ? ORDER BY sort').all(productId) as Array<{ stock: number }>
    assert.deepEqual(stock.map((s) => s.stock), [0, 0])
    const view = await call('GET', `/api/orders/${orderToken}`)
    assert.equal(view.body.total, 4350)
    assert.equal(view.body.phone, '+380671234567')
    assert.equal(view.body.payment.purpose, 'Оплата за товар, замовлення №1001')
    await new Promise((r) => setTimeout(r, 50))
    const team = telegramCalls.filter((c) => c.body.chat_id === -100).at(-1)!
    assert.match(String(team.body.text), /Замовлення №1001/)
    assert.equal((team.body.reply_markup as any).inline_keyboard[0][0].callback_data, `take:${orderId}`)
  })

  test('sold-out pieces cannot be ordered again', async () => {
    const res = await call('POST', '/api/orders', { ...delivery, items: [{ variantId: variantM, qty: 1 }], agree: true })
    assert.equal(res.status, 409)
    const list = await call('GET', '/api/products?q=сукня')
    assert.equal(list.body.items[0].inStock, false)
  })

  test('a manager takes it from the team chat with one tap', async () => {
    db.prepare("UPDATE users SET tg_user_id = 777 WHERE login = 'olya'").run()
    await handleUpdate(db, 'x', { update_id: 2, callback_query: { id: 'cb1', from: { id: 777 }, data: `take:${orderId}` } })
    const order = await call('GET', `/api/admin/orders/${orderId}`, undefined, 'anna')
    assert.equal(order.body.manager.name, 'Оля')
  })

  test('the buyer follows the order in Telegram', async () => {
    const res = await call('POST', `/api/orders/${orderToken}/telegram`, {})
    const payload = /start=(o_[\w-]+)/.exec(res.body.url)![1]
    await handleUpdate(db, 'x', { update_id: 3, message: { message_id: 2, chat: { id: 9001, type: 'private' }, from: { id: 9001 }, text: `/start ${payload}` } })
    const msg = telegramCalls.filter((c) => c.body.chat_id === 9001).at(-1)!
    assert.match(String(msg.body.text), /UA073220010000026000350010013/)
  })

  test('paid, shipped with a TTN from Nova Poshta, tracked to the branch and picked up', async () => {
    assert.equal((await call('POST', `/api/admin/orders/${orderId}/ttn`, {}, 'anna')).status, 409, 'not before payment')
    assert.equal((await call('POST', `/api/admin/orders/${orderId}/status`, { status: 'paid' }, 'olya')).status, 200)
    saveSettings(db, 'novaPoshta', {
      apiKey: 'k', senderRef: 's', contactRef: 'c', senderPhone: '+380671770035', senderCityRef: 'city', senderWarehouseRef: 'wh',
    })
    const ttn = await call('POST', `/api/admin/orders/${orderId}/ttn`, {}, 'olya')
    assert.equal(ttn.status, 200, JSON.stringify(ttn.body))
    assert.equal(ttn.body.ttn, '20450000000001')
    const doc = npCalls.find((c) => c.body.modelName === 'InternetDocument' && c.body.calledMethod === 'save')!
    const props = doc.body.methodProperties as Record<string, string>
    assert.equal(props.RecipientsPhone, '380671234567')
    assert.equal(props.Cost, '4350')
    const recipient = npCalls.find((c) => c.body.modelName === 'Counterparty' && c.body.calledMethod === 'save')!
    assert.equal((recipient.body.methodProperties as Record<string, string>).LastName, 'Шевченко')

    await new Promise((r) => setTimeout(r, 20))
    assert.match(String(telegramCalls.filter((c) => c.body.chat_id === 9001).at(-1)!.body.text), /20450000000001/)

    np.trackingCode = 7
    const arrived = await call('POST', `/api/admin/orders/${orderId}/track`, {}, 'olya')
    assert.equal(arrived.body.status, 'arrived')
    np.trackingCode = 9
    np.trackingText = 'Відправлення отримано'
    const received = await call('POST', `/api/admin/orders/${orderId}/track`, {}, 'olya')
    assert.equal(received.body.status, 'received')
  })

  test('part of it comes back: stock and refund follow', async () => {
    const order = await call('GET', `/api/admin/orders/${orderId}`, undefined, 'anna')
    const lineM = order.body.items.find((i: { size: string }) => i.size === 'M')
    const res = await call('POST', `/api/admin/orders/${orderId}/return`, { items: [{ itemId: lineM.id, qty: 1 }], refund: 1450 }, 'olya')
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal((db.prepare('SELECT stock FROM variants WHERE id = ?').get(variantM) as { stock: number }).stock, 1)
    const after = await call('GET', `/api/admin/orders/${orderId}`, undefined, 'anna')
    assert.equal(after.body.status, 'received')
    assert.equal(after.body.refund, 1450)
    // Too much back is refused.
    assert.equal((await call('POST', `/api/admin/orders/${orderId}/return`, { items: [{ itemId: lineM.id, qty: 5 }], refund: 0 }, 'olya')).status, 400)
  })

  test('cancelling an unpaid order puts the pieces back', async () => {
    const res = await call('POST', '/api/orders', { ...delivery, items: [{ variantId: variantM, qty: 1 }], agree: true })
    const id = (db.prepare('SELECT id FROM orders WHERE token = ?').get(res.body.token) as { id: number }).id
    assert.equal((db.prepare('SELECT stock FROM variants WHERE id = ?').get(variantM) as { stock: number }).stock, 0)
    // Its reservation runs out.
    db.prepare("UPDATE orders SET reserved_until = datetime('now', '-1 minute') WHERE id = ?").run(id)
    assert.ok(overdueReservations(db).some((o) => o.id === id))
    assert.equal((await call('POST', `/api/admin/orders/${id}/status`, { status: 'cancelled' }, 'olya')).status, 200)
    assert.equal((db.prepare('SELECT stock FROM variants WHERE id = ?').get(variantM) as { stock: number }).stock, 1)
    assert.equal((await call('POST', `/api/admin/orders/${id}/status`, { status: 'paid' }, 'olya')).status, 409)
  })

  test('orders entered by staff, with a discount', async () => {
    const res = await call('POST', '/api/admin/orders', { ...delivery, phone: '+380501112233', items: [{ variantId: variantM, qty: 1 }], discount: 150, note: 'з Instagram' }, 'olya')
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const order = await call('GET', `/api/admin/orders/${res.body.id}`, undefined, 'olya')
    assert.equal(order.body.total, 1300)
    assert.equal(order.body.source, 'admin')
    assert.equal(order.body.manager.name, 'Оля')
    assert.equal(order.body.items[0].cost, undefined)
    const search = await call('GET', '/api/admin/orders?status=all&q=0501112233', undefined, 'olya')
    assert.equal(search.body.items.length, 1)
  })
})

describe('money', () => {
  test('a purchase adds stock and averages the cost', async () => {
    const res = await call('POST', '/api/admin/purchases', { date: '2026-10-20', supplier: 'Склад 7км', extraCost: 100, items: [{ variantId: variantL, qty: 4, unitCost: 500 }] }, 'anna')
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const v = db.prepare('SELECT stock, cost FROM variants WHERE id = ?').get(variantL) as { stock: number; cost: number }
    assert.equal(v.stock, 4)
    assert.equal(v.cost, 525)
    assert.equal((await call('POST', '/api/admin/purchases', { date: '2026-10-20', items: [{ variantId: variantL, qty: 1, unitCost: 1 }] }, 'olya')).status, 403)
  })

  test('profit for the month: paid orders less refunds, cost of goods and expenses', async () => {
    await call('POST', '/api/admin/expenses', { date: new Date().toISOString().slice(0, 10), category: 'Реклама', amount: 300 }, 'anna')
    const fin = await call('GET', '/api/admin/finance', undefined, 'anna')
    const month = fin.body.months[0]
    assert.equal(month.orders, 1)
    assert.equal(month.revenue, 4350 - 1450)
    assert.equal(month.expenses, 300)
    assert.equal(month.uncosted, 2, 'pieces sold before any cost was known are flagged')
    assert.ok(fin.body.stock.pieces >= 4)
  })
})

describe('reviews and pages', () => {
  test('a review waits for approval, then shows on the product', async () => {
    const res = await call('POST', '/api/reviews', { productId, name: 'Олена', rating: 5, text: 'Сукня чудова, розмір у розмір!' })
    assert.equal(res.status, 200)
    assert.equal((await call('GET', '/api/products/suknia-lniana-midi')).body.reviews.length, 0)
    await call('PATCH', `/api/admin/reviews/${res.body.id}`, { status: 'approved', reply: 'Дякуємо!' }, 'olya')
    const page = await call('GET', '/api/products/suknia-lniana-midi')
    assert.equal(page.body.reviews[0].reply, 'Дякуємо!')
  })

  test('legal pages carry the current requisites', async () => {
    const offer = await call('GET', '/api/pages/offer')
    assert.match(offer.body.body, /ФОП Маловік Євгенія Володимирівна, РНОКПП 3110406220/)
    assert.match(offer.body.body, /new\.damark\.test/)
  })
})

describe('backup', () => {
  test('database copy and hard-linked photos', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'damark-backup-'))
    await backup(db, dir)
    assert.ok(fs.existsSync(path.join(dir, 'damark.sqlite')))
    assert.ok(fs.existsSync(path.join(dir, 'done')))
    const sub = fs.readdirSync(path.join(dir, 'media'))[0]
    const file = fs.readdirSync(path.join(dir, 'media', sub))[0]
    const a = fs.statSync(path.join(dir, 'media', sub, file))
    const b = fs.statSync(path.join(process.env.DATA_DIR!, 'media', sub, file))
    assert.equal(a.ino, b.ino)
  })
})

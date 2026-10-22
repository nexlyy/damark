import type { DB } from './db.js'
import { config } from './config.js'
import { getOrder, logEvent, orderEvents, orderItems, type OrderRow, type OrderStatus } from './orders.js'
import { getSettings, saveSettings } from './settings.js'
import { addHours, fail, parseSqlTime, randomToken, sqlTime } from './util.js'

// The bot runs on long polling: no inbound webhook, so it works while the
// site sits behind a password, and nothing else has to be exposed.

export type Update = {
  update_id: number
  message?: { message_id: number; chat: { id: number; type: string; title?: string }; from?: TgUser; text?: string }
  callback_query?: { id: string; from: TgUser; data?: string; message?: { message_id: number; chat: { id: number }; text?: string } }
}
type TgUser = { id: number; username?: string; first_name?: string }

export async function tg<T = unknown>(token: string, method: string, params: object = {}, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(`${config.telegramApi}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string }
  if (!body.ok) throw new Error(`Telegram ${method}: ${body.description ?? res.status}`)
  return body.result as T
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const money = (n: number) => `${n.toLocaleString('uk-UA').replace(/ /g, ' ')} грн`
const kyivTime = (sql: string) =>
  parseSqlTime(sql).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function botReady(db: DB) {
  return !!getSettings(db, 'telegram').botToken
}

export async function send(db: DB, chatId: number, text: string, extra: object = {}) {
  const { botToken } = getSettings(db, 'telegram')
  if (!botToken || !chatId) return null
  return tg<{ message_id: number }>(botToken, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra })
}

// /start payloads: u_<token> ties a staff account, o_<token> an order.
export function startLink(db: DB, kind: 'user' | 'order', refId: number) {
  const { botUsername, botToken } = getSettings(db, 'telegram')
  if (!botToken || !botUsername) fail(400, 'Telegram-бот ще не підключений у налаштуваннях.')
  db.prepare("DELETE FROM tg_links WHERE expires_at < datetime('now')").run()
  const token = randomToken(18)
  db.prepare('INSERT INTO tg_links (token, kind, ref_id, expires_at) VALUES (?, ?, ?, ?)').run(token, kind, refId, sqlTime(addHours(kind === 'user' ? 1 : 24 * 30)))
  return `https://t.me/${botUsername}?start=${kind[0]}_${token}`
}

function orderLines(db: DB, order: OrderRow) {
  return orderItems(db, order.id)
    .map((i) => `• ${esc(i.title)}${i.size || i.color ? ` — ${esc([i.size, i.color].filter(Boolean).join(' / '))}` : ''} × ${i.qty} — ${money(i.price * i.qty)}`)
    .join('\n')
}

function adminLink(orderId: number) {
  return `${config.publicUrl}/admin/orders/${orderId}`
}

function urlButton(text: string, url: string) {
  // Telegram only takes public https links on buttons.
  return /^https:\/\//.test(url) ? [{ text, url }] : []
}

function teamText(db: DB, order: OrderRow) {
  const manager = order.manager_id ? (db.prepare('SELECT name FROM users WHERE id = ?').get(order.manager_id) as { name: string } | undefined) : undefined
  const flagged = (db.prepare('SELECT blacklisted FROM customers WHERE id = ?').get(order.customer_id) as { blacklisted: number } | undefined)?.blacklisted
  return [
    `🛍 <b>Замовлення №${order.number}</b> · ${money(order.total)}${order.source === 'admin' ? ' · з адмінки' : ''}`,
    `${esc(order.name)}, ${esc(order.phone)}${order.telegram ? `, @${esc(order.telegram)}` : ''}`,
    `${esc(order.city_name)}, ${esc(order.warehouse_name)}`,
    '',
    orderLines(db, order),
    order.buyer_note ? `\n💬 ${esc(order.buyer_note)}` : '',
    order.status === 'new' && order.reserved_until ? `\nБронь до ${kyivTime(order.reserved_until)}` : '',
    flagged ? '\n⚠️ Клієнт у чорному списку' : '',
    manager ? `\n👤 Взяв(ла): ${esc(manager.name)}` : '',
  ]
    .filter((l) => l !== '')
    .join('\n')
}

function teamKeyboard(order: OrderRow) {
  const row = [...(order.manager_id ? [] : [{ text: '✋ Беру', callback_data: `take:${order.id}` }]), ...urlButton('Відкрити', adminLink(order.id))]
  return row.length ? { inline_keyboard: [row] } : undefined
}

export async function announceOrder(db: DB, orderId: number) {
  const { teamChatId } = getSettings(db, 'telegram')
  if (!teamChatId) return
  const order = getOrder(db, orderId)
  const sent = await send(db, teamChatId, teamText(db, order), { reply_markup: teamKeyboard(order) })
  if (sent) db.prepare('UPDATE orders SET team_message_id = ? WHERE id = ?').run(sent.message_id, orderId)
}

export async function refreshTeamMessage(db: DB, orderId: number) {
  const { teamChatId, botToken } = getSettings(db, 'telegram')
  const order = getOrder(db, orderId)
  if (!teamChatId || !botToken || !order.team_message_id) return
  await tg(botToken, 'editMessageText', {
    chat_id: teamChatId,
    message_id: order.team_message_id,
    text: teamText(db, order),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: teamKeyboard(order),
  }).catch(() => undefined)
}

export async function toTeam(db: DB, text: string, orderId?: number) {
  const { teamChatId } = getSettings(db, 'telegram')
  if (!teamChatId) return
  const buttons = orderId ? urlButton('Відкрити', adminLink(orderId)) : []
  await send(db, teamChatId, text, buttons.length ? { reply_markup: { inline_keyboard: [buttons] } } : {})
}

function paymentText(db: DB, order: OrderRow) {
  const p = getSettings(db, 'payment')
  return [
    `Сума до сплати: <b>${money(order.total)}</b>`,
    `Отримувач: ${esc(p.recipient)}`,
    `IBAN: <code>${esc(p.iban)}</code>`,
    `ІПН / ЄДРПОУ: <code>${esc(p.taxId)}</code>`,
    `Призначення: <code>${esc(p.purpose.replace('{number}', String(order.number)))}</code>`,
  ].join('\n')
}

function buyerText(db: DB, order: OrderRow, status: OrderStatus): string | null {
  const head = `Замовлення №${order.number}`
  switch (status) {
    case 'new':
      return [
        `${head} прийнято ✅`,
        '',
        orderLines(db, order),
        '',
        paymentText(db, order),
        order.reserved_until ? `\nРечі заброньовані до ${kyivTime(order.reserved_until)}. Після оплати надішліть, будь ласка, квитанцію менеджеру.` : '',
      ].join('\n')
    case 'paid':
      return `${head}: оплату отримано 💙 Готуємо до відправки.`
    case 'shipped':
      return `${head} відправлено Новою поштою.\nТТН: <code>${order.ttn}</code>`
    case 'arrived':
      return `${head} чекає на вас: ${esc(order.warehouse_name)}.\nТТН: <code>${order.ttn}</code>`
    case 'received':
      return `${head} отримано. Дякуємо, що обрали DaMark! Будемо раді вашому відгуку на сайті.`
    case 'cancelled':
      return `${head} скасовано. Якщо це помилка — напишіть менеджеру.`
    default:
      return null
  }
}

export async function toBuyer(db: DB, orderId: number, status: OrderStatus) {
  const order = getOrder(db, orderId)
  if (!order.tg_chat_id) return
  const text = buyerText(db, order, status)
  if (!text) return
  const link = `${config.publicUrl}/order/${order.token}`
  await send(db, order.tg_chat_id, text, urlButton('Замовлення на сайті', link).length ? { reply_markup: { inline_keyboard: [urlButton('Замовлення на сайті', link)] } } : {})
}

export async function sendLoginCode(db: DB, tgUserId: number, code: string) {
  await send(db, tgUserId, `Код для входу в адмінку DaMark: <code>${code}</code>\nДіє 10 хвилин. Нікому його не пересилайте.`)
}

export async function handleUpdate(db: DB, token: string, u: Update) {
  const msg = u.message
  if (msg?.text) {
    const text = msg.text.trim()
    const start = /^\/start(?:@\w+)?(?:\s+([uo])_([\w-]+))?$/.exec(text)
    if (start && msg.chat.type === 'private') {
      const [, kind, linkToken] = start
      if (!kind) {
        await send(db, msg.chat.id, `Вітаємо в DaMark shop 💙\nТут приходитимуть статуси ваших замовлень.\n${config.publicUrl}`)
        return
      }
      const link = db.prepare("SELECT kind, ref_id FROM tg_links WHERE token = ? AND expires_at > datetime('now')").get(linkToken) as
        | { kind: 'user' | 'order'; ref_id: number }
        | undefined
      if (!link || link.kind[0] !== kind) {
        await send(db, msg.chat.id, 'Посилання застаріло. Відкрийте його ще раз із сайту.')
        return
      }
      if (link.kind === 'user') {
        db.prepare('UPDATE users SET tg_user_id = NULL WHERE tg_user_id = ?').run(msg.from?.id ?? msg.chat.id)
        db.prepare('UPDATE users SET tg_user_id = ?, tg_username = ? WHERE id = ?').run(msg.from?.id ?? msg.chat.id, msg.from?.username ?? null, link.ref_id)
        db.prepare('DELETE FROM tg_links WHERE token = ?').run(linkToken)
        const user = db.prepare('SELECT name FROM users WHERE id = ?').get(link.ref_id) as { name: string }
        await send(db, msg.chat.id, `Готово, ${esc(user.name)}! Сюди приходитимуть коди для входу в адмінку DaMark.`)
      } else {
        const order = getOrder(db, link.ref_id)
        db.prepare('UPDATE orders SET tg_chat_id = ? WHERE id = ?').run(msg.chat.id, order.id)
        db.prepare('UPDATE customers SET tg_chat_id = ? WHERE id = ?').run(msg.chat.id, order.customer_id)
        logEvent(db, order.id, null, 'Покупець підписався на статуси в Telegram')
        await toBuyer(db, order.id, order.status === 'new' ? 'new' : order.status)
      }
      return
    }
    const bind = /^\/bind(?:@\w+)?\s+(\S+)$/.exec(text)
    if (bind && msg.chat.type !== 'private') {
      const settings = getSettings(db, 'telegram')
      if (settings.bindCode && bind[1] === settings.bindCode) {
        saveSettings(db, 'telegram', { teamChatId: msg.chat.id, teamChatTitle: msg.chat.title ?? '', bindCode: '' })
        await send(db, msg.chat.id, 'Готово: сюди приходитимуть нові замовлення DaMark.')
      }
      return
    }
  }

  const cb = u.callback_query
  if (cb?.data) {
    const take = /^take:(\d+)$/.exec(cb.data)
    if (take) {
      const staff = db.prepare('SELECT id, name FROM users WHERE tg_user_id = ? AND disabled = 0').get(cb.from.id) as { id: number; name: string } | undefined
      if (!staff) {
        await tg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Спершу привʼяжіть Telegram у своєму профілі в адмінці.', show_alert: true })
        return
      }
      const orderId = Number(take[1])
      const order = getOrder(db, orderId)
      if (order.manager_id && order.manager_id !== staff.id) {
        await tg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Це замовлення вже взяли.' })
      } else {
        db.prepare('UPDATE orders SET manager_id = ? WHERE id = ?').run(staff.id, orderId)
        logEvent(db, orderId, staff.id, `Взяв(ла) в роботу: ${staff.name}`)
        await tg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: `Замовлення №${order.number} — ваше.` })
      }
      await refreshTeamMessage(db, orderId)
    }
  }
}

let polling = false

export function startBot(db: DB, log: (msg: string) => void) {
  if (polling) return
  polling = true
  let activeToken = ''
  const loop = async () => {
    while (polling) {
      const settings = getSettings(db, 'telegram')
      if (!settings.botToken) {
        activeToken = ''
        await sleep(15_000)
        continue
      }
      try {
        if (activeToken !== settings.botToken) {
          await tg(settings.botToken, 'deleteWebhook', {})
          activeToken = settings.botToken
        }
        const updates = await tg<Update[]>(
          settings.botToken,
          'getUpdates',
          { offset: settings.updateOffset || undefined, timeout: 50, allowed_updates: ['message', 'callback_query'] },
          65_000,
        )
        for (const u of updates) {
          saveSettings(db, 'telegram', { updateOffset: u.update_id + 1 })
          await handleUpdate(db, settings.botToken, u).catch((e: Error) => log(`telegram update: ${e.message}`))
        }
      } catch (e) {
        log(`telegram: ${(e as Error).message}`)
        await sleep(10_000)
      }
    }
  }
  void loop()
  notifyOnOrders(db, log)
}

// Order events turn into messages: the team chat and the buyer.
export function notifyOnOrders(db: DB, log: (msg: string) => void) {
  orderEvents.on('created', (id) => {
    void announceOrder(db, id).catch((e: Error) => log(`telegram announce: ${e.message}`))
  })
  orderEvents.on('status', (id, status) => {
    void toBuyer(db, id, status).catch((e: Error) => log(`telegram buyer: ${e.message}`))
    void refreshTeamMessage(db, id)
    if (status === 'refused') {
      const o = getOrder(db, id)
      void toTeam(db, `↩️ Відмова від посилки №${o.number} (${esc(o.name)}). ТТН ${o.ttn}`, id).catch(() => undefined)
    }
  })
}

export function stopBot() {
  polling = false
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

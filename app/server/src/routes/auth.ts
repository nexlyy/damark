import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Ctx } from '../app.js'
import {
  can, checkChallenge, createChallenge, createSession, endSession, hashPassword, isTrustedDevice, rateLimit, sessionUser,
  trustDevice, verifyPassword, SESSION_COOKIE, type User,
} from '../auth.js'
import { config } from '../config.js'
import { botReady, sendLoginCode, startLink } from '../telegram.js'
import { fail, sha256 } from '../util.js'

// A real hash to compare against when the login does not exist, so both
// cases take the same time.
const dummyHash = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='

export function me(db: Ctx['db'], user: User) {
  return {
    user: { id: user.id, login: user.login, name: user.name, role: user.role, telegram: user.tg_username ?? (user.tg_user_id ? '✓' : null) },
    can: { finance: can.finance(user), settings: can.settings(user), staff: can.staff(user) },
    botReady: botReady(db),
  }
}

export const authRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  const { db } = ctx

  app.post('/login', async (req, reply) => {
    const { login, password } = z.object({ login: z.string().trim().min(1).max(64), password: z.string().min(1).max(200) }).parse(req.body)
    rateLimit(`login-ip:${req.ip}`, 10, 15 * 60_000)
    rateLimit(`login-user:${login.toLowerCase()}`, 10, 15 * 60_000)
    const row = db.prepare('SELECT id, password_hash, tg_user_id, disabled FROM users WHERE login = ?').get(login) as
      | { id: number; password_hash: string; tg_user_id: number | null; disabled: number }
      | undefined
    const ok = await verifyPassword(password, row?.password_hash ?? dummyHash)
    if (!row || !ok || row.disabled) fail(401, 'Невірний логін або пароль.')

    // With Telegram linked, a new device also needs the code from the bot.
    if (row.tg_user_id && botReady(db) && !isTrustedDevice(db, row.id, req)) {
      const challenge = createChallenge(db, row.id)
      try {
        await sendLoginCode(db, row.tg_user_id, challenge.code)
      } catch {
        fail(502, 'Не вдалося надіслати код у Telegram. Спробуйте ще раз.')
      }
      return { challenge: challenge.id }
    }
    createSession(db, row.id, req, reply, config.secureCookies)
    return { ok: true }
  })

  app.post('/verify', async (req, reply) => {
    const { challenge, code, remember } = z.object({ challenge: z.string().max(64), code: z.string().max(12), remember: z.boolean().default(true) }).parse(req.body)
    rateLimit(`verify-ip:${req.ip}`, 20, 15 * 60_000)
    const userId = checkChallenge(db, challenge, code)
    createSession(db, userId, req, reply, config.secureCookies)
    if (remember) trustDevice(db, userId, reply, config.secureCookies)
    return { ok: true }
  })

  app.post('/logout', async (req, reply) => {
    endSession(db, req, reply)
    return { ok: true }
  })

  app.get('/me', async (req, reply) => {
    const user = sessionUser(db, req)
    if (!user) return reply.status(401).send({ error: 'Увійдіть в адмінку.' })
    return me(db, user)
  })

  app.post('/telegram-link', async (req) => {
    const user = sessionUser(db, req)
    if (!user) fail(401, 'Увійдіть в адмінку.')
    return { url: startLink(db, 'user', user.id) }
  })

  app.post('/password', async (req) => {
    const user = sessionUser(db, req)
    if (!user) fail(401, 'Увійдіть в адмінку.')
    const { current, next } = z.object({ current: z.string().max(200), next: z.string().min(10, 'Новий пароль — щонайменше 10 символів.').max(200) }).parse(req.body)
    rateLimit(`password:${user.id}`, 10, 15 * 60_000)
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string }
    if (!(await verifyPassword(current, row.password_hash))) fail(400, 'Поточний пароль невірний.')
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), user.id)
    // Every other session ends; this one stays.
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(user.id, sha256(req.cookies[SESSION_COOKIE] ?? ''))
    return { ok: true }
  })
}

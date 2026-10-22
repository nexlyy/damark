import crypto from 'node:crypto'
import { promisify } from 'node:util'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { DB } from './db.js'
import { addHours, fail, randomToken, sha256, sqlTime } from './util.js'

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export type Role = 'owner' | 'manager' | 'dev'
export type User = { id: number; login: string; name: string; role: Role; tg_user_id: number | null; tg_username: string | null }

export const SESSION_COOKIE = 'dm_session'
export const DEVICE_COOKIE = 'dm_device'
const SESSION_DAYS = 30
const DEVICE_DAYS = 180

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt, 32, SCRYPT)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, key] = stored.split('$')
  if (kind !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64')
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, SCRYPT)
  return crypto.timingSafeEqual(actual, expected)
}

// Owner and developer see everything; managers work with products, orders
// and customers but not money, settings or staff.
export const can = {
  finance: (u: User) => u.role !== 'manager',
  settings: (u: User) => u.role !== 'manager',
  staff: (u: User) => u.role !== 'manager',
}

const userColumns = 'u.id, u.login, u.name, u.role, u.tg_user_id, u.tg_username'

export function createSession(db: DB, userId: number, req: FastifyRequest, reply: FastifyReply, secure: boolean) {
  const token = randomToken(32)
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?)').run(
    sha256(token), userId, sqlTime(addHours(SESSION_DAYS * 24)), String(req.headers['user-agent'] ?? '').slice(0, 300), req.ip,
  )
  reply.setCookie(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: SESSION_DAYS * 86400 })
}

export function sessionUser(db: DB, req: FastifyRequest): User | null {
  const token = req.cookies[SESSION_COOKIE]
  if (!token) return null
  const row = db.prepare(
    `SELECT ${userColumns} FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now') AND u.disabled = 0`,
  ).get(sha256(token)) as User | undefined
  return row ?? null
}

export function endSession(db: DB, req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE]
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token))
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

export function endAllSessions(db: DB, userId: number) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  db.prepare('DELETE FROM trusted_devices WHERE user_id = ?').run(userId)
}

export function isTrustedDevice(db: DB, userId: number, req: FastifyRequest): boolean {
  const token = req.cookies[DEVICE_COOKIE]
  if (!token) return false
  return !!db.prepare("SELECT 1 FROM trusted_devices WHERE id = ? AND user_id = ? AND expires_at > datetime('now')").get(sha256(token), userId)
}

export function trustDevice(db: DB, userId: number, reply: FastifyReply, secure: boolean) {
  const token = randomToken(32)
  db.prepare('INSERT INTO trusted_devices (id, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, sqlTime(addHours(DEVICE_DAYS * 24)))
  reply.setCookie(DEVICE_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: DEVICE_DAYS * 86400 })
}

// A six-digit code sent by the bot. Returns the challenge id and the code;
// only the hash is stored.
export function createChallenge(db: DB, userId: number): { id: string; code: string } {
  db.prepare("DELETE FROM login_challenges WHERE user_id = ? OR expires_at < datetime('now')").run(userId)
  const id = randomToken(18)
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  db.prepare('INSERT INTO login_challenges (id, user_id, code_hash, expires_at) VALUES (?, ?, ?, ?)').run(
    id, userId, sha256(`${id}:${code}`), sqlTime(addHours(10 / 60)),
  )
  return { id, code }
}

export function checkChallenge(db: DB, id: string, code: string): number {
  const row = db.prepare("SELECT user_id, code_hash, attempts FROM login_challenges WHERE id = ? AND expires_at > datetime('now')").get(id) as
    | { user_id: number; code_hash: string; attempts: number }
    | undefined
  if (!row) fail(400, 'Код застарів. Увійдіть ще раз.')
  if (row!.attempts >= 5) {
    db.prepare('DELETE FROM login_challenges WHERE id = ?').run(id)
    fail(429, 'Забагато спроб. Увійдіть ще раз.')
  }
  const ok = crypto.timingSafeEqual(Buffer.from(sha256(`${id}:${code.trim()}`)), Buffer.from(row!.code_hash))
  if (!ok) {
    db.prepare('UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?').run(id)
    fail(400, 'Невірний код.')
  }
  db.prepare('DELETE FROM login_challenges WHERE id = ?').run(id)
  return row!.user_id
}

// Fixed windows per key, in memory: one process serves the whole shop.
const hits = new Map<string, { count: number; reset: number }>()
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const hit = hits.get(key)
  if (!hit || hit.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs })
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
    return
  }
  hit.count++
  if (hit.count > limit) fail(429, 'Забагато запитів. Спробуйте трохи пізніше.')
}

export function resetRateLimits() {
  hits.clear()
}

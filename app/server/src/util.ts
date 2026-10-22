import crypto from 'node:crypto'

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// A function declaration, so TypeScript narrows after `if (...) fail(...)`.
export function fail(status: number, message: string): never {
  throw new HttpError(status, message)
}

// SQLite's datetime('now') format, in UTC: "2026-10-23 14:05:00".
export function sqlTime(date = new Date()): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

export function addHours(hours: number, from = new Date()): Date {
  return new Date(from.getTime() + hours * 3600_000)
}

export function parseSqlTime(value: string): Date {
  return new Date(value.replace(' ', 'T') + 'Z')
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

// Ukrainian national transliteration (2010), enough for readable URLs.
const translit: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i',
  й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh',
  ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'e', ъ: '',
}

export function slugify(text: string): string {
  const latin = Array.from(text.toLowerCase(), (ch) => translit[ch] ?? ch).join('')
  return latin.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item'
}

// What search compares against: lower case, ё/е and ʼ variants folded.
export function searchText(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ').toLowerCase().replace(/[’ʼ'`]/g, '').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

// Ukrainian mobile numbers as +380XXXXXXXXX; anything else kept as digits.
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('0')) return '+38' + digits
  if (digits.length === 12 && digits.startsWith('380')) return '+' + digits
  if (digits.length === 9) return '+380' + digits
  return digits ? '+' + digits : ''
}

export function isUaMobile(phone: string): boolean {
  return /^\+380\d{9}$/.test(phone)
}

export const round2 = (n: number) => Math.round(n * 100) / 100

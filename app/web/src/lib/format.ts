const groups = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 })

export const money = (n: number | null | undefined) => `${groups.format(n ?? 0).replace(/ /g, ' ')} ₴`

// Server times are UTC "YYYY-MM-DD HH:MM:SS"; people read Kyiv time.
export function parseTime(sql: string) {
  return new Date(sql.includes('T') ? sql : sql.replace(' ', 'T') + 'Z')
}

export function dateTime(sql: string | null | undefined) {
  if (!sql) return ''
  return parseTime(sql).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function date(sql: string | null | undefined) {
  if (!sql) return ''
  return parseTime(sql).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: 'numeric', month: 'long', year: 'numeric' })
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export const pieces = (n: number) => `${n} ${plural(n, 'річ', 'речі', 'речей')}`

export function phoneLink(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

export function prettyPhone(phone: string) {
  const m = /^\+380(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone)
  return m ? `+380 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone
}

export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' })

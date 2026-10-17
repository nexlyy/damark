const money = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 })

export function uah(value: number): string {
  return money.format(Math.round(value)) + ' ₴'
}

// 1 250 ₴ → "1,3 тис." for tight spots such as chart ticks.
export function uahShort(value: number): string {
  if (Math.abs(value) < 1000) return money.format(value)
  return (value / 1000).toLocaleString('uk-UA', { maximumFractionDigits: 1 }) + ' тис.'
}

export function dateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function hoursSince(iso: string, now = Date.now()): number {
  return (now - new Date(iso).getTime()) / 36e5
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export function telegramLink(username: string): string {
  return 'https://t.me/' + username.replace(/^@/, '')
}

export function viberLink(phone: string): string {
  return 'viber://chat?number=' + encodeURIComponent(phone)
}

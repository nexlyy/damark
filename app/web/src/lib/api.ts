// One way to talk to the server: JSON in, JSON out, the server's own
// Ukrainian error text on failure.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body instanceof FormData || body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Немає зʼєднання. Перевірте інтернет і спробуйте ще раз.')
  }
  const text = await res.text()
  const data = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? `Помилка ${res.status}`)
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
}

export function query(params: Record<string, string | number | boolean | undefined | null | string[]>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length)) continue
    q.set(k, Array.isArray(v) ? v.join(',') : v === true ? '1' : String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

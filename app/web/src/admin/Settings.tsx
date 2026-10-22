import { useEffect, useState, type ReactNode } from 'react'
import { Link, Route, Routes, useParams } from 'react-router'
import { Icon } from '../components/Icon'
import { NpPicker } from '../components/NpPicker'
import { CopyButton, ErrorText, Field, Sheet, Spinner, toast } from '../components/ui'
import { api } from '../lib/api'
import { useAction, useFetch } from '../lib/hooks'
import type { Category } from '../lib/types'
import { renderText } from '../shop/InfoPage'
import { roleLabel, Top, useMe } from './AdminApp'

type AllSettings = {
  shop: { name: string; managerTelegram: string; viberPhone: string; stockGroup: string; instagram: string; deliveryNote: string; sizes: string[]; colors: string[] }
  payment: { recipient: string; iban: string; taxId: string; bankCode: string; purpose: string }
  orders: { reserveHours: number }
  novaPoshta: {
    apiKeySet: boolean
    senderRef: string
    contactRef: string
    senderPhone: string
    senderCityRef: string
    senderCityName: string
    senderWarehouseRef: string
    senderWarehouseName: string
    description: string
    weightKg: number
    lengthCm: number
    widthCm: number
    heightCm: number
  }
  telegram: { botTokenSet: boolean; botUsername: string; teamChatId: number; teamChatTitle: string }
  analytics: { umamiWebsiteId: string }
}

export function Settings() {
  return (
    <Routes>
      <Route index element={<Index />} />
      <Route path="shop" element={<ShopSection />} />
      <Route path="payment" element={<PaymentSection />} />
      <Route path="novaposhta" element={<NpSection />} />
      <Route path="telegram" element={<TelegramSection />} />
      <Route path="categories" element={<Categories />} />
      <Route path="pages" element={<Pages />} />
      <Route path="pages/:slug" element={<PageEditor />} />
      <Route path="team" element={<Team />} />
      <Route path="profile" element={<Profile />} />
    </Routes>
  )
}

function Index() {
  const { me } = useMe()
  const rows: Array<[string, string, string, string, boolean]> = [
    ['profile', 'Мій профіль', 'Пароль, вхід через Telegram', 'users', true],
    ['categories', 'Категорії', 'Сукні, джинси, білизна…', 'grid', true],
    ['shop', 'Магазин', 'Назва, контакти, розміри й кольори, бронь, Umami', 'home', me.can.settings],
    ['payment', 'Реквізити', 'Рахунок ФОП для оплати', 'cash', me.can.settings],
    ['novaposhta', 'Нова пошта', 'Ключ API, відправник, розмір посилки', 'truck', me.can.settings],
    ['telegram', 'Telegram-бот', 'Сповіщення команді й покупцям', 'telegram', me.can.settings],
    ['pages', 'Сторінки', 'Оферта, доставка, обмін, конфіденційність', 'doc', me.can.settings],
    ['team', 'Команда', 'Хто має доступ до адмінки', 'users', me.can.staff],
  ]
  return (
    <>
      <Top title="Налаштування" />
      <section className="card">
        <div className="list">
          {rows
            .filter((r) => r[4])
            .map(([to, title, hint, icon]) => (
              <Link key={to} to={`/admin/settings/${to}`} className="list-row">
                <Icon name={icon} />
                <span className="grow">
                  <b>{title}</b>
                  <span className="muted small">{hint}</span>
                </span>
                <Icon name="right" size={18} />
              </Link>
            ))}
        </div>
      </section>
    </>
  )
}

function useSettings() {
  return useFetch<AllSettings>('/api/admin/settings')
}

function SaveBar({ busy, error, onSave }: { busy: boolean; error: string | null; onSave: () => void }) {
  return (
    <>
      <ErrorText>{error}</ErrorText>
      <div className="sticky-save">
        <button className="btn main" disabled={busy} onClick={onSave}>
          {busy ? 'Зберігаємо…' : 'Зберегти'}
        </button>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Top title={title} back="/admin/settings" />
      {children}
    </>
  )
}

function ListInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState('')
  const add = () => {
    const v = text.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setText('')
  }
  return (
    <div>
      <div className="chips" style={{ marginBottom: 8 }}>
        {value.map((v) => (
          <button key={v} type="button" className="chip on" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Прибрати ${v}`}>
            {v} <Icon name="close" size={14} />
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
        <button type="button" className="btn sm" onClick={add}>
          Додати
        </button>
      </div>
    </div>
  )
}

function ShopSection() {
  const { data } = useSettings()
  const [shop, setShop] = useState<AllSettings['shop'] | null>(null)
  const [hours, setHours] = useState('')
  const [umami, setUmami] = useState('')
  const { busy, error, run } = useAction()
  useEffect(() => {
    if (!data) return
    setShop(data.shop)
    setHours(String(data.orders.reserveHours))
    setUmami(data.analytics.umamiWebsiteId)
  }, [data])
  if (!shop) return <Spinner />
  const set = (p: Partial<AllSettings['shop']>) => setShop({ ...shop, ...p })
  return (
    <Section title="Магазин">
      <section className="card">
        <Field label="Назва">
          <input value={shop.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="row">
          <Field label="Telegram менеджера" hint="Без @">
            <input value={shop.managerTelegram} onChange={(e) => set({ managerTelegram: e.target.value })} />
          </Field>
          <Field label="Viber / телефон">
            <input value={shop.viberPhone} onChange={(e) => set({ viberPhone: e.target.value })} />
          </Field>
        </div>
        <div className="row">
          <Field label="Група наявності в Telegram">
            <input value={shop.stockGroup} onChange={(e) => set({ stockGroup: e.target.value })} />
          </Field>
          <Field label="Instagram">
            <input value={shop.instagram} onChange={(e) => set({ instagram: e.target.value })} />
          </Field>
        </div>
        <Field label="Про доставку (коротко)">
          <input value={shop.deliveryNote} onChange={(e) => set({ deliveryNote: e.target.value })} />
        </Field>
        <Field label="Скільки годин тримати бронь до оплати">
          <input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 140 }} />
        </Field>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h2>Розміри</h2>
        <p className="hint">У цьому порядку розміри показуються покупцям і пропонуються в товарі.</p>
        <ListInput value={shop.sizes} onChange={(sizes) => set({ sizes })} placeholder="Додати розмір" />
        <h2 style={{ marginTop: 18 }}>Кольори</h2>
        <ListInput value={shop.colors} onChange={(colors) => set({ colors })} placeholder="Додати колір" />
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h2>Статистика Umami</h2>
        <Field label="ID сайту в Umami" hint="Umami → Settings → Websites → Add website (new.damark.net) → скопіюйте Website ID">
          <input value={umami} onChange={(e) => setUmami(e.target.value.trim())} placeholder="7338b69a-…" />
        </Field>
      </section>
      <SaveBar
        busy={busy}
        error={error}
        onSave={() =>
          run(async () => {
            await api.put('/api/admin/settings/shop', shop)
            await api.put('/api/admin/settings/orders', { reserveHours: Number(hours) || 24 })
            await api.put('/api/admin/settings/analytics', { umamiWebsiteId: umami })
            toast('Збережено')
          })
        }
      />
    </Section>
  )
}

function PaymentSection() {
  const { data } = useSettings()
  const [p, setP] = useState<AllSettings['payment'] | null>(null)
  const { busy, error, run } = useAction()
  useEffect(() => {
    if (data) setP(data.payment)
  }, [data])
  if (!p) return <Spinner />
  return (
    <Section title="Реквізити">
      <section className="card">
        <p className="hint" style={{ marginTop: 0 }}>
          Їх бачать покупці після оформлення замовлення й у Telegram. Перевіряйте кожну цифру.
        </p>
        <Field label="Отримувач">
          <input value={p.recipient} onChange={(e) => setP({ ...p, recipient: e.target.value })} />
        </Field>
        <Field label="IBAN">
          <input value={p.iban} onChange={(e) => setP({ ...p, iban: e.target.value })} />
        </Field>
        <div className="row">
          <Field label="ІПН / ЄДРПОУ">
            <input value={p.taxId} onChange={(e) => setP({ ...p, taxId: e.target.value })} />
          </Field>
          <Field label="ЄДРПОУ банку">
            <input value={p.bankCode} onChange={(e) => setP({ ...p, bankCode: e.target.value })} />
          </Field>
        </div>
        <Field label="Призначення платежу" hint="{number} заміниться номером замовлення">
          <input value={p.purpose} onChange={(e) => setP({ ...p, purpose: e.target.value })} />
        </Field>
      </section>
      <SaveBar busy={busy} error={error} onSave={() => run(async () => (await api.put('/api/admin/settings/payment', p), toast('Збережено')))} />
    </Section>
  )
}

function NpSection() {
  const { data, reload } = useSettings()
  const [np, setNp] = useState<AllSettings['novaPoshta'] | null>(null)
  const [key, setKey] = useState('')
  const [senders, setSenders] = useState<Array<{ ref: string; name: string; contacts: Array<{ ref: string; name: string; phone: string }> }> | null>(null)
  const { busy, error, run } = useAction()
  useEffect(() => {
    if (data) setNp(data.novaPoshta)
  }, [data])
  if (!np) return <Spinner />
  const set = (p: Partial<AllSettings['novaPoshta']>) => setNp({ ...np, ...p })
  const { apiKeySet, ...rest } = np
  void apiKeySet
  return (
    <Section title="Нова пошта">
      <section className="card">
        <h2>Ключ API</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Кабінет Нової пошти (бізнес) → Налаштування → Безпека → Створити ключ. Ключ зберігається лише на сервері.
        </p>
        <Field label={np.apiKeySet ? 'Ключ збережено. Новий ключ (щоб замінити):' : 'Ключ API'}>
          <input value={key} onChange={(e) => setKey(e.target.value.trim())} autoComplete="off" />
        </Field>
        <div className="actions">
          <button
            className="btn sm"
            disabled={busy || (!key && !np.apiKeySet)}
            onClick={() =>
              run(async () => {
                if (key) await api.put('/api/admin/settings/novaPoshta', { apiKey: key })
                setKey('')
                reload()
                setSenders(await api.get('/api/admin/settings/novaposhta/senders'))
              })
            }
          >
            {key ? 'Зберегти й знайти відправника' : 'Знайти відправника'}
          </button>
        </div>
        {senders && (
          <div style={{ marginTop: 12 }}>
            {senders.map((s) => (
              <div key={s.ref}>
                <b>{s.name}</b>
                <div className="chips" style={{ marginTop: 6 }}>
                  {s.contacts.map((c) => (
                    <button key={c.ref} type="button" className="chip" aria-pressed={np.contactRef === c.ref} onClick={() => set({ senderRef: s.ref, contactRef: c.ref, senderPhone: c.phone })}>
                      {c.name} · {c.phone}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {np.contactRef && !senders && <p className="note-ok" style={{ marginTop: 10 }}>Відправника обрано. Телефон: {np.senderPhone}</p>}
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h2>Звідки відправляєте</h2>
        <NpPicker
          value={{
            city: np.senderCityRef ? { ref: np.senderCityRef, name: np.senderCityName } : null,
            warehouse: np.senderWarehouseRef ? { ref: np.senderWarehouseRef, name: np.senderWarehouseName, kind: 'branch' } : null,
          }}
          onChange={(v) => set({ senderCityRef: v.city?.ref ?? '', senderCityName: v.city?.name ?? '', senderWarehouseRef: v.warehouse?.ref ?? '', senderWarehouseName: v.warehouse?.name ?? '' })}
        />
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h2>Посилка за замовчуванням</h2>
        <Field label="Опис вмісту">
          <input value={np.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="row">
          <Field label="Вага, кг">
            <input inputMode="decimal" value={np.weightKg} onChange={(e) => set({ weightKg: Number(e.target.value.replace(',', '.')) || 0 })} />
          </Field>
          <Field label="Довжина, см">
            <input inputMode="numeric" value={np.lengthCm} onChange={(e) => set({ lengthCm: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <div className="row">
          <Field label="Ширина, см">
            <input inputMode="numeric" value={np.widthCm} onChange={(e) => set({ widthCm: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Висота, см">
            <input inputMode="numeric" value={np.heightCm} onChange={(e) => set({ heightCm: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <p className="hint">Доставку оплачує одержувач; оголошена вартість — сума замовлення.</p>
      </section>
      <SaveBar busy={busy} error={error} onSave={() => run(async () => (await api.put('/api/admin/settings/novaPoshta', rest), toast('Збережено')))} />
    </Section>
  )
}

function TelegramSection() {
  const { data, reload } = useSettings()
  const [token, setToken] = useState('')
  const [bind, setBind] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  if (!data) return <Spinner />
  const t = data.telegram
  return (
    <Section title="Telegram-бот">
      <section className="card">
        <h2>1. Бот</h2>
        {t.botTokenSet ? (
          <p className="note-ok">
            Підключено: <a href={`https://t.me/${t.botUsername}`} target="_blank" rel="noreferrer">@{t.botUsername}</a>
          </p>
        ) : (
          <ol className="hint" style={{ paddingLeft: 18 }}>
            <li>Анна відкриває в Telegram @BotFather → /newbot, дає назву (наприклад, DaMark shop) і нік (damark_shop_bot).</li>
            <li>BotFather надсилає токен — вставте його нижче.</li>
          </ol>
        )}
        <Field label={t.botTokenSet ? 'Новий токен (щоб замінити бота)' : 'Токен від @BotFather'}>
          <input value={token} onChange={(e) => setToken(e.target.value.trim())} autoComplete="off" placeholder="123456789:AA…" />
        </Field>
        <div className="actions">
          <button className="btn main sm" disabled={busy || !token} onClick={() => run(async () => (await api.post('/api/admin/settings/telegram/token', { token }), setToken(''), toast('Бота підключено'), reload()))}>
            Підключити
          </button>
          {t.botTokenSet && (
            <button className="btn ghost sm" disabled={busy} onClick={() => confirm('Відключити бота? Сповіщення перестануть приходити.') && run(async () => (await api.post('/api/admin/settings/telegram/token', { token: '' }), reload()))}>
              Відключити
            </button>
          )}
        </div>
      </section>
      {t.botTokenSet && (
        <section className="card" style={{ marginTop: 12 }}>
          <h2>2. Чат команди</h2>
          {t.teamChatId ? (
            <p className="note-ok">Нові замовлення приходять у «{t.teamChatTitle || 'чат команди'}».</p>
          ) : (
            <p className="hint" style={{ marginTop: 0 }}>
              Створіть групу в Telegram (наприклад, «DaMark замовлення»), додайте туди менеджерів і бота @{t.botUsername}, потім надішліть у групу команду нижче.
            </p>
          )}
          {bind ? (
            <div className="req-row">
              <div>
                <span>Надішліть у групу</span>
                <b>{bind}</b>
              </div>
              <CopyButton text={bind} label="команду" />
            </div>
          ) : (
            <button className="btn sm" disabled={busy} onClick={() => run(async () => setBind((await api.post<{ command: string }>('/api/admin/settings/telegram/bind')).command))}>
              {t.teamChatId ? 'Підключити інший чат' : 'Отримати команду'}
            </button>
          )}
          {bind && (
            <button className="link-btn small" style={{ marginTop: 10 }} onClick={() => (setBind(null), reload())}>
              Надіслали? Оновити
            </button>
          )}
        </section>
      )}
      {t.botTokenSet && (
        <section className="card" style={{ marginTop: 12 }}>
          <h2>3. Кожен у команді</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            Кожен привʼязує свій Telegram у <Link to="/admin/settings/profile">профілі</Link>: тоді працює кнопка «Беру» в чаті і приходять коди для входу.
          </p>
        </section>
      )}
      <ErrorText>{error}</ErrorText>
    </Section>
  )
}

function Categories() {
  const { data, reload } = useFetch<Category[]>('/api/admin/categories')
  const [name, setName] = useState('')
  const { busy, error, run } = useAction()
  return (
    <Section title="Категорії">
      <section className="card">
        <p className="hint" style={{ marginTop: 0 }}>
          Покупці бачать категорії в цьому порядку. Порожні категорії на сайті не показуються.
        </p>
        <div className="list">
          {data?.map((c, i) => (
            <div key={c.id} className="list-row">
              <span className="grow">
                <b>{c.name}</b>
                <span className="muted small">{c.active ?? 0} товарів у продажу</span>
              </span>
              <button className="icon-btn" aria-label="Вище" disabled={i === 0} onClick={() => run(async () => (await reorder(data, i, -1), reload()))}>
                <Icon name="up" size={18} />
              </button>
              <button className="icon-btn" aria-label="Нижче" disabled={i === data.length - 1} onClick={() => run(async () => (await reorder(data, i, 1), reload()))}>
                <Icon name="down" size={18} />
              </button>
              <button
                className="icon-btn"
                aria-label="Перейменувати"
                onClick={() => {
                  const next = prompt('Нова назва', c.name)
                  if (next) run(async () => (await api.put(`/api/admin/categories/${c.id}`, { name: next, sort: c.sort }), reload()))
                }}
              >
                <Icon name="edit" size={18} />
              </button>
              <button className="icon-btn" aria-label="Видалити" onClick={() => confirm(`Видалити «${c.name}»? Товари лишаться без категорії.`) && run(async () => (await api.del(`/api/admin/categories/${c.id}`), reload()))}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Нова категорія" />
          <button className="btn main sm" disabled={busy || !name.trim()} onClick={() => run(async () => (await api.post('/api/admin/categories', { name, sort: ((data?.length ?? 0) + 1) * 10 }), setName(''), reload()))}>
            Додати
          </button>
        </div>
        <ErrorText>{error}</ErrorText>
      </section>
    </Section>
  )
}

async function reorder(list: Category[], i: number, d: number) {
  const next = [...list]
  const [c] = next.splice(i, 1)
  next.splice(i + d, 0, c)
  await Promise.all(next.map((x, n) => api.put(`/api/admin/categories/${x.id}`, { name: x.name, sort: (n + 1) * 10 })))
}

function Pages() {
  const { data } = useFetch<Array<{ slug: string; title: string; updated_at: string }>>('/api/admin/pages')
  return (
    <Section title="Сторінки">
      <section className="card">
        <p className="hint" style={{ marginTop: 0 }}>
          Це чернетки за шаблоном. Перед відкриттям магазину покажіть їх юристу.
        </p>
        <div className="list">
          {data?.map((p) => (
            <Link key={p.slug} to={`/admin/settings/pages/${p.slug}`} className="list-row">
              <Icon name="doc" />
              <b className="grow">{p.title}</b>
              <Icon name="right" size={18} />
            </Link>
          ))}
        </div>
      </section>
    </Section>
  )
}

function PageEditor() {
  const { slug } = useParams()
  const { data } = useFetch<{ title: string; body: string }>(`/api/admin/pages/${slug}`)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState(false)
  const { busy, error, run } = useAction()
  useEffect(() => {
    if (data) {
      setTitle(data.title)
      setBody(data.body)
    }
  }, [data])
  if (!data) return <Spinner />
  return (
    <>
      <Top title={title} back="/admin/settings/pages">
        <button className="btn ghost sm" onClick={() => setPreview(true)}>
          Перегляд
        </button>
      </Top>
      <section className="card">
        <Field label="Заголовок">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Текст" hint="## — підзаголовок, - — пункт списку, порожній рядок — новий абзац. {recipient}, {taxId}, {telegram}, {phone}, {site} підставляються з налаштувань.">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={22} style={{ fontSize: 14 }} />
        </Field>
      </section>
      <SaveBar busy={busy} error={error} onSave={() => run(async () => (await api.put(`/api/admin/pages/${slug}`, { title, body }), toast('Збережено')))} />
      {preview && (
        <Sheet title={title} onClose={() => setPreview(false)} wide>
          <div className="prose">{renderText(body)}</div>
        </Sheet>
      )}
    </>
  )
}

type Staff = { id: number; login: string; name: string; role: 'owner' | 'manager' | 'dev'; disabled: number; tg_username: string | null; telegram: number }

function Team() {
  const { me } = useMe()
  const { data, reload } = useFetch<Staff[]>('/api/admin/users')
  const [adding, setAdding] = useState(false)
  const [password, setPassword] = useState<{ login: string; password: string } | null>(null)
  const { busy, error, run } = useAction()
  const reset = (u: Staff) =>
    run(async () => {
      const pw = generatePassword()
      await api.patch(`/api/admin/users/${u.id}`, { password: pw })
      setPassword({ login: u.login, password: pw })
    })
  return (
    <Section title="Команда">
      <section className="card">
        <div className="list">
          {data?.map((u) => (
            <div key={u.id} className="list-row" style={{ flexWrap: 'wrap' }}>
              <span className="grow">
                <b>
                  {u.name} {u.id === me.user.id && <span className="muted small">(ви)</span>}
                </b>
                <span className="muted small">
                  {u.login} · {roleLabel[u.role]} · {u.telegram ? `Telegram ${u.tg_username ? '@' + u.tg_username : '✓'}` : 'без Telegram'}
                </span>
              </span>
              {u.disabled ? <span className="pill alarm">Відключено</span> : null}
              {u.id !== me.user.id && (
                <div className="actions">
                  <select
                    value={u.role}
                    onChange={(e) => run(async () => (await api.patch(`/api/admin/users/${u.id}`, { role: e.target.value }), reload()))}
                    style={{ width: 'auto', minHeight: 36, fontSize: 14 }}
                    aria-label="Роль"
                  >
                    <option value="manager">Менеджер</option>
                    <option value="owner">Власниця</option>
                    <option value="dev">Розробник</option>
                  </select>
                  <button className="btn sm ghost" onClick={() => reset(u)}>
                    Новий пароль
                  </button>
                  <button className={`btn sm ${u.disabled ? 'ok' : 'danger'}`} onClick={() => run(async () => (await api.patch(`/api/admin/users/${u.id}`, { disabled: !u.disabled }), reload()))}>
                    {u.disabled ? 'Увімкнути' : 'Відключити'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button className="btn main sm" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
          + Додати людину
        </button>
        <ErrorText>{error}</ErrorText>
        <p className="hint">Менеджер працює з товарами, замовленнями й клієнтами, але не бачить собівартості, фінансів і налаштувань.</p>
      </section>
      {adding && <AddUser onClose={() => setAdding(false)} onDone={(login, pw) => (setAdding(false), setPassword({ login, password: pw }), reload())} />}
      {password && (
        <Sheet title="Дані для входу" onClose={() => setPassword(null)}>
          <p>Передайте людині особисто. Пароль показується лише зараз; після входу його можна змінити в профілі.</p>
          <div className="req-row">
            <div>
              <span>Адреса</span>
              <b>{location.origin}/admin</b>
            </div>
          </div>
          <div className="req-row">
            <div>
              <span>Логін</span>
              <b>{password.login}</b>
            </div>
            <CopyButton text={password.login} label="логін" />
          </div>
          <div className="req-row">
            <div>
              <span>Пароль</span>
              <b>{password.password}</b>
            </div>
            <CopyButton text={password.password} label="пароль" />
          </div>
          {busy && <Spinner />}
        </Sheet>
      )}
    </Section>
  )
}

function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(14))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function AddUser({ onClose, onDone }: { onClose: () => void; onDone: (login: string, password: string) => void }) {
  const [form, setForm] = useState({ login: '', name: '', role: 'manager' })
  const { busy, error, run } = useAction()
  return (
    <Sheet title="Нова людина в команді" onClose={onClose}>
      <Field label="Імʼя">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Оля" />
      </Field>
      <Field label="Логін" hint="Латиницею, без пробілів">
        <input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value.trim().toLowerCase() })} placeholder="olya" autoCapitalize="none" />
      </Field>
      <Field label="Роль">
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="manager">Менеджер</option>
          <option value="owner">Власниця</option>
          <option value="dev">Розробник</option>
        </select>
      </Field>
      <ErrorText>{error}</ErrorText>
      <button
        className="btn main block"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const pw = generatePassword()
            await api.post('/api/admin/users', { ...form, password: pw })
            onDone(form.login, pw)
          })
        }
      >
        Створити
      </button>
    </Sheet>
  )
}

function Profile() {
  const { me, reload } = useMe()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const { busy, error, run } = useAction()
  const link = useAction()
  return (
    <Section title="Мій профіль">
      <section className="card">
        <dl className="kv">
          <dt>Імʼя</dt>
          <dd>{me.user.name}</dd>
          <dt>Логін</dt>
          <dd>{me.user.login}</dd>
          <dt>Роль</dt>
          <dd>{roleLabel[me.user.role]}</dd>
        </dl>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h2>Telegram</h2>
        {me.user.telegram ? (
          <p className="note-ok">Привʼязано{me.user.telegram !== '✓' ? `: @${me.user.telegram}` : ''}. На нових пристроях для входу прийде код.</p>
        ) : (
          <p className="hint" style={{ marginTop: 0 }}>
            Привʼяжіть Telegram: вхід стане безпечнішим (код на новому пристрої), а в чаті команди запрацює кнопка «Беру».
          </p>
        )}
        {me.botReady ? (
          <button
            className="btn tg sm"
            disabled={link.busy}
            onClick={() =>
              link.run(async () => {
                const { url } = await api.post<{ url: string }>('/api/auth/telegram-link')
                window.open(url, '_blank')
                setTimeout(reload, 8000)
              })
            }
          >
            <Icon name="telegram" size={18} /> {me.user.telegram ? 'Привʼязати інший акаунт' : 'Привʼязати Telegram'}
          </button>
        ) : (
          <p className="muted small">Спершу власниця підключає бота в налаштуваннях.</p>
        )}
        <ErrorText>{link.error}</ErrorText>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h2>Змінити пароль</h2>
        <Field label="Поточний пароль">
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="Новий пароль" hint="Щонайменше 10 символів">
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button
          className="btn main sm"
          disabled={busy || !current || next.length < 10}
          onClick={() =>
            run(async () => {
              await api.post('/api/auth/password', { current, next })
              setCurrent('')
              setNext('')
              toast('Пароль змінено, інші пристрої вийшли')
            })
          }
        >
          Змінити
        </button>
      </section>
    </Section>
  )
}

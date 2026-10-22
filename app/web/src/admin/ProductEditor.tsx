import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Icon } from '../components/Icon'
import { ErrorText, Field, Sheet, Spinner, toast } from '../components/ui'
import { api } from '../lib/api'
import { useAction, useFetch } from '../lib/hooks'
import { uploadImage } from '../lib/images'
import type { Category, Photo, SizeChart } from '../lib/types'
import { Top, useMe } from './AdminApp'

type Variant = { id?: number; size: string; color: string; sku: string; stock: number; cost?: number | null; key: string }

type Form = {
  title: string
  slug: string
  description: string
  categoryId: number | null
  brand: string
  price: string
  oldPrice: string
  composition: string
  care: string
  measurements: string
  sizeChart: SizeChart | null
  status: 'draft' | 'active' | 'archived'
  isNew: boolean
  isHit: boolean
  photos: Photo[]
  variants: Variant[]
}

type Loaded = Omit<Form, 'price' | 'oldPrice' | 'variants'> & { id: number; price: number; oldPrice: number | null; sold: number; variants: Omit<Variant, 'key'>[] }
type ShopSettings = { shop: { sizes: string[]; colors: string[] } }

const blank: Form = {
  title: '', slug: '', description: '', categoryId: null, brand: '', price: '', oldPrice: '', composition: '', care: '', measurements: '',
  sizeChart: null, status: 'active', isNew: true, isHit: false, photos: [], variants: [],
}

let keySeq = 0
const key = () => `v${++keySeq}`

export function ProductEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { me } = useMe()
  const isNew = !id
  const loaded = useFetch<Loaded>(isNew ? null : `/api/admin/products/${id}`)
  const cats = useFetch<Category[]>('/api/admin/categories')
  const brands = useFetch<Array<{ id: number; name: string }>>('/api/admin/brands').data
  const shop = useFetch<ShopSettings>('/api/shop').data
  const [form, setForm] = useState<Form | null>(isNew ? blank : null)
  const [uploading, setUploading] = useState(0)
  const [newCat, setNewCat] = useState<string | null>(null)
  const { busy, error, setError, run } = useAction()

  useEffect(() => {
    const d = loaded.data
    if (!d) return
    setForm({
      ...d,
      price: String(d.price),
      oldPrice: d.oldPrice ? String(d.oldPrice) : '',
      variants: d.variants.map((v) => ({ ...v, key: key() })),
    })
  }, [loaded.data])

  if (!form) return <Spinner />
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f!, ...patch }))
  const sizes = shop?.shop.sizes ?? []
  const colors = shop?.shop.colors ?? []

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files).slice(0, 20 - form.photos.length)
    setUploading(list.length)
    for (const f of list) {
      try {
        const p = await uploadImage('/api/admin/media', f)
        setForm((cur) => ({ ...cur!, photos: [...cur!.photos, p] }))
      } catch (e) {
        setError(`${f.name}: ${(e as Error).message}`)
      }
      setUploading((n) => n - 1)
    }
  }
  const movePhoto = (i: number, d: number) => {
    const list = [...form.photos]
    const [p] = list.splice(i, 1)
    list.splice(Math.max(0, Math.min(list.length, i + d)), 0, p)
    set({ photos: list })
  }

  const save = (status?: Form['status']) =>
    run(async () => {
      const body = {
        title: form.title,
        slug: form.slug || undefined,
        description: form.description,
        categoryId: form.categoryId,
        brand: form.brand,
        price: Number(form.price),
        oldPrice: form.oldPrice ? Number(form.oldPrice) : null,
        composition: form.composition,
        care: form.care,
        measurements: form.measurements,
        sizeChart: form.sizeChart && form.sizeChart.rows.length ? form.sizeChart : null,
        status: status ?? form.status,
        isNew: form.isNew,
        isHit: form.isHit,
        photoIds: form.photos.map((p) => p.id),
        variants: form.variants.map((v) => ({
          id: v.id,
          size: v.size,
          color: v.color,
          sku: v.sku,
          stock: Number(v.stock) || 0,
          ...(me.can.finance ? { cost: v.cost === undefined || v.cost === null || (v.cost as unknown) === '' ? null : Number(v.cost) } : {}),
        })),
      }
      if (!body.title.trim()) throw new Error('Вкажіть назву.')
      if (!Number.isInteger(body.price) || body.price <= 0) throw new Error('Вкажіть ціну в гривнях.')
      const saved = isNew ? await api.post<Loaded>('/api/admin/products', body) : await api.put<Loaded>(`/api/admin/products/${id}`, body)
      toast('Збережено')
      if (isNew) navigate(`/admin/products/${saved.id}`, { replace: true })
      else setForm({ ...form, ...saved, price: String(saved.price), oldPrice: saved.oldPrice ? String(saved.oldPrice) : '', variants: saved.variants.map((v) => ({ ...v, key: key() })) })
    })

  return (
    <>
      <Top title={isNew ? 'Новий товар' : form.title || 'Товар'} back="/admin/products">
        {!isNew && form.status !== 'draft' && (
          <a className="btn ghost sm" href={`/p/${form.slug}`} target="_blank" rel="noreferrer">
            На сайті <Icon name="external" size={16} />
          </a>
        )}
      </Top>

      <div className="cols2">
        <div className="stack">
          <section className="card">
            <div className="section-title">
              <h2>Фото</h2>
              <span className="muted small">Перше — головне. До 20 фото.</span>
            </div>
            <div className="photos">
              {form.photos.map((p, i) => (
                <div className="photo" key={p.id}>
                  <img src={p.s} alt="" />
                  {i === 0 && <span className="main-mark">Головне</span>}
                  <div className="tools">
                    <button type="button" onClick={() => movePhoto(i, -1)} disabled={i === 0} aria-label="Лівіше">
                      <Icon name="left" size={16} />
                    </button>
                    <button type="button" onClick={() => set({ photos: form.photos.filter((x) => x.id !== p.id) })} aria-label="Прибрати фото">
                      <Icon name="trash" size={16} />
                    </button>
                    <button type="button" onClick={() => movePhoto(i, 1)} disabled={i === form.photos.length - 1} aria-label="Правіше">
                      <Icon name="right" size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {Array.from({ length: uploading }, (_, i) => (
                <div className="photo uploading" key={`u${i}`}>
                  <Spinner label="" />
                </div>
              ))}
              {form.photos.length + uploading < 20 && (
                <label className="photo add">
                  <Icon name="photo" size={26} />
                  Додати фото
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => (addPhotos(e.target.files), (e.target.value = ''))} />
                </label>
              )}
            </div>
          </section>

          <section className="card">
            <h2>Основне</h2>
            <Field label="Назва">
              <input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={140} placeholder="Сукня льняна міді" />
            </Field>
            <div className="row">
              <Field label="Ціна, ₴">
                <input inputMode="numeric" value={form.price} onChange={(e) => set({ price: e.target.value.replace(/\D/g, '') })} />
              </Field>
              <Field label="Стара ціна, ₴" hint="Для знижки: буде закреслена">
                <input inputMode="numeric" value={form.oldPrice} onChange={(e) => set({ oldPrice: e.target.value.replace(/\D/g, '') })} />
              </Field>
            </div>
            <div className="row">
              <Field label="Категорія">
                {newCat === null ? (
                  <select
                    value={form.categoryId ?? ''}
                    onChange={(e) => (e.target.value === 'new' ? setNewCat('') : set({ categoryId: e.target.value ? Number(e.target.value) : null }))}
                  >
                    <option value="">Без категорії</option>
                    {cats.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value="new">+ Нова категорія…</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Назва категорії" />
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() =>
                        run(async () => {
                          const { id: catId } = await api.post<{ id: number }>('/api/admin/categories', { name: newCat, sort: (cats.data?.length ?? 0) * 10 })
                          cats.reload()
                          set({ categoryId: catId })
                          setNewCat(null)
                        })
                      }
                    >
                      OK
                    </button>
                  </div>
                )}
              </Field>
              <Field label="Бренд">
                <input value={form.brand} onChange={(e) => set({ brand: e.target.value })} list="brands" maxLength={60} />
                <datalist id="brands">
                  {brands?.map((b) => (
                    <option key={b.id} value={b.name} />
                  ))}
                </datalist>
              </Field>
            </div>
            <Field label="Опис">
              <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={5} />
            </Field>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={form.isNew} onClick={() => set({ isNew: !form.isNew })}>
                Новинка
              </button>
              <button type="button" className="chip" aria-pressed={form.isHit} onClick={() => set({ isHit: !form.isHit })}>
                Хіт
              </button>
            </div>
          </section>

          <Variants form={form} set={set} sizes={sizes} colors={colors} showCost={me.can.finance} />
        </div>

        <div className="stack">
          <section className="card">
            <h2>Статус</h2>
            <div className="seg" role="tablist" style={{ display: 'flex' }}>
              {(['active', 'draft', 'archived'] as const).map((s) => (
                <button key={s} type="button" role="tab" aria-selected={form.status === s} onClick={() => set({ status: s })} style={{ flex: 1 }}>
                  {{ active: 'У продажу', draft: 'Чернетка', archived: 'Архів' }[s]}
                </button>
              ))}
            </div>
            <p className="hint">Чернетку бачите лише ви. Архів — сторінка лишається за посиланням, але без кнопки «Купити».</p>
            {!isNew && loaded.data && <p className="muted small">Продано: {loaded.data.sold} шт.</p>}
          </section>

          <section className="card">
            <h2>Склад і заміри</h2>
            <Field label="Склад">
              <input value={form.composition} onChange={(e) => set({ composition: e.target.value })} placeholder="95% бавовна, 5% еластан" />
            </Field>
            <Field label="Догляд">
              <input value={form.care} onChange={(e) => set({ care: e.target.value })} placeholder="Прання 30°, не віджимати" />
            </Field>
            <Field label="Заміри" hint="Кожен з нового рядка: довжина, обхват грудей…">
              <textarea value={form.measurements} onChange={(e) => set({ measurements: e.target.value })} rows={3} />
            </Field>
            <SizeChartEditor chart={form.sizeChart} onChange={(c) => set({ sizeChart: c })} sizes={[...new Set(form.variants.map((v) => v.size).filter(Boolean))]} />
          </section>

          {!isNew && <DangerZone id={Number(id)} title={form.title} />}
        </div>
      </div>

      <ErrorText>{error}</ErrorText>
      <div className="sticky-save">
        {isNew && (
          <button className="btn ghost" disabled={busy || uploading > 0} onClick={() => save('draft')}>
            Зберегти чернетку
          </button>
        )}
        <button className="btn main" disabled={busy || uploading > 0} onClick={() => save()}>
          {busy ? 'Зберігаємо…' : uploading ? 'Завантажуємо фото…' : isNew ? 'Опублікувати' : 'Зберегти'}
        </button>
      </div>
    </>
  )
}

function Variants({ form, set, sizes, colors, showCost }: { form: Form; set: (p: Partial<Form>) => void; sizes: string[]; colors: string[]; showCost: boolean }) {
  const [pickSizes, setPickSizes] = useState<string[]>([])
  const [pickColors, setPickColors] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const [generator, setGenerator] = useState(form.variants.length === 0)

  const update = (k: string, patch: Partial<Variant>) => set({ variants: form.variants.map((v) => (v.key === k ? { ...v, ...patch } : v)) })
  const generate = () => {
    const ss = pickSizes.length ? pickSizes : ['']
    const cs = pickColors.length ? pickColors : ['']
    const next = [...form.variants]
    for (const c of cs)
      for (const s of ss) if (!next.some((v) => v.size === s && v.color === c)) next.push({ size: s, color: c, sku: '', stock: 1, key: key() })
    set({ variants: next })
    setGenerator(false)
    setPickSizes([])
    setPickColors([])
  }
  const toggle = (list: string[], v: string, setList: (l: string[]) => void) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const total = form.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0)

  return (
    <section className="card">
      <div className="section-title">
        <h2>Розміри й залишки</h2>
        <span className="muted small">Усього: {total} шт.</span>
      </div>
      {form.variants.length > 0 && (
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Розмір</th>
                <th>Колір</th>
                <th className="narrow">Залишок</th>
                {showCost && <th className="narrow">Собівартість</th>}
                <th>Артикул</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {form.variants.map((v) => (
                <tr key={v.key}>
                  <td>
                    <input value={v.size} onChange={(e) => update(v.key, { size: e.target.value })} list="size-list" style={{ minWidth: 70 }} />
                  </td>
                  <td>
                    <input value={v.color} onChange={(e) => update(v.key, { color: e.target.value })} list="color-list" style={{ minWidth: 90 }} />
                  </td>
                  <td>
                    <input inputMode="numeric" value={v.stock} onChange={(e) => update(v.key, { stock: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                  </td>
                  {showCost && (
                    <td>
                      <input inputMode="decimal" value={v.cost ?? ''} placeholder="—" onChange={(e) => update(v.key, { cost: e.target.value === '' ? null : (e.target.value.replace(',', '.') as unknown as number) })} />
                    </td>
                  )}
                  <td>
                    <input value={v.sku} onChange={(e) => update(v.key, { sku: e.target.value })} style={{ minWidth: 80 }} />
                  </td>
                  <td>
                    <button type="button" className="icon-btn" aria-label="Прибрати" onClick={() => set({ variants: form.variants.filter((x) => x.key !== v.key) })}>
                      <Icon name="trash" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="size-list">{sizes.map((s) => <option key={s} value={s} />)}</datalist>
          <datalist id="color-list">{colors.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      )}
      {generator ? (
        <div style={{ marginTop: 12 }}>
          <p className="field-label" style={{ margin: '0 0 6px' }}>
            Розміри
          </p>
          <div className="chips">
            {[...sizes, ...pickSizes.filter((s) => !sizes.includes(s))].map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={pickSizes.includes(s)} onClick={() => toggle(pickSizes, s, setPickSizes)}>
                {s}
              </button>
            ))}
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && custom.trim()) {
                  e.preventDefault()
                  setPickSizes([...pickSizes, custom.trim()])
                  setCustom('')
                }
              }}
              placeholder="Свій: 38, 40…"
              style={{ width: 130, minHeight: 38 }}
            />
          </div>
          <p className="field-label" style={{ margin: '12px 0 6px' }}>
            Кольори (якщо один — можна не обирати)
          </p>
          <div className="chips">
            {colors.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={pickColors.includes(c)} onClick={() => toggle(pickColors, c, setPickColors)}>
                {c}
              </button>
            ))}
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn main sm" onClick={generate}>
              Додати {Math.max(pickSizes.length, 1) * Math.max(pickColors.length, 1)} варіант(и)
            </button>
            {form.variants.length > 0 && (
              <button type="button" className="btn ghost sm" onClick={() => setGenerator(false)}>
                Скасувати
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn sm" onClick={() => setGenerator(true)}>
            + Розміри / кольори
          </button>
          <button type="button" className="btn ghost sm" onClick={() => set({ variants: [...form.variants, { size: '', color: '', sku: '', stock: 1, key: key() }] })}>
            + Рядок
          </button>
        </div>
      )}
    </section>
  )
}

function SizeChartEditor({ chart, onChange, sizes }: { chart: SizeChart | null; onChange: (c: SizeChart | null) => void; sizes: string[] }) {
  if (!chart)
    return (
      <button
        type="button"
        className="btn sm"
        onClick={() => onChange({ columns: ['Розмір', 'Груди, см', 'Талія, см', 'Стегна, см'], rows: (sizes.length ? sizes : ['S', 'M', 'L']).map((s) => [s, '', '', '']) })}
      >
        + Таблиця розмірів
      </button>
    )
  const setCell = (r: number, c: number, v: string) => onChange({ ...chart, rows: chart.rows.map((row, i) => (i === r ? chart.columns.map((_, j) => (j === c ? v : row[j] ?? '')) : row)) })
  return (
    <div>
      <p className="field-label" style={{ margin: '0 0 6px' }}>
        Таблиця розмірів
      </p>
      <div className="scroll-x">
        <table className="grid-table">
          <thead>
            <tr>
              {chart.columns.map((c, j) => (
                <th key={j}>
                  <input value={c} onChange={(e) => onChange({ ...chart, columns: chart.columns.map((x, k) => (k === j ? e.target.value : x)) })} style={{ minWidth: 104 }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row, r) => (
              <tr key={r}>
                {chart.columns.map((_, c) => (
                  <td key={c}>
                    <input value={row[c] ?? ''} onChange={(e) => setCell(r, c, e.target.value)} style={{ minWidth: 60 }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions" style={{ marginTop: 8 }}>
        <button type="button" className="btn ghost sm" onClick={() => onChange({ ...chart, rows: [...chart.rows, chart.columns.map(() => '')] })}>
          + Рядок
        </button>
        <button type="button" className="btn ghost sm" onClick={() => onChange({ columns: [...chart.columns, 'Новий'], rows: chart.rows.map((r) => [...r, '']) })} disabled={chart.columns.length >= 10}>
          + Стовпець
        </button>
        <button type="button" className="btn ghost sm" onClick={() => onChange(chart.rows.length > 1 ? { ...chart, rows: chart.rows.slice(0, -1) } : null)}>
          − Рядок
        </button>
        <button type="button" className="btn danger sm" onClick={() => onChange(null)}>
          Прибрати таблицю
        </button>
      </div>
    </div>
  )
}

function DangerZone({ id, title }: { id: number; title: string }) {
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const { busy, error, run } = useAction()
  return (
    <section className="card">
      <h2>Ще</h2>
      <div className="actions">
        <button
          className="btn sm"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const { id: copy } = await api.post<{ id: number }>(`/api/admin/products/${id}/copy`)
              toast('Створено копію-чернетку')
              navigate(`/admin/products/${copy}`)
            })
          }
        >
          Копія (інший колір)
        </button>
        <Link className="btn sm ghost" to={`/admin/purchases/new?product=${id}`}>
          Оприбуткувати
        </Link>
        <button className="btn danger sm" onClick={() => setConfirm(true)}>
          Видалити
        </button>
      </div>
      <ErrorText>{error}</ErrorText>
      {confirm && (
        <Sheet title="Видалити товар?" onClose={() => setConfirm(false)}>
          <p>
            «{title}» і всі його фото буде видалено назавжди. Якщо товар уже продавали — перенесіть його в архів.
          </p>
          <ErrorText>{error}</ErrorText>
          <div className="row">
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              Ні
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api.del(`/api/admin/products/${id}`)
                  navigate('/admin/products', { replace: true })
                }).then(() => setConfirm(false))
              }
            >
              Видалити
            </button>
          </div>
        </Sheet>
      )}
    </section>
  )
}

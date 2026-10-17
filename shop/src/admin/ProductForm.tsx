import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Empty, Photo } from '../components/ui'
import { compressPhoto } from '../lib/images'
import { deleteProduct, newId, nextProductCode, saveProduct, StorageFullError, useShop } from '../lib/store'
import { uah } from '../lib/format'
import {
  CATEGORIES,
  CONDITION_LABEL,
  PRODUCT_STATUS_LABEL,
  type Category,
  type Condition,
  type Product,
  type ProductStatus,
} from '../lib/types'

// Size presets so a size is one tap, not typing, on a phone.
const SIZE_PRESETS: Partial<Record<Category, string[]>> = {
  Взуття: ['35', '36', '37', '38', '39', '40', '41'],
  Одяг: ['XS', 'S', 'M', 'L', 'XL'],
  Білизна: ['70B', '75B', '75C', '80B', 'S', 'M'],
  Купальники: ['XS', 'S', 'M', 'L'],
}

const MEASURE_HINT: Partial<Record<Category, string>> = {
  Взуття: 'Устілка: 24,5 см\nВисота халяви: 40 см\nПідбор: 9 см',
  Одяг: 'Довжина: 98 см\nПОГ: 46 см\nПОТ: 36 см',
  Білизна: 'Обхват під грудьми: 75 см',
  Купальники: 'ПОГ: 44 см, ПОС: 48 см',
}

function blank(code: string): Product {
  return {
    id: newId(),
    code,
    title: '',
    brand: '',
    category: 'Взуття',
    sizes: [],
    measurements: '',
    condition: 'new',
    description: '',
    price: 0,
    cost: 0,
    photos: [],
    status: 'available',
    createdAt: new Date().toISOString(),
  }
}

export function ProductForm() {
  const { id } = useParams()
  const { products, batches } = useShop()
  const navigate = useNavigate()
  const existing = products.find((p) => p.id === id)
  const [p, setP] = useState<Product>(() => existing ?? blank(nextProductCode()))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (id && !existing) {
    return <Empty icon="box" title="Товар не знайдено" action={<Link className="btn" to="/admin/products">До товарів</Link>} />
  }

  const set = <K extends keyof Product>(key: K, value: Product[K]) => setP((prev) => ({ ...prev, [key]: value }))

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const added = await Promise.all([...files].map(compressPhoto))
      setP((prev) => ({ ...prev, photos: [...prev.photos, ...added] }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const movePhoto = (i: number) =>
    setP((prev) => {
      const photos = [...prev.photos]
      ;[photos[i - 1], photos[i]] = [photos[i], photos[i - 1]]
      return { ...prev, photos }
    })

  const toggleSize = (size: string) =>
    setP((prev) =>
      prev.sizes.some((s) => s.size === size)
        ? { ...prev, sizes: prev.sizes.filter((s) => s.size !== size) }
        : { ...prev, sizes: [...prev.sizes, { size, qty: 1 }] },
    )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!p.title.trim()) return setError('Вкажіть назву товару')
    if (!(p.price > 0)) return setError('Вкажіть ціну продажу')
    try {
      saveProduct({ ...p, title: p.title.trim(), brand: p.brand.trim() })
      navigate('/admin/products')
    } catch (err) {
      setError(err instanceof StorageFullError ? err.message : 'Не вдалося зберегти')
    }
  }

  const remove = () => {
    if (!confirm('Видалити товар? Це не можна скасувати.')) return
    deleteProduct(p.id)
    navigate('/admin/products')
  }

  const margin = p.price - p.cost
  const presets = SIZE_PRESETS[p.category] ?? []

  return (
    <form className="stack" style={{ gap: 16 }} onSubmit={submit} noValidate>
      <div className="page-head">
        <div>
          <Link to="/admin/products" className="row faint" style={{ textDecoration: 'none' }}>
            <Icon name="back" size={16} /> Товари
          </Link>
          <h1 style={{ marginTop: 6 }}>{existing ? p.title || 'Товар' : 'Новий товар'}</h1>
          <p className="faint num">Код для покупців: {p.code}</p>
        </div>
      </div>

      <section className="card form-section">
        <h2>Фото</h2>
        <div className="photo-grid">
          {p.photos.map((src, i) => (
            <div key={i} className="photo-tile">
              <Photo src={src} alt={`Фото ${i + 1}`} />
              {i === 0 && <span className="cover-tag">Обкладинка</span>}
              <div className="tools">
                {i > 0 ? (
                  <button type="button" onClick={() => movePhoto(i)} aria-label="Перемістити ліворуч">
                    <Icon name="back" />
                  </button>
                ) : (
                  <span />
                )}
                <button type="button" onClick={() => set('photos', p.photos.filter((_, j) => j !== i))} aria-label="Видалити фото">
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          ))}
          <label className="photo-add">
            <Icon name="camera" />
            {busy ? 'Обробка…' : 'Додати фото'}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
          </label>
        </div>
        <p className="faint">Перше фото — обкладинка в каталозі. Фото стискаються автоматично.</p>
      </section>

      <section className="card form-section">
        <h2>Основне</h2>
        <label className="field">
          <span>Назва *</span>
          <input className="input" value={p.title} onChange={(e) => set('title', e.target.value)} placeholder="Напр.: Ботфорти замшеві" />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Бренд</span>
            <input className="input" value={p.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Бренд" />
          </label>
          <label className="field">
            <span>Категорія</span>
            <select className="input" value={p.category} onChange={(e) => set('category', e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Стан</span>
          <select className="input" value={p.condition} onChange={(e) => set('condition', e.target.value as Condition)}>
            {Object.entries(CONDITION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="card form-section">
        <h2>Розміри</h2>
        {presets.length > 0 && (
          <div className="row-wrap" role="group" aria-label="Швидкий вибір розміру">
            {presets.map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={p.sizes.some((x) => x.size === s)} onClick={() => toggleSize(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {p.sizes.map((s, i) => (
          <div key={i} className="size-row">
            <input
              className="input"
              aria-label="Розмір"
              value={s.size}
              onChange={(e) => set('sizes', p.sizes.map((x, j) => (j === i ? { ...x, size: e.target.value } : x)))}
            />
            <input
              className="input"
              aria-label="Кількість"
              type="number"
              min={0}
              inputMode="numeric"
              value={s.qty}
              onChange={(e) => set('sizes', p.sizes.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))}
            />
            <button className="icon-btn" type="button" aria-label="Прибрати розмір" onClick={() => set('sizes', p.sizes.filter((_, j) => j !== i))}>
              <Icon name="trash" />
            </button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" type="button" style={{ justifySelf: 'start' }} onClick={() => set('sizes', [...p.sizes, { size: '', qty: 1 }])}>
          <Icon name="plus" /> Свій розмір
        </button>
        <label className="field">
          <span>Заміри</span>
          <textarea className="input" value={p.measurements} onChange={(e) => set('measurements', e.target.value)} placeholder={MEASURE_HINT[p.category] ?? 'Заміри'} />
        </label>
      </section>

      <section className="card form-section">
        <h2>Опис</h2>
        <label className="field">
          <span>Опис для сайту</span>
          <textarea className="input" value={p.description} onChange={(e) => set('description', e.target.value)} placeholder="Матеріал, посадка, нюанси, якщо є" />
        </label>
      </section>

      <section className="card form-section">
        <h2>Ціна</h2>
        <div className="grid-2">
          <label className="field">
            <span>Ціна продажу, ₴ *</span>
            <input className="input" type="number" min={0} inputMode="numeric" value={p.price || ''} onChange={(e) => set('price', Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Стара ціна, ₴</span>
            <input className="input" type="number" min={0} inputMode="numeric" value={p.oldPrice || ''} onChange={(e) => set('oldPrice', Number(e.target.value) || undefined)} />
            <small>Перекреслена, для знижки</small>
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Закупівля, ₴</span>
            <input className="input" type="number" min={0} inputMode="numeric" value={p.cost || ''} onChange={(e) => set('cost', Number(e.target.value))} />
            <small>Бачите тільки ви</small>
          </label>
          <label className="field">
            <span>Закупівля / партія</span>
            <select className="input" value={p.batchId ?? ''} onChange={(e) => set('batchId', e.target.value || undefined)}>
              <option value="">— без партії —</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          </label>
        </div>
        {p.price > 0 && p.cost > 0 && (
          <p className="faint">
            Заробіток з речі: <b>{uah(margin)}</b> ({Math.round((margin / p.price) * 100)}% від ціни)
          </p>
        )}
      </section>

      <section className="card form-section">
        <h2>Показ на сайті</h2>
        <label className="field">
          <span>Статус</span>
          <select className="input" value={p.status} onChange={(e) => set('status', e.target.value as ProductStatus)}>
            {Object.entries(PRODUCT_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <small>Чернетку бачите тільки ви. Продане зникає з каталогу.</small>
        </label>
      </section>

      {error && (
        <p role="alert" style={{ color: 'var(--critical-ink)', fontWeight: 600 }}>
          {error}
        </p>
      )}

      <div className="sticky-actions">
        <button className="btn grow" type="submit" disabled={busy}>
          <Icon name="check" />
          Зберегти
        </button>
        {existing && (
          <button className="btn btn-danger" type="button" onClick={remove} aria-label="Видалити товар">
            <Icon name="trash" />
          </button>
        )}
      </div>
    </form>
  )
}

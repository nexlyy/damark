import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Icon } from '../components/Icon'
import { Empty, ErrorText, Sheet, Spinner } from '../components/ui'
import { api, query } from '../lib/api'
import { useFetch, useTitle } from '../lib/hooks'
import { useShop } from '../lib/shop'
import type { ProductCard as Card, ProductList } from '../lib/types'
import { ProductCard } from './ProductCard'

type Facets = { sizes: string[]; colors: string[]; brands: Array<{ name: string; slug: string }>; price: { min: number | null; max: number | null } }

const listKeys = ['size', 'color', 'brand'] as const

export function Catalog() {
  const { category } = useParams()
  const shop = useShop()
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const cat = shop.categories.find((c) => c.slug === category)

  const filters = {
    q: params.get('q') ?? '',
    size: params.get('size')?.split(',').filter(Boolean) ?? [],
    color: params.get('color')?.split(',').filter(Boolean) ?? [],
    brand: params.get('brand')?.split(',').filter(Boolean) ?? [],
    min: params.get('min') ?? '',
    max: params.get('max') ?? '',
    sale: params.get('sale') === '1',
    new: params.get('new') === '1',
    hit: params.get('hit') === '1',
    sort: params.get('sort') ?? 'new',
  }
  const key = `${category ?? ''}?${params.toString()}`

  const [items, setItems] = useState<Card[]>([])
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState<{ total: number; pages: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setItems([])
    setPage(1)
    setMeta(null)
  }, [key])

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .get<ProductList>(
        `/api/products${query({ category, q: filters.q, size: filters.size, color: filters.color, brand: filters.brand, min: filters.min, max: filters.max, sale: filters.sale, new: filters.new, hit: filters.hit, sort: filters.sort, page })}`,
      )
      .then((res) => {
        if (!alive) return
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items.filter((p) => !prev.some((x) => x.id === p.id))]))
        setMeta({ total: res.total, pages: res.pages })
        setError(null)
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [key, page])

  const facets = useFetch<Facets>(`/api/facets${query({ category })}`).data
  const title = filters.q ? `Пошук: ${filters.q}` : cat?.name ?? (filters.sale ? 'Акції' : filters.new ? 'Новинки' : filters.hit ? 'Хіти' : 'Каталог')
  useTitle(`${title} · ${shop.shop.name}`)

  const set = (patch: Record<string, string | string[] | boolean>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      const value = Array.isArray(v) ? v.join(',') : v === true ? '1' : v === false ? '' : v
      if (value) next.set(k, value)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const active = useMemo(() => {
    const out: Array<{ label: string; clear: () => void }> = []
    for (const k of listKeys)
      for (const v of filters[k]) out.push({ label: k === 'brand' ? facets?.brands.find((b) => b.slug === v)?.name ?? v : v, clear: () => set({ [k]: filters[k].filter((x) => x !== v) }) })
    if (filters.min || filters.max) out.push({ label: `${filters.min || 0}–${filters.max || '…'} ₴`, clear: () => set({ min: '', max: '' }) })
    if (filters.sale) out.push({ label: 'Акції', clear: () => set({ sale: false }) })
    if (filters.new) out.push({ label: 'Новинки', clear: () => set({ new: false }) })
    if (filters.hit) out.push({ label: 'Хіти', clear: () => set({ hit: false }) })
    if (filters.q) out.push({ label: `«${filters.q}»`, clear: () => set({ q: '' }) })
    return out
  }, [key, facets])

  return (
    <div className="wrap">
      <div className="catalog-head">
        <h1>{title}</h1>
        {meta && <span className="muted small">{meta.total} шт.</span>}
      </div>
      <div className="toolbar">
        <button className="btn ghost sm filters-btn" onClick={() => setFiltersOpen(true)}>
          <Icon name="filter" size={18} /> Фільтри{active.length ? ` · ${active.length}` : ''}
        </button>
        <select value={filters.sort} onChange={(e) => set({ sort: e.target.value === 'new' ? '' : e.target.value })} aria-label="Сортування">
          <option value="new">Спершу нові</option>
          <option value="price_asc">Спершу дешевші</option>
          <option value="price_desc">Спершу дорожчі</option>
        </select>
      </div>
      {active.length > 0 && (
        <div className="active-filters">
          {active.map((a) => (
            <button key={a.label} onClick={a.clear} aria-label={`Прибрати фільтр ${a.label}`}>
              {a.label} <Icon name="close" size={14} />
            </button>
          ))}
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      {items.length > 0 && (
        <div className="grid">
          {items.map((p, i) => (
            <ProductCard key={p.id} p={p} eager={i < 4} />
          ))}
        </div>
      )}
      {loading && <Spinner />}
      {!loading && !items.length && !error && (
        <Empty icon="search" title="Нічого не знайшли">
          {active.length > 0 && (
            <button className="btn" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Скинути фільтри
            </button>
          )}
        </Empty>
      )}
      {meta && page < meta.pages && !loading && (
        <div className="more">
          <button className="btn" onClick={() => setPage((p) => p + 1)}>
            Показати ще
          </button>
        </div>
      )}

      {filtersOpen && (
        <Sheet title="Фільтри" onClose={() => setFiltersOpen(false)}>
          <FilterPanel facets={facets} filters={filters} set={set} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn ghost" onClick={() => (setParams(new URLSearchParams(filters.q ? { q: filters.q } : {}), { replace: true }), setFiltersOpen(false))}>
              Скинути
            </button>
            <button className="btn main" onClick={() => setFiltersOpen(false)}>
              Показати{meta ? ` (${meta.total})` : ''}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function FilterPanel({
  facets,
  filters,
  set,
}: {
  facets: Facets | null
  filters: { size: string[]; color: string[]; brand: string[]; min: string; max: string; sale: boolean; new: boolean; hit: boolean }
  set: (patch: Record<string, string | string[] | boolean>) => void
}) {
  if (!facets) return <Spinner />
  const toggle = (k: (typeof listKeys)[number], v: string) => set({ [k]: filters[k].includes(v) ? filters[k].filter((x) => x !== v) : [...filters[k], v] })
  return (
    <div>
      {facets.sizes.length > 0 && (
        <div className="filter-group">
          <h3>Розмір</h3>
          <div className="chips">
            {facets.sizes.map((s) => (
              <button key={s} className="chip" aria-pressed={filters.size.includes(s)} onClick={() => toggle('size', s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      {facets.colors.length > 0 && (
        <div className="filter-group">
          <h3>Колір</h3>
          <div className="chips">
            {facets.colors.map((c) => (
              <button key={c} className="chip" aria-pressed={filters.color.includes(c)} onClick={() => toggle('color', c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      {facets.brands.length > 0 && (
        <div className="filter-group">
          <h3>Бренд</h3>
          <div className="chips">
            {facets.brands.map((b) => (
              <button key={b.slug} className="chip" aria-pressed={filters.brand.includes(b.slug)} onClick={() => toggle('brand', b.slug)}>
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="filter-group">
        <h3>Ціна, ₴</h3>
        <div className="row">
          <input inputMode="numeric" placeholder={`від ${facets.price.min ?? 0}`} value={filters.min} onChange={(e) => set({ min: e.target.value.replace(/\D/g, '') })} aria-label="Ціна від" />
          <input inputMode="numeric" placeholder={`до ${facets.price.max ?? ''}`} value={filters.max} onChange={(e) => set({ max: e.target.value.replace(/\D/g, '') })} aria-label="Ціна до" />
        </div>
      </div>
      <div className="filter-group chips">
        <button className="chip" aria-pressed={filters.sale} onClick={() => set({ sale: !filters.sale })}>
          Акції
        </button>
        <button className="chip" aria-pressed={filters.new} onClick={() => set({ new: !filters.new })}>
          Новинки
        </button>
        <button className="chip" aria-pressed={filters.hit} onClick={() => set({ hit: !filters.hit })}>
          Хіти
        </button>
      </div>
    </div>
  )
}

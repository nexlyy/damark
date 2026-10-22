import { useEffect, useState } from 'react'
import { api, query } from '../lib/api'
import { useDebounced } from '../lib/hooks'
import { money } from '../lib/format'

export type VariantHit = { variantId: number; productId: number; title: string; status: string; size: string; color: string; sku: string; stock: number; price: number; cost?: number | null; image: string | null }

// Find a product size to add to an order or a purchase.
export function VariantPicker({ onPick, placeholder = 'Знайти товар: назва, розмір, артикул', initial = '' }: { onPick: (v: VariantHit) => void; placeholder?: string; initial?: string }) {
  const [q, setQ] = useState(initial)
  const [open, setOpen] = useState(!!initial)
  const [hits, setHits] = useState<VariantHit[]>([])
  const debounced = useDebounced(q, 250)
  useEffect(() => {
    if (!open) return
    let alive = true
    api.get<VariantHit[]>(`/api/admin/variants${query({ q: debounced })}`).then((h) => alive && setHits(h))
    return () => {
      alive = false
    }
  }, [debounced, open])
  return (
    <div className="combo-pick">
      <input
        type="search"
        value={q}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        aria-label="Пошук товару"
      />
      {open && hits.length > 0 && (
        <ul>
          {hits.map((h) => (
            <li key={h.variantId}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick(h), setOpen(false), setQ(''))}>
                {h.image ? <img src={h.image} alt="" /> : <span className="thumb" style={{ width: 36, height: 45 }} />}
                <span style={{ display: 'grid', flex: 1, minWidth: 0 }}>
                  <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</b>
                  <span className="small muted">
                    {[h.size, h.color, h.sku].filter(Boolean).join(' · ') || 'без розміру'} · {money(h.price)}
                  </span>
                </span>
                <span className={`pill${h.stock ? '' : ' alarm'}`}>{h.stock} шт.</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { api, query } from '../lib/api'
import { useDebounced } from '../lib/hooks'
import type { City, Warehouse } from '../lib/types'
import { Icon } from './Icon'

export type NpValue = {
  city: { ref: string; name: string } | null
  warehouse: { ref: string; name: string; kind: 'branch' | 'postomat' } | null
}

// City, then branch or parcel locker, from Nova Poshta's own lists, so the
// TTN can be made without retyping anything. If the lists do not load, the
// address can be typed by hand.
export function NpPicker({ value, onChange, errors }: { value: NpValue; onChange: (v: NpValue) => void; errors?: { city?: string; warehouse?: string } }) {
  const [cityText, setCityText] = useState(value.city?.name ?? '')
  const [cities, setCities] = useState<City[]>([])
  const [cityOpen, setCityOpen] = useState(false)
  const [kind, setKind] = useState<'branch' | 'postomat'>(value.warehouse?.kind ?? 'branch')
  const [whText, setWhText] = useState('')
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [manual, setManual] = useState(!!value.city && !value.city.ref)
  const q = useDebounced(cityText, 250)

  useEffect(() => {
    if (manual || !cityOpen || q.trim().length < 2 || q === value.city?.name) return
    let alive = true
    api
      .get<City[]>(`/api/np/cities${query({ q })}`)
      .then((list) => alive && (setCities(list), setFailed(false)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [q, cityOpen, manual, value.city?.name])

  const cityRef = value.city?.ref
  useEffect(() => {
    if (!cityRef || manual) return
    let alive = true
    setWarehouses(null)
    api
      .get<Warehouse[]>(`/api/np/warehouses${query({ city: cityRef })}`)
      .then((list) => alive && setWarehouses(list))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [cityRef, manual])

  const shown = useMemo(() => {
    const t = whText.trim().toLowerCase()
    return (warehouses ?? []).filter((w) => w.kind === kind && (!t || w.name.toLowerCase().includes(t) || w.number === t.replace(/\D/g, '')))
  }, [warehouses, kind, whText])
  const hasLockers = (warehouses ?? []).some((w) => w.kind === 'postomat')

  if (manual)
    return (
      <div className="np">
        <label className={`field${errors?.city ? ' invalid' : ''}`}>
          <span className="field-label">Місто</span>
          <input value={value.city?.name ?? ''} onChange={(e) => onChange({ ...value, city: { ref: '', name: e.target.value } })} autoComplete="address-level2" />
          {errors?.city && <span className="field-error">{errors.city}</span>}
        </label>
        <label className={`field${errors?.warehouse ? ' invalid' : ''}`}>
          <span className="field-label">Відділення або поштомат Нової пошти</span>
          <input
            value={value.warehouse?.name ?? ''}
            placeholder="Наприклад: Відділення №5"
            onChange={(e) => onChange({ ...value, warehouse: { ref: '', name: e.target.value, kind: /поштомат/i.test(e.target.value) ? 'postomat' : 'branch' } })}
          />
          {errors?.warehouse && <span className="field-error">{errors.warehouse}</span>}
        </label>
        <button type="button" className="link-btn" onClick={() => (setManual(false), onChange({ city: null, warehouse: null }), setCityText(''))}>
          Обрати зі списку Нової пошти
        </button>
      </div>
    )

  return (
    <div className="np">
      <div className={`field combo${errors?.city ? ' invalid' : ''}`}>
        <label className="field-label" htmlFor="np-city">
          Місто
        </label>
        <input
          id="np-city"
          value={cityText}
          placeholder="Почніть вводити назву"
          autoComplete="off"
          role="combobox"
          aria-expanded={cityOpen && cities.length > 0}
          onFocus={() => setCityOpen(true)}
          onBlur={() => setTimeout(() => setCityOpen(false), 150)}
          onChange={(e) => {
            setCityText(e.target.value)
            setCityOpen(true)
            if (value.city) onChange({ city: null, warehouse: null })
          }}
        />
        {cityOpen && cities.length > 0 && !value.city && (
          <ul className="combo-list" role="listbox">
            {cities.map((c) => (
              <li key={c.ref + c.area + c.region}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange({ city: { ref: c.ref, name: c.name }, warehouse: null })
                    setCityText(c.name)
                    setCityOpen(false)
                    setWhText('')
                  }}
                >
                  <b>
                    {c.kind} {c.name}
                  </b>
                  <span>{[c.region, c.area && `${c.area} обл.`].filter(Boolean).join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {errors?.city && <span className="field-error">{errors.city}</span>}
      </div>

      {value.city && (
        <div className={`field${errors?.warehouse ? ' invalid' : ''}`}>
          <span className="field-label">Куди доставити</span>
          {hasLockers && (
            <div className="seg" role="tablist">
              <button type="button" role="tab" aria-selected={kind === 'branch'} onClick={() => setKind('branch')}>
                Відділення
              </button>
              <button type="button" role="tab" aria-selected={kind === 'postomat'} onClick={() => setKind('postomat')}>
                Поштомат
              </button>
            </div>
          )}
          {value.warehouse ? (
            <div className="np-chosen">
              <Icon name="check" size={18} />
              <span>{value.warehouse.name}</span>
              <button type="button" className="link-btn" onClick={() => onChange({ ...value, warehouse: null })}>
                Змінити
              </button>
            </div>
          ) : (
            <>
              <input value={whText} onChange={(e) => setWhText(e.target.value)} placeholder="Номер або вулиця" autoComplete="off" />
              <ul className="np-list">
                {warehouses === null && <li className="muted">Завантажуємо відділення…</li>}
                {warehouses !== null && !shown.length && <li className="muted">Нічого не знайшли</li>}
                {shown.slice(0, 40).map((w) => (
                  <li key={w.ref}>
                    <button type="button" onClick={() => onChange({ ...value, warehouse: { ref: w.ref, name: w.name, kind: w.kind } })}>
                      {w.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {errors?.warehouse && <span className="field-error">{errors.warehouse}</span>}
        </div>
      )}

      {failed && (
        <p className="hint">
          Довідник Нової пошти не відповідає.{' '}
          <button type="button" className="link-btn" onClick={() => setManual(true)}>
            Ввести адресу вручну
          </button>
        </p>
      )}
    </div>
  )
}

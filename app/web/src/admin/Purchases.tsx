import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Icon } from '../components/Icon'
import { Empty, ErrorText, Field, Sheet, Spinner, toast } from '../components/ui'
import { api } from '../lib/api'
import { date, money, today } from '../lib/format'
import { useAction, useFetch } from '../lib/hooks'
import { Top } from './AdminApp'
import { VariantPicker, type VariantHit } from './VariantPicker'

type Row = { id: number; date: string; supplier: string; note: string; extra_cost: number; created_by: string | null; pieces: number; amount: number }
type Detail = Row & { items: Array<{ id: number; title: string; size: string; color: string; qty: number; unit_cost: number }> }

// Goods coming in: each line adds stock and updates the cost of a piece.
export function Purchases() {
  const { data, loading, reload } = useFetch<Row[]>('/api/admin/purchases')
  const [open, setOpen] = useState<number | null>(null)
  return (
    <>
      <Top title="Закупки">
        <Link to="/admin/purchases/new" className="btn main sm">
          + Закупка
        </Link>
      </Top>
      <p className="hint" style={{ marginTop: 0 }}>
        Закупка додає речі на склад і рахує собівартість кожної — з неї рахується прибуток у «Фінансах».
      </p>
      <section className="card">
        {!data && loading && <Spinner />}
        {data && !data.length && <Empty icon="box" title="Закупок ще немає" />}
        <div className="list">
          {data?.map((p) => (
            <button key={p.id} className="list-row" style={{ border: 0, borderTop: '1px solid var(--line)', background: 'none', textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => setOpen(p.id)}>
              <div className="grow">
                <b>{p.supplier || 'Без постачальника'}</b>
                <span className="muted small">
                  {date(p.date)} · {p.pieces} шт.{p.created_by ? ` · ${p.created_by}` : ''}
                </span>
              </div>
              <div className="side">
                <b>{money(p.amount)}</b>
              </div>
            </button>
          ))}
        </div>
      </section>
      {open && <PurchaseView id={open} onClose={() => setOpen(null)} onDeleted={() => (setOpen(null), reload())} />}
    </>
  )
}

function PurchaseView({ id, onClose, onDeleted }: { id: number; onClose: () => void; onDeleted: () => void }) {
  const { data } = useFetch<Detail>(`/api/admin/purchases/${id}`)
  const { busy, error, run } = useAction()
  return (
    <Sheet title="Закупка" onClose={onClose}>
      {!data ? (
        <Spinner />
      ) : (
        <>
          <dl className="kv">
            <dt>Дата</dt>
            <dd>{date(data.date)}</dd>
            <dt>Постачальник</dt>
            <dd>{data.supplier || '—'}</dd>
            {data.extra_cost > 0 && (
              <>
                <dt>Доставка й інше</dt>
                <dd>{money(data.extra_cost)}</dd>
              </>
            )}
            {data.note && (
              <>
                <dt>Нотатка</dt>
                <dd>{data.note}</dd>
              </>
            )}
          </dl>
          <table className="grid-table money-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Річ</th>
                <th>К-сть</th>
                <th>Ціна</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.title} <span className="muted small">{[i.size, i.color].filter(Boolean).join(' · ')}</span>
                  </td>
                  <td>{i.qty}</td>
                  <td>{money(i.unit_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ErrorText>{error}</ErrorText>
          <button
            className="btn danger sm"
            style={{ marginTop: 14 }}
            disabled={busy}
            onClick={() =>
              confirm('Видалити закупку? Речі з неї знімуться зі складу.') &&
              run(async () => {
                await api.del(`/api/admin/purchases/${id}`)
                toast('Закупку видалено')
                onDeleted()
              })
            }
          >
            Видалити закупку
          </button>
        </>
      )}
    </Sheet>
  )
}

type Line = VariantHit & { qty: string; unitCost: string }

export function PurchaseNew() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [day, setDay] = useState(today())
  const [supplier, setSupplier] = useState('')
  const [extra, setExtra] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const { busy, error, run } = useAction()

  // From a product page: start with all its sizes.
  const productId = params.get('product')
  useEffect(() => {
    if (!productId) return
    api.get<{ title: string }>(`/api/admin/products/${productId}`).then((p) =>
      api.get<VariantHit[]>(`/api/admin/variants?q=${encodeURIComponent(p.title)}`).then((hits) =>
        setLines(hits.filter((h) => h.productId === Number(productId)).map((h) => ({ ...h, qty: '', unitCost: h.cost ? String(h.cost) : '' }))),
      ),
    )
  }, [productId])

  const add = (v: VariantHit) => setLines((ls) => (ls.some((l) => l.variantId === v.variantId) ? ls : [...ls, { ...v, qty: '1', unitCost: v.cost ? String(v.cost) : '' }]))
  const update = (id: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.variantId === id ? { ...l, ...patch } : l)))
  const filled = lines.filter((l) => Number(l.qty) > 0)
  const total = filled.reduce((s, l) => s + Number(l.qty) * (Number(l.unitCost.replace(',', '.')) || 0), 0) + (Number(extra.replace(',', '.')) || 0)

  return (
    <>
      <Top title="Нова закупка" back="/admin/purchases" />
      <section className="card">
        <div className="row">
          <Field label="Дата">
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="Постачальник">
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="7 км, Садовод…" />
          </Field>
        </div>
        <VariantPicker onPick={add} placeholder="Додати товар: назва, розмір, артикул" />
        <p className="hint">Товару ще немає в каталозі? Спершу створіть його (можна чернеткою), потім оприбуткуйте тут.</p>
        {lines.length > 0 && (
          <div className="scroll-x">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th className="narrow">Кількість</th>
                  <th className="narrow">Ціна за шт., ₴</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.variantId}>
                    <td>
                      <b className="small">{l.title}</b>
                      <div className="muted small">
                        {[l.size, l.color].filter(Boolean).join(' · ') || 'без розміру'} · зараз {l.stock}
                      </div>
                    </td>
                    <td>
                      <input inputMode="numeric" value={l.qty} onChange={(e) => update(l.variantId, { qty: e.target.value.replace(/\D/g, '') })} />
                    </td>
                    <td>
                      <input inputMode="decimal" value={l.unitCost} onChange={(e) => update(l.variantId, { unitCost: e.target.value })} />
                    </td>
                    <td>
                      <button className="icon-btn" aria-label="Прибрати" onClick={() => setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))}>
                        <Icon name="trash" size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <Field label="Доставка й інші витрати, ₴" hint="Розподіляться на всі речі">
            <input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </Field>
          <Field label="Нотатка">
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <div className="totals">
          <div className="grand">
            <span>Усього</span>
            <span>
              {filled.reduce((s, l) => s + Number(l.qty), 0)} шт. · {money(total)}
            </span>
          </div>
        </div>
      </section>
      <ErrorText>{error}</ErrorText>
      <div className="sticky-save">
        <button
          className="btn main"
          disabled={busy || !filled.length}
          onClick={() =>
            run(async () => {
              if (filled.some((l) => l.unitCost.trim() === '')) throw new Error('Вкажіть ціну за штуку для кожного рядка.')
              await api.post('/api/admin/purchases', {
                date: day,
                supplier,
                note,
                extraCost: Number(extra.replace(',', '.')) || 0,
                items: filled.map((l) => ({ variantId: l.variantId, qty: Number(l.qty), unitCost: Number(l.unitCost.replace(',', '.')) })),
              })
              toast('Закупку збережено, залишки оновлено')
              navigate('/admin/purchases')
            })
          }
        >
          Оприбуткувати
        </button>
      </div>
    </>
  )
}

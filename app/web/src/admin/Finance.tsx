import { useState } from 'react'
import { ErrorText, Field, Sheet, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { date, money, today } from '../lib/format'
import { useAction, useFetch } from '../lib/hooks'
import { Top } from './AdminApp'

type Month = { month: string; orders: number; pieces: number; revenue: number; cogs: number; gross: number; expenses: number; profit: number; uncosted: number }
type Data = { months: Month[]; stock: { pieces: number; cost: number; retail: number } }
type Expense = { id: number; date: string; category: string; amount: number; note: string; created_by_name: string | null }

const monthName = (m: string) => {
  const [y, mm] = m.split('-').map(Number)
  return new Date(y, mm - 1, 1).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
}

export function Finance() {
  const { data, reload } = useFetch<Data>('/api/admin/finance')
  const thisMonth = today().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const expenses = useFetch<Expense[]>(`/api/admin/expenses?month=${month}`)
  const [edit, setEdit] = useState<Expense | 'new' | null>(null)
  if (!data) return <Spinner />
  const max = Math.max(1, ...data.months.map((m) => Math.max(m.revenue, Math.abs(m.profit))))
  const months = [...data.months].reverse()
  const uncosted = data.months.reduce((s, m) => s + m.uncosted, 0)
  return (
    <>
      <Top title="Фінанси" />
      <div className="tiles">
        <div className="tile">
          <b>{money(data.months.find((m) => m.month === thisMonth)?.revenue ?? 0)}</b>
          <span>Виручка цього місяця</span>
        </div>
        <div className="tile ok">
          <b>{money(data.months.find((m) => m.month === thisMonth)?.profit ?? 0)}</b>
          <span>Прибуток цього місяця</span>
        </div>
        <div className="tile">
          <b>{data.stock.pieces}</b>
          <span>Речей на складі</span>
        </div>
        <div className="tile">
          <b>{money(data.stock.cost)}</b>
          <span>Склад за собівартістю · у цінах продажу {money(data.stock.retail)}</span>
        </div>
      </div>

      {uncosted > 0 && (
        <p className="warning">
          {uncosted} проданих позицій без собівартості — прибуток для них завищений. Вкажіть собівартість у товарі або оприбуткуйте закупку.
        </p>
      )}

      <section className="card" style={{ marginTop: 14 }}>
        <h2>По місяцях</h2>
        {months.length > 0 && (
          <div className="bars" aria-hidden="true">
            {months.map((m) => (
              <div key={m.month} className={m.profit < 0 ? 'neg' : ''} style={{ height: `${Math.max(3, (Math.abs(m.profit) / max) * 100)}%` }} title={`${monthName(m.month)}: прибуток ${money(m.profit)}`} />
            ))}
          </div>
        )}
        <div className="scroll-x">
          <table className="grid-table money-table" style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>Місяць</th>
                <th>Замовл.</th>
                <th>Виручка</th>
                <th>Собівартість</th>
                <th>Витрати</th>
                <th>Прибуток</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m) => (
                <tr key={m.month} onClick={() => setMonth(m.month)} style={{ cursor: 'pointer', background: m.month === month ? 'var(--soft)' : undefined }}>
                  <td>{monthName(m.month)}</td>
                  <td>{m.orders}</td>
                  <td>{money(m.revenue)}</td>
                  <td>{money(m.cogs)}</td>
                  <td>{money(m.expenses)}</td>
                  <td>
                    <b className={m.profit < 0 ? 'field-error' : ''}>{money(m.profit)}</b>
                  </td>
                </tr>
              ))}
              {!data.months.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    Ще немає оплачених замовлень.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="hint">Виручка — оплачені замовлення за місяцем оплати, мінус повернення. Собівартість — з закупок.</p>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="section-title">
          <h2>Витрати: {monthName(month)}</h2>
          <button className="btn main sm" onClick={() => setEdit('new')}>
            + Витрата
          </button>
        </div>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ maxWidth: 220, marginBottom: 10 }} aria-label="Місяць" />
        <div className="list">
          {expenses.data?.map((e) => (
            <button key={e.id} className="list-row" style={{ border: 0, borderTop: '1px solid var(--line)', background: 'none', textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => setEdit(e)}>
              <div className="grow">
                <b>{e.category}</b>
                <span className="muted small">
                  {date(e.date)}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
              </div>
              <b>{money(e.amount)}</b>
            </button>
          ))}
          {expenses.data && !expenses.data.length && <p className="muted">Витрат за цей місяць немає. Реклама, упаковка, оренда — додавайте сюди.</p>}
        </div>
      </section>

      {edit && (
        <ExpenseForm
          expense={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            expenses.reload()
            reload()
          }}
        />
      )}
    </>
  )
}

function ExpenseForm({ expense, onClose, onSaved }: { expense: Expense | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ date: expense?.date ?? today(), category: expense?.category ?? '', amount: expense ? String(expense.amount) : '', note: expense?.note ?? '' })
  const cats = useFetch<Array<{ category: string }>>('/api/admin/expense-categories').data
  const { busy, error, run } = useAction()
  const body = () => ({ ...form, amount: Number(form.amount.replace(',', '.')) || 0 })
  return (
    <Sheet title={expense ? 'Витрата' : 'Нова витрата'} onClose={onClose}>
      <div className="row">
        <Field label="Дата">
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Сума, ₴">
          <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
      </div>
      <Field label="Стаття">
        <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} list="expense-cats" placeholder="Реклама, упаковка, оренда…" />
        <datalist id="expense-cats">
          {[...new Set([...(cats ?? []).map((c) => c.category), 'Реклама', 'Упаковка', 'Доставка', 'Оренда', 'Зарплата'])].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Нотатка">
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="row">
        {expense ? (
          <button
            className="btn danger"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.del(`/api/admin/expenses/${expense.id}`)
                onSaved()
              })
            }
          >
            Видалити
          </button>
        ) : (
          <button className="btn ghost" onClick={onClose}>
            Скасувати
          </button>
        )}
        <button
          className="btn main"
          disabled={busy}
          onClick={() =>
            run(async () => {
              if (expense) await api.put(`/api/admin/expenses/${expense.id}`, body())
              else await api.post('/api/admin/expenses', body())
              onSaved()
            })
          }
        >
          Зберегти
        </button>
      </div>
    </Sheet>
  )
}

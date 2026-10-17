import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Empty, Sheet } from '../components/ui'
import { deleteBatch, newId, saveBatch, useShop } from '../lib/store'
import { dateShort, uah } from '../lib/format'
import { batchResult } from '../lib/stats'
import type { Batch } from '../lib/types'

// A reseller buys by the bag or the lot, not by the piece. This page answers
// "did that bag pay off?": what it cost against what its pieces sold for.
export function Batches() {
  const data = useShop()
  const [editing, setEditing] = useState<Batch | null>(null)

  const blank = (): Batch => ({ id: newId(), title: '', date: new Date().toISOString(), cost: 0, note: '' })

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Закупівлі</h1>
          <p className="muted">Скільки коштувала партія і скільки вона вже заробила.</p>
        </div>
        <button className="btn" type="button" onClick={() => setEditing(blank())}>
          <Icon name="plus" />
          Нова закупівля
        </button>
      </div>

      {data.batches.length === 0 ? (
        <Empty
          icon="layers"
          title="Закупівель ще немає"
          action={
            <button className="btn" type="button" onClick={() => setEditing(blank())}>
              Внести закупівлю
            </button>
          }
        >
          Внесіть мішок чи партію з ціною, а потім прив’язуйте до неї товари — побачите, коли вона окупилась.
        </Empty>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Партія</th>
                <th className="r">Продано</th>
                <th className="r">Закупівля</th>
                <th className="r">Виручка</th>
                <th className="r">Результат</th>
              </tr>
            </thead>
            <tbody>
              {data.batches.map((b) => {
                const r = batchResult(data, b.id)
                return (
                  <tr key={b.id} onClick={() => setEditing(b)} style={{ cursor: 'pointer' }}>
                    <td>
                      <b>{b.title}</b>
                      <div className="faint">{dateShort(b.date)}</div>
                    </td>
                    <td className="r">{r.sold} / {r.total}</td>
                    <td className="r">{uah(b.cost)}</td>
                    <td className="r">{uah(r.revenue)}</td>
                    <td className="r" style={{ fontWeight: 700, color: r.profit >= 0 ? 'var(--good-ink)' : 'var(--critical-ink)' }}>
                      {r.profit >= 0 ? '▲ +' : '▼ '}
                      {uah(r.profit)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <BatchSheet batch={editing} isNew={!data.batches.some((b) => b.id === editing.id)} onClose={() => setEditing(null)} />}
    </>
  )
}

function BatchSheet({ batch, isNew, onClose }: { batch: Batch; isNew: boolean; onClose: () => void }) {
  const [b, setB] = useState(batch)
  return (
    <Sheet title={isNew ? 'Нова закупівля' : b.title} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Назва</span>
          <input className="input" value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} placeholder="Напр.: Мішок взуття, Італія" />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Дата</span>
            <input className="input" type="date" value={b.date.slice(0, 10)} onChange={(e) => e.target.value && setB({ ...b, date: new Date(e.target.value).toISOString() })} />
          </label>
          <label className="field">
            <span>Сума закупівлі, ₴</span>
            <input className="input" type="number" min={0} inputMode="numeric" value={b.cost || ''} onChange={(e) => setB({ ...b, cost: Number(e.target.value) })} />
          </label>
        </div>
        <label className="field">
          <span>Нотатка</span>
          <textarea className="input" style={{ minHeight: 64 }} value={b.note} onChange={(e) => setB({ ...b, note: e.target.value })} placeholder="Постачальник, доставка, скільки речей у мішку" />
        </label>
        <div className="row">
          <button
            className="btn grow"
            type="button"
            onClick={() => {
              saveBatch({ ...b, title: b.title.trim() || 'Закупівля' })
              onClose()
            }}
          >
            Зберегти
          </button>
          {!isNew && (
            <button
              className="btn btn-danger"
              type="button"
              aria-label="Видалити закупівлю"
              onClick={() => {
                if (confirm('Видалити закупівлю? Товари залишаться, але без партії.')) {
                  deleteBatch(b.id)
                  onClose()
                }
              }}
            >
              <Icon name="trash" />
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}

import { useState } from 'react'
import { Empty, Spinner, Stars } from '../components/ui'
import { api } from '../lib/api'
import { dateTime } from '../lib/format'
import { useFetch } from '../lib/hooks'
import type { Photo } from '../lib/types'
import { Top, useCounts } from './AdminApp'

type Review = { id: number; name: string; rating: number; text: string; reply: string; status: string; created_at: string; product: string | null; product_slug: string | null; photos: Photo[] }

export function Reviews() {
  const [status, setStatus] = useState('pending')
  const { data, reload } = useFetch<Review[]>(`/api/admin/reviews?status=${status}`)
  const { refresh } = useCounts()
  const update = async (id: number, patch: object) => {
    await api.patch(`/api/admin/reviews/${id}`, patch)
    reload()
    refresh()
  }
  return (
    <>
      <Top title="Відгуки" />
      <div className="tabs-row" role="tablist">
        {[
          ['pending', 'На перевірці'],
          ['approved', 'Опубліковані'],
          ['rejected', 'Відхилені'],
        ].map(([v, l]) => (
          <button key={v} role="tab" aria-selected={status === v} onClick={() => setStatus(v)}>
            {l}
          </button>
        ))}
      </div>
      {!data && <Spinner />}
      {data && !data.length && <Empty icon="star" title="Тут порожньо" />}
      <div className="stack">
        {data?.map((r) => (
          <ReviewItem key={r.id} r={r} update={update} remove={async () => (await api.del(`/api/admin/reviews/${r.id}`), reload(), refresh())} />
        ))}
      </div>
    </>
  )
}

function ReviewItem({ r, update, remove }: { r: Review; update: (id: number, patch: object) => Promise<void>; remove: () => void }) {
  const [reply, setReply] = useState(r.reply)
  return (
    <article className="card">
      <div className="section-title">
        <b>{r.name}</b>
        <Stars value={r.rating} />
      </div>
      <p className="muted small" style={{ margin: '0 0 6px' }}>
        {dateTime(r.created_at)}
        {r.product ? (
          <>
            {' · '}
            <a href={`/p/${r.product_slug}`} target="_blank" rel="noreferrer">
              {r.product}
            </a>
          </>
        ) : (
          ' · про магазин'
        )}
      </p>
      <p style={{ whiteSpace: 'pre-line', margin: '0 0 10px' }}>{r.text}</p>
      {r.photos.length > 0 && (
        <div className="chips" style={{ marginBottom: 10 }}>
          {r.photos.map((p) => (
            <a key={p.id} href={p.l} target="_blank" rel="noreferrer">
              <img src={p.s} alt="" style={{ width: 72, height: 90, objectFit: 'cover', borderRadius: 10 }} />
            </a>
          ))}
        </div>
      )}
      <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} style={{ minHeight: 60 }} placeholder="Відповідь від магазину (за бажанням)" />
      <div className="actions" style={{ marginTop: 10 }}>
        {r.status !== 'approved' && (
          <button className="btn ok sm" onClick={() => update(r.id, { status: 'approved', reply })}>
            Опублікувати
          </button>
        )}
        {r.status === 'approved' && reply !== r.reply && (
          <button className="btn sm" onClick={() => update(r.id, { reply })}>
            Зберегти відповідь
          </button>
        )}
        {r.status !== 'rejected' && (
          <button className="btn ghost sm" onClick={() => update(r.id, { status: 'rejected' })}>
            Відхилити
          </button>
        )}
        <button className="btn danger sm" onClick={() => confirm('Видалити відгук назавжди?') && remove()}>
          Видалити
        </button>
      </div>
    </article>
  )
}

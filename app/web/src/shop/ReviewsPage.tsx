import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Icon } from '../components/Icon'
import { ErrorText, Field, Spinner, Stars } from '../components/ui'
import { api } from '../lib/api'
import { useAction, useFetch, useTitle } from '../lib/hooks'
import { uploadImage } from '../lib/images'
import type { Review } from '../lib/types'
import { ReviewCard } from './ProductPage'

type Data = { items: Review[]; stats: { count: number; avg: number | null } }

export function ReviewsPage() {
  const [params] = useSearchParams()
  const { data } = useFetch<Data>('/api/reviews')
  useTitle('Відгуки')
  const productId = Number(params.get('product')) || null
  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="catalog-head">
        <h1>Відгуки</h1>
        {data?.stats.count ? (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <Stars value={data.stats.avg ?? 0} /> <b>{data.stats.avg}</b> <span className="muted small">· {data.stats.count}</span>
          </span>
        ) : null}
      </div>
      <ReviewForm productId={productId} />
      <div className="stack" style={{ marginTop: 18 }}>
        {!data && <Spinner />}
        {data?.items.map((r) => (
          <ReviewCard key={r.id} r={r} />
        ))}
        {data && !data.items.length && <p className="muted">Будьте першими, хто залишить відгук.</p>}
      </div>
    </div>
  )
}

function ReviewForm({ productId }: { productId: number | null }) {
  const [name, setName] = useState('')
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<Array<{ id: number; s: string }>>([])
  const [uploading, setUploading] = useState(false)
  const [sent, setSent] = useState(false)
  const { busy, error, setError, run } = useAction()

  const addPhotos = async (files: FileList | null) => {
    if (!files) return
    setUploading(true)
    try {
      for (const f of Array.from(files).slice(0, 4 - photos.length)) {
        const res = await uploadImage('/api/reviews/photo', f)
        setPhotos((p) => [...p, { id: res.id, s: res.s }])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      await api.post('/api/reviews', { productId, name, rating, text, photoIds: photos.map((p) => p.id) })
      setSent(true)
    })
  }

  if (sent) return <p className="note-ok" id="write">Дякуємо! Відгук зʼявиться після перевірки.</p>
  return (
    <form className="card" id="write" onSubmit={submit}>
      <h2>Залишити відгук</h2>
      <div className="rating-pick" role="radiogroup" aria-label="Оцінка">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={n === rating} aria-label={`${n} з 5`} onClick={() => setRating(n)}>
            <Icon name="star" size={30} filled={n <= rating} />
          </button>
        ))}
      </div>
      <Field label="Ваше ім'я">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
      </Field>
      <Field label="Відгук">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} required />
      </Field>
      <div className="chips" style={{ marginBottom: 14 }}>
        {photos.map((p) => (
          <img key={p.id} src={p.s} alt="" style={{ width: 64, height: 80, objectFit: 'cover', borderRadius: 10 }} />
        ))}
        {photos.length < 4 && (
          <label className="chip" style={{ cursor: 'pointer' }}>
            <Icon name="photo" size={18} /> {uploading ? 'Завантажуємо…' : 'Додати фото'}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} disabled={uploading} />
          </label>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
      <button className="btn main block" disabled={busy || uploading}>
        Надіслати
      </button>
    </form>
  )
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { photoUrl } from '../lib/photos'
import { Icon, type IconName } from './Icon'
import {
  LIVE_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  PRODUCT_STATUS_LABEL,
  type LiveStatus,
  type OrderStatus,
  type ProductStatus,
} from '../lib/types'

type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'brand' | 'neutral'

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="badge" data-tone={tone}>
      {children}
    </span>
  )
}

const PRODUCT_TONE: Record<ProductStatus, Tone> = {
  draft: 'neutral',
  available: 'good',
  reserved: 'warning',
  sold: 'brand',
}

export function ProductBadge({ status }: { status: ProductStatus }) {
  return <Badge tone={PRODUCT_TONE[status]}>{PRODUCT_STATUS_LABEL[status]}</Badge>
}

const ORDER_TONE: Record<OrderStatus, Tone> = {
  new: 'brand',
  awaiting_payment: 'warning',
  paid: 'good',
  shipped: 'brand',
  done: 'neutral',
  refused: 'critical',
  cancelled: 'neutral',
}

export function OrderBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>
}

const LIVE_TONE: Record<LiveStatus, Tone> = { planned: 'brand', live: 'critical', done: 'neutral' }

export function LiveBadge({ status }: { status: LiveStatus }) {
  return <Badge tone={LIVE_TONE[status]}>{LIVE_STATUS_LABEL[status]}</Badge>
}

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

function usePhotoUrl(ref?: string): string | undefined {
  const [loaded, setLoaded] = useState<[string, string] | null>(null)
  useEffect(() => {
    if (!ref) return
    let live = true
    photoUrl(ref).then((url) => live && setLoaded([ref, url]), () => {})
    return () => {
      live = false
    }
  }, [ref])
  if (!ref) return undefined
  if (!ref.startsWith('idb:')) return ref
  return loaded && loaded[0] === ref ? loaded[1] || undefined : undefined
}

export function Photo({ src: ref, alt, className }: { src?: string; alt: string; className?: string }) {
  const src = usePhotoUrl(ref)
  if (!src) {
    return (
      <div className={'photo photo-empty ' + (className ?? '')} role="img" aria-label={alt + ' — фото ще немає'}>
        <Icon name="image" />
      </div>
    )
  }
  return (
    <div className={'photo ' + (className ?? '')}>
      <img src={src} alt={alt} loading="lazy" />
    </div>
  )
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Once per opening: callers pass a fresh onClose on every render, and
  // re-running this would pull focus out of the field being typed in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    document.addEventListener('keydown', onKey)
    const scroll = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = scroll
    }
  }, [])

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="spread" style={{ marginBottom: 16 }}>
          <h2>{title}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Закрити">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function useToast(): [ReactNode, (text: string) => void] {
  const [text, setText] = useState('')
  useEffect(() => {
    if (!text) return
    const t = setTimeout(() => setText(''), 2600)
    return () => clearTimeout(t)
  }, [text])
  const node = text ? (
    <div className="toast" role="status">
      {text}
    </div>
  ) : null
  return [node, setText]
}

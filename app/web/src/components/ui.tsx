import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { copyText } from '../lib/inapp'
import type { Photo } from '../lib/types'

// A panel over the page: a bottom sheet on phones, a dialog on wide screens.
export function Sheet({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', key)
      document.body.style.overflow = overflow
    }
  }, [onClose])
  return createPortal(
    <div className="sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрити">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function Img({ photo, sizes, alt, eager = false, className }: { photo: Photo; sizes: string; alt: string; eager?: boolean; className?: string }) {
  return (
    <img
      className={className}
      src={photo.m}
      srcSet={`${photo.s} 480w, ${photo.m} 960w, ${photo.l} 1600w`}
      sizes={sizes}
      alt={alt}
      width={photo.width}
      height={photo.height}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${value} з 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} filled={n <= Math.round(value)} />
      ))}
    </span>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="error" role="alert">
      <Icon name="alert" size={18} />
      <span>{children}</span>
    </p>
  )
}

export function Spinner({ label = 'Завантаження…' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span />
      {label}
    </div>
  )
}

export function Empty({ icon = 'box', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={34} />
      <h3>{title}</h3>
      {children}
    </div>
  )
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(text: string) {
  let el = document.getElementById('toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast'
    el.className = 'toast'
    el.setAttribute('role', 'status')
    document.body.appendChild(el)
  }
  el.textContent = text
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    if (el) el.hidden = true
  }, 2400)
}

export function CopyButton({ text, label, className = 'copy-btn' }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={`${className}${done ? ' done' : ''}`}
      aria-label={`Скопіювати: ${label}`}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true)
          toast(`Скопійовано: ${label}`)
          setTimeout(() => setDone(false), 1500)
        } else {
          window.prompt('Скопіюйте:', text)
        }
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={18} />
    </button>
  )
}

export function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <label className={`field${error ? ' invalid' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Qty({ value, max, onChange, small = false }: { value: number; max: number; onChange: (n: number) => void; small?: boolean }) {
  return (
    <span className={`qty${small ? ' small' : ''}`}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Менше">
        <Icon name="minus" size={16} />
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Більше">
        <Icon name="plus" size={16} />
      </button>
    </span>
  )
}

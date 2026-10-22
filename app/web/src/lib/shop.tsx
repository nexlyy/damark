import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import type { ShopInfo } from './types'
import { loadUmami } from './umami'

// Contacts, requisites and categories, loaded once for every page.
const ShopContext = createContext<ShopInfo | null>(null)

export function ShopProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<ShopInfo | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    api
      .get<ShopInfo>('/api/shop')
      .then((data) => {
        setInfo(data)
        if (data.umamiWebsiteId) loadUmami(data.umamiWebsiteId)
      })
      .catch(() => setFailed(true))
  }, [])
  if (failed)
    return (
      <div className="boot">
        <p>Не вдалося завантажити магазин. Перевірте інтернет і оновіть сторінку.</p>
        <button className="btn" onClick={() => location.reload()}>
          Оновити
        </button>
      </div>
    )
  if (!info) return <div className="boot" aria-busy="true" />
  return <ShopContext.Provider value={info}>{children}</ShopContext.Provider>
}

export function useShop(): ShopInfo {
  const info = useContext(ShopContext)
  if (!info) throw new Error('useShop outside ShopProvider')
  return info
}

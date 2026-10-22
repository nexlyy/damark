import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

// Load JSON for a page. Keeps the old data on screen while new data loads,
// so filters and tabs do not flash.
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!url) return
    let alive = true
    setLoading(true)
    api
      .get<T>(url)
      .then((d) => {
        if (!alive) return
        setData(d)
        setError(null)
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [url, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload, setData }
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// Run an action, show its error, block double taps.
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined
    running.current = true
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError((e as Error).message)
      return undefined
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [])
  return { busy, error, setError, run }
}

export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}

import { Suspense, useEffect, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ShopLayout } from './shop/ShopLayout'
import { Catalog } from './shop/Catalog'
import { ProductPage } from './shop/ProductPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { lazyPage } from './lib/lazy'
import { demoData } from './lib/demo'
import { replaceAll, snapshot } from './lib/store'

const AdminRoutes = lazyPage(() => import('./admin/AdminRoutes'))

// A new screen starts at its top, not wherever the last long form was left.
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

// A link ending in ?demo=1 opens with the invented example already loaded,
// so it can be sent to someone who will not go looking for the button. It
// never replaces products someone has added.
function DemoFromLink() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const params = new URLSearchParams(search)
    if (params.get('demo') !== '1') return
    if (!snapshot().products.length) replaceAll(demoData(snapshot().settings))
    params.delete('demo')
    const rest = params.toString()
    navigate(pathname + (rest ? '?' + rest : ''), { replace: true })
  }, [pathname, search, navigate])
  return null
}

// A screen that fails stays contained, and moving to another screen clears it.
function Contained({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}

const loading = (
  <div className="empty" style={{ margin: 16, border: 0 }} aria-busy="true">
    Завантаження…
  </div>
)

export function App() {
  return (
    <HashRouter>
      <ScrollToTop />
      <DemoFromLink />
      <Contained>
        <Routes>
          <Route element={<ShopLayout />}>
            <Route index element={<Catalog />} />
            <Route path="item/:id" element={<ProductPage />} />
          </Route>
          <Route
            path="admin/*"
            element={
              <Suspense fallback={loading}>
                <AdminRoutes />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Contained>
    </HashRouter>
  )
}

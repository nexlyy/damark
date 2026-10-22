import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/600.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/montserrat/800.css'
import './styles.css'
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { lazyPage } from './lib/lazy'
import { ShopApp } from './shop/ShopApp'
import { Spinner } from './components/ui'

// The admin is a separate chunk: buyers never download it.
const AdminApp = lazyPage(() => import('./admin/AdminApp'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<Spinner />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route path="/*" element={<ShopApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

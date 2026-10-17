import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ShopLayout } from './shop/ShopLayout'
import { Catalog } from './shop/Catalog'
import { ProductPage } from './shop/ProductPage'
import { AdminLayout, MorePage } from './admin/AdminLayout'
import { Dashboard } from './admin/Dashboard'
import { Products } from './admin/Products'
import { ProductForm } from './admin/ProductForm'
import { Lives, LiveMode } from './admin/Lives'
import { Orders } from './admin/Orders'
import { Customers } from './admin/Customers'
import { Batches } from './admin/Batches'
import { Settings } from './admin/Settings'

// A fresh form for every product, rather than one that keeps the last
// product's fields when the address changes underneath it.
function ProductFormRoute() {
  const { id } = useParams()
  return <ProductForm key={id ?? 'new'} />
}

// A new screen starts at its top, not wherever the last long form was left.
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

export function App() {
  return (
    <HashRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<ShopLayout />}>
          <Route index element={<Catalog />} />
          <Route path="item/:id" element={<ProductPage />} />
        </Route>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<ProductFormRoute />} />
          <Route path="products/:id" element={<ProductFormRoute />} />
          <Route path="lives" element={<Lives />} />
          <Route path="lives/:id" element={<LiveMode />} />
          <Route path="orders" element={<Orders />} />
          <Route path="customers" element={<Customers />} />
          <Route path="batches" element={<Batches />} />
          <Route path="settings" element={<Settings />} />
          <Route path="more" element={<MorePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

import { Route, Routes, useParams } from 'react-router-dom'
import { AdminLayout, MorePage } from './AdminLayout'
import { Dashboard } from './Dashboard'
import { Products } from './Products'
import { ProductForm } from './ProductForm'
import { Lives, LiveMode } from './Lives'
import { Orders } from './Orders'
import { Customers } from './Customers'
import { Batches } from './Batches'
import { Settings } from './Settings'

// The admin is loaded as its own file, so a buyer opening the catalog from
// TikTok never downloads it.

// A fresh form for every product, rather than one that keeps the last
// product's fields when the address changes underneath it.
function ProductFormRoute() {
  const { id } = useParams()
  return <ProductForm key={id ?? 'new'} />
}

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
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
    </Routes>
  )
}

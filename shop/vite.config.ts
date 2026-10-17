import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative asset paths and a hash router: the built folder runs from any
// static host, or straight from disk, with no server rules.
export default defineConfig({
  base: './',
  plugins: [react()],
})

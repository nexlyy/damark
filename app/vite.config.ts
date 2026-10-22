import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The web app lives in web/ and builds into dist/web, which the server (or
// nginx) serves. In development /api and /media go to the server on 8810.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: 'es2020',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8810',
      '/media': 'http://127.0.0.1:8810',
    },
  },
})

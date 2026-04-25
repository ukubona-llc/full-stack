import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': { target: 'http://localhost:8000', changeOrigin: true },
      '/records': { target: 'http://localhost:8000', changeOrigin: true },
      '/audit': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})

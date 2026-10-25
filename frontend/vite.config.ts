import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // In development, the Django API runs on :8000. In production both share one origin.
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  build: { chunkSizeWarningLimit: 1500 }, // MapLibre alone is ~1 MB
})

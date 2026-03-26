import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/comex/',
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          d3: ['d3'],
          topojson: ['topojson-client'],
        },
      },
    },
    sourcemap: true,
  },
})

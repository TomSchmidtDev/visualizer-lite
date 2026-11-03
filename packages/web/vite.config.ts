import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sharedDefine } from './vite.shared.js'

export default defineConfig({
  define: sharedDefine,
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/shots': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})

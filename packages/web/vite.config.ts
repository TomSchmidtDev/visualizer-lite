import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'child_process'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
const gitHash = (() => {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim() } catch { return '' }
})()

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__:  JSON.stringify(buildTime),
    __GIT_HASH__:    JSON.stringify(gitHash),
  },
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

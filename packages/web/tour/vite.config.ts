// Vite config for the demo tour — a separate static build, never part of the app image.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { sharedDefine } from '../vite.shared.js'

export default defineConfig({
  root: resolve(__dirname),
  base: process.env.TOUR_BASE ?? '/',
  publicDir: false,
  define: sharedDefine,
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '../dist-tour'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  server: { port: 5174 },
  preview: { port: 4173 },
})

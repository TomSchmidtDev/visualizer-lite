// Boots the demo: language, demo data, fetch shim, click guards, app routes and overlay.
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../src/i18n/index.js'
import { AppRoutes } from '../src/App.js'
import type { DemoDataset } from './data/types.js'
import { rebaseDataset } from './data/rebase.js'
import { createStore } from './mock/store.js'
import { createHandler } from './mock/handlers.js'
import { installFetch } from './mock/installFetch.js'
import { installDemoGuards } from './guards.js'
import { resolveLang, type TourLang } from './lang.js'
import { tourText } from './i18n/index.js'
import { showToast } from './overlay/toast.js'
import { TourShell } from './TourShell.js'

export interface BootOptions {
  root: HTMLElement
  dataset: DemoDataset
  base: string
  search: string
  navigatorLang: string
  startTour?: boolean
}

/** Current tour language, following the app's i18n language (it can change in Settings). */
export const currentLang = (): TourLang => (i18n.language?.startsWith('de') ? 'de' : 'en')

export async function bootTour(opts: BootOptions): Promise<() => void> {
  const lang = resolveLang(opts.search, opts.navigatorLang)
  const recordMode = new URLSearchParams(opts.search).get('record') === '1'
  try {
    localStorage.setItem('vl-language', lang)
    localStorage.setItem('vl-theme', 'dark')
  } catch { /* storage may be unavailable */ }
  document.documentElement.lang = lang
  await i18n.changeLanguage(lang)

  const dataset = rebaseDataset(opts.dataset, new Date())
  const store = createStore(dataset)
  const uninstallFetch = installFetch(
    createHandler(store, { lang: currentLang, notice: (k) => tourText(currentLang()).notices[k] }),
    opts.base,
  )
  const uninstallGuards = installDemoGuards(() => showToast(tourText(currentLang()).toast.blocked))

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  const reactRoot = ReactDOM.createRoot(opts.root)
  reactRoot.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={opts.base.replace(/\/$/, '')}>
          <AppRoutes requireLogin={false} />
          <TourShell dataset={dataset} recordMode={recordMode} autoStart={opts.startTour ?? true} />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  )

  return () => {
    reactRoot.unmount()
    uninstallGuards()
    uninstallFetch()
  }
}

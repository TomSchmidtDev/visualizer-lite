// Demo tour entry point. Mounts the real app routes without login.
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../src/i18n/index.js'
import '../src/index.css'
import { AppRoutes } from '../src/App.js'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } })
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <AppRoutes requireLogin={false} />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)

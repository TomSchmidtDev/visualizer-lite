import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './i18n/index.js'
import { AppRoutes } from './App.js'

function renderAt(path: string, requireLogin?: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes requireLogin={requireLogin} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppRoutes', () => {
  beforeEach(() => {
    // Never resolve: we only check which route tree renders
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    document.cookie = 'vl_loggedin=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('renders the app layout at / without login when requireLogin is false', () => {
    const { container } = renderAt('/', false)
    expect(container.querySelector('nav')).not.toBeNull()
    expect(container.querySelector('input[type="password"]')).toBeNull()
  })

  it('redirects to /login when guarded and no login cookie is set', () => {
    const { container } = renderAt('/')
    expect(container.querySelector('input[type="password"]')).not.toBeNull()
    expect(container.querySelector('nav')).toBeNull()
  })
})

// packages/web/src/api/client.ts
import type { Shot, ShotListResponse, Suggestions, AppSettings, Stats, StatsWindow, SearchParams } from '../types.js'

const BASE = ''  // Same origin; Vite proxies /api → localhost:3000 in dev

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    // Only set Content-Type when there is a body — DELETE/GET have no body and
    // Fastify returns 400 if it receives Content-Type: application/json with an empty body.
    headers: {
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    if (res.status === 401) {
      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  // Auth
  login: (password: string) =>
    request<{ ok: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  // Shots
  listShots: (params: SearchParams = {}) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    })
    return request<ShotListResponse>(`/api/shots?${qs}`)
  },

  getShot: (id: string) =>
    request<Shot>(`/api/shots/${id}`),

  updateShot: (id: string, data: Partial<Shot>) =>
    request<Shot>(`/api/shots/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteShot: (id: string) =>
    request<void>(`/api/shots/${id}`, { method: 'DELETE' }),

  downloadShot: (id: string) => {
    window.location.href = `/api/shots/${id}/download`
  },

  uploadShot: (file: File): Promise<{ id: string }> => {
    const form = new FormData()
    form.append('file', file)
    return fetch('/api/shots/upload', {
      method: 'POST',
      credentials: 'include',
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    })
  },

  // Search
  getSuggestions: () =>
    request<Suggestions>('/api/search/suggestions'),

  // Settings
  getSettings: () =>
    request<AppSettings>('/api/settings'),

  updateSettings: (data: Partial<AppSettings & { currentPassword?: string; newPassword?: string }>) =>
    request<{ ok: boolean }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Stats
  getStats: (period: '24h' | '7d' | '30d' | '365d' = '365d', beverage: 'espresso' | 'filter' | 'all' = 'espresso') =>
    request<Stats>(`/api/stats?period=${period}&beverage=${beverage}`),

  // Export
  exportAll: () => {
    window.location.href = '/api/export'
  },

  // DE1 direct import
  testDe1Connection: () =>
    request<{ ok: boolean; total: number }>('/api/de1/test'),

  previewDe1Import: (dateFrom: string, dateTo: string) =>
    request<{ count: number; shots: { filename: string; date: string }[] }>(
      '/api/de1/preview',
      { method: 'POST', body: JSON.stringify({ dateFrom, dateTo }) }
    ),

  startDe1Import: async (
    dateFrom: string,
    dateTo: string,
    updateExisting: boolean,
    onProgress: (current: number, total: number, filename: string, status: string) => void,
  ): Promise<{ imported: number; updated: number; skipped: number; errors: number; errorDetails: { filename: string; message: string }[] }> => {
    const res = await fetch('/api/de1/import', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateFrom, dateTo, updateExisting }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalResult: { imported: number; updated: number; skipped: number; errors: number; errorDetails: { filename: string; message: string }[] } | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line) as Record<string, unknown>
          if (event.type === 'progress') {
            onProgress(
              event.current as number,
              event.total as number,
              event.filename as string,
              event.status as string,
            )
          } else if (event.type === 'done') {
            finalResult = event as unknown as typeof finalResult
          }
        } catch { /* skip malformed lines */ }
      }
    }
    if (!finalResult) throw new Error('Import stream ended without result')
    return finalResult as NonNullable<typeof finalResult>
  },
}

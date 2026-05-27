// packages/web/src/api/client.ts
import type { Shot, ShotListResponse, Suggestions, AppSettings, Stats, SearchParams } from '../types.js'

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
    return fetch('/shots/upload', {
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
  getStats: () =>
    request<Stats>('/api/stats'),

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

  startDe1Import: (dateFrom: string, dateTo: string, updateExisting: boolean) =>
    request<{
      imported: number
      updated: number
      skipped: number
      errors: number
      errorDetails: { filename: string; message: string }[]
    }>(
      '/api/de1/import',
      { method: 'POST', body: JSON.stringify({ dateFrom, dateTo, updateExisting }) }
    ),
}

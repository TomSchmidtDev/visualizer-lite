// packages/api/tests/services/de1Service.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { detectMachineType } from '../../src/services/de1Service.js'

const BASE = 'http://192.168.1.1:8888'

function makeFetch(responses: Record<string, { ok: boolean; status: number; body: string }>) {
  return vi.fn(async (url: string) => {
    const entry = responses[url.toString()] ?? { ok: false, status: 404, body: 'Not found' }
    return {
      ok:     entry.ok,
      status: entry.status,
      json:   async () => JSON.parse(entry.body),
      text:   async () => entry.body,
    }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('detectMachineType', () => {
  it('detects de1app when GET /api/shot/ returns a filename array', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${BASE}/api/shot/`]: { ok: true, status: 200, body: JSON.stringify(['20260526T121947.shot']) },
    }))
    await expect(detectMachineType(BASE)).resolves.toBe('de1app')
  })

  it('detects decenza when GET /api/shots returns a shot-object array', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${BASE}/api/shots`]: { ok: true, status: 200, body: JSON.stringify([{ id: 1, timestamp: 1785492901 }]) },
    }))
    await expect(detectMachineType(BASE)).resolves.toBe('decenza')
  })

  it('treats an empty array from either endpoint as a valid detection', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${BASE}/api/shots`]: { ok: true, status: 200, body: '[]' },
    }))
    await expect(detectMachineType(BASE)).resolves.toBe('decenza')
  })

  it('prefers de1app if both endpoints unexpectedly succeed', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${BASE}/api/shot/`]:  { ok: true, status: 200, body: JSON.stringify(['20260526T121947.shot']) },
      [`${BASE}/api/shots`]:  { ok: true, status: 200, body: JSON.stringify([{ id: 1, timestamp: 1785492901 }]) },
    }))
    await expect(detectMachineType(BASE)).resolves.toBe('de1app')
  })

  it('throws when neither endpoint responds successfully', async () => {
    vi.stubGlobal('fetch', makeFetch({}))
    await expect(detectMachineType(BASE)).rejects.toThrow('No machine detected')
  })

  it('throws when fetch itself rejects for both probes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await expect(detectMachineType(BASE)).rejects.toThrow('No machine detected')
  })
})

// packages/api/tests/services/de1Service.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '../../src/db.js'
import {
  detectMachineType,
  filterByDateRange,
  listMachineShots,
  fetchAndImportShot,
} from '../../src/services/de1Service.js'

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

  it('prefers de1app if both endpoints unexpectedly succeed, and logs a warning', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${BASE}/api/shot/`]:  { ok: true, status: 200, body: JSON.stringify(['20260526T121947.shot']) },
      [`${BASE}/api/shots`]:  { ok: true, status: 200, body: JSON.stringify([{ id: 1, timestamp: 1785492901 }]) },
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(detectMachineType(BASE)).resolves.toBe('de1app')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toMatch(/de1app.*Decenza|both/i)
    warnSpy.mockRestore()
  })

  it('throws with both probe reasons (HTTP status) when neither endpoint responds successfully', async () => {
    vi.stubGlobal('fetch', makeFetch({}))
    await expect(detectMachineType(BASE)).rejects.toThrow('No machine detected')
    await expect(detectMachineType(BASE)).rejects.toThrow(/de1app: HTTP 404/)
    await expect(detectMachineType(BASE)).rejects.toThrow(/Decenza: HTTP 404/)
  })

  it('throws with both probe reasons (exception message) when fetch itself rejects for both probes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await expect(detectMachineType(BASE)).rejects.toThrow('No machine detected')
    await expect(detectMachineType(BASE)).rejects.toThrow(/de1app: ECONNREFUSED/)
    await expect(detectMachineType(BASE)).rejects.toThrow(/Decenza: ECONNREFUSED/)
  })
})

describe('filterByDateRange', () => {
  it('keeps shots whose ISO date falls within the range (inclusive)', () => {
    const shots = [
      { filename: '2628', date: '2026-05-26T10:19:47.000Z' },
      { filename: '1000', date: '2020-01-01T00:00:00.000Z' },
      { filename: '1001', date: '2026-01-01T00:00:00.000Z' },
      { filename: '1002', date: '2026-12-31T23:59:59.000Z' },
    ]
    const result = filterByDateRange(shots, '2026-01-01', '2026-12-31')
    expect(result.map(s => s.filename)).toEqual(['2628', '1001', '1002'])
  })
})

describe('listMachineShots - decenza', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps Decenza /api/shots entries to MachineShotInfo using local wall-clock digits, not UTC', async () => {
    const timestamp = 1779790787
    vi.stubGlobal('fetch', makeFetch({
      [`${BASE}/api/shots`]: {
        ok: true, status: 200,
        body: JSON.stringify([{ id: 2628, timestamp }]),
      },
    }))
    const result = await listMachineShots(BASE, 'decenza')
    expect(result).toHaveLength(1)
    expect(result[0].filename).toBe('2628')

    // Expected value is derived from the *local* Date getters (not UTC) so this
    // test is correct regardless of which time zone it runs in — it pins down
    // the behavior (local wall clock, labeled Z) rather than one fixed offset.
    const d = new Date(timestamp * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000Z`
    expect(result[0].date).toBe(expected)

    // Explicitly confirm the hour/minute/second are local-getter values, not UTC ones.
    expect(result[0].date.slice(11, 19)).toBe(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`)
  })

  it('throws when Decenza returns a non-200 response', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${BASE}/api/shots`]: { ok: false, status: 500, body: 'Internal Server Error' },
    }))
    await expect(listMachineShots(BASE, 'decenza')).rejects.toThrow('Decenza returned HTTP 500')
  })

  it('skips entries with a missing/non-numeric timestamp instead of throwing', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${BASE}/api/shots`]: {
        ok: true, status: 200,
        body: JSON.stringify([
          { id: 1, timestamp: undefined },
          { id: 2, timestamp: 1779790787 },
        ]),
      },
    }))
    const result = await listMachineShots(BASE, 'decenza')
    expect(result).toHaveLength(1)
    expect(result[0].filename).toBe('2')
  })
})

describe('fetchAndImportShot - decenza', () => {
  const DECENZA_SHOT_JSON = JSON.stringify({
    clock: 1779790787,
    elapsed: [0.0, 1.0, 30.0],
    pressure: { pressure: [0.0, 7.0, 7.5] },
  })

  beforeEach(async () => {
    await prisma.$executeRaw`DELETE FROM "_ShotToTag"`
    await prisma.$executeRaw`DELETE FROM "Shot"`
  })
  afterEach(() => vi.unstubAllGlobals())

  it('fetches /shot/<id>/shot.json and imports the shot', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${BASE}/shot/2628/shot.json`]: { ok: true, status: 200, body: DECENZA_SHOT_JSON },
    }))
    const outcome = await fetchAndImportShot(BASE, '2628', 'decenza')
    expect(outcome).toBe('created')
  })

  it('throws with the shot id in the message when Decenza returns non-200', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${BASE}/shot/2628/shot.json`]: { ok: false, status: 404, body: 'Not found' },
    }))
    await expect(fetchAndImportShot(BASE, '2628', 'decenza')).rejects.toThrow('for shot 2628')
  })
})

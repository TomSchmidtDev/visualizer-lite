// packages/api/tests/routes/de1.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from 'vitest'
import { buildServer } from '../../src/server.js'
import { prisma } from '../../src/db.js'

type App = Awaited<ReturnType<typeof buildServer>>
let app: App
let cookie: string

const DE1_URL = 'http://192.168.1.1:8888'

const MINIMAL_SHOT = [
  'clock 1779790787',
  'espresso_elapsed {0.0 1.0 30.0}',
  'espresso_pressure {0.0 7.0 7.5}',
].join('\n')

// Same shot as MINIMAL_SHOT but in v2 JSON format (same clock → same startTime)
const MINIMAL_SHOT_V2 = JSON.stringify({
  clock: 1779790787,
  elapsed: [0.0, 1.0, 30.0],
  pressure: { pressure: [0.0, 7.0, 7.5] },
})

function makeFetch(
  responses: Record<string, { ok: boolean; status: number; body: string }>
) {
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

/** Parse NDJSON response body into an array of parsed objects. */
function parseNdjson(body: string): Record<string, unknown>[] {
  return body.trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
}

/** Extract the final "done" event from an NDJSON import response. */
function doneEvent(body: string) {
  const events = parseNdjson(body)
  const done = events.find(e => e.type === 'done')
  if (!done) throw new Error('No "done" event in NDJSON response')
  return done as {
    type: 'done'
    imported: number
    updated: number
    skipped: number
    errors: number
    errorDetails: { filename: string; message: string }[]
  }
}

beforeAll(async () => {
  process.env.VL_PASSWORD = 'testpass'
  try { await prisma.settings.deleteMany() } catch {}
  app = await buildServer()
  await app.ready()
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { password: 'testpass' },
  })
  cookie = login.headers['set-cookie'] as string
  await prisma.settings.create({ data: { key: 'de1Url', value: DE1_URL } })
})

afterAll(() => app.close())

beforeEach(async () => {
  await prisma.$executeRaw`DELETE FROM "_ShotToTag"`
  await prisma.$executeRaw`DELETE FROM "Shot"`
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/de1/test', () => {
  // Ensure de1Url setting is present before each test in this describe
  beforeEach(async () => {
    await prisma.settings.upsert({
      where: { key: 'de1Url' },
      create: { key: 'de1Url', value: DE1_URL },
      update: { value: DE1_URL },
    })
  })

  it('returns ok and total when DE1 is reachable', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shot/`]: {
        ok: true, status: 200,
        body: JSON.stringify(['20260526T121947.shot', '20230101T100000.shot']),
      },
    }))

    const res = await app.inject({
      method: 'GET', url: '/api/de1/test', headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.ok).toBe(true)
    expect(body.total).toBe(2)
    expect(body.machineType).toBe('de1app')
  })

  it('returns 502 when DE1 fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const res = await app.inject({
      method: 'GET', url: '/api/de1/test', headers: { cookie },
    })
    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.body).error).toContain('Cannot reach DE1')
  })

  it('returns 400 when no DE1 URL configured', async () => {
    await prisma.settings.delete({ where: { key: 'de1Url' } })
    const res = await app.inject({
      method: 'GET', url: '/api/de1/test', headers: { cookie },
    })
    expect(res.statusCode).toBe(400)
    // Restoration is handled by the beforeEach above
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/de1/test' })
    expect(res.statusCode).toBe(401)
  })

  it('falls back to port 8080 when the configured 8888 is unreachable, and persists the corrected URL', async () => {
    const altUrl = 'http://192.168.1.1:8080'
    vi.stubGlobal('fetch', makeFetch({
      [`${altUrl}/api/v1/shots?limit=1`]: {
        ok: true, status: 200,
        body: JSON.stringify({ items: [], total: 5, limit: 1, offset: 0 }),
      },
      [`${altUrl}/api/v1/shots?limit=1&offset=0&orderBy=timestamp&order=desc`]: {
        ok: true, status: 200,
        body: JSON.stringify({ items: [], total: 5, limit: 1, offset: 0 }),
      },
      // DE1_URL (8888) is intentionally left unmocked — defaults to 404 for all three probes
    }))

    const res = await app.inject({
      method: 'GET', url: '/api/de1/test', headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.machineType).toBe('decaid')
    expect(body.total).toBe(5)

    const saved = await prisma.settings.findUnique({ where: { key: 'de1Url' } })
    expect(saved?.value).toBe(altUrl)
  })
})

describe('POST /api/de1/preview', () => {
  it('returns filtered shot list for date range', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shot/`]: {
        ok: true, status: 200,
        body: JSON.stringify([
          '20260526T121947.shot',
          '20200101T100000.shot',
          'bad-name.shot',
        ]),
      },
    }))

    const res = await app.inject({
      method: 'POST', url: '/api/de1/preview', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.count).toBe(1)
    expect(body.shots[0].filename).toBe('20260526T121947.shot')
  })

  it('returns 400 when dateFrom > dateTo', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/de1/preview', headers: { cookie },
      payload: { dateFrom: '2026-12-31', dateTo: '2026-01-01' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/de1/import', () => {
  it('streams progress and done event; imports a shot', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shot/`]: {
        ok: true, status: 200,
        body: JSON.stringify(['20260526T121947.shot']),
      },
      [`${DE1_URL}/api/shot/20260526T121947.shot`]: {
        ok: true, status: 200, body: MINIMAL_SHOT,
      },
    }))

    const res = await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/x-ndjson')

    const events = parseNdjson(res.body)
    const progress = events.filter(e => e.type === 'progress')
    expect(progress).toHaveLength(1)
    expect(progress[0].current).toBe(1)
    expect(progress[0].total).toBe(1)
    expect(progress[0].status).toBe('imported')

    const done = doneEvent(res.body)
    expect(done.imported).toBe(1)
    expect(done.updated).toBe(0)
    expect(done.errors).toBe(0)
    expect(done.errorDetails).toHaveLength(0)
  })

  it('returns updated on second import of same shot', async () => {
    const shotFetch = makeFetch({
      [`${DE1_URL}/api/shot/`]: {
        ok: true, status: 200,
        body: JSON.stringify(['20260526T121947.shot']),
      },
      [`${DE1_URL}/api/shot/20260526T121947.shot`]: {
        ok: true, status: 200, body: MINIMAL_SHOT,
      },
    })
    vi.stubGlobal('fetch', shotFetch)

    await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    const res = await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    const done = doneEvent(res.body)
    expect(done.imported).toBe(0)
    expect(done.updated).toBe(1)
  })

  it('records per-shot errors in progress stream and done event', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shot/`]: {
        ok: true, status: 200,
        body: JSON.stringify(['20260526T121947.shot']),
      },
      // v2 returns 404 → fallback; v1 also fails → counted as error
      [`${DE1_URL}/api/shot/20260526T121947.shot`]: {
        ok: false, status: 404, body: 'Not found',
      },
    }))

    const res = await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    expect(res.statusCode).toBe(200)

    const events = parseNdjson(res.body)
    const errProgress = events.filter(e => e.type === 'progress' && e.status === 'error')
    expect(errProgress).toHaveLength(1)
    expect(errProgress[0].filename).toBe('20260526T121947.shot')

    const done = doneEvent(res.body)
    expect(done.errors).toBe(1)
    expect(done.errorDetails[0].filename).toBe('20260526T121947.shot')
  })

  it('uses v2 JSON API when available, skipping v1', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shot/`]: {
        ok: true, status: 200,
        body: JSON.stringify(['20260526T121947.shot']),
      },
      [`${DE1_URL}/api/v2/shot/20260526T121947.shot`]: {
        ok: true, status: 200, body: MINIMAL_SHOT_V2,
      },
      // v1 not mocked → would return 404 if called; test verifies it is NOT called
    }))

    const res = await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    expect(res.statusCode).toBe(200)
    const done = doneEvent(res.body)
    expect(done.imported).toBe(1)
    expect(done.errors).toBe(0)
  })

  it('falls back to v1 when v2 returns 404', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shot/`]: {
        ok: true, status: 200,
        body: JSON.stringify(['20260526T121947.shot']),
      },
      [`${DE1_URL}/api/v2/shot/20260526T121947.shot`]: {
        ok: false, status: 404, body: 'Not found',
      },
      [`${DE1_URL}/api/shot/20260526T121947.shot`]: {
        ok: true, status: 200, body: MINIMAL_SHOT,
      },
    }))

    const res = await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    expect(res.statusCode).toBe(200)
    const done = doneEvent(res.body)
    expect(done.imported).toBe(1)
    expect(done.errors).toBe(0)
  })

  it('falls back to v1 when v2 returns any non-404 HTTP error', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shot/`]: {
        ok: true, status: 200,
        body: JSON.stringify(['20260526T121947.shot']),
      },
      [`${DE1_URL}/api/v2/shot/20260526T121947.shot`]: {
        ok: false, status: 500, body: 'Internal Server Error',
      },
      // v1 is available and should be reached after v2 fails
      [`${DE1_URL}/api/shot/20260526T121947.shot`]: {
        ok: true, status: 200, body: MINIMAL_SHOT,
      },
    }))

    const res = await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    expect(res.statusCode).toBe(200)
    const done = doneEvent(res.body)
    expect(done.imported).toBe(1)
    expect(done.errors).toBe(0)
  })

  it('deduplicates by startTime when re-importing via v2 after initial v1 import', async () => {
    // First import via v1 (v2 returns 404)
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shot/`]: {
        ok: true, status: 200,
        body: JSON.stringify(['20260526T121947.shot']),
      },
      [`${DE1_URL}/api/shot/20260526T121947.shot`]: {
        ok: true, status: 200, body: MINIMAL_SHOT,
      },
    }))
    await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })

    // Second import: v2 now returns JSON (different SHA256, same startTime)
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shot/`]: {
        ok: true, status: 200,
        body: JSON.stringify(['20260526T121947.shot']),
      },
      [`${DE1_URL}/api/v2/shot/20260526T121947.shot`]: {
        ok: true, status: 200, body: MINIMAL_SHOT_V2,
      },
    }))
    const res = await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31', updateExisting: true },
    })
    const done = doneEvent(res.body)
    // Same startTime → treated as update, not a second import
    expect(done.imported).toBe(0)
    expect(done.updated).toBe(1)
    expect(done.errors).toBe(0)
  })
})

describe('Decenza dialect', () => {
  const DECENZA_SHOT_JSON = JSON.stringify({
    clock: 1779790787,
    elapsed: [0.0, 1.0, 30.0],
    pressure: { pressure: [0.0, 7.0, 7.5] },
  })

  it('GET /api/de1/test detects decenza and returns machineType', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shots`]: {
        ok: true, status: 200,
        body: JSON.stringify([{ id: 2628, timestamp: 1779790787 }]),
      },
    }))
    const res = await app.inject({
      method: 'GET', url: '/api/de1/test', headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.machineType).toBe('decenza')
    expect(body.total).toBe(1)
  })

  it('POST /api/de1/preview filters decenza shots by date range', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shots`]: {
        ok: true, status: 200,
        body: JSON.stringify([
          { id: 2628, timestamp: 1779790787 }, // 2026-05-26
          { id: 1000, timestamp: 1577836800 }, // 2020-01-01 — outside range
        ]),
      },
    }))
    const res = await app.inject({
      method: 'POST', url: '/api/de1/preview', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.count).toBe(1)
    expect(body.shots[0].filename).toBe('2628')
    expect(body.machineType).toBe('decenza')
  })

  it('POST /api/de1/import streams progress and imports a decenza shot', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shots`]: {
        ok: true, status: 200,
        body: JSON.stringify([{ id: 2628, timestamp: 1779790787 }]),
      },
      [`${DE1_URL}/shot/2628/shot.json`]: {
        ok: true, status: 200, body: DECENZA_SHOT_JSON,
      },
    }))
    const res = await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    expect(res.statusCode).toBe(200)

    const events = parseNdjson(res.body)
    const progress = events.filter(e => e.type === 'progress')
    expect(progress).toHaveLength(1)
    expect(progress[0].filename).toBe('2628')
    expect(progress[0].status).toBe('imported')

    const done = doneEvent(res.body)
    expect(done.imported).toBe(1)
    expect(done.errors).toBe(0)
  })

  it('records an error when a decenza shot.json fetch fails', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shots`]: {
        ok: true, status: 200,
        body: JSON.stringify([{ id: 2628, timestamp: 1779790787 }]),
      },
      // /shot/2628/shot.json not mocked → defaults to 404 via makeFetch's fallback
    }))
    const res = await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    const done = doneEvent(res.body)
    expect(done.errors).toBe(1)
    expect(done.errorDetails[0].filename).toBe('2628')
  })
})

describe('Decaid dialect', () => {
  const DECAID_SHOT_JSON = JSON.stringify({
    id: 'shot-1',
    timestamp: '2026-05-26T12:19:47.000000',
    measurements: [
      { machine: { timestamp: '2026-05-26T12:19:47.000000', flow: 0, pressure: 0 }, scale: null, volume: 0 },
      { machine: { timestamp: '2026-05-26T12:20:17.000000', flow: 2, pressure: 7 }, scale: null, volume: 30 },
    ],
  })

  it('GET /api/de1/test detects decaid and reports the total from a single request (no full pagination)', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/v1/shots?limit=1`]: {
        ok: true, status: 200,
        body: JSON.stringify({ items: [{ id: 'shot-1', timestamp: '2026-05-26T12:19:47.000000' }], total: 2655, limit: 1, offset: 0 }),
      },
      [`${DE1_URL}/api/v1/shots?limit=1&offset=0&orderBy=timestamp&order=desc`]: {
        ok: true, status: 200,
        body: JSON.stringify({ items: [{ id: 'shot-1', timestamp: '2026-05-26T12:19:47.000000' }], total: 2655, limit: 1, offset: 0 }),
      },
      // No other page is mocked — if the route paged through the full history this would 404 and fail.
    }))
    const res = await app.inject({
      method: 'GET', url: '/api/de1/test', headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.machineType).toBe('decaid')
    expect(body.total).toBe(2655)
  })

  it('POST /api/de1/preview filters decaid shots by date range', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/v1/shots?limit=1`]: {
        ok: true, status: 200,
        body: JSON.stringify({ items: [], total: 2, limit: 1, offset: 0 }),
      },
      [`${DE1_URL}/api/v1/shots?limit=100&offset=0&orderBy=timestamp&order=desc`]: {
        ok: true, status: 200,
        body: JSON.stringify({
          items: [
            { id: 'shot-1', timestamp: '2026-05-26T12:19:47.000000' },
            { id: 'shot-2', timestamp: '2020-01-01T10:00:00.000000' }, // outside range
          ],
          total: 2, limit: 100, offset: 0,
        }),
      },
    }))
    const res = await app.inject({
      method: 'POST', url: '/api/de1/preview', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.count).toBe(1)
    expect(body.shots[0].filename).toBe('shot-1')
    expect(body.machineType).toBe('decaid')
  })

  it('POST /api/de1/import streams progress and imports a decaid shot', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/v1/shots?limit=1`]: {
        ok: true, status: 200,
        body: JSON.stringify({ items: [], total: 1, limit: 1, offset: 0 }),
      },
      [`${DE1_URL}/api/v1/shots?limit=100&offset=0&orderBy=timestamp&order=desc`]: {
        ok: true, status: 200,
        body: JSON.stringify({ items: [{ id: 'shot-1', timestamp: '2026-05-26T12:19:47.000000' }], total: 1, limit: 100, offset: 0 }),
      },
      [`${DE1_URL}/api/v1/shots/shot-1`]: {
        ok: true, status: 200, body: DECAID_SHOT_JSON,
      },
    }))
    const res = await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    expect(res.statusCode).toBe(200)

    const events = parseNdjson(res.body)
    const progress = events.filter(e => e.type === 'progress')
    expect(progress).toHaveLength(1)
    expect(progress[0].filename).toBe('shot-1')
    expect(progress[0].status).toBe('imported')

    const done = doneEvent(res.body)
    expect(done.imported).toBe(1)
    expect(done.errors).toBe(0)
  })
})

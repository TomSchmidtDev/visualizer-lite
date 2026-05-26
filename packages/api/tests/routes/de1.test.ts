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
  it('imports a shot and returns counts', async () => {
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
    const body = JSON.parse(res.body)
    expect(body.imported).toBe(1)
    expect(body.updated).toBe(0)
    expect(body.errors).toBe(0)
    expect(body.errorDetails).toHaveLength(0)
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
    const body = JSON.parse(res.body)
    expect(body.imported).toBe(0)
    expect(body.updated).toBe(1)
  })

  it('records per-shot errors but continues and returns 200', async () => {
    vi.stubGlobal('fetch', makeFetch({
      [`${DE1_URL}/api/shot/`]: {
        ok: true, status: 200,
        body: JSON.stringify(['20260526T121947.shot']),
      },
      [`${DE1_URL}/api/shot/20260526T121947.shot`]: {
        ok: false, status: 404, body: 'Not found',
      },
    }))

    const res = await app.inject({
      method: 'POST', url: '/api/de1/import', headers: { cookie },
      payload: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.errors).toBe(1)
    expect(body.errorDetails[0].filename).toBe('20260526T121947.shot')
  })
})

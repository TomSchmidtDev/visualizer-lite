import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHandler } from './handlers.js'
import { installFetch } from './installFetch.js'
import { createStore } from './store.js'
import { makeDataset } from './fixtures.test-helpers.js'

const NOTICES = { analysisUnavailable: 'No stored analysis in the demo', notInDemo: 'Not available in the demo' }

function setup(importBatch = 3) {
  const ds = makeDataset(12, importBatch, new Date(Date.now() - 3_600_000).toISOString())
  const store = createStore(ds)
  const handle = createHandler(store, {
    lang: () => 'en',
    notice: (k) => NOTICES[k],
    delays: { importPerShotMs: 0, analysisMs: 0, de1TestMs: 0 },
  })
  const call = (path: string, init?: RequestInit) => handle(new Request(`http://demo.test${path}`, init))
  return { ds, store, call }
}

async function readNdjson(res: Response) {
  const text = await res.text()
  return text.trim().split('\n').map((l) => JSON.parse(l))
}

describe('createHandler', () => {
  it('lists shots honouring query params', async () => {
    const { call } = setup(0)
    const body = await (await call('/api/shots?beanBrand=Demo&limit=2')).json()
    expect(body.total).toBe(4)
    expect(body.shots).toHaveLength(2)
  })

  it('returns a shot with shotData, 404 for unknown', async () => {
    const { ds, call } = setup(0)
    const ok = await (await call(`/api/shots/${ds.shots[0].id}`)).json()
    expect(ok.shotData.timeframe.length).toBeGreaterThan(0)
    expect((await call('/api/shots/nope')).status).toBe(404)
  })

  it('PATCH and DELETE shots work in memory', async () => {
    const { ds, call } = setup(0)
    const id = ds.shots[0].id
    const patched = await (await call(`/api/shots/${id}`, { method: 'PATCH', body: JSON.stringify({ espressoNotes: 'x' }) })).json()
    expect(patched.espressoNotes).toBe('x')
    expect((await call(`/api/shots/${id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await call(`/api/shots/${id}`)).status).toBe(404)
  })

  it('settings PATCH persists in memory and never exposes real values', async () => {
    const { call } = setup()
    const before = await (await call('/api/settings')).json()
    expect(before.de1Url).toBe('http://decent.local:8888')
    await call('/api/settings', { method: 'PATCH', body: JSON.stringify({ tooltipOpacity: 0.5, newPassword: 'x' }) })
    const after = await (await call('/api/settings')).json()
    expect(after.tooltipOpacity).toBe(0.5)
    expect(after.newPassword).toBeUndefined()
  })

  it('serves suggestions and stats', async () => {
    const { call } = setup(0)
    expect((await (await call('/api/search/suggestions')).json()).beanBrands).toHaveLength(3)
    const stats = await (await call('/api/stats?period=30d&beverage=espresso&topN=5')).json()
    expect(stats.period).toBe('30d')
    expect(stats.current.shotCount).toBeGreaterThan(0)
    expect(Array.isArray(await (await call('/api/stats/roasters?period=all&beverage=all')).json())).toBe(true)
    expect(Array.isArray(await (await call('/api/stats/profiles?period=bogus')).json())).toBe(true)
  })

  it('de1 test and preview report the pending import', async () => {
    const { call } = setup(3)
    const test = await (await call('/api/de1/test')).json()
    expect(test).toEqual({ ok: true, total: 12, machineType: 'decenza' })
    const prev = await (await call('/api/de1/preview', { method: 'POST', body: JSON.stringify({ dateFrom: '2000-01-01', dateTo: '2100-01-01' }) })).json()
    expect(prev.count).toBe(3)
    expect(prev.shots[0].filename).toMatch(/^\d{8}T\d{6}\.json$/)
  })

  it('de1 import streams progress lines then done, and adds shots to the list', async () => {
    const { call } = setup(3)
    const res = await call('/api/de1/import', { method: 'POST', body: JSON.stringify({ dateFrom: '2000-01-01', dateTo: '2100-01-01' }) })
    const events = await readNdjson(res)
    expect(events.filter((e) => e.type === 'progress')).toHaveLength(3)
    expect(events.at(-1)).toMatchObject({ type: 'done', imported: 3, skipped: 0, errors: 0 })
    expect((await (await call('/api/shots')).json()).total).toBe(12)
  })

  it('a second import reports nothing new and adds no duplicates', async () => {
    const { call } = setup(3)
    const body = JSON.stringify({ dateFrom: '2000-01-01', dateTo: '2100-01-01' })
    await readNdjson(await call('/api/de1/import', { method: 'POST', body }))
    const events = await readNdjson(await call('/api/de1/import', { method: 'POST', body }))
    expect(events.at(-1)).toMatchObject({ type: 'done', imported: 0 })
    expect((await (await call('/api/shots')).json()).total).toBe(12)
  })

  it('analysis without a stored result returns 404 with the notice text', async () => {
    const { ds, call } = setup()
    const res = await call(`/api/analysis/shot/${ds.shots[11].id}?window=30d`, { method: 'POST' })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe(NOTICES.analysisUnavailable)
  })

  it('analysis with a stored result returns it', async () => {
    const { ds, call } = setup()
    const id = Object.keys(ds.analyses)[0]
    const body = await (await call(`/api/analysis/shot/${id}`, { method: 'POST' })).json()
    expect(body.shotId).toBe(id)
    expect(body.barista.length).toBeGreaterThan(0)
  })

  it('upload and unknown api paths answer with the not-in-demo notice', async () => {
    const { call } = setup()
    const up = await call('/api/shots/upload', { method: 'POST', body: 'x' })
    expect(up.status).toBe(400)
    expect((await up.json()).error).toBe(NOTICES.notInDemo)
    const unk = await call('/api/whatever')
    expect(unk.status).toBe(501)
  })

  it('never returns 401, even for garbage input', async () => {
    const { call } = setup()
    const paths = ['/api/auth/logout', '/api/auth/login', '/api/shots/x', '/api/de1/preview', '/api/de1/import',
      '/api/analysis/shot/x', '/api/settings', '/api/stats', '/api/export', '/api/shots/x/download']
    for (const p of paths) {
      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
        const res = await call(p, { method, body: method === 'GET' ? undefined : '{not json' })
        expect(res.status, `${method} ${p}`).not.toBe(401)
      }
    }
  })
})

describe('installFetch', () => {
  const original = globalThis.fetch
  afterEach(() => { globalThis.fetch = original })

  it('routes /api requests to the handler and passes others through', async () => {
    const passthrough = vi.fn(async () => new Response('real'))
    globalThis.fetch = passthrough as typeof fetch
    const handler = vi.fn(async () => new Response('mock'))
    const uninstall = installFetch(handler, '/visualizer-lite/')
    expect(await (await fetch('/api/shots')).text()).toBe('mock')
    expect(await (await fetch('/visualizer-lite/api/shots')).text()).toBe('mock')
    expect(await (await fetch('/assets/x.js')).text()).toBe('real')
    uninstall()
    expect(globalThis.fetch).toBe(passthrough)
  })
})

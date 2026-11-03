// Demo "backend": answers every /api/ request from the in-memory store.
// Never returns 401 — the app client would redirect to /login.
import type { AppSettings, SearchParams } from '../../src/types.js'
import type { DemoStore } from './store.js'
import { computeStats, computeRoasters, computeProfiles, isPeriod, isBeverage } from './stats.js'
import { DEMO_SETTINGS } from './settings.js'

export type NoticeKey = 'analysisUnavailable' | 'notInDemo'

export interface HandlerOptions {
  lang: () => 'en' | 'de'
  notice: (key: NoticeKey) => string
  delays?: { importPerShotMs: number; analysisMs: number; de1TestMs: number }
}

const DEFAULT_DELAYS = { importPerShotMs: 350, analysisMs: 2500, de1TestMs: 800 }
const MACHINE = 'decenza' as const

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve())

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try { return (await req.json()) as Record<string, unknown> } catch { return {} }
}

/** DE1-style filename from an ISO timestamp, e.g. 20261020T081500.json */
export function machineFilename(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace(/Z$/, '') + '.json'
}

const SETTINGS_KEYS = new Set(Object.keys(DEMO_SETTINGS('en')))

export function createHandler(store: DemoStore, opts: HandlerOptions): (req: Request) => Promise<Response> {
  const delays = opts.delays ?? DEFAULT_DELAYS
  let settings: AppSettings | null = null
  const getSettings = () => (settings ??= DEMO_SETTINGS(opts.lang()))

  function inRange(body: Record<string, unknown>) {
    const from = Date.parse(String(body.dateFrom ?? ''))
    const toDay = Date.parse(String(body.dateTo ?? ''))
    const to = Number.isNaN(toDay) ? Infinity : toDay + 86_400_000 - 1 // dateTo is a whole day
    return store.pendingImport().filter((s) => {
      const t = Date.parse(s.startTime)
      return (Number.isNaN(from) || t >= from) && t <= to
    }).sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
  }

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname.replace(/^.*?(\/api\/)/, '/api/')
    const q = Object.fromEntries(url.searchParams)
    const m = req.method.toUpperCase()
    let match: RegExpMatchArray | null

    if (path === '/api/shots' && m === 'GET') {
      const p: SearchParams = {
        ...q,
        page: q.page ? parseInt(q.page, 10) : undefined,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
      }
      return json(store.list(p))
    }
    if (path === '/api/shots/upload') return json({ error: opts.notice('notInDemo') }, 400)
    if ((match = path.match(/^\/api\/shots\/([^/]+)$/))) {
      const id = decodeURIComponent(match[1])
      if (m === 'GET') { const s = store.get(id); return s ? json(s) : json({ error: 'Not found' }, 404) }
      if (m === 'PATCH') { const s = store.update(id, await readJson(req)); return s ? json(s) : json({ error: 'Not found' }, 404) }
      if (m === 'DELETE') return store.remove(id) ? new Response(null, { status: 204 }) : json({ error: 'Not found' }, 404)
    }
    if (path === '/api/search/suggestions') return json(store.suggestions())

    if (path === '/api/settings') {
      if (m === 'PATCH') {
        const body = await readJson(req)
        const patch = Object.fromEntries(Object.entries(body).filter(([k]) => SETTINGS_KEYS.has(k)))
        settings = { ...getSettings(), ...patch } as AppSettings
        return json({ ok: true })
      }
      return json(getSettings())
    }

    if (path.startsWith('/api/stats')) {
      const period = isPeriod(q.period) ? q.period : '365d'
      const beverage = isBeverage(q.beverage) ? q.beverage : 'espresso'
      const topN = Math.min(20, Math.max(1, parseInt(q.topN ?? '10', 10) || 10))
      const now = Date.now()
      if (path === '/api/stats') return json(computeStats(store.all(), period, beverage, topN, now))
      if (path === '/api/stats/roasters') return json(computeRoasters(store.all(), period, beverage, now))
      if (path === '/api/stats/profiles') return json(computeProfiles(store.all(), period, beverage, now))
    }

    if (path === '/api/de1/test') {
      await sleep(delays.de1TestMs)
      return json({ ok: true, total: store.all().length + store.pendingImport().length, machineType: MACHINE })
    }
    if (path === '/api/de1/preview' && m === 'POST') {
      const shots = inRange(await readJson(req))
      return json({ count: shots.length, shots: shots.map((s) => ({ filename: machineFilename(s.startTime), date: s.startTime })), machineType: MACHINE })
    }
    if (path === '/api/de1/import' && m === 'POST') {
      const shots = inRange(await readJson(req))
      const enc = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async start(ctrl) {
          let imported = 0, skipped = 0
          for (const [i, s] of shots.entries()) {
            await sleep(delays.importPerShotMs)
            const status = store.importOne(s.id)
            status === 'imported' ? imported++ : skipped++
            ctrl.enqueue(enc.encode(JSON.stringify({ type: 'progress', current: i + 1, total: shots.length, filename: machineFilename(s.startTime), status }) + '\n'))
          }
          ctrl.enqueue(enc.encode(JSON.stringify({ type: 'done', imported, updated: 0, skipped, errors: 0, errorDetails: [] }) + '\n'))
          ctrl.close()
        },
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
    }

    if ((match = path.match(/^\/api\/analysis\/shot\/([^/]+)$/)) && m === 'POST') {
      await sleep(delays.analysisMs)
      const a = store.analysis(decodeURIComponent(match[1]))
      return a ? json(a) : json({ error: opts.notice('analysisUnavailable') }, 404)
    }

    if (path === '/api/auth/logout' || path === '/api/auth/login') return json({ ok: true })

    return json({ error: opts.notice('notInDemo') }, 501)
  }
}

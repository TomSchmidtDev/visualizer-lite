// packages/api/src/routes/de1.ts
import type { FastifyPluginAsync } from 'fastify'
import {
  getDe1Url,
  fetchShotList,
  filterByDateRange,
  importShotsInRange,
} from '../services/de1Service.js'

const de1Routes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [(fastify as any).requireAuth] }

  fastify.get('/test', auth, async (_req, reply) => {
    const url = await getDe1Url()
    if (!url) return reply.status(400).send({ error: 'DE1 URL not configured' })
    try {
      const list = await fetchShotList(url)
      return reply.send({ ok: true, total: list.length })
    } catch (err) {
      return reply.status(502).send({
        error: `Cannot reach DE1 at ${url}: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  })

  fastify.post<{ Body: { dateFrom: string; dateTo: string } }>(
    '/preview', auth, async (request, reply) => {
      const { dateFrom, dateTo } = request.body
      if (!dateFrom || !dateTo || new Date(dateFrom) > new Date(dateTo))
        return reply.status(400).send({ error: 'Invalid date range' })
      const url = await getDe1Url()
      if (!url) return reply.status(400).send({ error: 'DE1 URL not configured' })
      try {
        const list = await fetchShotList(url)
        const filtered = filterByDateRange(list, dateFrom, dateTo)
        return reply.send({ count: filtered.length, shots: filtered })
      } catch (err) {
        return reply.status(502).send({
          error: `Cannot reach DE1 at ${url}: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
  )

  fastify.post<{ Body: { dateFrom: string; dateTo: string } }>(
    '/import', auth, async (request, reply) => {
      const { dateFrom, dateTo } = request.body
      if (!dateFrom || !dateTo || new Date(dateFrom) > new Date(dateTo))
        return reply.status(400).send({ error: 'Invalid date range' })
      const url = await getDe1Url()
      if (!url) return reply.status(400).send({ error: 'DE1 URL not configured' })
      try {
        const result = await importShotsInRange(url, dateFrom, dateTo)
        return reply.send(result)
      } catch (err) {
        return reply.status(502).send({
          error: `Cannot reach DE1 at ${url}: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
  )
}

export default de1Routes

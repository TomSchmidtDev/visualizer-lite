// packages/api/src/routes/de1.ts
import { Readable } from 'stream'
import type { FastifyPluginAsync } from 'fastify'
import {
  getDe1Url,
  fetchShotList,
  filterByDateRange,
  fetchAndImportShot,
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

  /**
   * POST /api/de1/import
   *
   * Streams progress as newline-delimited JSON (NDJSON).
   * Each line is either a progress event or the final summary:
   *
   *   {"type":"progress","current":1,"total":5,"filename":"...","status":"imported"|"updated"|"skipped"|"error","error":"<msg if error>"}
   *   {"type":"done","imported":N,"updated":N,"skipped":N,"errors":N,"errorDetails":[...]}
   */
  fastify.post<{ Body: { dateFrom: string; dateTo: string; updateExisting?: boolean } }>(
    '/import', auth, async (request, reply) => {
      const { dateFrom, dateTo, updateExisting = true } = request.body
      if (!dateFrom || !dateTo || new Date(dateFrom) > new Date(dateTo))
        return reply.status(400).send({ error: 'Invalid date range' })

      const url = await getDe1Url()
      if (!url) return reply.status(400).send({ error: 'DE1 URL not configured' })

      // Fetch shot list before streaming — keeps error responses as plain JSON
      let allFilenames: string[]
      try {
        allFilenames = await fetchShotList(url)
      } catch (err) {
        return reply.status(502).send({
          error: `Cannot reach DE1 at ${url}: ${err instanceof Error ? err.message : String(err)}`,
        })
      }

      const filtered = filterByDateRange(allFilenames, dateFrom, dateTo)
      const total = filtered.length

      const stream = new Readable({ read() {} })
      reply.header('Content-Type', 'application/x-ndjson')
      reply.header('Cache-Control', 'no-cache')

      // Run the import asynchronously while streaming progress lines
      ;(async () => {
        let imported = 0, updated = 0, skipped = 0, errors = 0
        const errorDetails: { filename: string; message: string }[] = []

        for (let i = 0; i < filtered.length; i++) {
          const { filename } = filtered[i]
          try {
            const outcome = await fetchAndImportShot(url, filename, updateExisting)
            if      (outcome === 'created') imported++
            else if (outcome === 'updated') updated++
            else                            skipped++
            const status = outcome === 'created' ? 'imported' : outcome
            stream.push(
              JSON.stringify({ type: 'progress', current: i + 1, total, filename, status }) + '\n'
            )
          } catch (err) {
            errors++
            const msg = err instanceof Error ? err.message : 'Unknown error'
            errorDetails.push({ filename, message: msg })
            const shortMsg = msg.split('\n').find(l => l.trim()) ?? msg
            fastify.log.error(`DE1 import: ${filename}: ${shortMsg}`)
            stream.push(
              JSON.stringify({ type: 'progress', current: i + 1, total, filename, status: 'error', error: msg }) + '\n'
            )
          }
        }

        stream.push(
          JSON.stringify({ type: 'done', imported, updated, skipped, errors, errorDetails }) + '\n'
        )
        stream.push(null)
      })()

      return reply.send(stream)
    }
  )
}

export default de1Routes

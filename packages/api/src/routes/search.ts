// packages/api/src/routes/search.ts
import type { FastifyPluginAsync } from 'fastify'
import { getSuggestions } from '../services/searchService.js'

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/suggestions', { preHandler: [(fastify as any).requireAuth] }, async (_req, reply) => {
    return reply.send(await getSuggestions())
  })
}

export default searchRoutes

// packages/api/src/routes/export.ts
import type { FastifyPluginAsync } from 'fastify'
import { createExportArchive } from '../services/exportService.js'

const exportRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: [(fastify as any).requireAuth] }, async (_req, reply) => {
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', 'attachment; filename="visualizer-lite-export.zip"')
    await createExportArchive(reply.raw)
  })
}

export default exportRoutes

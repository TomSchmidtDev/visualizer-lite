// packages/api/src/routes/shots.ts
import type { FastifyPluginAsync } from 'fastify'
import {
  listShots,
  findShot,
  updateShot,
  deleteShot,
  getShotFilePath,
} from '../services/shotService.js'
import { readFile, deleteFile } from '../services/fileStorage.js'
import { searchShots } from '../services/searchService.js'

const shotRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [(fastify as any).requireAuth] }

  // GET /api/shots
  fastify.get('/', auth, async (request, reply) => {
    const q = request.query as Record<string, string>
    return reply.send(
      await searchShots({
        q:            q.q,
        page:         q.page    ? parseInt(q.page, 10)  : 1,
        limit:        q.limit   ? parseInt(q.limit, 10) : 20,
        beanBrand:    q.beanBrand,
        beanType:     q.beanType,
        profileTitle: q.profileTitle,
        grinderModel: q.grinderModel,
        dateFrom:     q.dateFrom,
        dateTo:       q.dateTo,
      })
    )
  })

  // GET /api/shots/:id
  fastify.get<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const shot = await findShot(request.params.id)
    return shot ? reply.send(shot) : reply.status(404).send({ error: 'Not found' })
  })

  // PATCH /api/shots/:id
  fastify.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/:id', auth, async (request, reply) => {
      try {
        return reply.send(await updateShot(request.params.id, request.body as any))
      } catch {
        return reply.status(404).send({ error: 'Not found' })
      }
    }
  )

  // DELETE /api/shots/:id
  fastify.delete<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const filePath = await getShotFilePath(request.params.id)
    if (!filePath) return reply.status(404).send({ error: 'Not found' })
    await deleteShot(request.params.id)
    deleteFile(filePath)
    return reply.status(204).send()
  })

  // GET /api/shots/:id/download
  fastify.get<{ Params: { id: string } }>('/:id/download', auth, async (request, reply) => {
    const filePath = await getShotFilePath(request.params.id)
    if (!filePath) return reply.status(404).send({ error: 'Not found' })
    const buffer = readFile(filePath)
    if (!buffer) return reply.status(404).send({ error: 'File not found on disk' })
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${request.params.id}.shot"`)
      .send(buffer)
  })
}

export default shotRoutes

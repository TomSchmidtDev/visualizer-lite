// packages/api/src/routes/upload.ts
import type { FastifyPluginAsync } from 'fastify'
import { sha256, saveFile } from '../services/fileStorage.js'
import { parseDecentShot } from '../parsers/decent.js'
import { createShot } from '../services/shotService.js'

const uploadRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/shots/upload',
    { preHandler: [(fastify as any).requireAuthOrBasic] },
    async (request, reply) => {
      const data = await request.file()
      if (!data) return reply.status(400).send({ error: 'No file provided' })

      const buffer = await data.toBuffer()
      const hash = sha256(buffer)
      const content = buffer.toString('utf8')

      let parsed
      try {
        parsed = parseDecentShot(content)
      } catch {
        return reply.status(422).send({ error: 'Failed to parse .shot file' })
      }

      const date = new Date(parsed.clock * 1000)
      const filePath = saveFile(buffer, hash, date)

      try {
        const shot = await createShot(parsed, hash, filePath)
        return reply.send({ id: shot.id })
      } catch (e: any) {
        if (e?.code === 'P2002') {
          return reply.status(409).send({ error: 'Shot already uploaded (duplicate)' })
        }
        throw e
      }
    }
  )
}

export default uploadRoutes

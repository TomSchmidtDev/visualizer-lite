// packages/api/src/routes/upload.ts
import type { FastifyPluginAsync } from 'fastify'
import { sha256, saveFile } from '../services/fileStorage.js'
import { parseDecentShot } from '../parsers/decent.js'
import { createShot } from '../services/shotService.js'
import { prisma } from '../db.js'

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
      } catch (err) {
        fastify.log.error(`upload: parse failed: ${err instanceof Error ? err.message : String(err)}`)
        return reply.status(422).send({ error: 'Failed to parse .shot file' })
      }

      // Re-parse and update shotData if shot already exists (picks up parser improvements)
      const existing = await prisma.shot.findUnique({ where: { sha256: hash }, select: { id: true } })
      if (existing) {
        await prisma.shot.update({
          where: { id: existing.id },
          data: { shotData: JSON.stringify(parsed.shotData) },
        })
        return reply.send({ id: existing.id })
      }

      const date = new Date(parsed.clock * 1000)
      const filePath = saveFile(buffer, hash, date)
      try {
        const shot = await createShot(parsed, hash, filePath)
        return reply.send({ id: shot.id })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const shortMsg = msg.split('\n').find(l => l.trim()) ?? msg
        fastify.log.error(`upload: DB insert failed: ${shortMsg}`)
        return reply.status(500).send({ error: 'Failed to save shot' })
      }
    }
  )
}

export default uploadRoutes

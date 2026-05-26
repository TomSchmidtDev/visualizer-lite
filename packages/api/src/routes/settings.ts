// packages/api/src/routes/settings.ts
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../db.js'
import bcrypt from 'bcrypt'

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [(fastify as any).requireAuth] }

  fastify.get('/', auth, async (_req, reply) => {
    const rows = await prisma.settings.findMany()
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    return reply.send({
      language: map.language ?? 'auto',
      theme: map.theme ?? 'dark',
      username: map.username ?? 'admin',
    })
  })

  fastify.patch<{
    Body: {
      language?: string
      theme?: string
      currentPassword?: string
      newPassword?: string
    }
  }>('/', auth, async (request, reply) => {
    const { language, theme, currentPassword, newPassword } = request.body
    if (language)
      await prisma.settings.upsert({
        where: { key: 'language' },
        create: { key: 'language', value: language },
        update: { value: language },
      })
    if (theme)
      await prisma.settings.upsert({
        where: { key: 'theme' },
        create: { key: 'theme', value: theme },
        update: { value: theme },
      })
    if (currentPassword && newPassword) {
      const row = await prisma.settings.findUnique({ where: { key: 'passwordHash' } })
      if (!row || !(await bcrypt.compare(currentPassword, row.value))) {
        return reply.status(401).send({ error: 'Current password incorrect' })
      }
      await prisma.settings.update({
        where: { key: 'passwordHash' },
        data: { value: await bcrypt.hash(newPassword, 12) },
      })
    }
    return reply.send({ ok: true })
  })
}

export default settingsRoutes

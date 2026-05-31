// packages/api/src/routes/settings.ts
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../db.js'
import bcrypt from 'bcryptjs'

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [(fastify as any).requireAuth] }

  fastify.get('/', auth, async (_req, reply) => {
    const rows = await prisma.settings.findMany()
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    return reply.send({
      language:           map.language       ?? 'auto',
      theme:              map.theme          ?? 'dark',
      username:           map.username       ?? 'admin',
      de1Url:             map.de1Url         ?? '',
      tooltipOpacity:     map.tooltipOpacity ? parseFloat(map.tooltipOpacity) : 0.72,
      showAvgRatio:       map.showAvgRatio !== undefined ? map.showAvgRatio === 'true' : true,
      de1LastImportDate:  map.de1LastImportDate ?? null,
      statsTopN:           map.statsTopN ? parseInt(map.statsTopN, 10) : 10,
      statsShowPrevValue:  map.statsShowPrevValue !== undefined ? map.statsShowPrevValue === 'true' : true,
      de1DefaultBeverage:  map.de1DefaultBeverage ?? '',
    })
  })

  fastify.patch<{
    Body: {
      language?: string
      theme?: string
      de1Url?: string
      tooltipOpacity?: number
      showAvgRatio?: boolean
      de1LastImportDate?: string | null
      statsTopN?: number
      statsShowPrevValue?: boolean
      de1DefaultBeverage?: string
      currentPassword?: string
      newPassword?: string
    }
  }>('/', auth, async (request, reply) => {
    const { language, theme, de1Url, tooltipOpacity, showAvgRatio, de1LastImportDate, statsTopN, statsShowPrevValue, de1DefaultBeverage, currentPassword, newPassword } = request.body

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
    if (de1Url !== undefined)
      await prisma.settings.upsert({
        where: { key: 'de1Url' },
        create: { key: 'de1Url', value: de1Url },
        update: { value: de1Url },
      })
    if (tooltipOpacity !== undefined)
      await prisma.settings.upsert({
        where: { key: 'tooltipOpacity' },
        create: { key: 'tooltipOpacity', value: String(tooltipOpacity) },
        update: { value: String(tooltipOpacity) },
      })
    if (showAvgRatio !== undefined)
      await prisma.settings.upsert({
        where: { key: 'showAvgRatio' },
        create: { key: 'showAvgRatio', value: String(showAvgRatio) },
        update: { value: String(showAvgRatio) },
      })
    if (de1LastImportDate !== undefined && de1LastImportDate !== null)
      await prisma.settings.upsert({
        where: { key: 'de1LastImportDate' },
        create: { key: 'de1LastImportDate', value: de1LastImportDate },
        update: { value: de1LastImportDate },
      })
    if (statsTopN !== undefined)
      await prisma.settings.upsert({
        where: { key: 'statsTopN' },
        create: { key: 'statsTopN', value: String(Math.min(20, Math.max(1, statsTopN))) },
        update: { value: String(Math.min(20, Math.max(1, statsTopN))) },
      })
    if (statsShowPrevValue !== undefined)
      await prisma.settings.upsert({
        where: { key: 'statsShowPrevValue' },
        create: { key: 'statsShowPrevValue', value: String(statsShowPrevValue) },
        update: { value: String(statsShowPrevValue) },
      })
    if (de1DefaultBeverage !== undefined)
      await prisma.settings.upsert({
        where: { key: 'de1DefaultBeverage' },
        create: { key: 'de1DefaultBeverage', value: de1DefaultBeverage },
        update: { value: de1DefaultBeverage },
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

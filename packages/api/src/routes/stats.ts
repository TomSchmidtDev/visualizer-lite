// packages/api/src/routes/stats.ts
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../db.js'

const statsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: [(fastify as any).requireAuth] }, async (_req, reply) => {
    const [count, agg] = await Promise.all([
      prisma.shot.count(),
      prisma.shot.aggregate({
        _avg: {
          espressoEnjoyment: true,
          drinkWeight: true,
          beanWeight: true,
        },
      }),
    ])
    const avgRatio =
      agg._avg.beanWeight && agg._avg.drinkWeight
        ? Math.round((agg._avg.drinkWeight / agg._avg.beanWeight) * 100) / 100
        : null
    return reply.send({
      total: count,
      avgEnjoyment: agg._avg.espressoEnjoyment
        ? Math.round(agg._avg.espressoEnjoyment)
        : null,
      avgRatio,
    })
  })
}

export default statsRoutes

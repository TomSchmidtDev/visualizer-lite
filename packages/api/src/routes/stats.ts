import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../db.js'

type Period = '24h' | '7d' | '30d' | '365d'
type Beverage = 'espresso' | 'filter' | 'all'

const PERIOD_MS: Record<Period, number> = {
  '24h':  1 * 24 * 60 * 60 * 1000,
  '7d':   7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '365d': 365 * 24 * 60 * 60 * 1000,
}

const PERIOD_DAYS: Record<Period, number> = {
  '24h': 1, '7d': 7, '30d': 30, '365d': 365,
}

function isValidPeriod(v: unknown): v is Period {
  return typeof v === 'string' && v in PERIOD_MS
}

function isValidBeverage(v: unknown): v is Beverage {
  return v === 'espresso' || v === 'filter' || v === 'all'
}

function beverageFilter(beverage: Beverage) {
  if (beverage === 'all') return {}
  return { beverageType: beverage }
}

async function computeWindow(where: object) {
  const [agg, topRoasters, topRoasts, topProfiles, topGrinderRows] = await Promise.all([
    prisma.shot.aggregate({
      where,
      _count: { id: true },
      _sum:   { beanWeight: true, drinkWeight: true },
      _avg:   { espressoEnjoyment: true, duration: true },
    }),

    prisma.shot.groupBy({
      by: ['beanBrand'],
      where: { ...where, beanBrand: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 3,
    }),

    prisma.shot.groupBy({
      by: ['beanBrand', 'beanType'],
      where: { ...where, beanBrand: { not: null }, beanType: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 3,
    }),

    prisma.shot.groupBy({
      by: ['profileTitle'],
      where: { ...where, profileTitle: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 3,
    }),

    prisma.shot.groupBy({
      by: ['grinderSetting'],
      where: { ...where, grinderSetting: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1,
    }),
  ])

  const shotCount = agg._count.id
  const beanWeightG = agg._sum.beanWeight ?? 0
  const drinkWeightG = agg._sum.drinkWeight ?? 0

  return {
    shotCount,
    beanWeightG: Math.round(beanWeightG),
    drinkWeightG: Math.round(drinkWeightG),
    avgRatio: beanWeightG > 0
      ? Math.round((drinkWeightG / beanWeightG) * 1000) / 1000
      : null,
    avgEnjoyment: agg._avg.espressoEnjoyment != null
      ? Math.round(agg._avg.espressoEnjoyment * 10) / 10
      : null,
    avgDurationS: agg._avg.duration != null
      ? Math.round(agg._avg.duration * 10) / 10
      : null,
    topGrinderSetting: topGrinderRows[0]?.grinderSetting ?? null,
    topRoasters: topRoasters.map(r => ({ name: r.beanBrand as string, count: r._count.id })),
    topRoasts: topRoasts.map(r => ({
      name: `${r.beanBrand} · ${r.beanType}`,
      count: r._count.id,
    })),
    topProfiles: topProfiles.map(r => ({ name: r.profileTitle as string, count: r._count.id })),
  }
}

const statsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: [(fastify as any).requireAuth] }, async (request, reply) => {
    const q = request.query as Record<string, string>

    const period: Period   = isValidPeriod(q.period)     ? q.period     : '365d'
    const beverage: Beverage = isValidBeverage(q.beverage) ? q.beverage : 'espresso'

    const now    = Date.now()
    const ms     = PERIOD_MS[period]
    const days   = PERIOD_DAYS[period]
    const bevWhere = beverageFilter(beverage)

    const currentWhere = {
      startTime: { gte: new Date(now - ms), lt: new Date(now) },
      ...bevWhere,
    }
    const previousWhere = {
      startTime: { gte: new Date(now - 2 * ms), lt: new Date(now - ms) },
      ...bevWhere,
    }

    const [current, previous] = await Promise.all([
      computeWindow(currentWhere),
      computeWindow(previousWhere),
    ])

    const shotsPerDay = days > 0
      ? Math.round((current.shotCount / days) * 10) / 10
      : null

    return reply.send({
      period,
      beverage,
      current: { ...current, shotsPerDay },
      previous: {
        ...previous,
        shotsPerDay: days > 0
          ? Math.round((previous.shotCount / days) * 10) / 10
          : null,
      },
    })
  })
}

export default statsRoutes

import type { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { prisma } from '../db.js'

type Period = '24h' | '7d' | '14d' | '30d' | '180d' | '365d' | '730d' | '1095d' | 'all'
type Beverage = 'espresso' | 'filter' | 'all'

const PERIOD_MS: Record<Exclude<Period, 'all'>, number> = {
  '24h':    1 * 24 * 60 * 60 * 1000,
  '7d':     7 * 24 * 60 * 60 * 1000,
  '14d':   14 * 24 * 60 * 60 * 1000,
  '30d':   30 * 24 * 60 * 60 * 1000,
  '180d':  180 * 24 * 60 * 60 * 1000,
  '365d':  365 * 24 * 60 * 60 * 1000,
  '730d':  730 * 24 * 60 * 60 * 1000,
  '1095d': 1095 * 24 * 60 * 60 * 1000,
}

const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = {
  '24h': 1, '7d': 7, '14d': 14, '30d': 30, '180d': 180, '365d': 365, '730d': 730, '1095d': 1095,
}

const VALID_PERIODS = new Set<string>(['24h', '7d', '14d', '30d', '180d', '365d', '730d', '1095d', 'all'])

interface BeanRow {
  bean: string
  shotCount: number
  avgEnjoyment: number | null
  avgRatio: number | null
  avgDurationS: number | null
  totalBeanWeightG: number
}

interface RoasterRow {
  roaster: string
  shotCount: number
  avgEnjoyment: number | null
  avgRatio: number | null
  avgDurationS: number | null
  totalBeanWeightG: number
  beans: BeanRow[]
}

interface ProfileRow {
  profile: string
  shotCount: number
  avgEnjoyment: number | null
  avgDurationS: number | null
  avgRatio: number | null
  avgBeanWeightG: number | null
}

function isValidPeriod(v: unknown): v is Period {
  return typeof v === 'string' && VALID_PERIODS.has(v)
}

function isValidBeverage(v: unknown): v is Beverage {
  return v === 'espresso' || v === 'filter' || v === 'all'
}

function beverageFilter(beverage: Beverage) {
  if (beverage === 'all') return {}
  // shots with null beverageType are excluded when a specific type is selected
  return { beverageType: beverage }
}

async function computeWindow(where: Prisma.ShotWhereInput, topN: number) {
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
      take: topN,
    }),

    prisma.shot.groupBy({
      by: ['beanBrand', 'beanType'],
      where: { ...where, beanBrand: { not: null }, beanType: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: topN,
    }),

    prisma.shot.groupBy({
      by: ['profileTitle'],
      where: { ...where, profileTitle: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: topN,
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

    const period: Period     = isValidPeriod(q.period)       ? q.period     : '365d'
    const beverage: Beverage = isValidBeverage(q.beverage)   ? q.beverage   : 'espresso'
    const topN = Math.min(20, Math.max(1, parseInt(q.topN ?? '10', 10) || 10))

    const now      = Date.now()
    const bevWhere = beverageFilter(beverage)

    let currentWhere: Prisma.ShotWhereInput
    let previousWhere: Prisma.ShotWhereInput
    let days: number | null

    if (period === 'all') {
      currentWhere  = { ...bevWhere }
      previousWhere = { startTime: { lt: new Date(0) } } // empty — no previous for "all"
      days = null
    } else {
      const ms = PERIOD_MS[period]
      days = PERIOD_DAYS[period]
      currentWhere  = { startTime: { gte: new Date(now - ms),       lt: new Date(now) },       ...bevWhere }
      previousWhere = { startTime: { gte: new Date(now - 2 * ms),   lt: new Date(now - ms) },  ...bevWhere }
    }

    const [current, previous] = await Promise.all([
      computeWindow(currentWhere, topN),
      computeWindow(previousWhere, topN),
    ])

    const shotsPerDay = days != null && days > 0
      ? Math.round((current.shotCount / days) * 10) / 10
      : null

    return reply.send({
      period,
      beverage,
      current: { ...current, shotsPerDay },
      previous: {
        ...previous,
        shotsPerDay: days != null && days > 0
          ? Math.round((previous.shotCount / days) * 10) / 10
          : null,
      },
    })
  })

  fastify.get('/roasters', { preHandler: [(fastify as any).requireAuth] }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const period: Period     = isValidPeriod(q.period)     ? q.period   : '365d'
    const beverage: Beverage = isValidBeverage(q.beverage) ? q.beverage : 'espresso'

    const now = Date.now()
    const bevWhere = beverageFilter(beverage)
    const where: Prisma.ShotWhereInput = period === 'all'
      ? { ...bevWhere }
      : { startTime: { gte: new Date(now - PERIOD_MS[period]), lt: new Date(now) }, ...bevWhere }

    const [roasterGroups, beanGroups] = await Promise.all([
      prisma.shot.groupBy({
        by: ['beanBrand'],
        where: { ...where, beanBrand: { not: null } },
        _count: { id: true },
        _sum:   { beanWeight: true, drinkWeight: true },
        _avg:   { espressoEnjoyment: true, duration: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.shot.groupBy({
        by: ['beanBrand', 'beanType'],
        where: { ...where, beanBrand: { not: null }, beanType: { not: null } },
        _count: { id: true },
        _sum:   { beanWeight: true, drinkWeight: true },
        _avg:   { espressoEnjoyment: true, duration: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ])

    const beansByRoaster = new Map<string, BeanRow[]>()
    for (const b of beanGroups) {
      const roaster = b.beanBrand as string
      const bw = b._sum.beanWeight ?? 0
      const dw = b._sum.drinkWeight ?? 0
      const bean: BeanRow = {
        bean: b.beanType as string,
        shotCount: b._count.id,
        avgEnjoyment: b._avg.espressoEnjoyment != null ? Math.round(b._avg.espressoEnjoyment * 10) / 10 : null,
        avgRatio: bw > 0 ? Math.round((dw / bw) * 1000) / 1000 : null,
        avgDurationS: b._avg.duration != null ? Math.round(b._avg.duration * 10) / 10 : null,
        totalBeanWeightG: Math.round(bw),
      }
      if (!beansByRoaster.has(roaster)) beansByRoaster.set(roaster, [])
      beansByRoaster.get(roaster)!.push(bean)
    }

    const result: RoasterRow[] = roasterGroups.map(r => {
      const bw = r._sum.beanWeight ?? 0
      const dw = r._sum.drinkWeight ?? 0
      return {
        roaster: r.beanBrand as string,
        shotCount: r._count.id,
        avgEnjoyment: r._avg.espressoEnjoyment != null ? Math.round(r._avg.espressoEnjoyment * 10) / 10 : null,
        avgRatio: bw > 0 ? Math.round((dw / bw) * 1000) / 1000 : null,
        avgDurationS: r._avg.duration != null ? Math.round(r._avg.duration * 10) / 10 : null,
        totalBeanWeightG: Math.round(bw),
        beans: beansByRoaster.get(r.beanBrand as string) ?? [],
      }
    })

    return reply.send(result)
  })
}

export default statsRoutes

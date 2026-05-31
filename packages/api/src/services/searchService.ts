// packages/api/src/services/searchService.ts
import { prisma } from '../db.js'
import { listShots, computeAvgRatio, downsample, type ListOptions } from './shotService.js'
import type { ShotListResponse, ShotData } from '../types.js'

export async function searchShots(opts: ListOptions & { q?: string }): Promise<ShotListResponse> {
  if (!opts.q?.trim()) return listShots(opts)

  const query = opts.q.trim().split(/\s+/).map((t) => `${t}*`).join(' ')
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM shots_fts WHERE shots_fts MATCH ${query} ORDER BY rank
  `
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) return { shots: [], total: 0, page: 1, limit: opts.limit ?? 20, avgRatio: null }

  const page = Math.max(1, opts.page ?? 1)
  const limit = Math.min(100, opts.limit ?? 20)

  const ftsWhere: Record<string, unknown> = { id: { in: ids } }
  if (opts.beverageType === 'unknown') ftsWhere.OR = [{ beverageType: null }, { beverageType: '' }]
  else if (opts.beverageType) ftsWhere.beverageType = opts.beverageType

  const [shots, total, avgRatio] = await Promise.all([
    prisma.shot.findMany({
      where: ftsWhere,
      orderBy: { startTime: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { tags: true },
    }),
    prisma.shot.count({ where: ftsWhere }),
    computeAvgRatio(ftsWhere),
  ])

  return {
    shots: shots.map((s) => ({
      id: s.id,
      startTime: s.startTime.toISOString(),
      duration: s.duration,
      beanWeight: s.beanWeight,
      drinkWeight: s.drinkWeight,
      drinkTds: s.drinkTds,
      drinkEy: s.drinkEy,
      profileTitle: s.profileTitle,
      beverageType: s.beverageType,
      grinderModel: s.grinderModel,
      grinderSetting: s.grinderSetting,
      barista: s.barista,
      beanBrand: s.beanBrand,
      beanType: s.beanType,
      roastDate: s.roastDate?.toISOString() ?? null,
      roastLevel: s.roastLevel,
      espressoEnjoyment: s.espressoEnjoyment,
      fragrance: s.fragrance,
      aroma: s.aroma,
      flavor: s.flavor,
      aftertaste: s.aftertaste,
      acidity: s.acidity,
      bitterness: s.bitterness,
      sweetness: s.sweetness,
      mouthfeel: s.mouthfeel,
      beanNotes: s.beanNotes,
      espressoNotes: s.espressoNotes,
      privateNotes: s.privateNotes,
      tags: (s as any).tags.map((t: { name: string }) => t.name),
      sparkline: (() => {
        try {
          const sd = JSON.parse((s as any).shotData) as ShotData
          return {
            pressure:   sd.espresso_pressure?.length   ? downsample(sd.espresso_pressure)   : undefined,
            flow:       sd.espresso_flow?.length        ? downsample(sd.espresso_flow)        : undefined,
            weightFlow: sd.espresso_flow_weight?.length ? downsample(sd.espresso_flow_weight) : undefined,
          }
        } catch { return undefined }
      })(),
    })),
    total,
    page,
    limit,
    avgRatio,
  }
}

export async function getSuggestions() {
  const [brands, types, profiles, grinders, settings, beverages] = await Promise.all([
    prisma.shot.findMany({ select: { beanBrand: true }, distinct: ['beanBrand'], where: { beanBrand: { not: null } }, orderBy: { beanBrand: 'asc' } }),
    prisma.shot.findMany({ select: { beanType: true }, distinct: ['beanType'], where: { beanType: { not: null } }, orderBy: { beanType: 'asc' } }),
    prisma.shot.findMany({ select: { profileTitle: true }, distinct: ['profileTitle'], where: { profileTitle: { not: null } }, orderBy: { profileTitle: 'asc' } }),
    prisma.shot.findMany({ select: { grinderModel: true }, distinct: ['grinderModel'], where: { grinderModel: { not: null } }, orderBy: { grinderModel: 'asc' } }),
    prisma.shot.findMany({ select: { grinderSetting: true }, distinct: ['grinderSetting'], where: { grinderSetting: { not: null } }, orderBy: { grinderSetting: 'asc' } }),
    prisma.shot.findMany({ select: { beverageType: true }, distinct: ['beverageType'], orderBy: { beverageType: 'asc' } }),
  ])
  return {
    beanBrands:      brands.map((r) => r.beanBrand!),
    beanTypes:       types.map((r) => r.beanType!),
    profileTitles:   profiles.map((r) => r.profileTitle!),
    grinderModels:   grinders.map((r) => r.grinderModel!),
    grinderSettings: settings.map((r) => r.grinderSetting!),
    // null and '' are both mapped to 'unknown' so the filter can catch all "not set" shots
    beverageTypes:   [...new Set(beverages.map((r) => r.beverageType || 'unknown'))].sort(),
  }
}

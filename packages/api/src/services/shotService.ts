// packages/api/src/services/shotService.ts
import { prisma } from '../db.js'
import type { ParsedShot, ShotData, ShotResponse, ShotListResponse } from '../types.js'

export interface ListOptions {
  page?: number
  limit?: number
  beanBrand?: string
  beanType?: string
  profileTitle?: string
  grinderModel?: string
  dateFrom?: string
  dateTo?: string
  beverageType?: string
}

type ShotWithTags = Awaited<ReturnType<typeof prisma.shot.findUniqueOrThrow>>
  & { tags: { name: string }[] }

export function downsample(arr: number[], target = 60): number[] {
  if (arr.length <= target) return arr
  const step = arr.length / target
  return Array.from({ length: target }, (_, i) => arr[Math.round(i * step)])
}

function toResponse(row: ShotWithTags, includeShotData = false, includeSparkline = false): ShotResponse {
  const base: ShotResponse = {
    id: row.id,
    startTime: row.startTime.toISOString(),
    duration: row.duration,
    beanWeight: row.beanWeight,
    drinkWeight: row.drinkWeight,
    drinkTds: row.drinkTds,
    drinkEy: row.drinkEy,
    profileTitle: row.profileTitle,
    beverageType: row.beverageType,
    grinderModel: row.grinderModel,
    grinderSetting: row.grinderSetting,
    barista: row.barista,
    beanBrand: row.beanBrand,
    beanType: row.beanType,
    roastDate: row.roastDate?.toISOString() ?? null,
    roastLevel: row.roastLevel,
    espressoEnjoyment: row.espressoEnjoyment,
    fragrance: row.fragrance,
    aroma: row.aroma,
    flavor: row.flavor,
    aftertaste: row.aftertaste,
    acidity: row.acidity,
    bitterness: row.bitterness,
    sweetness: row.sweetness,
    mouthfeel: row.mouthfeel,
    beanNotes: row.beanNotes,
    espressoNotes: row.espressoNotes,
    privateNotes: row.privateNotes,
    tags: row.tags.map((t) => t.name),
  }
  if (includeShotData || includeSparkline) {
    const sd = JSON.parse(row.shotData) as ShotData
    if (includeShotData) base.shotData = sd
    if (includeSparkline) {
      base.sparkline = {
        pressure:   sd.espresso_pressure?.length   ? downsample(sd.espresso_pressure)   : undefined,
        flow:       sd.espresso_flow?.length        ? downsample(sd.espresso_flow)        : undefined,
        weightFlow: sd.espresso_flow_weight?.length ? downsample(sd.espresso_flow_weight) : undefined,
      }
    }
  }
  return base
}

function parseOptionalDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export async function createShot(
  parsed: ParsedShot,
  hash: string,
  filePath: string
): Promise<ShotResponse> {
  const row = await prisma.shot.create({
    data: {
      startTime: new Date(parsed.clock * 1000),
      filePath,
      sha256: hash,
      duration: parsed.duration,
      beanWeight: parsed.beanWeight,
      drinkWeight: parsed.drinkWeight,
      profileTitle: parsed.profileTitle,
      grinderModel: parsed.grinderModel,
      grinderSetting: parsed.grinderSetting,
      barista: parsed.barista,
      beverageType: parsed.beverageType,
      beanBrand: parsed.beanBrand,
      beanType: parsed.beanType,
      roastLevel: parsed.roastLevel,
      roastDate: parseOptionalDate(parsed.roastDate),
      espressoEnjoyment: parsed.espressoEnjoyment,
      espressoNotes:     parsed.espressoNotes,
      shotData: JSON.stringify(parsed.shotData),
    },
    include: { tags: true },
  })
  return toResponse(row as ShotWithTags)
}

export async function findShot(id: string): Promise<ShotResponse | null> {
  const row = await prisma.shot.findUnique({
    where: { id },
    include: { tags: true },
  })
  return row ? toResponse(row as ShotWithTags, true) : null
}

export async function computeAvgRatio(where: Record<string, unknown>): Promise<number | null> {
  const rows = await prisma.shot.findMany({
    where: { ...where, beanWeight: { gt: 0 }, drinkWeight: { not: null } },
    select: { beanWeight: true, drinkWeight: true },
  })
  if (rows.length === 0) return null
  const sum = rows.reduce((s, r) => s + r.drinkWeight! / r.beanWeight!, 0)
  return Math.round((sum / rows.length) * 100) / 100
}

export async function listShots(opts: ListOptions): Promise<ShotListResponse> {
  const page = Math.max(1, opts.page ?? 1)
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20))
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (opts.beanBrand) where.beanBrand = { contains: opts.beanBrand }
  if (opts.beanType) where.beanType = { contains: opts.beanType }
  if (opts.profileTitle) where.profileTitle = { contains: opts.profileTitle }
  if (opts.grinderModel) where.grinderModel = { contains: opts.grinderModel }
  if (opts.dateFrom || opts.dateTo) {
    where.startTime = {
      ...(opts.dateFrom ? { gte: new Date(opts.dateFrom) } : {}),
      ...(opts.dateTo ? { lte: new Date(opts.dateTo) } : {}),
    }
  }
  if (opts.beverageType === 'unknown') where.OR = [{ beverageType: null }, { beverageType: '' }]
  else if (opts.beverageType) where.beverageType = opts.beverageType

  const [rows, total, avgRatio] = await Promise.all([
    prisma.shot.findMany({
      where,
      orderBy: { startTime: 'desc' },
      skip,
      take: limit,
      include: { tags: true },
    }),
    prisma.shot.count({ where }),
    computeAvgRatio(where),
  ])

  return {
    shots: rows.map((r) => toResponse(r as ShotWithTags, false, true)),
    total,
    page,
    limit,
    avgRatio,
  }
}

export async function updateShot(
  id: string,
  data: Partial<{
    drinkTds: number; drinkEy: number; profileTitle: string
    beverageType: string | null
    grinderModel: string; grinderSetting: string; barista: string
    beanBrand: string; beanType: string; roastLevel: string; roastDate: string
    espressoEnjoyment: number; fragrance: number; aroma: number
    flavor: number; aftertaste: number; acidity: number
    bitterness: number; sweetness: number; mouthfeel: number
    beanNotes: string; espressoNotes: string; privateNotes: string
    tags: string[]
  }>
): Promise<ShotResponse> {
  const { tags, roastDate, beverageType, ...rest } = data
  const row = await prisma.shot.update({
    where: { id },
    data: {
      ...rest,
      ...(beverageType !== undefined ? { beverageType: beverageType?.toLowerCase() ?? null } : {}),
      ...(roastDate !== undefined
        ? { roastDate: roastDate ? new Date(roastDate) : null }
        : {}),
      ...(tags !== undefined
        ? {
            tags: {
              set: [],
              connectOrCreate: tags.map((name) => ({
                where: { name },
                create: { name },
              })),
            },
          }
        : {}),
    },
    include: { tags: true },
  })
  return toResponse(row as ShotWithTags, true)
}

export async function deleteShot(id: string): Promise<void> {
  await prisma.shot.delete({ where: { id } })
}

export async function getShotFilePath(id: string): Promise<string | null> {
  const row = await prisma.shot.findUnique({ where: { id }, select: { filePath: true } })
  return row?.filePath ?? null
}

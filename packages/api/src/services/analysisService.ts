// packages/api/src/services/analysisService.ts
import { prisma } from '../db.js'
import type { ShotData, ShotResponse } from '../types.js'

export interface AggregatedStats {
  min: number
  max: number
  avg: number
  count: number
}

export interface CurveStats {
  pressure?: AggregatedStats
  flow?: AggregatedStats
  temperature?: AggregatedStats
}

export interface DownsampledCurve {
  pressure?: number[]
  flow?: number[]
  temperature?: number[]
}

export interface PreprocessedData {
  targetShot: ShotResponse
  contextShots: ShotResponse[]
  aggregatedStats: CurveStats
}

/**
 * Downsample a numeric array to a target size using linear interpolation.
 * Preserves min/max values and handles edge cases.
 */
export function downsampleCurve(data: number[], targetSize: number): number[] {
  // Empty array
  if (data.length === 0) {
    return []
  }

  // Array smaller than target size - return as is
  if (data.length <= targetSize) {
    return data
  }

  const result: number[] = []

  // Always include the first point
  result.push(data[0])

  if (targetSize === 1) {
    return result
  }

  // Generate intermediate points using linear interpolation
  for (let i = 1; i < targetSize - 1; i++) {
    // Calculate the position in the original data array
    const position = (i / (targetSize - 1)) * (data.length - 1)
    const index = Math.floor(position)
    const fraction = position - index

    // Linear interpolation between two points
    if (index < data.length - 1) {
      const interpolated = data[index] * (1 - fraction) + data[index + 1] * fraction
      result.push(interpolated)
    }
  }

  // Always include the last point
  result.push(data[data.length - 1])

  return result
}

/**
 * Calculate min, max, average, and count for a numeric array.
 * Returns zeros for empty arrays.
 */
export function aggregateStats(data: number[]): AggregatedStats {
  if (data.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      count: 0,
    }
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const avg = data.reduce((a, b) => a + b, 0) / data.length

  return {
    min,
    max,
    avg,
    count: data.length,
  }
}

/**
 * Downsample shot curves to 50 points each.
 * Handles missing fields gracefully.
 */
export function downsampleShotCurves(shotData: ShotData): DownsampledCurve {
  const result: DownsampledCurve = {}

  if (shotData.espresso_pressure) {
    result.pressure = downsampleCurve(shotData.espresso_pressure, 50)
  }

  if (shotData.espresso_flow) {
    result.flow = downsampleCurve(shotData.espresso_flow, 50)
  }

  if (shotData.espresso_temperature_mix) {
    result.temperature = downsampleCurve(shotData.espresso_temperature_mix, 50)
  }

  return result
}

/**
 * Create a human-readable description of a curve.
 * Format: "Min: X, Max: Y, Avg: Z unit"
 */
export function describeCurve(data: number[] | undefined, unit: string): string {
  if (!data || data.length === 0) {
    return 'No data'
  }

  const stats = aggregateStats(data)
  return `Min: ${stats.min}, Max: ${stats.max}, Avg: ${stats.avg.toFixed(1)} ${unit}`
}

/**
 * Preprocess a shot for AI analysis.
 * Loads the target shot, context shots within time window, and aggregated stats.
 */
export async function preprocessShots(
  shotId: string,
  window: '7d' | '30d' | '90d' | 'all' = '30d'
): Promise<PreprocessedData> {
  // Load target shot
  const targetShot = await prisma.shot.findUnique({
    where: { id: shotId },
    include: { tags: true },
  })

  if (!targetShot) {
    throw new Error('Shot not found')
  }

  // Calculate time window
  const windowMs: Record<string, number> = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
    'all': Infinity,
  }

  const targetDate = new Date(targetShot.startTime)
  const windowStart = new Date(targetDate.getTime() - windowMs[window])

  // Load context shots within time window, excluding target shot, limit to 100
  const contextShots = await prisma.shot.findMany({
    where: {
      id: { not: shotId },
      startTime: {
        gte: windowStart.toISOString(),
        lte: targetDate.toISOString(),
      },
    },
    include: { tags: true },
    orderBy: { startTime: 'desc' },
    take: 100,
  })

  // Aggregate stats from all shots (target + context)
  const allShots = [targetShot, ...contextShots]
  const pressureData: number[] = []
  const flowData: number[] = []
  const temperatureData: number[] = []

  for (const shot of allShots) {
    // Parse shotData JSON if it's stored as string
    let shotData: ShotData
    if (typeof shot.shotData === 'string') {
      shotData = JSON.parse(shot.shotData)
    } else {
      shotData = shot.shotData as ShotData
    }

    if (shotData.espresso_pressure) {
      pressureData.push(...shotData.espresso_pressure)
    }
    if (shotData.espresso_flow) {
      flowData.push(...shotData.espresso_flow)
    }
    if (shotData.espresso_temperature_mix) {
      temperatureData.push(...shotData.espresso_temperature_mix)
    }
  }

  const aggregatedStats: CurveStats = {}
  if (pressureData.length > 0) {
    aggregatedStats.pressure = aggregateStats(pressureData)
  }
  if (flowData.length > 0) {
    aggregatedStats.flow = aggregateStats(flowData)
  }
  if (temperatureData.length > 0) {
    aggregatedStats.temperature = aggregateStats(temperatureData)
  }

  // Downsample target shot curves for the response
  let shotData: ShotData
  if (typeof targetShot.shotData === 'string') {
    shotData = JSON.parse(targetShot.shotData)
  } else {
    shotData = targetShot.shotData as ShotData
  }

  const downsampledCurves = downsampleShotCurves(shotData)

  // Build response with downsampled curves
  const targetShotResponse: ShotResponse = {
    id: targetShot.id,
    startTime: targetShot.startTime,
    duration: targetShot.duration,
    beanWeight: targetShot.beanWeight,
    drinkWeight: targetShot.drinkWeight,
    drinkTds: targetShot.drinkTds,
    drinkEy: targetShot.drinkEy,
    profileTitle: targetShot.profileTitle,
    beverageType: targetShot.beverageType,
    grinderModel: targetShot.grinderModel,
    grinderSetting: targetShot.grinderSetting,
    barista: targetShot.barista,
    beanBrand: targetShot.beanBrand,
    beanType: targetShot.beanType,
    roastDate: targetShot.roastDate,
    roastLevel: targetShot.roastLevel,
    espressoEnjoyment: targetShot.espressoEnjoyment,
    fragrance: targetShot.fragrance,
    aroma: targetShot.aroma,
    flavor: targetShot.flavor,
    aftertaste: targetShot.aftertaste,
    acidity: targetShot.acidity,
    bitterness: targetShot.bitterness,
    sweetness: targetShot.sweetness,
    mouthfeel: targetShot.mouthfeel,
    beanNotes: targetShot.beanNotes,
    espressoNotes: targetShot.espressoNotes,
    privateNotes: targetShot.privateNotes,
    tags: targetShot.tags.map((t) => t.name),
    shotData: {
      timeframe: downsampledCurves.pressure ? shotData.timeframe : undefined,
      espresso_pressure: downsampledCurves.pressure,
      espresso_flow: downsampledCurves.flow,
      espresso_temperature_mix: downsampledCurves.temperature,
    },
  }

  const contextShotResponses: ShotResponse[] = contextShots.map((shot) => ({
    id: shot.id,
    startTime: shot.startTime,
    duration: shot.duration,
    beanWeight: shot.beanWeight,
    drinkWeight: shot.drinkWeight,
    drinkTds: shot.drinkTds,
    drinkEy: shot.drinkEy,
    profileTitle: shot.profileTitle,
    beverageType: shot.beverageType,
    grinderModel: shot.grinderModel,
    grinderSetting: shot.grinderSetting,
    barista: shot.barista,
    beanBrand: shot.beanBrand,
    beanType: shot.beanType,
    roastDate: shot.roastDate,
    roastLevel: shot.roastLevel,
    espressoEnjoyment: shot.espressoEnjoyment,
    fragrance: shot.fragrance,
    aroma: shot.aroma,
    flavor: shot.flavor,
    aftertaste: shot.aftertaste,
    acidity: shot.acidity,
    bitterness: shot.bitterness,
    sweetness: shot.sweetness,
    mouthfeel: shot.mouthfeel,
    beanNotes: shot.beanNotes,
    espressoNotes: shot.espressoNotes,
    privateNotes: shot.privateNotes,
    tags: shot.tags.map((t) => t.name),
  }))

  return {
    targetShot: targetShotResponse,
    contextShots: contextShotResponses,
    aggregatedStats,
  }
}

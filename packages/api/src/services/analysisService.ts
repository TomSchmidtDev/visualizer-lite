// packages/api/src/services/analysisService.ts
import { prisma } from '../db.js'
import type { Prisma } from '@prisma/client'
import type { ShotData, ShotResponse } from '../types.js'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getModelPricing } from './pricingService.js'

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
  shotCount?: number
  /** Describes what was matched, e.g. "same profile & bean" or "same profile" */
  contextLabel?: string
}

export interface ShotPhase {
  name: string
  control: 'flow' | 'pressure' | 'unknown'
  goalValue: number | null
  startTime: number
  endTime: number
  durationS: number
  // Whole-phase stats (includes ramp-up/ramp-down)
  pressure: { avg: number; min: number; max: number; stdDev: number; tracking?: number }
  flow: { avg: number; min: number; max: number; stdDev: number; tracking?: number }
  tempAvg: number | null
  trend: 'stable' | 'rising' | 'falling' | 'peaked'
  // Stable sub-phase: only when controlled variable is within 10% of goal
  // Avoids misleading σ from pressure ramp-up or flow transition periods
  stable?: {
    startTime: number
    durationS: number
    pressure: { avg: number; min: number; max: number; stdDev: number }
    flow: { avg: number; min: number; max: number; stdDev: number }
    tempAvg: number | null
    flowTrend: 'stable' | 'rising' | 'falling' | 'peaked'
  }
}

export interface DownsampledCurve {
  timeframe?: number[]
  pressure?: number[]
  pressureGoal?: number[]
  flow?: number[]
  flowGoal?: number[]
  temperature?: number[]
  flowWeight?: number[]
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

  // Always downsample timeframe so it stays in sync with all other curves
  if (shotData.timeframe && (shotData.timeframe as number[]).length > 0) {
    result.timeframe = downsampleCurve(shotData.timeframe as number[], 50)
  }

  if (shotData.espresso_pressure) {
    result.pressure = downsampleCurve(shotData.espresso_pressure, 50)
  }
  if (shotData.espresso_pressure_goal) {
    result.pressureGoal = downsampleCurve(shotData.espresso_pressure_goal, 50)
  }

  if (shotData.espresso_flow) {
    result.flow = downsampleCurve(shotData.espresso_flow, 50)
  }
  if (shotData.espresso_flow_goal) {
    result.flowGoal = downsampleCurve(shotData.espresso_flow_goal, 50)
  }

  if (shotData.espresso_temperature_mix) {
    result.temperature = downsampleCurve(shotData.espresso_temperature_mix, 50)
  }

  if (shotData.espresso_flow_weight) {
    result.flowWeight = downsampleCurve(shotData.espresso_flow_weight, 50)
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

function stdDev(data: number[]): number {
  if (data.length < 2) return 0
  const mean = avg(data)
  return Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length)
}

function trend(data: number[]): 'stable' | 'rising' | 'falling' | 'peaked' {
  if (data.length < 6) return 'stable'
  const third = Math.floor(data.length / 3)
  const first = data.slice(0, third).reduce((a, b) => a + b, 0) / third
  const last = data.slice(-third).reduce((a, b) => a + b, 0) / third
  const mid = data.slice(third, 2 * third).reduce((a, b) => a + b, 0) / third
  const peakMid = mid > first * 1.05 && mid > last * 1.05
  if (peakMid) return 'peaked'
  const diff = last - first
  const range = Math.max(...data) - Math.min(...data)
  if (range < 0.3) return 'stable'
  if (diff > range * 0.3) return 'rising'
  if (diff < -range * 0.3) return 'falling'
  return 'stable'
}

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length
}

/**
 * Detect shot phases from goal signals.
 * A phase boundary occurs when the control variable switches (flow↔pressure)
 * or the goal value changes significantly.
 * goal = -1 means "not the control variable for this step".
 */
export function detectShotPhases(shotData: ShotData): ShotPhase[] {
  const timeframe = shotData.timeframe as number[] | undefined
  const pres = shotData.espresso_pressure as number[] | undefined
  const presGoal = shotData.espresso_pressure_goal as number[] | undefined
  const flow = shotData.espresso_flow as number[] | undefined
  const flowGoal = shotData.espresso_flow_goal as number[] | undefined
  const temp = (shotData.espresso_temperature_basket || shotData.espresso_temperature_mix) as number[] | undefined

  if (!timeframe || timeframe.length < 4) return []
  if (!pres || !presGoal || !flow || !flowGoal) return []

  const n = Math.min(timeframe.length, pres.length, presGoal.length, flow.length, flowGoal.length)

  // Determine control type per sample: flow-controlled if flowGoal != -1, else pressure
  type CtrlType = 'flow' | 'pressure'
  const ctrl: CtrlType[] = []
  const goalVals: number[] = []
  for (let i = 0; i < n; i++) {
    const fg = flowGoal[i]
    const pg = presGoal[i]
    if (fg !== undefined && fg > 0) {
      ctrl.push('flow')
      goalVals.push(fg)
    } else if (pg !== undefined && pg > 0) {
      ctrl.push('pressure')
      goalVals.push(pg)
    } else {
      ctrl.push(i > 0 ? ctrl[i - 1] : 'flow')
      goalVals.push(i > 0 ? goalVals[i - 1] : 0)
    }
  }

  // Find phase boundaries (control switches + significant goal jumps)
  const boundaries: number[] = [0]
  for (let i = 1; i < n; i++) {
    if (ctrl[i] !== ctrl[i - 1]) {
      boundaries.push(i)
    } else if (Math.abs(goalVals[i] - goalVals[i - 1]) > 1.0) {
      boundaries.push(i)
    }
  }
  boundaries.push(n)

  const phases: ShotPhase[] = []
  for (let b = 0; b < boundaries.length - 1; b++) {
    const start = boundaries[b]
    const end = boundaries[b + 1]
    if (end - start < 3) continue  // skip tiny slivers

    const tStart = timeframe[start]
    const tEnd = timeframe[end - 1]
    const presSlice = pres.slice(start, end)
    const flowSlice = flow.slice(start, end)
    const tempSlice = temp ? temp.slice(start, end) : []
    const goalSlice = goalVals.slice(start, end)
    const presGoalSlice = presGoal.slice(start, end).filter(v => v > 0)
    const flowGoalSlice = flowGoal.slice(start, end).filter(v => v > 0)

    const control = ctrl[start]
    const goalVal = avg(goalSlice)
    const presAvg = avg(presSlice)
    const flowAvg = avg(flowSlice)

    // Tracking accuracy: how close actual was to goal
    let presTracking: number | undefined
    if (presGoalSlice.length > 0 && control === 'pressure') {
      presTracking = Math.abs(presAvg - avg(presGoalSlice))
    }
    let flowTracking: number | undefined
    if (flowGoalSlice.length > 0 && control === 'flow') {
      flowTracking = Math.abs(flowAvg - avg(flowGoalSlice))
    }

    // Name phases intelligently
    let name: string
    const shotIndex = phases.length
    if (shotIndex === 0 && tEnd < 20 && control === 'flow' && flowAvg > 0.5) {
      name = 'Preinfusion'
    } else if (shotIndex === 0 && tEnd < 20 && control === 'pressure' && presAvg < 2.5) {
      name = 'Preinfusion'
    } else if (control === 'pressure' && presAvg > 4) {
      name = `Extraction`
    } else if (control === 'flow') {
      name = shotIndex === 0 ? 'Preinfusion' : `Flow Phase`
    } else {
      name = `Phase ${shotIndex + 1}`
    }
    if (phases.length > 0 && phases[phases.length - 1].name === name) {
      name = `${name} 2`
    }

    // Find stable sub-phase.
    // For PRESSURE-controlled phases: start at the flow minimum.
    //   The flow falls from the headspace fill, hits a trough, then levels off/rises.
    //   Everything before the trough is ramp-down and skews σ upwards.
    // For FLOW-controlled phases: start when flow reaches ≥90% of goal.
    let stablePhase: ShotPhase['stable'] | undefined
    if (goalVal > 0 && end - start >= 6) {
      let stableStartIdx = -1

      if (control === 'pressure') {
        // Find the flow minimum (trough after the initial ramp-down)
        let minFlowVal = Infinity
        let minFlowIdx = start
        for (let i = start; i < end; i++) {
          const fv = flow[i] ?? 0
          if (fv < minFlowVal) { minFlowVal = fv; minFlowIdx = i }
        }
        // Only use trough if it's not right at the start and there's enough data after it
        if (minFlowIdx > start + 1) {
          stableStartIdx = minFlowIdx
        }
      } else {
        // Flow-controlled: start when flow reaches ≥90% of goal
        const threshold = goalVal * 0.90
        for (let i = start; i < end; i++) {
          if ((flow[i] ?? 0) >= threshold) { stableStartIdx = i; break }
        }
      }

      if (stableStartIdx >= 0 && end - stableStartIdx >= 4) {
        const sPresSlice = pres.slice(stableStartIdx, end)
        const sFlowSlice = flow.slice(stableStartIdx, end)
        const sTempSlice = temp ? temp.slice(stableStartIdx, end) : []
        stablePhase = {
          startTime: parseFloat(timeframe[stableStartIdx].toFixed(1)),
          durationS: parseFloat((timeframe[end - 1] - timeframe[stableStartIdx]).toFixed(1)),
          pressure: {
            avg: parseFloat(avg(sPresSlice).toFixed(2)),
            min: parseFloat(Math.min(...sPresSlice).toFixed(2)),
            max: parseFloat(Math.max(...sPresSlice).toFixed(2)),
            stdDev: parseFloat(stdDev(sPresSlice).toFixed(3)),
          },
          flow: {
            avg: parseFloat(avg(sFlowSlice).toFixed(2)),
            min: parseFloat(Math.min(...sFlowSlice).toFixed(2)),
            max: parseFloat(Math.max(...sFlowSlice).toFixed(2)),
            stdDev: parseFloat(stdDev(sFlowSlice).toFixed(3)),
          },
          tempAvg: sTempSlice.length > 0 ? parseFloat(avg(sTempSlice).toFixed(1)) : null,
          flowTrend: trend(sFlowSlice),
        }
      }
    }

    phases.push({
      name,
      control,
      goalValue: goalVal > 0 ? parseFloat(goalVal.toFixed(2)) : null,
      startTime: parseFloat(tStart.toFixed(1)),
      endTime: parseFloat(tEnd.toFixed(1)),
      durationS: parseFloat((tEnd - tStart).toFixed(1)),
      pressure: {
        avg: parseFloat(presAvg.toFixed(2)),
        min: parseFloat(Math.min(...presSlice).toFixed(2)),
        max: parseFloat(Math.max(...presSlice).toFixed(2)),
        stdDev: parseFloat(stdDev(presSlice).toFixed(3)),
        tracking: presTracking !== undefined ? parseFloat(presTracking.toFixed(2)) : undefined,
      },
      flow: {
        avg: parseFloat(flowAvg.toFixed(2)),
        min: parseFloat(Math.min(...flowSlice).toFixed(2)),
        max: parseFloat(Math.max(...flowSlice).toFixed(2)),
        stdDev: parseFloat(stdDev(flowSlice).toFixed(3)),
        tracking: flowTracking !== undefined ? parseFloat(flowTracking.toFixed(2)) : undefined,
      },
      tempAvg: tempSlice.length > 0 ? parseFloat(avg(tempSlice).toFixed(1)) : null,
      trend: trend(control === 'pressure' ? presSlice : flowSlice),
      stable: stablePhase,
    })
  }

  return phases
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

  // Load context shots — tiered matching for a meaningful baseline:
  //   Tier 1 (ideal):   same profileTitle + same beanBrand + same beanType
  //   Tier 2 (fallback): same profileTitle only
  //   No profile set:   skip historical context entirely (incomparable profiles)
  //
  // Minimum 2 context shots required; fewer → no historical stats in prompt.
  const baseWhere = {
    id: { not: shotId },
    startTime: {
      gte: windowStart.toISOString(),
      lte: targetDate.toISOString(),
    },
  }

  type ShotWithTags = Prisma.ShotGetPayload<{ include: { tags: true } }>
  let contextShots: ShotWithTags[] = []
  let contextLabel = ''

  if (targetShot.profileTitle) {
    // Tier 1: same profile AND same bean (both brand and type must be present)
    if (targetShot.beanBrand && targetShot.beanType) {
      contextShots = await prisma.shot.findMany({
        where: {
          ...baseWhere,
          profileTitle: targetShot.profileTitle,
          beanBrand: targetShot.beanBrand,
          beanType: targetShot.beanType,
        },
        include: { tags: true },
        orderBy: { startTime: 'desc' },
        take: 100,
      })
      if (contextShots.length >= 2) {
        contextLabel = 'same profile & bean'
      }
    }

    // Tier 2 fallback: same profile only
    if (contextShots.length < 2) {
      contextShots = await prisma.shot.findMany({
        where: {
          ...baseWhere,
          profileTitle: targetShot.profileTitle,
        },
        include: { tags: true },
        orderBy: { startTime: 'desc' },
        take: 100,
      })
      contextLabel = contextShots.length >= 2 ? 'same profile' : ''
    }

    // Clear if still below threshold — no meaningful stats
    if (contextShots.length < 2) contextShots = []
  }
  // No profileTitle → contextShots stays empty, no historical context

  // Aggregate stats from context shots only (not target) — extraction phase only
  // This gives a fair baseline: only the pressure-controlled extraction phase,
  // not preinfusion which would dilute the averages.
  const allShots = [targetShot, ...contextShots]
  const pressureData: number[] = []
  const flowData: number[] = []
  const temperatureData: number[] = []

  for (const shot of contextShots) {
    let shotData: ShotData
    if (typeof shot.shotData === 'string') {
      shotData = JSON.parse(shot.shotData)
    } else {
      shotData = shot.shotData as ShotData
    }

    // Try to extract only the extraction phase using phase detection
    const phases = detectShotPhases(shotData)
    const extractionPhases = phases.filter(p => p.name.toLowerCase().includes('extract') || (p.control === 'pressure' && p.pressure.avg > 4))

    if (extractionPhases.length > 0) {
      // Prefer stable sub-phase stats if available, otherwise whole-phase avg
      for (const phase of extractionPhases) {
        const p = phase.stable ?? phase
        pressureData.push(p.pressure.avg)
        flowData.push(p.flow.avg)
        if (p.tempAvg != null) temperatureData.push(p.tempAvg)
      }
    } else {
      // Fallback: filter by pressure goal > 0 (if available) or pressure > 4 bar heuristic
      const presGoal = shotData.espresso_pressure_goal as number[] | undefined
      const pres = shotData.espresso_pressure as number[] | undefined
      const flow = shotData.espresso_flow as number[] | undefined
      const tempArr = (shotData.espresso_temperature_basket || shotData.espresso_temperature_mix) as number[] | undefined
      if (pres && presGoal) {
        for (let i = 0; i < Math.min(pres.length, presGoal.length); i++) {
          if (presGoal[i] > 0 && pres[i] > 4) {  // goal active AND clearly in extraction
            pressureData.push(pres[i])
            if (flow?.[i] !== undefined) flowData.push(flow[i])
            if (tempArr?.[i] !== undefined) temperatureData.push(tempArr[i])
          }
        }
      } else if (pres) {
        // No goal data at all — use pressure > 5 bar as extraction heuristic
        for (let i = 0; i < pres.length; i++) {
          if (pres[i] > 5.0) {
            pressureData.push(pres[i])
            if (flow?.[i] !== undefined) flowData.push(flow[i])
            if (tempArr?.[i] !== undefined) temperatureData.push(tempArr[i])
          }
        }
      }
    }
  }

  const aggregatedStats: CurveStats = { shotCount: allShots.length, contextLabel }
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
    startTime: targetShot.startTime.toISOString(),
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
    roastDate: targetShot.roastDate?.toISOString() ?? null,
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
      // Use downsampled timeframe so it stays aligned with all 50-point arrays
      timeframe: downsampledCurves.timeframe || shotData.timeframe || [],
      ...(downsampledCurves.pressure && { espresso_pressure: downsampledCurves.pressure }),
      ...(downsampledCurves.pressureGoal && { espresso_pressure_goal: downsampledCurves.pressureGoal }),
      ...(downsampledCurves.flow && { espresso_flow: downsampledCurves.flow }),
      ...(downsampledCurves.flowGoal && { espresso_flow_goal: downsampledCurves.flowGoal }),
      ...(downsampledCurves.temperature && { espresso_temperature_mix: downsampledCurves.temperature }),
      ...(downsampledCurves.flowWeight && { espresso_flow_weight: downsampledCurves.flowWeight }),
    },
  }

  const contextShotResponses: ShotResponse[] = contextShots.map((shot) => ({
    id: shot.id,
    startTime: shot.startTime.toISOString(),
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
    roastDate: shot.roastDate?.toISOString() ?? null,
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

/**
 * System prompt for Claude AI analysis.
 * Instructs Claude to analyze shots from 3 perspectives: Barista, Roaster, and Analyst.
 */
export function buildSystemPrompt(language: string): string {
  const isGerman = language === 'de'
  if (isGerman) {
    return `Du bist ein Espresso-Experte mit zwei spezialisierten Perspektiven:

1. **Barista**: Brühtechnik – Mahlgrad, Tamping, Puckprep, Timing, Verbesserungsvorschläge anhand der Phasendaten
2. **Röster**: Bohnenanalyse – Röstgrad/Herkunft im Kontext von Temperatur, Extraktionszeit und Tage seit Röstung

**ALLE PERSPEKTIVEN nutzen die Phasendaten** – nie Gesamtdurchschnitte des Shots verwenden, wenn Phasendaten vorliegen.

**KRITISCH – Unterschied flow-geregelt vs. druckgeregelt:**
- Flow-geregelte Phase: Die Maschine hält einen Flow-Zielwert; der DRUCK ist Ausgabe (= Puckwiderstand). Hoher Druck = dichter Puck (normal). Druckschwankungen in flow-geregelten Phasen sind kein Channeling-Signal und dürfen NICHT als Fehler gewertet werden.
- Druckgeregelte Phase: Die Maschine hält einen Druckzielwert; der FLOW ist Ausgabe. Starke Flow-Spitzen = mögliches Channeling.
- "goal=X" = der TATSÄCHLICHE Zielwert des Profils. Nie durch Trainingswissen ersetzen.

**Channeling-Signale – NUR in druckgeregelten Phasen:**
- Flow σ > 0.2 ml/s im stabilen Bereich
- Plötzlicher Flow-Spike (nicht stetiger Anstieg)
- Scale Flow "UNSTABLE"

**Kein Channeling-Signal in flow-geregelten Phasen:**
- Hoher Druck oder Druckschwankungen → normaler Puckwiderstand
- Stetiger Druckabfall → Puck öffnet sich planmäßig (bei Declining-Pressure-Profilen)

**Röster berücksichtigt:**
- Tage seit Röstung für Aussagen zu Ausgasung, Frische
- Basket-Temperatur der Extraktionsphase, Verhältnis und Zeit im Kontext von Röstgrad

**VERBOTEN – Historische Daten:** Es ist STRENGSTENS VERBOTEN, historische Durchschnittswerte, Vergleichswerte oder Trends zu nennen, zu schätzen oder zu erfinden. Aussagen wie "historischer Durchschnitt", "dein üblicher Wert" oder "normalerweise bei dir" sind unzulässig, solange kein Abschnitt "Historical Context" im Prompt vorhanden ist.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt mit genau zwei Keys:
{"barista":["Tipp 1","Tipp 2"],"roaster":["Erkenntnis 1","Erkenntnis 2"]}
3–5 Einträge pro Array, konkret mit Bezug auf Datenwerte und Phasennamen.
Jeder Eintrag ist ein einfacher Text-String — KEIN Objekt, KEIN verschachteltes JSON.`
  }
  return `You are an expert espresso analyst with two specialized perspectives:

1. **Barista**: Brewing technique – grind, tamping, puck prep, timing, improvement suggestions based on phase data
2. **Röster**: Bean analysis – roast level/origin in context of temperature, extraction time, and days since roast

**ALL perspectives use the phase data** – never use whole-shot averages when phase data is available.

**CRITICAL – Flow-controlled vs. pressure-controlled phases:**
- Flow-controlled phase: the machine maintains a flow rate target; PRESSURE is the output (= puck resistance). High or varying pressure is normal and NOT a channeling signal.
- Pressure-controlled phase: the machine maintains a pressure target; FLOW is the output. Flow spikes = possible channeling.
- "goal=X" = the ACTUAL programmed target. Never substitute with training knowledge.

**Channeling signals – ONLY in pressure-controlled phases:**
- Flow σ > 0.2 ml/s in the stable portion
- Sudden flow spike (not a steady rise)
- Scale Flow "UNSTABLE"

**NOT channeling signals in flow-controlled phases:**
- High pressure or pressure variation → normal puck resistance
- Steady pressure decline → puck opening as designed (declining-pressure profiles)

**Röster considers:**
- Days since roast for freshness/degassing comments
- Basket temp during extraction (not whole-shot average), ratio and time vs roast level

**FORBIDDEN – Historical data:** It is STRICTLY FORBIDDEN to mention, estimate, or invent historical averages, comparison values, or trends. Phrases like "your historical average", "your usual value", or "typically for you" are not allowed unless a "Historical Context" section is present in the prompt.

Respond ONLY with a JSON object with exactly two keys:
{"barista":["advice 1","advice 2"],"roaster":["insight 1","insight 2"]}
3-5 entries per array, concrete references to data values and phase names.
Each entry must be a plain text string — NOT an object, NOT nested JSON.`
}

export function buildSystemPromptOptimized(language: string): string {
  const isGerman = language === 'de'
  if (isGerman) {
    return `Du bist ein Espresso-Experte mit zwei Perspektiven:

1. **Barista**: Mahlgrad, Tamping, Puckprep, Timing — konkrete Tipps anhand der Phasendaten
2. **Röster**: Bohnenanalyse — Röstgrad/Herkunft vs. Temperatur, Extraktionszeit, Tage seit Röstung

Regeln:
- Phasendaten verwenden, keine Gesamt-Shot-Durchschnitte
- Flow-geregelte Phase: DRUCK ist Puckwiderstand-Ausgabe. Druckschwankungen sind normal, kein Channeling.
- Druckgeregelte Phase: FLOW ist Ausgabe. Channeling nur bei Flow σ > 0,20 ml/s UND plötzlichem Spike.
- "goal=X" = tatsächlicher Profilwert, kein Trainingswissen
- Röster: Tage seit Röstung, Basket-Temp in der Extraktionsphase, Ratio vs. Röstgrad
- Keine historischen Vergleiche, außer wenn eine "Verlauf"-Zeile im Prompt vorhanden ist

Nur Abweichungen erwähnen, die die Extraktionsqualität klar beeinflussen. Kleine Variationen ignorieren.

Antworte NUR mit JSON: {"barista":["String 1","String 2"],"roaster":["String 1","String 2"]}
Einträge müssen konkrete Datenwerte und Phasennamen referenzieren.
Jeder Eintrag ist ein einfacher Text-String — KEIN Objekt, KEIN verschachteltes JSON.`
  }
  return `You are an espresso expert with two perspectives:

1. **Barista**: grind, tamping, puck prep, timing — concrete suggestions from phase data
2. **Röster**: bean analysis — roast level/origin vs. temp, extraction time, days since roast

Rules:
- Use phase data, not whole-shot averages
- Flow-ctrl phase: PRESSURE is puck-resistance output. Pressure variation is normal, not channeling.
- Pres-ctrl phase: FLOW is output. Flag channeling only if flow σ > 0.20 ml/s AND there is a sudden spike.
- "goal=X" = actual programmed target, never substitute training knowledge
- Röster: days since roast, basket temp in extraction phase, ratio vs. roast level
- No historical references unless a "History" line is present in the prompt

Only flag deviations that clearly impact extraction quality. Ignore minor variations within equipment tolerance.

Respond ONLY with JSON: {"barista":["string 1","string 2"],"roaster":["string 1","string 2"]}
Entries must reference specific data values and phase names.
Each entry must be a plain text string — NOT an object, NOT nested JSON.`
}

function r1(v: number): string { return v.toFixed(1) }
function r2(v: number): string { return v.toFixed(2) }

export function buildDetailPromptOptimized(shot: ShotResponse, aggregatedStats: CurveStats, customContext = ''): string {
  const lines: string[] = []

  const shotDate = new Date(shot.startTime)
  lines.push(`Shot ${shotDate.toISOString().slice(0, 10)}`)

  const beanParts = [shot.beanBrand, shot.beanType, shot.roastLevel].filter(Boolean)
  if (beanParts.length) {
    let beanLine = `Bean: ${beanParts.join(' · ')}`
    if (shot.roastDate) {
      const daysSinceRoast = Math.round((shotDate.getTime() - new Date(shot.roastDate).getTime()) / 86400000)
      beanLine += ` (${daysSinceRoast}d post-roast)`
    }
    lines.push(beanLine)
  }

  const params: string[] = []
  if (shot.beanWeight && shot.drinkWeight) params.push(`${shot.beanWeight}g→${shot.drinkWeight}g (1:${(shot.drinkWeight / shot.beanWeight).toFixed(1)})`)
  if (shot.duration) params.push(`${shot.duration.toFixed(0)}s`)
  if (shot.drinkTds) params.push(`TDS ${shot.drinkTds}%`)
  if (shot.drinkEy) params.push(`EY ${shot.drinkEy}%`)
  if (shot.espressoEnjoyment != null) params.push(`Score ${shot.espressoEnjoyment}/100`)
  if (params.length) lines.push(`Params: ${params.join(' · ')}`)

  const eq: string[] = []
  if (shot.profileTitle) eq.push(shot.profileTitle)
  if (shot.grinderModel) eq.push(`${shot.grinderModel}${shot.grinderSetting ? ` @${shot.grinderSetting}` : ''}`)
  if (eq.length) lines.push(`Setup: ${eq.join(' | ')}`)
  lines.push('')

  if (shot.shotData) {
    const phases = detectShotPhases(shot.shotData)
    if (phases.length >= 1) {
      lines.push(`### Phases`)
      for (const phase of phases) {
        const ctrl = phase.control === 'flow' ? 'flow-ctrl' : 'pres-ctrl'
        const goal = phase.goalValue != null
          ? ` goal=${phase.goalValue}${phase.control === 'flow' ? 'ml/s' : 'bar'}`
          : ''
        lines.push(`${phase.name} ${phase.startTime}–${phase.endTime}s | ${ctrl}${goal}`)

        if (phase.stable && phase.stable.durationS >= 3) {
          const s = phase.stable
          if (phase.control === 'pressure') {
            const sigma = s.flow.stdDev > 0.20 ? ` σ=${r2(s.flow.stdDev)} max=${r1(s.flow.max)}` : ''
            const temp = s.tempAvg != null ? ` temp=${s.tempAvg}°C` : ''
            lines.push(`  ramp ${phase.startTime}–${r1(s.startTime)}s`)
            lines.push(`  stable ${r1(s.startTime)}–${phase.endTime}s: pres=${r1(s.pressure.avg)} flow=${r1(s.flow.avg)}${sigma} trend=${s.flowTrend}${temp}`)
          } else {
            const sigma = s.flow.stdDev > 0.20 ? ` σ=${r2(s.flow.stdDev)}` : ''
            const temp = s.tempAvg != null ? ` temp=${s.tempAvg}°C` : ''
            lines.push(`  stable ${r1(s.startTime)}–${phase.endTime}s: pres=${r1(s.pressure.avg)} flow=${r1(s.flow.avg)}${sigma} trend=${s.flowTrend}${temp}`)
          }
        } else {
          const sigma = phase.flow.stdDev > 0.20 ? ` σ=${r2(phase.flow.stdDev)}` : ''
          const temp = phase.tempAvg != null ? ` temp=${phase.tempAvg}°C` : ''
          if (phase.control === 'pressure') {
            lines.push(`  pres=${r1(phase.pressure.avg)} flow=${r1(phase.flow.avg)}${sigma} trend=${phase.trend}${temp}`)
          } else {
            lines.push(`  pres=${r1(phase.pressure.avg)} flow=${r1(phase.flow.avg)}${sigma} trend=${phase.trend}${temp}`)
          }
        }
      }
      lines.push('')
    } else {
      if (shot.shotData.espresso_pressure) lines.push(`Pressure: ${describeCurve(shot.shotData.espresso_pressure, 'bar')}`)
      if (shot.shotData.espresso_flow) lines.push(`Flow: ${describeCurve(shot.shotData.espresso_flow, 'ml/s')}`)
      lines.push('')
    }
  }

  if (shot.shotData?.espresso_flow_weight) {
    const scaleFlow = shot.shotData.espresso_flow_weight as number[]
    const timeframe = shot.shotData.timeframe as number[] | undefined
    const nonZero = scaleFlow.map((v, i) => ({ v, t: timeframe?.[i] ?? i })).filter(x => x.v > 0.05)
    if (nonZero.length > 5) {
      const vals = nonZero.map(x => x.v)
      const lastThird = vals.slice(Math.floor(vals.length * 0.67))
      const lastAvg = avg(lastThird)
      const residuals: number[] = []
      for (let i = 2; i < vals.length - 2; i++) {
        const localAvg = avg(vals.slice(i - 2, i + 3))
        residuals.push(Math.abs(vals[i] - localAvg))
      }
      const residualSD = avg(residuals)
      const flowTrend = trend(vals)
      const isUnstable = residualSD > 0.12 && flowTrend !== 'rising' && flowTrend !== 'falling'
      const unstableStr = isUnstable ? ` UNSTABLE(σ=${residualSD.toFixed(3)})` : ''
      lines.push(`Scale flow: first-drop=${nonZero[0].t.toFixed(1)}s peak=${r2(Math.max(...vals))}ml/s late=${r1(lastAvg)}ml/s trend=${flowTrend}${unstableStr}`)
      lines.push('')
    }
  }

  const tastingParts: string[] = []
  if (shot.espressoNotes) tastingParts.push(`"${shot.espressoNotes}"`)
  if (shot.acidity) tastingParts.push(`acid=${shot.acidity}`)
  if (shot.sweetness) tastingParts.push(`sweet=${shot.sweetness}`)
  if (shot.bitterness) tastingParts.push(`bitter=${shot.bitterness}`)
  if (shot.mouthfeel) tastingParts.push(`body=${shot.mouthfeel}`)
  if (tastingParts.length) lines.push(`Tasting: ${tastingParts.join(' · ')}`)

  const contextShotCount = (aggregatedStats.shotCount ?? 1) - 1
  if (contextShotCount >= 2 && (aggregatedStats.pressure || aggregatedStats.flow)) {
    const histParts: string[] = []
    if (aggregatedStats.pressure) histParts.push(`pres=${r1(aggregatedStats.pressure.avg)}bar`)
    if (aggregatedStats.flow) histParts.push(`flow=${r1(aggregatedStats.flow.avg)}ml/s`)
    if (aggregatedStats.temperature) histParts.push(`temp=${r1(aggregatedStats.temperature.avg)}°C`)
    const contextDesc = aggregatedStats.contextLabel ?? 'recent'
    lines.push(`History (${contextShotCount} shots, ${contextDesc}): ${histParts.join(' · ')}`)
  }

  if (customContext.trim()) {
    lines.push('')
    lines.push(`Context: ${customContext.trim()}`)
  }

  return lines.join('\n')
}

/**
 * Build a user prompt for analyzing a single shot.
 * Uses phase-segmented data for accurate per-phase analysis.
 */
export function buildDetailPrompt(shot: ShotResponse, aggregatedStats: CurveStats, customContext = ''): string {
  const lines: string[] = []

  lines.push(`## Shot Analysis`)
  lines.push('')

  // Shot date
  const shotDate = new Date(shot.startTime)
  lines.push(`**Shot Date:** ${shotDate.toISOString().slice(0, 10)}`)

  // Bean and roast
  if (shot.beanBrand || shot.beanType || shot.roastLevel) {
    lines.push(`**Bean:** ${[shot.beanBrand, shot.beanType, shot.roastLevel].filter(Boolean).join(' · ')}`)
    if (shot.roastDate) {
      const roastDate = new Date(shot.roastDate)
      const daysSinceRoast = Math.round((shotDate.getTime() - roastDate.getTime()) / 86400000)
      lines.push(`**Roast Date:** ${shot.roastDate} (${daysSinceRoast} days since roast)`)
    }
  }

  // Key parameters
  const params: string[] = []
  if (shot.beanWeight && shot.drinkWeight) params.push(`${shot.beanWeight}g → ${shot.drinkWeight}g (1:${(shot.drinkWeight / shot.beanWeight).toFixed(2)})`)
  if (shot.duration) params.push(`${shot.duration.toFixed(1)}s`)
  if (shot.drinkTds) params.push(`TDS ${shot.drinkTds}%`)
  if (shot.drinkEy) params.push(`EY ${shot.drinkEy}%`)
  if (shot.espressoEnjoyment != null) params.push(`Score ${shot.espressoEnjoyment}/100`)
  if (params.length) lines.push(`**Parameters:** ${params.join(' · ')}`)
  if (shot.profileTitle) lines.push(`**Profile:** ${shot.profileTitle}`)
  if (shot.grinderModel) lines.push(`**Grinder:** ${shot.grinderModel}${shot.grinderSetting ? ` @ ${shot.grinderSetting}` : ''}`)
  lines.push('')

  // Phase-based extraction data
  if (shot.shotData) {
    const phases = detectShotPhases(shot.shotData)
    if (phases.length >= 1) {
      lines.push(`### Profile Phases`)
      for (const phase of phases) {
        const ctrl = phase.control === 'flow' ? 'flow-controlled' : 'pressure-controlled'
        const goalStr = phase.goalValue != null
          ? phase.control === 'flow' ? `goal ${phase.goalValue} ml/s` : `goal ${phase.goalValue} bar`
          : ''
        lines.push(`**${phase.name}** (${phase.startTime}–${phase.endTime}s, ${phase.durationS}s, ${ctrl}${goalStr ? ', ' + goalStr : ''})`)

        if (phase.stable && phase.stable.durationS >= 3) {
          const s = phase.stable
          if (phase.control === 'pressure') {
            // Pressure-controlled: flow σ is the channeling signal; pressure σ shows machine tracking
            const presSD = s.pressure.stdDev > 0.05 ? ` σ=${s.pressure.stdDev}` : ''
            const flowSD = s.flow.stdDev > 0.15 ? ` σ=${s.flow.stdDev} [HIGH — channeling?]` : s.flow.stdDev > 0.08 ? ` σ=${s.flow.stdDev}` : ''
            const presTrack = phase.pressure.tracking != null ? ` tracking_err=±${phase.pressure.tracking}` : ''
            lines.push(`  Ramp: ${phase.startTime}–${s.startTime}s (pressure rising to goal)`)
            lines.push(`  Stable extraction (${s.startTime}–${phase.endTime}s, ${s.durationS}s):`)
            lines.push(`    Pressure: avg=${s.pressure.avg} bar, min=${s.pressure.min}, max=${s.pressure.max}${presSD}${presTrack}`)
            lines.push(`    Flow: avg=${s.flow.avg} ml/s, min=${s.flow.min}, max=${s.flow.max}${flowSD}, trend=${s.flowTrend}`)
          } else {
            // Flow-controlled: pressure = puck resistance (output), NOT a stability metric.
            // Flow σ shows how well the machine tracked the flow goal.
            const flowSD = s.flow.stdDev > 0.1 ? ` σ=${s.flow.stdDev}` : ''
            const flowTrack = phase.flow.tracking != null ? ` tracking_err=±${phase.flow.tracking}` : ''
            lines.push(`  Stable (${s.startTime}–${phase.endTime}s, ${s.durationS}s):`)
            lines.push(`    Puck resistance (pressure output): avg=${s.pressure.avg} bar, min=${s.pressure.min}, max=${s.pressure.max}, trend=${phase.trend}`)
            lines.push(`    Flow (controlled): avg=${s.flow.avg} ml/s, min=${s.flow.min}, max=${s.flow.max}${flowSD}${flowTrack}, trend=${s.flowTrend}`)
          }
          if (s.tempAvg != null) lines.push(`    Basket temp: ${s.tempAvg}°C`)
        } else {
          // No clear stable period — show whole-phase stats
          if (phase.control === 'pressure') {
            const presSD = phase.pressure.stdDev > 0.05 ? ` σ=${phase.pressure.stdDev}` : ''
            const flowSD = phase.flow.stdDev > 0.1 ? ` σ=${phase.flow.stdDev}` : ''
            const presTrack = phase.pressure.tracking != null ? ` tracking_err=±${phase.pressure.tracking}` : ''
            lines.push(`  Pressure: avg=${phase.pressure.avg} bar, min=${phase.pressure.min}, max=${phase.pressure.max}${presSD}${presTrack}, trend=${phase.trend}`)
            lines.push(`  Flow: avg=${phase.flow.avg} ml/s, min=${phase.flow.min}, max=${phase.flow.max}${flowSD}`)
          } else {
            const flowSD = phase.flow.stdDev > 0.1 ? ` σ=${phase.flow.stdDev}` : ''
            const flowTrack = phase.flow.tracking != null ? ` tracking_err=±${phase.flow.tracking}` : ''
            lines.push(`  Puck resistance (pressure output): avg=${phase.pressure.avg} bar, min=${phase.pressure.min}, max=${phase.pressure.max}, trend=${phase.trend}`)
            lines.push(`  Flow (controlled): avg=${phase.flow.avg} ml/s, min=${phase.flow.min}, max=${phase.flow.max}${flowSD}${flowTrack}`)
          }
          if (phase.tempAvg != null) lines.push(`  Basket temp: ${phase.tempAvg}°C`)
        }
      }
      lines.push('')
    } else {
      // Fallback: whole-shot curves if phase detection fails
      lines.push(`### Extraction Curves`)
      if (shot.shotData.espresso_pressure) lines.push(`- Pressure: ${describeCurve(shot.shotData.espresso_pressure, 'bar')}`)
      if (shot.shotData.espresso_flow) lines.push(`- Flow: ${describeCurve(shot.shotData.espresso_flow, 'ml/s')}`)
      if (shot.shotData.espresso_temperature_basket || shot.shotData.espresso_temperature_mix) {
        const tempArr = (shot.shotData.espresso_temperature_basket || shot.shotData.espresso_temperature_mix) as number[]
        lines.push(`- Temperature: ${describeCurve(tempArr, '°C')}`)
      }
      lines.push('')
    }
  }

  // Scale flow (espresso_flow_weight) — the actual extraction signal, delayed vs machine flow
  if (shot.shotData?.espresso_flow_weight) {
    const scaleFlow = shot.shotData.espresso_flow_weight as number[]
    const timeframe = shot.shotData.timeframe as number[] | undefined
    const nonZero = scaleFlow.map((v, i) => ({ v, t: timeframe?.[i] ?? i })).filter(x => x.v > 0.05)
    if (nonZero.length > 5) {
      const firstDrop = nonZero[0].t
      const peakVal = Math.max(...nonZero.map(x => x.v))

      // Use RESIDUAL std dev (deviation from local trend) to detect channeling.
      // Raw std dev would flag normal rising flow as "unstable" — we want to detect
      // oscillations around the trend, not the trend itself.
      const vals = nonZero.map(x => x.v)
      const lastThird = vals.slice(Math.floor(vals.length * 0.67))
      const lastAvg = avg(lastThird)
      // Compute residuals: difference from 5-point moving average
      const residuals: number[] = []
      for (let i = 2; i < vals.length - 2; i++) {
        const localAvg = avg(vals.slice(i - 2, i + 3))
        residuals.push(Math.abs(vals[i] - localAvg))
      }
      const residualSD = avg(residuals)  // mean absolute deviation from local trend
      const flowTrend = trend(vals)
      const isUnstable = residualSD > 0.12 && flowTrend !== 'rising' && flowTrend !== 'falling'

      lines.push(`### Scale Flow (cup output)`)
      lines.push(`- First drop at: ${firstDrop.toFixed(1)}s`)
      lines.push(`- Peak: ${peakVal.toFixed(2)} ml/s, late avg: ${lastAvg.toFixed(2)} ml/s, trend: ${flowTrend}${isUnstable ? `, residual σ=${residualSD.toFixed(3)} (UNSTABLE — possible channeling)` : ''}`)
      lines.push('')
    }
  }

  // Tasting notes
  const tastingParts: string[] = []
  if (shot.espressoNotes) tastingParts.push(`Notes: "${shot.espressoNotes}"`)
  if (shot.acidity) tastingParts.push(`Acidity ${shot.acidity}`)
  if (shot.sweetness) tastingParts.push(`Sweetness ${shot.sweetness}`)
  if (shot.bitterness) tastingParts.push(`Bitterness ${shot.bitterness}`)
  if (shot.mouthfeel) tastingParts.push(`Mouthfeel ${shot.mouthfeel}`)
  if (tastingParts.length) {
    lines.push(`### Tasting`)
    lines.push(tastingParts.join(' · '))
    lines.push('')
  }

  // Historical context — only when at least 2 context shots exist, extraction-phase only
  const contextShotCount = (aggregatedStats.shotCount ?? 1) - 1
  if (contextShotCount >= 2 && (aggregatedStats.pressure || aggregatedStats.flow)) {
    const contextDesc = aggregatedStats.contextLabel ?? 'recent shots'
    lines.push(`### Historical Context (${contextShotCount} shots, ${contextDesc}, extraction-phase averages)`)
    if (aggregatedStats.pressure) lines.push(`- Avg extraction pressure: ${aggregatedStats.pressure.avg.toFixed(1)} bar`)
    if (aggregatedStats.flow) lines.push(`- Avg extraction flow: ${aggregatedStats.flow.avg.toFixed(1)} ml/s`)
    if (aggregatedStats.temperature) lines.push(`- Avg basket temp: ${aggregatedStats.temperature.avg.toFixed(1)}°C`)
    lines.push('')
  }

  if (customContext.trim()) {
    lines.push(`### Machine & Setup Context`)
    lines.push(customContext.trim())
    lines.push('')
  }

  lines.push(`Analyze this shot from all three perspectives: Barista, Röster, Analyst.`)

  return lines.join('\n')
}

/**
 * Build a user prompt for analyzing trends across multiple shots.
 * Includes shot count, time window, and aggregated statistics.
 */
export function buildStatsPrompt(
  contextShots: ShotResponse[],
  aggregatedStats: CurveStats,
  window: '7d' | '30d' | '90d' | 'all'
): string {
  const lines: string[] = []

  lines.push(`## Trend Analysis Request`)
  lines.push('')

  const windowText: Record<string, string> = {
    '7d': 'last 7 days',
    '30d': 'last 30 days',
    '90d': 'last 90 days',
    'all': 'all time',
  }

  lines.push(`Analyzing ${contextShots.length} shots from the ${windowText[window]}.`)
  lines.push('')

  // Aggregated statistics
  lines.push(`### Statistical Summary`)
  if (aggregatedStats.pressure) {
    const p = aggregatedStats.pressure
    lines.push(`- Pressure: Min ${p.min.toFixed(1)}, Max ${p.max.toFixed(1)}, Avg ${p.avg.toFixed(1)} bar`)
  }
  if (aggregatedStats.flow) {
    const f = aggregatedStats.flow
    lines.push(`- Flow: Min ${f.min.toFixed(1)}, Max ${f.max.toFixed(1)}, Avg ${f.avg.toFixed(1)} ml/s`)
  }
  if (aggregatedStats.temperature) {
    const t = aggregatedStats.temperature
    lines.push(`- Temperature: Min ${t.min.toFixed(1)}, Max ${t.max.toFixed(1)}, Avg ${t.avg.toFixed(1)} C`)
  }
  lines.push('')

  // Bean variety
  const beanBrands = new Set(contextShots.map((s) => s.beanBrand).filter(Boolean))
  const roastLevels = new Set(contextShots.map((s) => s.roastLevel).filter(Boolean))

  if (beanBrands.size > 0) {
    lines.push(`### Variety`)
    lines.push(`- Bean Brands: ${Array.from(beanBrands).join(', ')}`)
    if (roastLevels.size > 0) {
      lines.push(`- Roast Levels: ${Array.from(roastLevels).join(', ')}`)
    }
    lines.push('')
  }

  lines.push(`Please provide trend insights from Barista, Röster, and Analyst perspectives.`)

  return lines.join('\n')
}

export interface ClaudeAnalysisResult {
  barista: string[]
  roaster: string[]
  analyst: string[]  // kept for DB compatibility; always empty for new analyses
}

/**
 * Ensure every element of an analysis array is a plain string.
 * The model occasionally returns objects ({phase, finding, action}) instead of strings.
 * We normalise by joining all string values with ' — ' to preserve the information.
 */
export function normalizeAnalysisArray(items: unknown[]): string[] {
  return items.map(item => {
    if (typeof item === 'string') return item
    if (item !== null && typeof item === 'object') {
      return Object.values(item as Record<string, unknown>)
        .filter((v): v is string => typeof v === 'string')
        .join(' — ')
    }
    return String(item)
  })
}

function extractJson(text: string): ClaudeAnalysisResult {
  // Strip markdown code blocks if present
  const stripped = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()
  // Find outermost JSON object
  const match = stripped.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Could not find JSON in response')
  const parsed = JSON.parse(match[0])
  return {
    barista: normalizeAnalysisArray(Array.isArray(parsed.barista) ? parsed.barista : []),
    roaster: normalizeAnalysisArray(Array.isArray(parsed.roaster) ? parsed.roaster : []),
    analyst: [],  // Analyst perspective removed from UI and prompts
  }
}

export interface AnalyzeResult extends ClaudeAnalysisResult {
  tokenInputCount: number
  tokenOutputCount: number
  costInputUsd: number | null
  costOutputUsd: number | null
  analysisMode: 'standard' | 'optimized'
}

/**
 * Call Claude API with the given prompt and parse the JSON response.
 * Extracts barista, roaster, and analyst arrays from the response.
 */
export async function callClaude(
  prompt: string,
  apiKey: string,
  sysPrompt = buildSystemPrompt('en')
): Promise<ClaudeAnalysisResult> {
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: sysPrompt,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const textContent = message.content.find((c) => c.type === 'text')
  if (!textContent || textContent.type !== 'text') throw new Error('No text response from Claude')
  return extractJson(textContent.text)
}

/**
 * Call OpenAI API with the given prompt and parse the JSON response.
 * Extracts barista, roaster, and analyst arrays from the response.
 */
export async function callOpenAI(
  prompt: string,
  apiKey: string,
  sysPrompt = buildSystemPrompt('en')
): Promise<ClaudeAnalysisResult> {
  const client = new OpenAI({ apiKey })

  const message = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: prompt },
    ],
  })

  const textContent = message.choices[0]?.message?.content
  if (!textContent) throw new Error('No text response from OpenAI')
  return extractJson(textContent)
}

/**
 * Main entry point: Preprocess shot, call AI model, and return analysis with token counts.
 * Supports both Claude and OpenAI models.
 */
export async function analyzeShot(
  shotId: string,
  apiKey: string,
  model: 'claude' | 'openai' = 'claude',
  analysisType: 'detail' | 'stats' = 'detail',
  window: '7d' | '30d' | '90d' | 'all' = '30d',
  modelName?: string,
  language = 'en',
  customContext = '',
  analysisMode: 'standard' | 'optimized' = 'standard'
): Promise<AnalyzeResult> {
  const preprocessed = await preprocessShots(shotId, window)

  const systemPrompt = analysisMode === 'optimized'
    ? buildSystemPromptOptimized(language)
    : buildSystemPrompt(language)

  let prompt: string
  if (analysisType === 'detail') {
    prompt = analysisMode === 'optimized'
      ? buildDetailPromptOptimized(preprocessed.targetShot, preprocessed.aggregatedStats, customContext)
      : buildDetailPrompt(preprocessed.targetShot, preprocessed.aggregatedStats, customContext)
  } else {
    prompt = buildStatsPrompt(preprocessed.contextShots, preprocessed.aggregatedStats, window)
  }

  let tokenInputCount = 0
  let tokenOutputCount = 0
  let analysisResult: ClaudeAnalysisResult

  if (model === 'openai') {
    const client = new OpenAI({ apiKey })
    const openaiModel = modelName || 'gpt-4o-mini'

    const message = await client.chat.completions.create({
      model: openaiModel,
      max_tokens: 2048,
      response_format: { type: 'json_object' },  // enforce JSON output
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    })

    tokenInputCount = message.usage?.prompt_tokens || 0
    tokenOutputCount = message.usage?.completion_tokens || 0

    const textContent = message.choices[0]?.message?.content
    if (!textContent) throw new Error('No text response from OpenAI')
    analysisResult = extractJson(textContent)
  } else {
    // Call Claude (default)
    const client = new Anthropic({ apiKey })
    const claudeModel = modelName || 'claude-haiku-4-5-20251001'
    const maxTokens = analysisMode === 'optimized' ? 1024 : 2048

    let message: Awaited<ReturnType<typeof client.messages.create>>

    if (analysisMode === 'optimized') {
      // Use prompt caching for system prompt in optimized mode
      message = await client.messages.create({
        model: claudeModel,
        max_tokens: maxTokens,
        system: [
          {
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          },
        ] as Parameters<typeof client.messages.create>[0]['system'],
        messages: [{ role: 'user', content: prompt }],
      })
    } else {
      message = await client.messages.create({
        model: claudeModel,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      })
    }

    tokenInputCount = message.usage.input_tokens
    tokenOutputCount = message.usage.output_tokens

    const textContent = message.content.find((c) => c.type === 'text')
    if (!textContent || textContent.type !== 'text') throw new Error('No text response from Claude')
    analysisResult = extractJson(textContent.text)
  }

  const resolvedModel = model === 'openai'
    ? (modelName || 'gpt-4o-mini')
    : (modelName || 'claude-haiku-4-5-20251001')
  const pricing = await getModelPricing(resolvedModel)
  const costInputUsd = pricing !== null ? tokenInputCount * pricing.inputPerToken : null
  const costOutputUsd = pricing !== null ? tokenOutputCount * pricing.outputPerToken : null

  return {
    ...analysisResult,
    tokenInputCount,
    tokenOutputCount,
    costInputUsd,
    costOutputUsd,
    analysisMode,
  }
}

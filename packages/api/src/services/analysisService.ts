// packages/api/src/services/analysisService.ts
import { prisma } from '../db.js'
import type { ShotData, ShotResponse } from '../types.js'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

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

/**
 * System prompt for Claude AI analysis.
 * Instructs Claude to analyze shots from 3 perspectives: Barista, Roaster, and Analyst.
 */
export const SYSTEM_PROMPT = `You are an expert espresso analyst with three specialized perspectives:

1. **Barista**: Practical brewing advice - technique, timing, grind adjustments, tamping, temperature management
2. **Röster**: Bean and roast analysis - origin characteristics, roast level implications, flavor development
3. **Analyst**: Trends and data patterns - consistency metrics, improvement areas, statistical insights

Analyze the provided espresso shot data and respond with a JSON object containing three arrays:

{
  "barista": ["advice 1", "advice 2", ...],
  "roaster": ["insight 1", "insight 2", ...],
  "analyst": ["observation 1", "observation 2", ...]
}

Each array should contain 3-5 insights from that perspective. Be specific, reference actual values from the shot data, and provide actionable information.`

/**
 * Build a user prompt for analyzing a single shot.
 * Includes bean info, roast data, shot parameters, and curve descriptions.
 */
export function buildDetailPrompt(shot: ShotResponse, aggregatedStats: CurveStats): string {
  const lines: string[] = []

  lines.push(`## Shot Analysis Request`)
  lines.push('')

  // Bean and roast information
  if (shot.beanBrand || shot.beanType) {
    lines.push(`### Bean Info`)
    if (shot.beanBrand) lines.push(`- Brand: ${shot.beanBrand}`)
    if (shot.beanType) lines.push(`- Type: ${shot.beanType}`)
    if (shot.roastLevel) lines.push(`- Roast Level: ${shot.roastLevel}`)
    if (shot.roastDate) lines.push(`- Roast Date: ${shot.roastDate}`)
    lines.push('')
  }

  // Shot parameters
  lines.push(`### Shot Parameters`)
  if (shot.beanWeight) lines.push(`- Bean Weight: ${shot.beanWeight}g`)
  if (shot.drinkWeight) lines.push(`- Drink Weight: ${shot.drinkWeight}g`)
  if (shot.duration) lines.push(`- Duration: ${shot.duration}s`)
  if (shot.drinkTds) lines.push(`- TDS: ${shot.drinkTds}`)
  if (shot.drinkEy) lines.push(`- EY: ${shot.drinkEy}`)
  if (shot.grinderModel) lines.push(`- Grinder: ${shot.grinderModel} @ ${shot.grinderSetting}`)
  if (shot.profileTitle) lines.push(`- Profile: ${shot.profileTitle}`)
  lines.push('')

  // Flavor notes
  if (shot.fragrance || shot.aroma || shot.flavor || shot.aftertaste) {
    lines.push(`### Flavor Profile`)
    if (shot.fragrance) lines.push(`- Fragrance: ${shot.fragrance}`)
    if (shot.aroma) lines.push(`- Aroma: ${shot.aroma}`)
    if (shot.flavor) lines.push(`- Flavor: ${shot.flavor}`)
    if (shot.aftertaste) lines.push(`- Aftertaste: ${shot.aftertaste}`)
    lines.push('')
  }

  // Tasting attributes
  if (shot.acidity || shot.bitterness || shot.sweetness || shot.mouthfeel) {
    lines.push(`### Tasting Attributes`)
    if (shot.acidity) lines.push(`- Acidity: ${shot.acidity}`)
    if (shot.bitterness) lines.push(`- Bitterness: ${shot.bitterness}`)
    if (shot.sweetness) lines.push(`- Sweetness: ${shot.sweetness}`)
    if (shot.mouthfeel) lines.push(`- Mouthfeel: ${shot.mouthfeel}`)
    lines.push('')
  }

  // Curve descriptions
  lines.push(`### Extraction Curves`)
  if (shot.shotData?.espresso_pressure) {
    lines.push(`- Pressure: ${describeCurve(shot.shotData.espresso_pressure, 'bar')}`)
  }
  if (shot.shotData?.espresso_flow) {
    lines.push(`- Flow: ${describeCurve(shot.shotData.espresso_flow, 'ml/s')}`)
  }
  if (shot.shotData?.espresso_temperature_mix) {
    lines.push(`- Temperature: ${describeCurve(shot.shotData.espresso_temperature_mix, 'C')}`)
  }
  lines.push('')

  // Context from aggregated stats
  if (Object.keys(aggregatedStats).length > 0) {
    lines.push(`### Historical Context (aggregated from similar shots)`)
    if (aggregatedStats.pressure) {
      lines.push(`- Pressure: ${describeCurve([aggregatedStats.pressure.avg], 'bar')} (avg from ${aggregatedStats.pressure.count} data points)`)
    }
    if (aggregatedStats.flow) {
      lines.push(`- Flow: ${describeCurve([aggregatedStats.flow.avg], 'ml/s')} (avg from ${aggregatedStats.flow.count} data points)`)
    }
    if (aggregatedStats.temperature) {
      lines.push(`- Temperature: ${describeCurve([aggregatedStats.temperature.avg], 'C')} (avg from ${aggregatedStats.temperature.count} data points)`)
    }
    lines.push('')
  }

  lines.push(`Please provide analysis from all three perspectives: Barista, Röster, and Analyst.`)

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
  analyst: string[]
}

export interface AnalyzeResult extends ClaudeAnalysisResult {
  tokenInputCount: number
  tokenOutputCount: number
}

/**
 * Call Claude API with the given prompt and parse the JSON response.
 * Extracts barista, roaster, and analyst arrays from the response.
 */
export async function callClaude(
  prompt: string,
  apiKey: string
): Promise<ClaudeAnalysisResult> {
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  // Extract text content from response
  const textContent = message.content.find((c) => c.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  // Parse JSON from response using regex
  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Could not find JSON in Claude response')
  }

  const parsed = JSON.parse(jsonMatch[0])

  return {
    barista: parsed.barista || [],
    roaster: parsed.roaster || [],
    analyst: parsed.analyst || [],
  }
}

/**
 * Call OpenAI API with the given prompt and parse the JSON response.
 * Extracts barista, roaster, and analyst arrays from the response.
 */
export async function callOpenAI(
  prompt: string,
  apiKey: string
): Promise<ClaudeAnalysisResult> {
  const client = new OpenAI({ apiKey })

  const message = await client.chat.completions.create({
    model: 'gpt-4-turbo',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  // Extract text content from response
  const textContent = message.choices[0]?.message?.content
  if (!textContent) {
    throw new Error('No text response from OpenAI')
  }

  // Parse JSON from response using regex
  const jsonMatch = textContent.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Could not find JSON in OpenAI response')
  }

  const parsed = JSON.parse(jsonMatch[0])

  return {
    barista: parsed.barista || [],
    roaster: parsed.roaster || [],
    analyst: parsed.analyst || [],
  }
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
  window: '7d' | '30d' | '90d' | 'all' = '30d'
): Promise<AnalyzeResult> {
  const preprocessed = await preprocessShots(shotId, window)

  let prompt: string
  if (analysisType === 'detail') {
    prompt = buildDetailPrompt(preprocessed.targetShot, preprocessed.aggregatedStats)
  } else {
    prompt = buildStatsPrompt(preprocessed.contextShots, preprocessed.aggregatedStats, window)
  }

  let tokenInputCount = 0
  let tokenOutputCount = 0
  let analysisResult: ClaudeAnalysisResult

  if (model === 'openai') {
    // Call OpenAI
    const client = new OpenAI({ apiKey })

    const message = await client.chat.completions.create({
      model: 'gpt-4-turbo',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    // Extract token counts from OpenAI
    tokenInputCount = message.usage?.prompt_tokens || 0
    tokenOutputCount = message.usage?.completion_tokens || 0

    // Extract and parse JSON response
    const textContent = message.choices[0]?.message?.content
    if (!textContent) {
      throw new Error('No text response from OpenAI')
    }

    const jsonMatch = textContent.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Could not find JSON in OpenAI response')
    }

    const parsed = JSON.parse(jsonMatch[0])
    analysisResult = {
      barista: parsed.barista || [],
      roaster: parsed.roaster || [],
      analyst: parsed.analyst || [],
    }
  } else {
    // Call Claude (default)
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    // Extract token counts
    tokenInputCount = message.usage.input_tokens
    tokenOutputCount = message.usage.output_tokens

    // Extract and parse JSON response
    const textContent = message.content.find((c) => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Could not find JSON in Claude response')
    }

    const parsed = JSON.parse(jsonMatch[0])
    analysisResult = {
      barista: parsed.barista || [],
      roaster: parsed.roaster || [],
      analyst: parsed.analyst || [],
    }
  }

  return {
    ...analysisResult,
    tokenInputCount,
    tokenOutputCount,
  }
}

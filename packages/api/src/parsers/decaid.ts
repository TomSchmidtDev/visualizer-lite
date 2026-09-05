// packages/api/src/parsers/decaid.ts
import type { ParsedShot, ProfileStep, ShotData } from '../types.js'

/**
 * Parse a Decaid shot record (the body of GET /api/v1/shots/{id}).
 *
 * Decaid's `measurements` are row-oriented snapshots keyed by an absolute
 * wall-clock timestamp (no `Z` suffix — the same "local digits, not real
 * UTC" convention de1Service.ts already uses for de1app/Decenza), unlike
 * de1app/Decenza's column-oriented Visualizer-format JSON. Elapsed seconds
 * are derived by diffing each sample's timestamp against the first one's.
 */
export function parseDecaidShot(content: string): ParsedShot {
  const data = JSON.parse(content)

  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null

  const num = (v: unknown): number | null => {
    const n = parseFloat(String(v ?? ''))
    return isNaN(n) ? null : n
  }

  const measurements: Array<{ machine?: Record<string, unknown>; scale?: { weight?: unknown; weightFlow?: unknown } | null; volume?: unknown }> =
    Array.isArray(data.measurements) ? data.measurements : []
  const workflow     = data.workflow ?? {}
  const profile       = workflow.profile ?? {}
  const context       = workflow.context ?? {}
  const annotations   = data.annotations ?? {}

  const t0 = measurements.length > 0 ? parseInstantMs(measurements[0]?.machine?.timestamp) : NaN

  const timeframe: number[] = []
  const espresso_pressure: number[] = []
  const espresso_pressure_goal: number[] = []
  const espresso_flow: number[] = []
  const espresso_flow_goal: number[] = []
  const espresso_temperature_mix: number[] = []
  const espresso_temperature_basket: number[] = []

  let lastWeight = 0
  let sawWeight = false
  const espresso_weight: number[] = []

  // scale.weightFlow is Decaid's own gravimetric flow rate (device-reported when
  // available, otherwise its weight-derived estimate) — the same channel de1app/
  // Decenza call espresso_flow_weight, and one of the chart's default-on channels.
  let lastFlowWeight = 0
  let sawFlowWeight = false
  const espresso_flow_weight: number[] = []

  let lastVolume = 0
  let sawVolume = false
  const espresso_water_dispensed: number[] = []

  for (const s of measurements) {
    const machine = s?.machine ?? {}
    const t = parseInstantMs(machine.timestamp)
    timeframe.push(!isNaN(t) && !isNaN(t0) ? (t - t0) / 1000 : 0)
    espresso_pressure.push(Number(machine.pressure) || 0)
    espresso_pressure_goal.push(Number(machine.targetPressure) || 0)
    espresso_flow.push(Number(machine.flow) || 0)
    espresso_flow_goal.push(Number(machine.targetFlow) || 0)
    espresso_temperature_mix.push(Number(machine.mixTemperature) || 0)
    espresso_temperature_basket.push(Number(machine.groupTemperature) || 0)

    const weight = s?.scale?.weight
    if (typeof weight === 'number' && !isNaN(weight)) { lastWeight = weight; sawWeight = true }
    espresso_weight.push(lastWeight)

    const flowWeight = s?.scale?.weightFlow
    if (typeof flowWeight === 'number' && !isNaN(flowWeight)) { lastFlowWeight = flowWeight; sawFlowWeight = true }
    espresso_flow_weight.push(lastFlowWeight)

    const volume = s?.volume
    if (typeof volume === 'number' && !isNaN(volume)) { lastVolume = volume; sawVolume = true }
    espresso_water_dispensed.push(lastVolume)
  }

  const shotData: ShotData = {
    timeframe,
    espresso_pressure,
    espresso_pressure_goal,
    espresso_flow,
    espresso_flow_goal,
    espresso_temperature_mix,
    espresso_temperature_basket,
  }
  // Only attach weight/flow-weight/volume series when at least one sample actually
  // reported one — otherwise every point would be a misleading flat 0 (e.g. no scale connected).
  if (sawWeight) shotData.espresso_weight = espresso_weight
  if (sawFlowWeight) shotData.espresso_flow_weight = espresso_flow_weight
  if (sawVolume) shotData.espresso_water_dispensed = espresso_water_dispensed

  if (Array.isArray(profile.steps)) {
    const steps = (profile.steps as unknown[]).filter(
      (st): st is ProfileStep =>
        st !== null && typeof st === 'object' && typeof (st as ProfileStep).name === 'string',
    )
    if (steps.length > 0) shotData.profileSteps = steps
  }

  const clockMs = parseInstantMs(data.timestamp)
  const clock = !isNaN(clockMs) ? Math.floor(clockMs / 1000) : Math.floor(Date.now() / 1000)

  const enjoymentRaw = num(annotations.enjoyment)
  const espressoEnjoyment = enjoymentRaw != null && enjoymentRaw !== 0
    ? Math.round(enjoymentRaw)
    : null

  return {
    clock,
    // WorkflowContext's coffeeRoaster/coffeeName are display strings, not linked
    // Bean entities — matches the beanBrand=roaster / beanType=coffee-name
    // convention used by the other dialects (e.g. "Gardelli" / "Ethiopia Guji Hambela").
    beanBrand:         str(context.coffeeRoaster),
    beanType:          str(context.coffeeName),
    beanWeight:        num(annotations.actualDoseWeight) ?? num(context.targetDoseWeight),
    drinkWeight:       num(annotations.actualYield)      ?? num(context.targetYield),
    duration:          timeframe.length > 0 ? timeframe[timeframe.length - 1] : null,
    grinderModel:      str(context.grinderModel),
    grinderSetting:    str(context.grinderSetting),
    barista:           str(context.baristaName),
    profileTitle:      str(profile.title),
    // Bean roast level/date would require a separate /api/v1/bean-batches lookup
    // by context.beanBatchId — not embedded in the shot record itself.
    roastLevel:        null,
    roastDate:         null,
    espressoEnjoyment,
    espressoNotes:     str(annotations.espressoNotes),
    beverageType:      (str(profile.beverage_type) ?? str(context.finalBeverageType))?.toLowerCase() ?? null,
    shotData,
  }
}

/**
 * Parse a Decaid wall-clock timestamp ("2026-09-05T10:28:22.214776", no `Z`)
 * into epoch milliseconds. Fractional seconds are truncated to 3 digits
 * before parsing so the extra microsecond precision Decaid emits can't push
 * the value into invalid-date territory. The digits are treated as literal
 * UTC (no timezone conversion), matching the "local digits labeled Z"
 * convention de1Service.ts uses for de1app/Decenza timestamps.
 */
function parseInstantMs(raw: unknown): number {
  if (typeof raw !== 'string') return NaN
  const m = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?/)
  if (!m) return NaN
  const frac = (m[2] ?? '000').padEnd(3, '0').slice(0, 3)
  return Date.parse(`${m[1]}.${frac}Z`)
}

// packages/api/src/parsers/decent.ts
import type { ParsedShot, ShotData } from '../types.js'

/**
 * Parse a Decent Espresso .shot file.
 * Supports:
 *   - Legacy Tcl format (no version header, set varname value lines)
 *   - JSON format version 2 ({"version":"2", "elapsed":[...], ...})
 */
export function parseDecentShot(content: string): ParsedShot {
  const trimmed = content.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseJsonShot(trimmed)
  }
  return parseTclShot(content)
}

// ─── JSON format (version 2) ─────────────────────────────────────────────────

function parseJsonShot(content: string): ParsedShot {
  const data = JSON.parse(content)

  const numArr = (arr: unknown): number[] | undefined => {
    if (!Array.isArray(arr) || arr.length === 0) return undefined
    const nums = arr.map(Number).filter((n) => !isNaN(n))
    return nums.length > 0 ? nums : undefined
  }

  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null

  const num = (v: unknown): number | null => {
    const n = parseFloat(String(v ?? ''))
    return isNaN(n) ? null : n
  }

  // Metadata: v2 nests under profile / meta / meta.bean / meta.grinder
  const profile = data.profile ?? {}
  const meta    = data.meta    ?? {}
  const bean    = meta.bean    ?? {}
  const grinder = meta.grinder ?? {}

  const timeframe = numArr(data.elapsed) ?? []

  // state_change: sentinel value 10000000.0 means "no change at this step" — keep raw
  const shotData: ShotData = {
    timeframe,
    espresso_pressure:           numArr(data.pressure?.pressure),
    espresso_pressure_goal:      numArr(data.pressure?.goal),
    espresso_flow:               numArr(data.flow?.flow),
    espresso_flow_goal:          numArr(data.flow?.goal),
    espresso_flow_weight:        numArr(data.flow?.by_weight),
    espresso_weight:             numArr(data.totals?.weight),
    espresso_temperature_mix:    numArr(data.temperature?.mix),
    espresso_temperature_basket: numArr(data.temperature?.basket),
    espresso_water_dispensed:    numArr(data.totals?.water_dispensed),
    espresso_state_change:       numArr(data.state_change),
  }

  // Extra channels present in v2
  const extras: Record<string, unknown> = {
    espresso_resistance:       data.resistance?.resistance,
    espresso_flow_weight_raw:  data.flow?.by_weight_raw,
    espresso_temperature_goal: data.temperature?.goal,
  }
  for (const [key, val] of Object.entries(extras)) {
    const arr = numArr(val)
    if (arr) shotData[key] = arr
  }

  const clock = data.clock ? parseInt(String(data.clock), 10) : Math.floor(Date.now() / 1000)

  return {
    clock,
    beanBrand:      str(bean.brand)   ?? str(data.bean_brand),
    beanType:       str(bean.type)    ?? str(data.bean_type),
    beanWeight:     num(meta.in)      ?? num(data.bean_weight),
    drinkWeight:    num(meta.out)     ?? num(data.drink_weight),
    duration:       timeframe.length > 0 ? timeframe[timeframe.length - 1] : null,
    grinderModel:   str(grinder.model)   ?? str(data.grinder_model),
    grinderSetting: str(grinder.setting) ?? str(data.grinder_setting),
    barista:        str(data.barista),
    profileTitle:   str(profile.title)   ?? str(data.profile_title),
    roastLevel:     str(bean.roast_level) ?? str(data.roast_level),
    roastDate:      str(bean.roast_date)  ?? str(data.roast_date),
    shotData,
  }
}

// ─── Tcl format (legacy) ──────────────────────────────────────────────────────

function parseTclShot(content: string): ParsedShot {
  const vars: Record<string, string> = {}

  // Match: (set )?identifier {braced content} or scalar
  const lineRe =
    /^(?:set\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:\{([^}]*)\}|(\S+))\s*$/gm

  let m: RegExpExecArray | null
  while ((m = lineRe.exec(content)) !== null) {
    const [, name, braced, scalar] = m
    vars[name] = braced ?? scalar ?? ''
  }

  const str = (key: string): string | null => vars[key]?.trim() || null

  const num = (key: string): number | null => {
    const v = vars[key]
    if (!v) return null
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }

  const numList = (key: string): number[] | undefined => {
    const v = vars[key]
    if (!v) return undefined
    const nums = v
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter((n) => !isNaN(n))
    return nums.length > 0 ? nums : undefined
  }

  const timeframe = numList('espresso_elapsed') ?? []

  const shotData: ShotData = {
    timeframe,
    espresso_pressure:           numList('espresso_pressure'),
    espresso_pressure_goal:      numList('espresso_pressure_goal'),
    espresso_flow:               numList('espresso_flow'),
    espresso_flow_goal:          numList('espresso_flow_goal'),
    espresso_flow_weight:        numList('espresso_flow_weight'),
    espresso_weight:             numList('espresso_weight'),
    espresso_temperature_mix:    numList('espresso_temperature_mix'),
    espresso_temperature_basket: numList('espresso_temperature_basket'),
    espresso_water_dispensed:    numList('espresso_water_dispensed'),
    espresso_state_change:       numList('espresso_state_change'),
  }

  // Preserve any additional espresso_ channels from future firmware
  for (const [key] of Object.entries(vars)) {
    if (key.startsWith('espresso_') && !(key in shotData)) {
      const list = numList(key)
      if (list) shotData[key] = list
    }
  }

  return {
    clock:          num('clock') ?? Math.floor(Date.now() / 1000),
    beanBrand:      str('bean_brand'),
    beanType:       str('bean_type'),
    beanWeight:     num('bean_weight'),
    drinkWeight:    num('drink_weight'),
    duration:       timeframe.length > 0 ? timeframe[timeframe.length - 1] : null,
    grinderModel:   str('grinder_model'),
    grinderSetting: str('grinder_setting'),
    barista:        str('barista'),
    profileTitle:   str('profile_title'),
    roastLevel:     str('roast_level'),
    roastDate:      str('roast_date'),
    shotData,
  }
}

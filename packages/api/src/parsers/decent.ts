// packages/api/src/parsers/decent.ts
import type { ParsedShot, ShotData } from '../types.js'

/**
 * Parse a Decent Espresso .shot file (Tcl format).
 * Supports both `set varname value` and `varname value` forms.
 */
export function parseDecentShot(content: string): ParsedShot {
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

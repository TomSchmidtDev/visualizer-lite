// packages/api/src/parsers/decent.ts
import type { ParsedShot, ProfileStep, ShotData } from '../types.js'

/**
 * Parse a Decent Espresso .shot file.
 * Supports:
 *   - Legacy Tcl format (top-level key-value pairs)
 *   - DE1 API Tcl format (metadata inside settings {} block)
 *   - JSON format version 2
 */
export function parseDecentShot(content: string): ParsedShot {
  const trimmed = content.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseJsonShot(trimmed)
  }
  return parseTclShot(content)
}

// JSON format (version 2)

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

  const profile = data.profile ?? {}
  const meta    = data.meta    ?? {}
  const bean    = meta.bean    ?? {}
  const grinder = meta.grinder ?? {}

  const timeframe = numArr(data.elapsed) ?? []

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

  const extras: Record<string, unknown> = {
    espresso_resistance:       data.resistance?.resistance,
    espresso_flow_weight_raw:  data.flow?.by_weight_raw,
    espresso_temperature_goal: data.temperature?.goal,
  }
  for (const [key, val] of Object.entries(extras)) {
    const arr = numArr(val)
    if (arr) shotData[key] = arr
  }

  // Profile steps — data.profile.steps holds the same structure as the Tcl profile {} block
  if (Array.isArray(profile.steps)) {
    const steps = (profile.steps as unknown[]).filter(
      (s): s is ProfileStep =>
        s !== null && typeof s === 'object' && typeof (s as ProfileStep).name === 'string',
    )
    if (steps.length > 0) shotData.profileSteps = steps
  }

  const clock = data.clock ? parseInt(String(data.clock), 10) : Math.floor(Date.now() / 1000)

  const rawRoastDate = str(bean.roast_date) ?? str(data.roast_date)

  return {
    clock,
    beanBrand:         str(bean.brand)        ?? str(data.bean_brand),
    beanType:          str(bean.type)         ?? str(data.bean_type),
    beanWeight:        num(meta.in)           ?? num(data.bean_weight),
    drinkWeight:       num(meta.out)          ?? num(data.drink_weight),
    duration:          timeframe.length > 0 ? timeframe[timeframe.length - 1] : null,
    grinderModel:      str(grinder.model)     ?? str(data.grinder_model),
    grinderSetting:    str(grinder.setting)   ?? str(data.grinder_setting),
    barista:           str(data.barista),
    profileTitle:      str(profile.title)     ?? str(data.profile_title),
    roastLevel:        str(bean.roast_level)  ?? str(data.roast_level),
    roastDate:         rawRoastDate ? normalizeDateStr(rawRoastDate) : null,
    espressoEnjoyment: null,
    espressoNotes:     null,
    shotData,
  }
}

// Tcl format

/**
 * Return only the "flat" (non-block) lines from a Tcl-like file.
 * Multi-line blocks delimited by `{` / `}` at the top level are stripped.
 * This prevents content inside blocks (like read_only_backup) from polluting
 * the top-level key-value map.
 */
function stripTopLevelBlocks(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let depth = 0

  for (const line of lines) {
    // Count brace opens/closes — only simple heuristic needed for Tcl shot format
    const opens  = (line.match(/\{/g) ?? []).length
    const closes = (line.match(/\}/g) ?? []).length

    if (depth === 0) {
      result.push(line)
    }

    depth += opens - closes
    if (depth < 0) depth = 0
  }

  return result.join('\n')
}

/**
 * Extract a single value from indented lines inside blocks like settings {}.
 * Indented lines are NOT matched by the top-level regex (which requires col-0 keys).
 * Matches:  <whitespace>key {value}  or  <whitespace>key scalar
 */
function extractFromSettings(content: string, key: string): string | null {
  const re = new RegExp(`^\\s+${key}\\s+(?:\\{([^}]*)\\}|(\\S+))`, 'm')
  const m = content.match(re)
  if (!m) return null
  return (m[1] ?? m[2] ?? '').trim() || null
}

/**
 * Extract the JSON content of a top-level Tcl block like `profile { ... }`.
 *
 * The DE1 API shot format stores the profile as:
 *   profile {
 *     "title": "...",
 *     ...
 *   }
 * where the opening `{` is simultaneously the Tcl block delimiter and the
 * JSON object opening brace.  We extract the block content, wrap it in `{}`
 * and return valid JSON.
 */
function extractTclBlock(content: string, key: string): string | null {
  const re = new RegExp(`^${key} \\{`, 'm')
  const match = re.exec(content)
  if (!match) return null

  const openPos = match.index + match[0].length - 1 // position of the opening '{'
  let depth = 0
  let i = openPos

  while (i < content.length) {
    if (content[i] === '{') depth++
    else if (content[i] === '}') {
      depth--
      if (depth === 0) {
        // Return content between the outer braces, wrapped as JSON object
        return '{' + content.slice(openPos + 1, i) + '}'
      }
    }
    i++
  }
  return null
}

/**
 * Parse the profile steps from a DE1 shot's `profile {}` block.
 * Returns an empty array if the block is absent or malformed.
 */
function parseProfileSteps(content: string): ProfileStep[] {
  const json = extractTclBlock(content, 'profile')
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as { steps?: unknown }
    const steps = parsed.steps
    if (!Array.isArray(steps)) return []
    return steps.filter(
      (s): s is ProfileStep =>
        s !== null && typeof s === 'object' && typeof (s as ProfileStep).name === 'string',
    )
  } catch {
    return []
  }
}

/**
 * Normalize DD.MM.YYYY to YYYY-MM-DD so new Date() parses it correctly.
 * Returns the original string unchanged for any other format.
 */
function normalizeDateStr(s: string): string {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return s
  return `${m[3]}-${m[2]}-${m[1]}`
}

function parseTclShot(content: string): ParsedShot {
  const vars: Record<string, string> = {}

  // Strip the settings {} block (and any other top-level multi-line blocks)
  // so that col-0 lines inside nested blocks don't pollute vars{}.
  const contentForVars = stripTopLevelBlocks(content)

  // Matches top-level (non-indented) lines only: key {braced} or key scalar
  const lineRe =
    /^(?:set\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:\{([^}]*)\}|(\S+))\s*$/gm

  let m: RegExpExecArray | null
  while ((m = lineRe.exec(contentForVars)) !== null) {
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
    const nums = v.trim().split(/\s+/).map(Number).filter((n) => !isNaN(n))
    return nums.length > 0 ? nums : undefined
  }

  // Fallback helpers: prefer settings {} block (avoids read_only_backup pollution),
  // fall back to top-level top-level vars.
  const strFb = (key: string): string | null =>
    extractFromSettings(content, key) ?? str(key)

  const numFb = (key: string): number | null => {
    const v = strFb(key)
    if (!v) return null
    const n = parseFloat(v)
    return isNaN(n) ? null : n
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

  for (const [key] of Object.entries(vars)) {
    if (key.startsWith('espresso_') && !(key in shotData) && key !== 'espresso_elapsed') {
      const list = numList(key)
      if (list) shotData[key] = list
    }
  }

  // Profile steps (DE1 API shots only — stored in the `profile {}` JSON block)
  const profileSteps = parseProfileSteps(content)
  if (profileSteps.length > 0) shotData.profileSteps = profileSteps

  // roast_date: may be ISO (sample.shot) or DD.MM.YYYY (DE1 API shot)
  const rawRoastDate = strFb('roast_date')
  const roastDate = rawRoastDate ? normalizeDateStr(rawRoastDate) : null

  // espresso_enjoyment: 0 means "not rated" in DE1 firmware -> store as null
  const enjoymentRaw = numFb('espresso_enjoyment')
  const espressoEnjoyment = enjoymentRaw != null && enjoymentRaw !== 0
    ? Math.round(enjoymentRaw)
    : null

  // beanWeight: top-level key is bean_weight; DE1 API uses grinder_dose_weight
  const beanWeight = num('bean_weight') ?? numFb('grinder_dose_weight')

  // barista: top-level key is barista; DE1 API uses drinker_name inside settings
  const barista = str('barista') ?? strFb('drinker_name')

  return {
    clock:            num('clock') ?? Math.floor(Date.now() / 1000),
    beanBrand:        strFb('bean_brand'),
    beanType:         strFb('bean_type'),
    beanWeight,
    drinkWeight:      numFb('drink_weight'),
    duration:         timeframe.length > 0 ? timeframe[timeframe.length - 1] : null,
    grinderModel:     strFb('grinder_model'),
    grinderSetting:   strFb('grinder_setting'),
    barista,
    profileTitle:     strFb('profile_title'),
    roastLevel:       strFb('roast_level'),
    roastDate,
    espressoEnjoyment,
    espressoNotes:    strFb('espresso_notes'),
    shotData,
  }
}

// packages/api/src/services/de1Service.ts
import { createHash } from 'crypto'
import { prisma } from '../db.js'
import { parseDecentShot } from '../parsers/decent.js'
import { parseDecaidShot } from '../parsers/decaid.js'
import { saveFile } from './fileStorage.js'

export interface MachineShotInfo {
  filename: string
  date: string  // ISO 8601
}

/** Read the DE1 machine URL from the Settings table. Returns null if not set. */
export async function getDe1Url(): Promise<string | null> {
  const row = await prisma.settings.findUnique({ where: { key: 'de1Url' } })
  return row?.value?.trim() || null
}

/** Read the default beverage type from Settings. Returns null if not set. */
async function getDefaultBeverage(): Promise<string | null> {
  const row = await prisma.settings.findUnique({ where: { key: 'de1DefaultBeverage' } })
  return row?.value?.trim() || null
}

export type MachineType = 'de1app' | 'decenza' | 'decaid'

interface ProbeResult {
  ok: boolean
  reason?: string
}

async function probeDe1App(base: string): Promise<ProbeResult> {
  try {
    const res = await fetch(`${base}/api/shot/`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const body = await res.json()
    const ok = Array.isArray(body) && (body.length === 0 || typeof body[0] === 'string')
    return ok ? { ok: true } : { ok: false, reason: 'unexpected response shape' }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

async function probeDecenza(base: string): Promise<ProbeResult> {
  try {
    const res = await fetch(`${base}/api/shots`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const body = await res.json()
    const ok = Array.isArray(body) && (body.length === 0 || (typeof body[0] === 'object' && body[0] !== null && 'id' in body[0]))
    return ok ? { ok: true } : { ok: false, reason: 'unexpected response shape' }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

async function probeDecaid(base: string): Promise<ProbeResult> {
  try {
    const res = await fetch(`${base}/api/v1/shots?limit=1`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const body = await res.json()
    const ok = body !== null && typeof body === 'object'
      && Array.isArray((body as { items?: unknown }).items)
      && typeof (body as { total?: unknown }).total === 'number'
    return ok ? { ok: true } : { ok: false, reason: 'unexpected response shape' }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Probe a machine URL to determine which app is running.
 * de1app:  GET /api/shot/       -> JSON array of filename strings.
 * Decenza: GET /api/shots       -> JSON array of shot objects ({id, timestamp, ...}).
 * Decaid:  GET /api/v1/shots    -> JSON object ({items: [...], total, limit, offset}).
 * All probes run concurrently; if more than one unexpectedly succeeds, the
 * first in de1app > Decenza > Decaid order wins (should not happen given the
 * distinct, unambiguous endpoint shapes).
 */
export async function detectMachineType(de1Url: string): Promise<MachineType> {
  const base = de1Url.replace(/\/+$/, '')
  const [de1Result, decenzaResult, decaidResult] = await Promise.allSettled([
    probeDe1App(base),
    probeDecenza(base),
    probeDecaid(base),
  ])
  const toResult = (r: PromiseSettledResult<ProbeResult>): ProbeResult =>
    r.status === 'fulfilled'
      ? r.value
      : { ok: false, reason: r.reason instanceof Error ? r.reason.message : String(r.reason) }
  const de1     = toResult(de1Result)
  const decenza = toResult(decenzaResult)
  const decaid  = toResult(decaidResult)

  if ([de1.ok, decenza.ok, decaid.ok].filter(Boolean).length > 1) {
    console.warn(`DE1 import: multiple machine types responded successfully at ${base}; preferring de1app > decenza > decaid`)
  }
  if (de1.ok) return 'de1app'
  if (decenza.ok) return 'decenza'
  if (decaid.ok) return 'decaid'
  throw new Error(`No machine detected (de1app: ${de1.reason}; Decenza: ${decenza.reason}; Decaid: ${decaid.reason})`)
}

/** de1app/Decenza's Advanced REST API plugin defaults to 8888; Decaid defaults to 8080. */
const DEFAULT_PORT_FALLBACKS: Record<string, string> = { '8888': '8080', '8080': '8888' }

/**
 * Swap a configured URL's port for the other app's well-known default port
 * (8888 <-> 8080), for use as a fallback when the configured port doesn't
 * respond. Returns null when the URL is unparseable or its port isn't one of
 * the two known defaults — there's nothing sensible to guess otherwise.
 */
function swapDefaultPort(urlStr: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(urlStr)
  } catch {
    return null
  }
  const altPort = DEFAULT_PORT_FALLBACKS[parsed.port]
  if (!altPort) return null
  parsed.port = altPort
  return parsed.toString().replace(/\/+$/, '')
}

/** Persist the working DE1 machine URL back to Settings. */
async function saveDe1Url(url: string): Promise<void> {
  await prisma.settings.upsert({
    where: { key: 'de1Url' },
    create: { key: 'de1Url', value: url },
    update: { value: url },
  })
}

/**
 * Resolve which machine type is running and at which URL, trying the
 * configured URL first and falling back to the other app's well-known
 * default port (8888 <-> 8080) if that fails entirely. de1app/Decenza and
 * Decaid conventionally run on different default ports, so a URL saved for
 * one dialect commonly doesn't work after switching to the other.
 *
 * On a successful fallback, the corrected URL is saved back to Settings so
 * later calls go straight to the working port instead of probing the dead
 * one again every time. On failure, the error reflects the originally
 * configured URL (not the fallback attempt), since that's the one the user
 * actually configured.
 */
export async function resolveMachineConnection(
  de1Url: string,
): Promise<{ url: string; machineType: MachineType }> {
  try {
    return { url: de1Url, machineType: await detectMachineType(de1Url) }
  } catch (primaryErr) {
    const altUrl = swapDefaultPort(de1Url)
    if (!altUrl) throw primaryErr

    let machineType: MachineType
    try {
      machineType = await detectMachineType(altUrl)
    } catch {
      throw primaryErr
    }

    await saveDe1Url(altUrl)
    return { url: altUrl, machineType }
  }
}

/**
 * Fetch the list of shot filenames from the DE1 machine.
 * Times out after 5 seconds. Throws on network error or non-200 response.
 */
export async function fetchShotList(de1Url: string): Promise<string[]> {
  const base = de1Url.replace(/\/+$/, '')
  const res = await fetch(`${base}/api/shot/`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`DE1 returned HTTP ${res.status}`)
  return res.json() as Promise<string[]>
}

/**
 * Parse a shot filename like "20260526T121947.shot" into an ISO date string (UTC).
 * The filename date is local machine time; use the date prefix for date-range filtering.
 * Returns null for filenames that do not match the expected pattern.
 */
export function parseFilenameDate(filename: string): string | null {
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.shot$/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`
}

/**
 * Filter shots to those whose date falls within [dateFrom, dateTo] inclusive,
 * compared as plain YYYYMMDD strings against the shot's ISO date prefix.
 * dateFrom and dateTo are ISO date strings like "2026-05-26".
 */
export function filterByDateRange(
  shots: MachineShotInfo[],
  dateFrom: string,
  dateTo: string
): MachineShotInfo[] {
  const from = dateFrom.replace(/-/g, '')  // "2026-05-26" → "20260526"
  const to   = dateTo.replace(/-/g, '')    // "2026-12-31" → "20261231"

  return shots.filter(({ date }) => {
    const prefix = date.slice(0, 10).replace(/-/g, '')  // "2026-05-26T..." → "20260526"
    return prefix >= from && prefix <= to
  })
}

/**
 * Safely parse a date string. Returns null if the string is empty, missing,
 * or produces an invalid JavaScript Date (e.g. "Invalid Date").
 */
function parseOptionalDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Fetch a shot's raw content from the DE1 machine.
 *
 * Strategy:
 *   1. Try the v2 JSON endpoint  GET /api/v2/shot/<filename>  (preferred)
 *   2. On any v2 error (HTTP error or exception), fall back to the legacy
 *      proprietary-format endpoint  GET /api/shot/<filename>
 *   3. Non-404 v2 errors are logged as warnings before the fallback.
 *   4. Any error from v1 is thrown.
 *
 * Both legs time out independently after 10 s.
 */
async function fetchShotContent(base: string, filename: string): Promise<string> {
  try {
    const v2Res = await fetch(`${base}/api/v2/shot/${filename}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (v2Res.ok) return v2Res.text()

    if (v2Res.status !== 404) {
      console.warn(`DE1 import: ${filename}: v2 failed (HTTP ${v2Res.status}), falling back to v1`)
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(`DE1 import: ${filename}: v2 error (${reason}), falling back to v1`)
  }

  const v1Res = await fetch(`${base}/api/shot/${filename}`, {
    signal: AbortSignal.timeout(10000),
  })
  if (!v1Res.ok) throw new Error(`DE1 returned HTTP ${v1Res.status} for ${filename}`)
  return v1Res.text()
}

interface DecenzaShotSummary {
  id: number
  timestamp: number  // unix seconds
}

/** Fetch the raw shot list from a Decenza machine's GET /api/shots. */
export async function fetchDecenzaShotList(de1Url: string): Promise<DecenzaShotSummary[]> {
  const base = de1Url.replace(/\/+$/, '')
  const res = await fetch(`${base}/api/shots`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Decenza returned HTTP ${res.status}`)
  return res.json() as Promise<DecenzaShotSummary[]>
}

/** Fetch a shot's Visualizer-format JSON from a Decenza machine. */
async function fetchDecenzaShotContent(base: string, id: string): Promise<string> {
  const res = await fetch(`${base}/shot/${encodeURIComponent(id)}/shot.json`, {
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Decenza returned HTTP ${res.status} for shot ${id}`)
  return res.text()
}

/**
 * Build the same "local wall-clock digits labeled Z" ISO shape that
 * parseFilenameDate() produces from a de1app filename, but from a Decenza
 * unix-seconds timestamp. This does NOT convert to UTC — it uses the
 * server's local time-zone getters — so that filterByDateRange's date-string
 * slicing treats a given calendar day the same way for both dialects.
 */
function decenzaTimestampToLocalDateString(timestampSeconds: number): string {
  const d = new Date(timestampSeconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const year  = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day   = pad(d.getDate())
  const hour  = pad(d.getHours())
  const min   = pad(d.getMinutes())
  const sec   = pad(d.getSeconds())
  return `${year}-${month}-${day}T${hour}:${min}:${sec}.000Z`
}

interface DecaidShotSummary {
  id: string
  timestamp: string  // local wall-clock digits, no `Z` suffix, e.g. "2026-09-05T10:28:22.214776"
}

interface DecaidShotPage {
  items: DecaidShotSummary[]
  total: number
}

/**
 * Fetch one page of Decaid's paginated GET /api/v1/shots (summaries only, no
 * measurements). Each page has been observed taking 2.5-7s against real
 * hardware with a large shot history (Decaid does real per-shot work
 * server-side even for summaries) — 30s leaves comfortable margin.
 */
async function fetchDecaidShotPage(base: string, limit: number, offset: number): Promise<DecaidShotPage> {
  const res = await fetch(`${base}/api/v1/shots?limit=${limit}&offset=${offset}&orderBy=timestamp&order=desc`, {
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Decaid returned HTTP ${res.status}`)
  return res.json() as Promise<DecaidShotPage>
}

/**
 * Cheaply fetch the total shot count from a Decaid machine without paging
 * through the full history — a single request reading the `total` field.
 */
async function fetchDecaidShotCount(base: string): Promise<number> {
  const { total } = await fetchDecaidShotPage(base, 1, 0)
  return total
}

/**
 * Fetch the shot list from a Decaid machine, paging through /api/v1/shots
 * (sorted newest-first).
 *
 * Each page has been observed taking multiple seconds against real hardware
 * regardless of offset — Decaid's list endpoint appears to do real work per
 * summary even though measurements are excluded. Paging through a large
 * history (thousands of shots) to serve a narrow recent date range would
 * otherwise take minutes for no reason, since the results are already sorted
 * newest-first: once a page's oldest entry falls before `dateFromHint`, every
 * subsequent page is strictly older too, so pagination can stop there.
 */
export async function fetchDecaidShotList(de1Url: string, dateFromHint?: string): Promise<DecaidShotSummary[]> {
  const base = de1Url.replace(/\/+$/, '')
  const limit = 100
  const fromPrefix = dateFromHint ? dateFromHint.replace(/-/g, '') : null
  const all: DecaidShotSummary[] = []
  let offset = 0
  while (true) {
    const { items, total } = await fetchDecaidShotPage(base, limit, offset)
    all.push(...items)
    offset += items.length
    if (items.length === 0 || offset >= total) break

    if (fromPrefix) {
      const oldestOnPage = decaidTimestampToDateString(items[items.length - 1].timestamp)
      const oldestPrefix = oldestOnPage?.slice(0, 10).replace(/-/g, '')
      if (oldestPrefix && oldestPrefix < fromPrefix) break
    }
  }
  return all
}

/** Fetch a shot's full record (including measurements) from a Decaid machine. */
async function fetchDecaidShotContent(base: string, id: string): Promise<string> {
  const res = await fetch(`${base}/api/v1/shots/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Decaid returned HTTP ${res.status} for shot ${id}`)
  return res.text()
}

/**
 * Truncate a Decaid wall-clock timestamp to whole seconds and label it `Z`,
 * without any timezone conversion — same convention as
 * decenzaTimestampToLocalDateString(), just starting from digits instead of
 * a unix timestamp. Returns null for anything that doesn't look like an
 * ISO-shaped timestamp.
 */
function decaidTimestampToDateString(raw: string): string | null {
  const m = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/)
  return m ? `${m[1]}.000Z` : null
}

/**
 * List all shots from a machine, normalized to MachineShotInfo regardless of
 * dialect. de1app shots without a filename date the parser can understand are
 * silently dropped (matches the previous de1app-only behavior); Decenza/Decaid
 * shots with an unparseable timestamp are silently dropped the same way,
 * rather than throwing and aborting the whole listing.
 *
 * `dateFromHint` (YYYY-MM-DD) is optional and only affects Decaid: it lets
 * pagination stop early once results (sorted newest-first) fall before that
 * date, instead of always paging through the entire history. It is a hint,
 * not a hard filter — callers still run filterByDateRange() on the result.
 */
export async function listMachineShots(
  de1Url: string,
  machineType: MachineType,
  dateFromHint?: string,
): Promise<MachineShotInfo[]> {
  if (machineType === 'decenza') {
    const shots = await fetchDecenzaShotList(de1Url)
    const result: MachineShotInfo[] = []
    for (const s of shots) {
      if (!Number.isFinite(s.timestamp)) continue
      result.push({ filename: String(s.id), date: decenzaTimestampToLocalDateString(s.timestamp) })
    }
    return result
  }

  if (machineType === 'decaid') {
    const shots = await fetchDecaidShotList(de1Url, dateFromHint)
    const result: MachineShotInfo[] = []
    for (const s of shots) {
      const date = decaidTimestampToDateString(s.timestamp)
      if (date) result.push({ filename: s.id, date })
    }
    return result
  }

  const filenames = await fetchShotList(de1Url)
  const result: MachineShotInfo[] = []
  for (const filename of filenames) {
    const date = parseFilenameDate(filename)
    if (date) result.push({ filename, date })
  }
  return result
}

/**
 * Count the shots available on a machine. For de1app/Decenza this is
 * equivalent to `(await listMachineShots(...)).length` — both dialects
 * return their full list in a single request, so there's no cheaper path.
 * For Decaid, listing is expensive (each page takes several seconds against
 * real hardware with a large history), so this reads the `total` field from
 * a single lightweight request instead of paging through everything just to
 * count it — used by the connection-test UI, which only needs a number.
 */
export async function countMachineShots(
  de1Url: string,
  machineType: MachineType,
): Promise<number> {
  if (machineType === 'decaid') {
    const base = de1Url.replace(/\/+$/, '')
    return fetchDecaidShotCount(base)
  }
  return (await listMachineShots(de1Url, machineType)).length
}

/**
 * Fetch a single shot from the DE1 machine, parse it, and upsert into DB.
 * Returns 'created' if new, 'updated' if updated, 'skipped' if already existed
 * and updateExisting is false.
 */
export async function fetchAndImportShot(
  de1Url: string,
  filename: string,
  machineType: MachineType,
  updateExisting = true,
): Promise<'created' | 'updated' | 'skipped'> {
  const base = de1Url.replace(/\/+$/, '')
  const content = machineType === 'decenza'
    ? await fetchDecenzaShotContent(base, filename)
    : machineType === 'decaid'
      ? await fetchDecaidShotContent(base, filename)
      : await fetchShotContent(base, filename)

  const buffer = Buffer.from(content, 'utf8')
  const hash = createHash('sha256').update(buffer).digest('hex')
  const parsed = machineType === 'decaid' ? parseDecaidShot(content) : parseDecentShot(content)
  const date = new Date(parsed.clock * 1000)
  const filePath = saveFile(buffer, hash, date)

  const defaultBeverage = !parsed.beverageType ? await getDefaultBeverage() : null

  const shotFields = {
    startTime:         date,
    filePath,
    sha256:            hash,
    duration:          parsed.duration,
    beanWeight:        parsed.beanWeight,
    drinkWeight:       parsed.drinkWeight,
    profileTitle:      parsed.profileTitle,
    grinderModel:      parsed.grinderModel,
    grinderSetting:    parsed.grinderSetting,
    barista:           parsed.barista,
    beanBrand:         parsed.beanBrand,
    beanType:          parsed.beanType,
    roastLevel:        parsed.roastLevel,
    roastDate:         parseOptionalDate(parsed.roastDate),
    espressoEnjoyment: parsed.espressoEnjoyment,
    espressoNotes:     parsed.espressoNotes,
    beverageType:      parsed.beverageType || defaultBeverage,
    shotData:          JSON.stringify(parsed.shotData),
  }

  // Primary deduplication: same file content → same SHA256
  let existing = await prisma.shot.findUnique({ where: { sha256: hash } })
  // Secondary deduplication by startTime: handles v1 → v2 migration where the same
  // physical shot produces different hashes because JSON ≠ TCL content
  if (!existing) {
    existing = await prisma.shot.findFirst({ where: { startTime: date } })
  }

  if (existing) {
    if (!updateExisting) return 'skipped'
    await prisma.shot.update({ where: { id: existing.id }, data: shotFields })
    return 'updated'
  }
  await prisma.shot.create({ data: shotFields })
  return 'created'
}

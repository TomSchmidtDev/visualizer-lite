// packages/api/src/services/de1Service.ts
import { createHash } from 'crypto'
import { prisma } from '../db.js'
import { parseDecentShot } from '../parsers/decent.js'
import { saveFile } from './fileStorage.js'

export interface De1ShotInfo {
  filename: string
  date: string  // ISO 8601
}

export interface ImportResult {
  imported: number
  updated: number
  skipped: number
  errors: number
  errorDetails: { filename: string; message: string }[]
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
 * Filter filenames to those whose date prefix (YYYYMMDD) falls within
 * [dateFrom, dateTo] inclusive, compared as plain date strings.
 * dateFrom and dateTo are ISO date strings like "2026-05-26".
 */
export function filterByDateRange(
  filenames: string[],
  dateFrom: string,
  dateTo: string
): De1ShotInfo[] {
  // Convert ISO dates to compact form for direct string comparison with filename prefix
  const from = dateFrom.replace(/-/g, '')  // "2026-05-26" → "20260526"
  const to   = dateTo.replace(/-/g, '')    // "2026-12-31" → "20261231"

  const result: De1ShotInfo[] = []
  for (const filename of filenames) {
    const isoDate = parseFilenameDate(filename)
    if (!isoDate) continue
    const prefix = filename.slice(0, 8)  // "20260526"
    if (prefix >= from && prefix <= to) result.push({ filename, date: isoDate })
  }
  return result
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

/**
 * Fetch a single shot from the DE1 machine, parse it, and upsert into DB.
 * Returns 'created' if new, 'updated' if updated, 'skipped' if already existed
 * and updateExisting is false.
 */
export async function fetchAndImportShot(
  de1Url: string,
  filename: string,
  updateExisting = true,
): Promise<'created' | 'updated' | 'skipped'> {
  const base = de1Url.replace(/\/+$/, '')
  const content = await fetchShotContent(base, filename)

  const buffer = Buffer.from(content, 'utf8')
  const hash = createHash('sha256').update(buffer).digest('hex')
  const parsed = parseDecentShot(content)
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

/**
 * Import all shots in the given date range. Per-shot errors are collected and
 * returned; the import continues past individual failures.
 */
export async function importShotsInRange(
  de1Url: string,
  dateFrom: string,
  dateTo: string,
  updateExisting = true,
): Promise<ImportResult> {
  const allFilenames = await fetchShotList(de1Url)
  const filtered = filterByDateRange(allFilenames, dateFrom, dateTo)

  let imported = 0
  let updated  = 0
  let skipped  = 0
  let errors   = 0
  const errorDetails: { filename: string; message: string }[] = []

  for (const { filename } of filtered) {
    try {
      const outcome = await fetchAndImportShot(de1Url, filename, updateExisting)
      if      (outcome === 'created') imported++
      else if (outcome === 'updated') updated++
      else                            skipped++
    } catch (err) {
      errors++
      errorDetails.push({
        filename,
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return { imported, updated, skipped, errors, errorDetails }
}

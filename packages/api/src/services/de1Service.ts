// packages/api/src/services/de1Service.ts
import { createHash } from 'crypto'
import { prisma } from '../db.js'
import { parseDecentShot } from '../parsers/decent.js'

export interface De1ShotInfo {
  filename: string
  date: string  // ISO 8601
}

export interface ImportResult {
  imported: number
  updated: number
  errors: number
  errorDetails: { filename: string; message: string }[]
}

/** Read the DE1 machine URL from the Settings table. Returns null if not set. */
export async function getDe1Url(): Promise<string | null> {
  const row = await prisma.settings.findUnique({ where: { key: 'de1Url' } })
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
 * Fetch a single shot file from the DE1 machine, parse it, and upsert into DB.
 * Returns 'created' if new, 'updated' if an existing record (matched by SHA-256)
 * was overwritten. Times out after 10 seconds.
 */
export async function fetchAndImportShot(
  de1Url: string,
  filename: string
): Promise<'created' | 'updated'> {
  const base = de1Url.replace(/\/+$/, '')
  const res = await fetch(`${base}/api/shot/${filename}`, {
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`DE1 returned HTTP ${res.status} for ${filename}`)

  const content = await res.text()
  const hash = createHash('sha256').update(content).digest('hex')
  const parsed = parseDecentShot(content)

  const shotFields = {
    startTime:         new Date(parsed.clock * 1000),
    filePath:          `de1://${filename}`,
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
    roastDate:         parsed.roastDate ? new Date(parsed.roastDate) : null,
    espressoEnjoyment: parsed.espressoEnjoyment,
    espressoNotes:     parsed.espressoNotes,
    shotData:          JSON.stringify(parsed.shotData),
  }

  const existing = await prisma.shot.findUnique({ where: { sha256: hash } })
  if (existing) {
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
  dateTo: string
): Promise<ImportResult> {
  const allFilenames = await fetchShotList(de1Url)
  const filtered = filterByDateRange(allFilenames, dateFrom, dateTo)

  let imported = 0
  let updated  = 0
  let errors   = 0
  const errorDetails: { filename: string; message: string }[] = []

  for (const { filename } of filtered) {
    try {
      const outcome = await fetchAndImportShot(de1Url, filename)
      if (outcome === 'created') imported++
      else updated++
    } catch (err) {
      errors++
      errorDetails.push({
        filename,
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return { imported, updated, errors, errorDetails }
}

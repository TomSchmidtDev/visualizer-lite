// Shifts every date in the demo dataset so the demo always looks recent.
import type { AnalysisResponse } from '../../src/types.js'
import type { DemoDataset, DemoShot } from './types.js'

export function shiftIso(iso: string, ms: number): string
export function shiftIso(iso: string | null, ms: number): string | null
export function shiftIso(iso: string | null | undefined, ms: number): string | null | undefined {
  return iso ? new Date(Date.parse(iso) + ms).toISOString() : iso
}

export function rebaseDataset(ds: DemoDataset, now: Date): DemoDataset {
  const shift = now.getTime() - Date.parse(ds.exportedAt)
  const shots: DemoShot[] = ds.shots.map((s) => ({
    ...s,
    startTime: shiftIso(s.startTime, shift),
    roastDate: shiftIso(s.roastDate, shift),
  }))
  const analyses: Record<string, AnalysisResponse> = {}
  for (const [id, a] of Object.entries(ds.analyses)) {
    analyses[id] = { ...a, createdAt: shiftIso(a.createdAt, shift), cachedAt: a.cachedAt ? shiftIso(a.cachedAt, shift) : a.cachedAt }
  }
  return { ...ds, exportedAt: now.toISOString(), shots, analyses }
}
